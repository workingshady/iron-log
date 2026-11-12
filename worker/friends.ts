// Friendship + privacy helpers. Every cross-user read goes through these (rawDb is unscoped: filter explicitly).
// Other features (chat, programs) may import: areFriends, friendIds, relationOf, isBlocked, privacyOf, notify, lite.
import { and, eq, inArray, or, sql } from "drizzle-orm";
import * as t from "./db/schema";
import type { RawDB } from "./db";
import { mentionNames, mergePrivacy, type Privacy, type Relation, type UserLite } from "../shared/social";
import { env as cfEnv, waitUntil } from "cloudflare:workers";
import { later, pushForNotification } from "./push";
import type { Env } from "./env";

export const ID_RE = /^[\w.-]{2,64}$/;

/** SQL fragment: ids of my accepted friends (no bound-parameter limit, usable inside IN (…)). */
export const friendIdsSql = (me: string) =>
  sql`(select ${t.friendships.addresseeId} from ${t.friendships} where ${t.friendships.requesterId} = ${me} and ${t.friendships.status} = 'accepted'
       union select ${t.friendships.requesterId} from ${t.friendships} where ${t.friendships.addresseeId} = ${me} and ${t.friendships.status} = 'accepted')`;

/** SQL fragment: ids of everyone in a block relation with me (either direction). */
export const blockedIdsSql = (me: string) =>
  sql`(select ${t.friendships.addresseeId} from ${t.friendships} where ${t.friendships.requesterId} = ${me} and ${t.friendships.status} = 'blocked'
       union select ${t.friendships.requesterId} from ${t.friendships} where ${t.friendships.addresseeId} = ${me} and ${t.friendships.status} = 'blocked')`;

/** Both rows that can exist between two people (A→B and B→A). */
async function pairRows(raw: RawDB, a: string, b: string) {
  return raw.select().from(t.friendships).where(or(
    and(eq(t.friendships.requesterId, a), eq(t.friendships.addresseeId, b)),
    and(eq(t.friendships.requesterId, b), eq(t.friendships.addresseeId, a)),
  ));
}

/** How `me` relates to `other`. "blocked" = either side blocked (callers must treat both the same: no contact). */
export async function relationOf(raw: RawDB, me: string, other: string): Promise<Relation> {
  if (me === other) return "self";
  const rows = await pairRows(raw, me, other);
  if (rows.some((r) => r.status === "blocked")) return "blocked";
  if (rows.some((r) => r.status === "accepted")) return "friends";
  if (rows.some((r) => r.status === "pending" && r.addresseeId === me)) return "incoming";
  if (rows.some((r) => r.requesterId === me && (r.status === "pending" || r.status === "declined"))) return "outgoing"; // declined looks pending to the sender
  return "none";
}

/** Who blocked whom between the two (null = no block). */
export async function blockerOf(raw: RawDB, a: string, b: string): Promise<string | null> {
  const rows = await pairRows(raw, a, b);
  return rows.find((r) => r.status === "blocked")?.requesterId ?? null;
}

export const areFriends = async (raw: RawDB, a: string, b: string) => a !== b && (await relationOf(raw, a, b)) === "friends";

export async function friendIds(raw: RawDB, me: string): Promise<string[]> {
  const rows = await raw.select({ a: t.friendships.requesterId, b: t.friendships.addresseeId }).from(t.friendships)
    .where(and(eq(t.friendships.status, "accepted"), or(eq(t.friendships.requesterId, me), eq(t.friendships.addresseeId, me))));
  return [...new Set(rows.map((r) => (r.a === me ? r.b : r.a)))];
}

/** Everyone in a block relation with me (either direction). */
export async function blockedIds(raw: RawDB, me: string): Promise<string[]> {
  const rows = await raw.select({ a: t.friendships.requesterId, b: t.friendships.addresseeId }).from(t.friendships)
    .where(and(eq(t.friendships.status, "blocked"), or(eq(t.friendships.requesterId, me), eq(t.friendships.addresseeId, me))));
  return rows.map((r) => (r.a === me ? r.b : r.a));
}
export const isBlocked = async (raw: RawDB, a: string, b: string) => (await blockerOf(raw, a, b)) != null;

export const privacyOf = (u: { privacy: string | null } | null | undefined): Privacy => mergePrivacy(u?.privacy);

/** Can someone with relation `rel` see a "friends | private" item? */
export const canSee = (vis: "friends" | "private", rel: Relation) => rel === "self" || (rel === "friends" && vis === "friends");

/**
 * Can `uid` see a post with this author + visibility? Author always · "friends" → accepted friends · "members" → anyone with an
 * account who isn't in a block with the author · "private" → only the author. The single rule for feed, comments and mentions.
 */
export async function canSeePost(raw: RawDB, uid: string, p: { userId: string; visibility: string; deleted?: number | null }) {
  if (p.deleted) return false;
  if (p.userId === uid) return true;
  if (p.visibility === "private") return false;
  const rel = await relationOf(raw, uid, p.userId);
  if (rel === "blocked") return false;
  if (p.visibility === "members") return true;
  return p.visibility === "friends" && rel === "friends";
}

/**
 * People mentioned in `text` who should hear about it: existing usernames (max 10), not the actor, not in a block with the
 * actor, and for whom `canSee(id)` holds (they can see the post / are in the chat). Returns user ids.
 */
export async function mentionTargets(raw: RawDB, actor: string, text: string | null | undefined, canSee: (userId: string) => Promise<boolean>): Promise<string[]> {
  const names = mentionNames(text);
  if (!names.length) return [];
  const rows = await raw.select({ id: t.users.id }).from(t.users).where(inArray(t.users.username, names));
  const blocked = new Set(await blockedIds(raw, actor));
  const out: string[] = [];
  for (const r of rows) if (r.id !== actor && !blocked.has(r.id) && (await canSee(r.id))) out.push(r.id);
  return out;
}

/** Public columns only — never select passHash / email / googleSub into social responses. */
export const LITE = { id: t.users.id, username: t.users.username, name: t.users.name, avatarId: t.users.avatarId };
export async function lite(raw: RawDB, ids: string[]): Promise<Map<string, UserLite>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, UserLite>();
  for (let i = 0; i < uniq.length; i += 90) {
    const rows = await raw.select(LITE).from(t.users).where(inArray(t.users.id, uniq.slice(i, i + 90)));
    rows.forEach((r) => out.set(r.id, r));
  }
  return out;
}

/** Optional push overrides (e.g. a chat mention opens the chat and collapses with its messages). */
export interface PushHint { url?: string; tag?: string; topic?: string }

/** In-app notification. Pass a deterministic `id` to make it idempotent (e.g. one "like" per post per person). */
export async function notify(raw: RawDB, n: { userId: string; kind: string; actorId?: string | null; refId?: string | null; id?: string; push?: PushHint }) {
  if (n.actorId && n.actorId === n.userId) return; // never notify yourself
  const fresh = await raw.insert(t.notifications).values({
    id: n.id ?? `n-${crypto.randomUUID()}`, userId: n.userId, kind: n.kind, actorId: n.actorId ?? null, refId: n.refId ?? null, createdAt: Date.now(), readAt: null,
  }).onConflictDoNothing().returning({ id: t.notifications.id });
  // phone push (prefs + quiet hours checked inside), only for a NEW row (re-like spam stays silent), after the response
  if (fresh.length) later(pushForNotification(raw, cfEnv as unknown as Env["Bindings"], n), waitUntil);
}
