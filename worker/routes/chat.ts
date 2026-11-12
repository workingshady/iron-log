import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import * as t from "../db/schema";
import type { Env } from "../env";
import { db, rawDb, type RawDB } from "../db";
import { mergePrivacy } from "../../shared/social";
import { areFriends, friendIds as friendList, isBlocked } from "../friends";

const friendIds = async (raw: RawDB, me: string) => new Set(await friendList(raw, me));

// Chat HTTP API + WebSocket upgrade → ChatRoom Durable Object (worker/chat.ts). Mounted in worker/index.ts under /api.
//
// D1 is the source of truth: every write goes through HTTP (idempotent, client-generated ids) → D1 → then the
// conversation's Durable Object is told to broadcast the event to connected sockets (and each member's "inbox" object,
// which drives the chat list + unread badge). The sockets only carry events + typing; a client that misses events
// (offline, reconnect) simply re-fetches the latest page.
// Chat tables are shared (not scoped by db(c)), so EVERY query here checks membership explicitly.

export const chatRoutes = new Hono<Env>();
type C = Context<Env>;

const now = () => Date.now();
const ID_RE = /^[\w-]{6,64}$/;
const STICKER_RE = /^[a-z0-9-]{1,32}$/;
const MAX_TEXT = 4000;
const PAGE = 50;
const IMG_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const AUDIO_RE = /^data:(audio\/(?:webm|ogg|mp4|mpeg|aac|x-m4a))(?:;codecs=[\w.]+)?;base64,([A-Za-z0-9+/=]+)$/;
const ACCENTS = ["lime", "blue", "violet", "amber", "pink", "teal", "coral"];
const BUBBLES = ["round", "soft", "sharp"];
const WALLS = ["none", "dots", "grid", "plates", "waves", "diag"];

// ---------------------------------------------------------------- wire types (mirrored in src/lib/chat.ts)

export interface WireUser { id: string; username: string; name: string | null; avatarId: string | null; lastSeenAt: number | null; lastReadAt?: number | null }
export interface WireMsg {
  id: string; convId: string; senderId: string; kind: string; text: string | null; mediaId: string | null; sticker: string | null;
  replyToId: string | null; createdAt: number; editedAt: number | null; deleted: number;
  reactions: Record<string, string[]>;
  media?: { w: number | null; h: number | null; mime: string; durationMs: number | null } | null;
  reply?: { id: string; senderId: string; kind: string; text: string | null; deleted: number } | null;
}

// ---------------------------------------------------------------- helpers

const err = (c: C, msg: string, status: 400 | 403 | 404 | 409 | 413 | 426 | 507 = 400) => c.json({ error: msg }, status);
const uid = (c: C) => c.var.userId;

async function body<T>(c: C): Promise<T | null> {
  try { return (await c.req.json()) as T; } catch { return null; }
}

async function membership(raw: RawDB, convId: string, userId: string) {
  if (!ID_RE.test(convId)) return null;
  const [m] = await raw.select().from(t.conversationMembers).where(and(eq(t.conversationMembers.convId, convId), eq(t.conversationMembers.userId, userId)));
  return m ?? null;
}

/** Public fields only. lastSeenAt hidden when the person turned "online" off in Privacy. */
async function usersById(raw: RawDB, ids: string[]): Promise<Map<string, WireUser>> {
  if (!ids.length) return new Map();
  const rows = await raw.select({ id: t.users.id, username: t.users.username, name: t.users.name, avatarId: t.users.avatarId, lastSeenAt: t.users.lastSeenAt, privacy: t.users.privacy })
    .from(t.users).where(inArray(t.users.id, [...new Set(ids)]));
  return new Map(rows.map(({ privacy, ...u }) => [u.id, { ...u, lastSeenAt: mergePrivacy(privacy).online === "private" ? null : u.lastSeenAt }]));
}

/** Cheap "last seen" bump (at most one write a minute). */
function touch(c: C) {
  const at = now();
  const p = rawDb(c).update(t.users).set({ lastSeenAt: at })
    .where(and(eq(t.users.id, uid(c)), sql`coalesce(${t.users.lastSeenAt}, 0) < ${at - 60_000}`)).run().catch(() => {});
  try { c.executionCtx.waitUntil(p); } catch { /* no ctx in tests */ }
}

const parseTheme = (s: string | null) => { try { return s ? (JSON.parse(s) as Record<string, string>) : null; } catch { return null; } };

/** Full messages (reactions, media size, quoted reply) for a set of rows. */
async function hydrate(raw: RawDB, rows: (typeof t.messages.$inferSelect)[]): Promise<WireMsg[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const reacts = await raw.select().from(t.messageReactions).where(inArray(t.messageReactions.messageId, ids)).orderBy(t.messageReactions.createdAt);
  const byMsg = new Map<string, Record<string, string[]>>();
  for (const r of reacts) {
    const m = byMsg.get(r.messageId) ?? {};
    (m[r.emoji] ??= []).push(r.userId);
    byMsg.set(r.messageId, m);
  }
  const imgIds = rows.filter((r) => r.kind === "image" && r.mediaId && !r.deleted).map((r) => r.mediaId!);
  const voiceIds = rows.filter((r) => r.kind === "voice" && r.mediaId && !r.deleted).map((r) => r.mediaId!);
  const media = new Map<string, WireMsg["media"]>();
  if (imgIds.length)
    for (const p of await raw.select({ id: t.photos.id, w: t.photos.w, h: t.photos.h, mime: t.photos.mime }).from(t.photos).where(inArray(t.photos.id, imgIds)))
      media.set(p.id, { w: p.w, h: p.h, mime: p.mime, durationMs: null });
  if (voiceIds.length)
    for (const v of await raw.select({ id: t.media.id, mime: t.media.mime, durationMs: t.media.durationMs }).from(t.media).where(inArray(t.media.id, voiceIds)))
      media.set(v.id, { w: null, h: null, mime: v.mime, durationMs: v.durationMs });
  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
  const replies = new Map<string, NonNullable<WireMsg["reply"]> & { convId: string }>();
  if (replyIds.length)
    for (const r of await raw.select({ id: t.messages.id, convId: t.messages.convId, senderId: t.messages.senderId, kind: t.messages.kind, text: t.messages.text, deleted: t.messages.deleted })
      .from(t.messages).where(inArray(t.messages.id, replyIds)))
      replies.set(r.id, { id: r.id, convId: r.convId, senderId: r.senderId, kind: r.kind, text: r.deleted ? null : r.text?.slice(0, 200) ?? null, deleted: r.deleted });
  return rows.map((r) => ({
    id: r.id, convId: r.convId, senderId: r.senderId, kind: r.kind, text: r.deleted ? null : r.text, mediaId: r.deleted ? null : r.mediaId,
    sticker: r.deleted ? null : r.sticker, replyToId: r.replyToId, createdAt: r.createdAt, editedAt: r.editedAt, deleted: r.deleted,
    reactions: byMsg.get(r.id) ?? {}, media: r.mediaId ? media.get(r.mediaId) ?? null : null,
    // only quote messages from the same conversation (never leak another chat's text)
    reply: (() => {
      const q = r.replyToId ? replies.get(r.replyToId) : undefined;
      if (!q || q.convId !== r.convId) return null;
      const { convId: _c, ...rest } = q;
      return rest;
    })(),
  }));
}

/** Tell the conversation room (and optionally every member's inbox) about an event. Fire-and-forget after the response. */
function notify(c: C, convId: string, ev: Record<string, unknown>, inboxFor: string[] = []) {
  const ns = c.env.CHAT;
  const mode = c.var.dev ? "dev" : "real";
  const payload = JSON.stringify(ev);
  const post = (name: string, data: string) => ns.get(ns.idFromName(name)).fetch("https://chat/broadcast", { method: "POST", body: data }).then((r) => r.body?.cancel()).catch(() => {});
  const jobs = [post(`${mode}:c:${convId}`, payload)];
  const inboxEv = JSON.stringify({ t: "conv", convId, ev: ev.t, msg: ev.t === "msg" ? ev.msg : undefined, by: ev.by ?? (ev.msg as WireMsg | undefined)?.senderId });
  for (const u of new Set(inboxFor)) jobs.push(post(`${mode}:u:${u}`, inboxEv));
  const p = Promise.all(jobs);
  try { c.executionCtx.waitUntil(p); } catch { void p; }
}

const memberIds = async (raw: RawDB, convId: string) =>
  (await raw.select({ u: t.conversationMembers.userId }).from(t.conversationMembers).where(eq(t.conversationMembers.convId, convId))).map((r) => r.u);

async function systemMsg(c: C, convId: string, text: string) {
  const raw = rawDb(c);
  const row = { id: `sys-${crypto.randomUUID()}`, convId, senderId: uid(c), kind: "system", text, mediaId: null, sticker: null, replyToId: null, createdAt: now(), editedAt: null, deleted: 0 };
  await raw.batch([raw.insert(t.messages).values(row), raw.update(t.conversations).set({ lastMessageAt: row.createdAt }).where(eq(t.conversations.id, convId))]);
  const [msg] = await hydrate(raw, [row]);
  notify(c, convId, { t: "msg", msg }, await memberIds(raw, convId));
}

/** One conversation as the list / header shows it (for the logged-in user). */
async function convSummaries(raw: RawDB, me: string, only?: string) {
  const mine = await raw.select().from(t.conversationMembers).where(only ? and(eq(t.conversationMembers.userId, me), eq(t.conversationMembers.convId, only)) : eq(t.conversationMembers.userId, me));
  if (!mine.length) return [];
  const ids = mine.map((m) => m.convId);
  const [convs, members, lasts, unread] = await Promise.all([
    raw.select().from(t.conversations).where(inArray(t.conversations.id, ids)),
    raw.select().from(t.conversationMembers).where(inArray(t.conversationMembers.convId, ids)),
    raw.select().from(t.messages).where(sql`${t.messages.id} in (select (select m2.id from messages m2 where m2.conv_id = cm.conv_id order by m2.created_at desc, m2.id desc limit 1) from conversation_members cm where cm.user_id = ${me}${only ? sql` and cm.conv_id = ${only}` : sql``})`),
    raw.all<{ conv_id: string; n: number }>(sql`select m.conv_id, count(*) as n from messages m join conversation_members cm on cm.conv_id = m.conv_id and cm.user_id = ${me}
      where m.sender_id != ${me} and m.deleted = 0 and m.kind != 'system' and m.created_at > coalesce(cm.last_read_at, 0) ${only ? sql`and m.conv_id = ${only}` : sql``} group by m.conv_id`),
  ]);
  const users = await usersById(raw, members.map((m) => m.userId));
  const lastBy = new Map(lasts.map((m) => [m.convId, m]));
  const unreadBy = new Map(unread.map((r) => [r.conv_id, Number(r.n)]));
  const meRow = new Map(mine.map((m) => [m.convId, m]));
  return convs.map((cv) => {
    const last = lastBy.get(cv.id);
    return {
      id: cv.id, kind: cv.kind, title: cv.title, theme: parseTheme(cv.theme), createdBy: cv.createdBy, createdAt: cv.createdAt,
      lastMessageAt: cv.lastMessageAt ?? cv.createdAt, muted: meRow.get(cv.id)!.muted, myLastReadAt: meRow.get(cv.id)!.lastReadAt,
      unread: unreadBy.get(cv.id) ?? 0,
      members: members.filter((m) => m.convId === cv.id).map((m) => ({ ...(users.get(m.userId) ?? { id: m.userId, username: "?", name: "Deleted user", avatarId: null, lastSeenAt: null }), lastReadAt: m.lastReadAt })),
      last: last ? { id: last.id, senderId: last.senderId, kind: last.kind, text: last.deleted ? null : last.text?.slice(0, 120) ?? null, sticker: last.deleted ? null : last.sticker, deleted: last.deleted, createdAt: last.createdAt } : null,
    };
  }).sort((a, z) => z.lastMessageAt - a.lastMessageAt);
}

// ---------------------------------------------------------------- media (registered before /chat/:id/* routes)

/** Serve a chat image / voice note to members of a conversation that contains it (or to the uploader). Immutable per id. */
chatRoutes.get("/chat/media/:id", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return err(c, "bad id");
  const small = c.req.query("s") === "t";
  const etag = `"cm-${id}${small ? "-t" : ""}"`;
  const head = { "cache-control": "private, max-age=31536000, immutable", etag, "x-content-type-options": "nosniff" };
  const raw = rawDb(c);
  const me = uid(c);
  const [ok] = await raw.all<{ x: number }>(sql`select 1 as x from messages m join conversation_members cm on cm.conv_id = m.conv_id and cm.user_id = ${me}
    where m.media_id = ${id} and m.deleted = 0 limit 1`);
  const [ph] = await raw.select({ userId: t.photos.userId, refKind: t.photos.refKind, refId: t.photos.refId, mime: t.photos.mime,
    data: small ? sql<string>`coalesce(${t.photos.thumb}, ${t.photos.data})` : t.photos.data, thumb: sql<number>`${t.photos.thumb} is not null` })
    .from(t.photos).where(eq(t.photos.id, id));
  if (ph) {
    if (!ok && ph.userId !== me) return err(c, "not found", 404);
    if (!ok && !(ph.refId ?? "").startsWith("chat:")) return err(c, "not found", 404); // this route only serves chat photos
    if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: head });
    const bin = Uint8Array.from(atob(ph.data), (ch) => ch.charCodeAt(0));
    return new Response(bin, { headers: { ...head, "content-type": small && ph.thumb ? "image/jpeg" : ph.mime, "content-length": String(bin.length) } });
  }
  const [v] = await raw.select().from(t.media).where(eq(t.media.id, id));
  if (!v || (!ok && v.ownerId !== me)) return err(c, "not found", 404);
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: head });
  const bin = Uint8Array.from(atob(v.data), (ch) => ch.charCodeAt(0));
  return new Response(bin, { headers: { ...head, "content-type": v.mime, "content-length": String(bin.length), "accept-ranges": "none" } });
});

/** Upload an image (PhotoEditor output → photos, refKind "other", refId "chat:<conv>") or a voice note (→ media). */
chatRoutes.post("/chat/:id/media", async (c) => {
  const convId = c.req.param("id");
  const raw = rawDb(c);
  if (!(await membership(raw, convId, uid(c)))) return err(c, "not found", 404);
  const b = await body<{ id: string; kind: "image" | "voice"; dataUrl: string; thumbUrl?: string; w?: number; h?: number; durationMs?: number }>(c);
  if (!b || !ID_RE.test(b.id ?? "")) return err(c, "bad id");
  if (b.kind === "image") {
    const m = IMG_RE.exec(b.dataUrl ?? "");
    if (!m) return err(c, "Not an image (JPEG, PNG or WebP)");
    const bytes = Math.floor((m[2].length * 3) / 4);
    if (bytes > 1_200_000) return err(c, "Photo too large (max ~1.2 MB)", 413);
    const th = b.thumbUrl ? IMG_RE.exec(b.thumbUrl) : null;
    if (th && th[2].length > 160_000) return err(c, "Thumbnail too large", 413);
    const d = db(c);
    const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(t.photos);
    if (n >= 3000) return err(c, "Photo limit reached (3,000).", 507);
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 && x < 10000 ? Math.round(x) : null);
    await d.insert(t.photos).values({
      id: b.id, userId: uid(c), refKind: "other", refId: `chat:${convId}`, exKey: null, sessionId: null, date: new Date().toISOString().slice(0, 10),
      caption: null, mime: m[1], w: num(b.w), h: num(b.h), bytes, data: m[2], thumb: th ? th[2] : null, visibility: "private", createdAt: now(),
    }).onConflictDoNothing();
    return c.json({ ok: true, id: b.id, bytes });
  }
  if (b.kind === "voice") {
    const m = AUDIO_RE.exec(b.dataUrl ?? "");
    if (!m) return err(c, "Not a supported voice recording (webm, ogg, mp4)");
    const bytes = Math.floor((m[2].length * 3) / 4);
    if (bytes > 1_000_000) return err(c, "Voice note too large (max 1 MB)", 413);
    const dur = Math.round(Number(b.durationMs) || 0);
    if (dur < 300 || dur > 125_000) return err(c, "Voice notes are up to 2 minutes");
    await raw.insert(t.media).values({ id: b.id, ownerId: uid(c), mime: m[1], bytes, durationMs: dur, data: m[2], createdAt: now() }).onConflictDoNothing();
    return c.json({ ok: true, id: b.id, bytes });
  }
  return err(c, "bad kind");
});

// ---------------------------------------------------------------- conversations

chatRoutes.use("/chats/*", async (c, next) => { touch(c); return next(); });
chatRoutes.use("/chats", async (c, next) => { touch(c); return next(); });

/** Chat list: newest first, last message preview, unread count, members (public fields). */
chatRoutes.get("/chats", async (c) => c.json({ me: uid(c), convs: await convSummaries(rawDb(c), uid(c)) }));

/** Nav badge: unread messages from other people across all non-muted conversations. */
chatRoutes.get("/chats/unread", async (c) => {
  const me = uid(c);
  const [r] = await rawDb(c).all<{ n: number; convs: number }>(sql`select count(*) as n, count(distinct m.conv_id) as convs from messages m
    join conversation_members cm on cm.conv_id = m.conv_id and cm.user_id = ${me}
    where cm.muted = 0 and m.sender_id != ${me} and m.deleted = 0 and m.kind != 'system' and m.created_at > coalesce(cm.last_read_at, 0)`);
  return c.json({ count: Number(r?.n ?? 0), convs: Number(r?.convs ?? 0) });
});

/** Friends you can start a chat with. */
chatRoutes.get("/chats/friends", async (c) => {
  const raw = rawDb(c);
  const ids = [...(await friendIds(raw, uid(c)))];
  const users = await usersById(raw, ids);
  return c.json([...users.values()].sort((a, z) => (a.name ?? a.username).localeCompare(z.name ?? z.username)));
});

/** Open (or create) the DM with a friend. Body: { username } or { userId }. */
chatRoutes.post("/chats/dm", async (c) => {
  const raw = rawDb(c);
  const me = uid(c);
  const b = await body<{ username?: string; userId?: string }>(c);
  const uname = (b?.username ?? "").trim().replace(/^@/, "").toLowerCase();
  const [other] = uname
    ? await raw.select({ id: t.users.id }).from(t.users).where(eq(t.users.username, uname.slice(0, 40)))
    : await raw.select({ id: t.users.id }).from(t.users).where(eq(t.users.id, (b?.userId ?? "").slice(0, 64)));
  if (!other) return err(c, "No such person", 404);
  if (other.id === me) return err(c, "That's you");
  if (!(await areFriends(raw, me, other.id))) return err(c, "You can only message friends", 403);
  const dmKey = [me, other.id].sort().join("|");
  const [found] = await raw.select({ id: t.conversations.id }).from(t.conversations).where(eq(t.conversations.dmKey, dmKey));
  if (found) {
    // re-add a member that somehow left (DMs can't be left, but stay safe)
    await raw.insert(t.conversationMembers).values([{ convId: found.id, userId: me, joinedAt: now() }, { convId: found.id, userId: other.id, joinedAt: now() }]).onConflictDoNothing();
    return c.json({ id: found.id });
  }
  const id = `dm-${crypto.randomUUID()}`;
  await raw.insert(t.conversations).values({ id, kind: "dm", title: null, dmKey, createdBy: me, theme: null, createdAt: now(), lastMessageAt: null }).onConflictDoNothing();
  const [cv] = await raw.select({ id: t.conversations.id }).from(t.conversations).where(eq(t.conversations.dmKey, dmKey)); // race-safe: unique dmKey
  await raw.insert(t.conversationMembers).values([{ convId: cv.id, userId: me, joinedAt: now() }, { convId: cv.id, userId: other.id, joinedAt: now() }]).onConflictDoNothing();
  return c.json({ id: cv.id });
});

/** New group: title + friends. */
chatRoutes.post("/chats/group", async (c) => {
  const raw = rawDb(c);
  const me = uid(c);
  const b = await body<{ title?: string; userIds?: string[] }>(c);
  const title = (b?.title ?? "").trim().slice(0, 60);
  if (!title) return err(c, "Give the group a name");
  const want = [...new Set((b?.userIds ?? []).filter((x) => typeof x === "string" && x !== me))];
  if (!want.length || want.length > 30) return err(c, "Pick 1-30 friends");
  const friends = await friendIds(raw, me);
  if (want.some((x) => !friends.has(x))) return err(c, "Everyone in a group must be your friend", 403);
  const id = `grp-${crypto.randomUUID()}`;
  const at = now();
  await raw.batch([
    raw.insert(t.conversations).values({ id, kind: "group", title, dmKey: null, createdBy: me, theme: null, createdAt: at, lastMessageAt: at }),
    raw.insert(t.conversationMembers).values([me, ...want].map((u) => ({ convId: id, userId: u, joinedAt: at, lastReadAt: u === me ? at : null }))),
  ]);
  await systemMsg(c, id, `created the group “${title}”`);
  return c.json({ id });
});

/** One conversation (header, members, read positions, theme). */
chatRoutes.get("/chat/:id", async (c) => {
  touch(c);
  const raw = rawDb(c);
  const [cv] = await convSummaries(raw, uid(c), c.req.param("id"));
  if (!cv || !ID_RE.test(c.req.param("id"))) return err(c, "not found", 404);
  return c.json(cv);
});

/** Rename (groups), theme, mute (just for me). */
chatRoutes.patch("/chat/:id", async (c) => {
  const convId = c.req.param("id");
  const raw = rawDb(c);
  const me = uid(c);
  if (!(await membership(raw, convId, me))) return err(c, "not found", 404);
  const b = await body<{ title?: string; theme?: Record<string, string> | null; muted?: boolean }>(c);
  if (!b) return err(c, "bad body");
  const [cv] = await raw.select().from(t.conversations).where(eq(t.conversations.id, convId));
  if (typeof b.muted === "boolean")
    await raw.update(t.conversationMembers).set({ muted: b.muted ? 1 : 0 }).where(and(eq(t.conversationMembers.convId, convId), eq(t.conversationMembers.userId, me)));
  const patch: Partial<typeof t.conversations.$inferInsert> = {};
  if (b.title !== undefined) {
    if (cv.kind !== "group") return err(c, "Only groups have a name");
    const title = String(b.title).trim().slice(0, 60);
    if (!title) return err(c, "Name can't be empty");
    if (title !== cv.title) patch.title = title;
  }
  if (b.theme !== undefined) {
    const th = b.theme ?? {};
    const clean: Record<string, string> = {};
    if (ACCENTS.includes(th.accent)) clean.accent = th.accent;
    if (BUBBLES.includes(th.bubble)) clean.bubble = th.bubble;
    if (WALLS.includes(th.wallpaper)) clean.wallpaper = th.wallpaper;
    patch.theme = Object.keys(clean).length ? JSON.stringify(clean) : null;
  }
  if (Object.keys(patch).length) {
    await raw.update(t.conversations).set(patch).where(eq(t.conversations.id, convId));
    notify(c, convId, { t: "conv", by: me });
    if (patch.title) await systemMsg(c, convId, `renamed the group to “${patch.title}”`);
    else if (patch.theme !== undefined) await systemMsg(c, convId, "changed the chat theme");
  }
  return c.json({ ok: true });
});

/** Add friends to a group. */
chatRoutes.post("/chat/:id/members", async (c) => {
  const convId = c.req.param("id");
  const raw = rawDb(c);
  const me = uid(c);
  if (!(await membership(raw, convId, me))) return err(c, "not found", 404);
  const [cv] = await raw.select().from(t.conversations).where(eq(t.conversations.id, convId));
  if (cv.kind !== "group") return err(c, "Only groups");
  const b = await body<{ userIds?: string[] }>(c);
  const friends = await friendIds(raw, me);
  const cur = new Set(await memberIds(raw, convId));
  const add = [...new Set(b?.userIds ?? [])].filter((x) => typeof x === "string" && !cur.has(x));
  if (!add.length) return c.json({ ok: true });
  if (add.some((x) => !friends.has(x))) return err(c, "You can only add your friends", 403);
  if (cur.size + add.length > 31) return err(c, "Groups are up to 31 people");
  await raw.insert(t.conversationMembers).values(add.map((u) => ({ convId, userId: u, joinedAt: now() }))).onConflictDoNothing();
  const users = await usersById(raw, add);
  await systemMsg(c, convId, `added ${add.map((x) => users.get(x)?.name ?? users.get(x)?.username ?? "someone").join(", ")}`);
  notify(c, convId, { t: "conv", by: me }, add);
  return c.json({ ok: true });
});

/** Leave a group. */
chatRoutes.delete("/chat/:id/members/me", async (c) => {
  const convId = c.req.param("id");
  const raw = rawDb(c);
  const me = uid(c);
  if (!(await membership(raw, convId, me))) return err(c, "not found", 404);
  const [cv] = await raw.select().from(t.conversations).where(eq(t.conversations.id, convId));
  if (cv.kind !== "group") return err(c, "You can't leave a direct chat");
  await systemMsg(c, convId, "left the group");
  await raw.delete(t.conversationMembers).where(and(eq(t.conversationMembers.convId, convId), eq(t.conversationMembers.userId, me)));
  notify(c, convId, { t: "conv", by: me }, [me]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- messages

/**
 * History, newest page first, returned oldest → newest.
 *   ?before=<createdAt>:<id>  → older page (cursor = the oldest message you have)
 *   ?around=<messageId>       → a page ending a little after that message (jump to a quoted reply)
 */
chatRoutes.get("/chat/:id/messages", async (c) => {
  const convId = c.req.param("id");
  const raw = rawDb(c);
  if (!(await membership(raw, convId, uid(c)))) return err(c, "not found", 404);
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || PAGE));
  const before = c.req.query("before");
  let where = eq(t.messages.convId, convId);
  if (before) {
    const [ts, id] = [Number(before.split(":")[0]), before.split(":").slice(1).join(":")];
    if (!Number.isFinite(ts)) return err(c, "bad cursor");
    where = and(where, or(lt(t.messages.createdAt, ts), and(eq(t.messages.createdAt, ts), lt(t.messages.id, id ?? ""))))!;
  }
  const around = c.req.query("around");
  if (around && ID_RE.test(around.replace(/^sys-/, "sys0"))) {
    const [m] = await raw.select({ createdAt: t.messages.createdAt }).from(t.messages).where(and(eq(t.messages.id, around), eq(t.messages.convId, convId)));
    if (!m) return err(c, "not found", 404);
    // everything from 20 before the target up to now (client merges, so overlap is fine)
    const older = await raw.select({ createdAt: t.messages.createdAt }).from(t.messages)
      .where(and(eq(t.messages.convId, convId), lt(t.messages.createdAt, m.createdAt))).orderBy(desc(t.messages.createdAt)).limit(20);
    const from = older.length ? older[older.length - 1].createdAt : m.createdAt;
    const rows = await raw.select().from(t.messages).where(and(eq(t.messages.convId, convId), sql`${t.messages.createdAt} >= ${from}`)).orderBy(t.messages.createdAt, t.messages.id).limit(1000);
    return c.json({ messages: await hydrate(raw, rows), hasMore: older.length === 20 });
  }
  const rows = await raw.select().from(t.messages).where(where).orderBy(desc(t.messages.createdAt), desc(t.messages.id)).limit(limit + 1);
  const hasMore = rows.length > limit;
  return c.json({ messages: await hydrate(raw, rows.slice(0, limit).reverse()), hasMore });
});

/** Send. Idempotent on the client-generated id (a retry returns the stored message). */
chatRoutes.post("/chat/:id/messages", async (c) => {
  const convId = c.req.param("id");
  const raw = rawDb(c);
  const me = uid(c);
  if (!(await membership(raw, convId, me))) return err(c, "not found", 404);
  const b = await body<{ id: string; kind: string; text?: string | null; mediaId?: string | null; sticker?: string | null; replyToId?: string | null }>(c);
  if (!b || !ID_RE.test(b.id ?? "")) return err(c, "bad id");
  const [dup] = await raw.select().from(t.messages).where(eq(t.messages.id, b.id));
  if (dup) {
    if (dup.convId !== convId || dup.senderId !== me) return err(c, "id taken", 409);
    return c.json((await hydrate(raw, [dup]))[0]);
  }
  const text = typeof b.text === "string" ? b.text.replace(/\r\n/g, "\n").trim() : "";
  if (text.length > MAX_TEXT) return err(c, `Messages are up to ${MAX_TEXT} characters`, 413);
  // a blocked person can't message you in an old DM
  const [cv] = await raw.select({ kind: t.conversations.kind }).from(t.conversations).where(eq(t.conversations.id, convId));
  if (cv?.kind === "dm") {
    const other = (await memberIds(raw, convId)).find((u) => u !== me);
    if (other && (await isBlocked(raw, me, other))) return err(c, "You can't message this person", 403);
  }
  const row: typeof t.messages.$inferInsert = { id: b.id, convId, senderId: me, kind: b.kind, text: null, mediaId: null, sticker: null, replyToId: null, createdAt: now(), editedAt: null, deleted: 0 };
  if (b.kind === "text") {
    if (!text) return err(c, "Empty message");
    row.text = text;
  } else if (b.kind === "sticker") {
    if (!STICKER_RE.test(b.sticker ?? "")) return err(c, "bad sticker");
    row.sticker = b.sticker!;
  } else if (b.kind === "image" || b.kind === "voice") {
    const mid = b.mediaId ?? "";
    if (!ID_RE.test(mid)) return err(c, "bad media");
    const owned = b.kind === "image"
      ? await raw.select({ id: t.photos.id }).from(t.photos).where(and(eq(t.photos.id, mid), eq(t.photos.userId, me), eq(t.photos.refId, `chat:${convId}`)))
      : await raw.select({ id: t.media.id }).from(t.media).where(and(eq(t.media.id, mid), eq(t.media.ownerId, me)));
    if (!owned.length) return err(c, "Upload the file first", 409);
    row.mediaId = mid;
    row.text = text ? text.slice(0, 1000) : null; // optional caption
  } else return err(c, "bad kind");
  if (b.replyToId) {
    const [q] = ID_RE.test(b.replyToId.replace(/^sys-/, "sys0")) ? await raw.select({ id: t.messages.id }).from(t.messages).where(and(eq(t.messages.id, b.replyToId), eq(t.messages.convId, convId))) : [];
    row.replyToId = q ? q.id : null;
  }
  await raw.batch([
    raw.insert(t.messages).values(row).onConflictDoNothing(),
    raw.update(t.conversations).set({ lastMessageAt: row.createdAt }).where(eq(t.conversations.id, convId)),
    // sending = you've read everything before it
    raw.update(t.conversationMembers).set({ lastReadAt: row.createdAt }).where(and(eq(t.conversationMembers.convId, convId), eq(t.conversationMembers.userId, me))),
  ]);
  const [saved] = await raw.select().from(t.messages).where(eq(t.messages.id, b.id));
  const [msg] = await hydrate(raw, [saved]);
  notify(c, convId, { t: "msg", msg }, await memberIds(raw, convId));
  touch(c);
  return c.json(msg);
});

async function ownMsg(c: C) {
  const convId = c.req.param("id")!;
  const mid = c.req.param("mid")!;
  const raw = rawDb(c);
  if (!(await membership(raw, convId, uid(c)))) return null;
  const [m] = await raw.select().from(t.messages).where(and(eq(t.messages.id, mid), eq(t.messages.convId, convId)));
  return m ?? null;
}

/** Edit your own text message. */
chatRoutes.patch("/chat/:id/messages/:mid", async (c) => {
  const m = await ownMsg(c);
  if (!m) return err(c, "not found", 404);
  if (m.senderId !== uid(c)) return err(c, "Not your message", 403);
  if (m.deleted || (m.kind !== "text" && m.kind !== "image" && m.kind !== "voice")) return err(c, "Can't edit this");
  const b = await body<{ text?: string }>(c);
  const text = String(b?.text ?? "").replace(/\r\n/g, "\n").trim();
  if (m.kind === "text" && !text) return err(c, "Empty message");
  if (text.length > MAX_TEXT) return err(c, `Messages are up to ${MAX_TEXT} characters`, 413);
  const editedAt = now();
  const raw = rawDb(c);
  await raw.update(t.messages).set({ text: text || null, editedAt }).where(eq(t.messages.id, m.id));
  notify(c, m.convId, { t: "edit", id: m.id, text: text || null, editedAt, by: uid(c) });
  return c.json({ ok: true, editedAt });
});

/** Delete for everyone: a tombstone stays ("This message was deleted"); the file + reactions are removed. */
chatRoutes.delete("/chat/:id/messages/:mid", async (c) => {
  const m = await ownMsg(c);
  if (!m) return err(c, "not found", 404);
  if (m.senderId !== uid(c)) return err(c, "Not your message", 403);
  if (m.deleted) return c.json({ ok: true });
  const raw = rawDb(c);
  const jobs = [
    raw.update(t.messages).set({ deleted: 1, text: null, sticker: null, mediaId: null, editedAt: null }).where(eq(t.messages.id, m.id)),
    raw.delete(t.messageReactions).where(eq(t.messageReactions.messageId, m.id)),
  ] as const;
  if (m.mediaId && m.kind === "image") await raw.batch([...jobs, raw.delete(t.photos).where(and(eq(t.photos.id, m.mediaId), eq(t.photos.userId, uid(c))))]);
  else if (m.mediaId && m.kind === "voice") await raw.batch([...jobs, raw.delete(t.media).where(and(eq(t.media.id, m.mediaId), eq(t.media.ownerId, uid(c))))]);
  else await raw.batch([...jobs]);
  notify(c, m.convId, { t: "del", id: m.id, by: uid(c) });
  return c.json({ ok: true });
});

/** Toggle a reaction (one person can add several different emoji). Returns the message's reactions. */
chatRoutes.post("/chat/:id/messages/:mid/react", async (c) => {
  const m = await ownMsg(c);
  if (!m || m.deleted) return err(c, "not found", 404);
  const b = await body<{ emoji?: string; on?: boolean }>(c);
  const emoji = String(b?.emoji ?? "");
  // one emoji grapheme (≤ 16 UTF-16 units, no letters/digits)
  if (!emoji || emoji.length > 16 || /[\p{L}\p{N}\s<>]/u.test(emoji) || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji)) return err(c, "bad emoji");
  const raw = rawDb(c);
  const me = uid(c);
  const key = and(eq(t.messageReactions.messageId, m.id), eq(t.messageReactions.userId, me), eq(t.messageReactions.emoji, emoji));
  const [has] = await raw.select().from(t.messageReactions).where(key);
  const on = typeof b?.on === "boolean" ? b.on : !has;
  if (on && !has) {
    const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.messageReactions).where(and(eq(t.messageReactions.messageId, m.id), eq(t.messageReactions.userId, me)));
    if (n >= 8) return err(c, "Too many reactions");
    await raw.insert(t.messageReactions).values({ messageId: m.id, userId: me, emoji, createdAt: now() }).onConflictDoNothing();
  } else if (!on && has) await raw.delete(t.messageReactions).where(key);
  const [h] = await hydrate(raw, [m]);
  notify(c, m.convId, { t: "react", id: m.id, reactions: h.reactions, by: me, emoji, on }, on && m.senderId !== me ? [m.senderId] : []);
  return c.json({ reactions: h.reactions });
});

/** Read receipt: everything up to `at` (ms, a message's createdAt) is read. Only moves forward. */
chatRoutes.post("/chat/:id/read", async (c) => {
  const convId = c.req.param("id");
  const raw = rawDb(c);
  const me = uid(c);
  const mem = await membership(raw, convId, me);
  if (!mem) return err(c, "not found", 404);
  const b = await body<{ at?: number }>(c);
  const at = Math.min(now(), Math.round(Number(b?.at) || now()));
  if ((mem.lastReadAt ?? 0) >= at) return c.json({ ok: true, lastReadAt: mem.lastReadAt });
  await raw.update(t.conversationMembers).set({ lastReadAt: at }).where(and(eq(t.conversationMembers.convId, convId), eq(t.conversationMembers.userId, me)));
  notify(c, convId, { t: "read", uid: me, at, by: me }, [me]);
  touch(c);
  return c.json({ ok: true, lastReadAt: at });
});

// ---------------------------------------------------------------- WebSockets → Durable Object

function sameOrigin(c: C) {
  const o = c.req.header("origin");
  if (!o) return true; // non-browser clients (tests); browsers always send Origin on WebSocket upgrades
  try { return new URL(o).host === new URL(c.req.url).host; } catch { return false; }
}

async function upgrade(c: C, name: string, room: boolean) {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return err(c, "Expected a WebSocket", 426);
  if (!sameOrigin(c)) return err(c, "bad origin", 403);
  const raw = rawDb(c);
  const [u] = await raw.select({ privacy: t.users.privacy }).from(t.users).where(eq(t.users.id, uid(c)));
  const hidden = mergePrivacy(u?.privacy).online === "private";
  touch(c);
  const ns = c.env.CHAT;
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-chat-uid", uid(c));
  headers.set("x-chat-dev", c.var.dev ? "1" : "0");
  headers.set("x-chat-room", room ? "1" : "0");
  headers.set("x-chat-hidden", hidden ? "1" : "0");
  return ns.get(ns.idFromName(name)).fetch(new Request("https://chat/ws", { headers }));
}

/** Live events for one conversation (members only). */
chatRoutes.get("/chat/:id/ws", async (c) => {
  const convId = c.req.param("id");
  if (!(await membership(rawDb(c), convId, uid(c)))) return err(c, "not found", 404);
  return upgrade(c, `${c.var.dev ? "dev" : "real"}:c:${convId}`, true);
});

/** Live events for my chat list + unread badge (one per user). */
chatRoutes.get("/chats/ws", async (c) => upgrade(c, `${c.var.dev ? "dev" : "real"}:u:${uid(c)}`, false));

// ---------------------------------------------------------------- DEV seed

/** DEV seed hook: called by POST /api/dev/seed after the dev users exist. users = { dev, omar, sara } ids. */
export async function seedChat(raw: RawDB, users: Record<string, string>) {
  const { dev, omar, sara } = users;
  const at = Date.now();
  // friendships dev↔omar, dev↔sara (the Social seed makes them too; only created when missing, never changed)
  for (const [a, b] of [[dev, omar], [dev, sara]] as const) {
    const [f] = await raw.select().from(t.friendships).where(or(and(eq(t.friendships.requesterId, a), eq(t.friendships.addresseeId, b)), and(eq(t.friendships.requesterId, b), eq(t.friendships.addresseeId, a))));
    if (!f) await raw.insert(t.friendships).values({ id: `seed-fr-${a}-${b}`, requesterId: a, addresseeId: b, status: "accepted", createdAt: at - 30 * 864e5, respondedAt: at - 30 * 864e5 }).onConflictDoNothing();
  }
  // wipe old seeded chat rows (ids prefixed seed-)
  const old = ["seed-dm-dev-omar", "seed-grp-gym-crew"];
  await raw.batch([
    raw.delete(t.messageReactions).where(sql`${t.messageReactions.messageId} in (select id from messages where conv_id in ('seed-dm-dev-omar','seed-grp-gym-crew'))`),
    raw.delete(t.messages).where(inArray(t.messages.convId, old)),
    raw.delete(t.conversationMembers).where(inArray(t.conversationMembers.convId, old)),
    raw.delete(t.conversations).where(or(inArray(t.conversations.id, old), eq(t.conversations.dmKey, [dev, omar].sort().join("|")))),
  ]);

  const dm = "seed-dm-dev-omar";
  const H = 3600e3, M = 60e3;
  const day0 = at - 2 * 24 * H;
  type S = [string, number, string, Partial<typeof t.messages.$inferInsert>?];
  const lines: S[] = [
    [omar, day0, "Yo! Leg day tomorrow? 🦵"],
    [dev, day0 + 2 * M, "Yes!! 7 pm at the usual gym"],
    [omar, day0 + 3 * M, "تمام 👍 هجيب الحزام"],
    [dev, day0 + 4 * M, "Bring chalk too, deadlifts are on the menu"],
    [omar, day0 + 5 * M, "", { kind: "sticker", sticker: "leg-day" }],
    [dev, day0 + 20 * H, "On my way 🚗"],
    [omar, day0 + 20 * H + 2 * M, "Already warming up 🔥"],
    [omar, day0 + 22 * H, "That was brutal. Squat 120 × 5 💪💪"],
    [dev, day0 + 22 * H + 1 * M, "😂😂"],
    [dev, day0 + 22 * H + 2 * M, "PR? Congrats man!! النهارده كان يوم جامد", { replyToId: "seed-m-8" }],
    [omar, day0 + 22 * H + 4 * M, "Yeah PR by 5 kg. الحمد لله"],
    [omar, day0 + 22 * H + 5 * M, "Next goal 140 before the summer"],
    [dev, day0 + 30 * H, "Did you try the new pull-up progression? https://www.youtube.com/watch?v=eGo4IYlbE5g"],
    [omar, day0 + 30 * H + 6 * M, "Not yet, will do it Sunday"],
    [omar, day0 + 30 * H + 7 * M, "عايز أوصل لـ 10 pull-ups strict"],
    [dev, at - 3 * H, "Rest day today 😴"],
    [omar, at - 2 * H, "Same. Stretching + walk only"],
    [dev, at - 2 * H + 3 * M, "", { kind: "sticker", sticker: "rest-day" }],
    [omar, at - 40 * M, "Tomorrow push day?"],
    [omar, at - 39 * M, "🏋️"],
  ];
  const rows = lines.map(([who, ts, text, extra], i) => ({
    id: `seed-m-${i + 1}`, convId: dm, senderId: who, kind: "text", text: text || null, mediaId: null, sticker: null, replyToId: null,
    createdAt: Math.round(ts), editedAt: null, deleted: 0, ...extra,
  }));
  const grp = "seed-grp-gym-crew";
  const g0 = at - 26 * H;
  const glines: S[] = [
    [dev, g0, "created the group “Gym crew”", { kind: "system" }],
    [dev, g0 + 1 * M, "Welcome to the crew 🏋️‍♂️"],
    [sara, g0 + 5 * M, "Finally a group! 5 strict pull-ups today 🎉"],
    [omar, g0 + 7 * M, "Beast mode 🔥🔥"],
    [sara, g0 + 8 * M, "", { kind: "sticker", sticker: "pr" }],
    [dev, at - 5 * H, "Saturday morning session, who's in?"],
    [sara, at - 4 * H, "أنا موجودة ✋"],
    [omar, at - 3 * H, "In. 9 am?"],
  ];
  const grows = glines.map(([who, ts, text, extra], i) => ({
    id: `seed-g-${i + 1}`, convId: grp, senderId: who, kind: "text", text: text || null, mediaId: null, sticker: null, replyToId: null,
    createdAt: Math.round(ts), editedAt: null, deleted: 0, ...extra,
  }));
  await raw.batch([
    raw.insert(t.conversations).values({ id: dm, kind: "dm", title: null, dmKey: [dev, omar].sort().join("|"), createdBy: dev, theme: null, createdAt: day0 - H, lastMessageAt: rows[rows.length - 1].createdAt }),
    raw.insert(t.conversations).values({ id: grp, kind: "group", title: "Gym crew", dmKey: null, createdBy: dev, theme: JSON.stringify({ accent: "blue", bubble: "round", wallpaper: "plates" }), createdAt: g0, lastMessageAt: grows[grows.length - 1].createdAt }),
    raw.insert(t.conversationMembers).values([
      { convId: dm, userId: dev, joinedAt: day0 - H, lastReadAt: at - 2 * H + 3 * M },
      { convId: dm, userId: omar, joinedAt: day0 - H, lastReadAt: at - 39 * M },
      { convId: grp, userId: dev, joinedAt: g0, lastReadAt: at - 5 * H },
      { convId: grp, userId: omar, joinedAt: g0, lastReadAt: at - 3 * H },
      { convId: grp, userId: sara, joinedAt: g0, lastReadAt: at - 4 * H },
    ]),
  ]);
  for (let i = 0; i < rows.length; i += 8) await raw.insert(t.messages).values(rows.slice(i, i + 8)); // D1: ≤ 100 bound params per query
  await raw.insert(t.messages).values(grows);
  await raw.insert(t.messageReactions).values([
    { messageId: "seed-m-8", userId: dev, emoji: "🔥", createdAt: day0 + 22 * H + M },
    { messageId: "seed-m-8", userId: omar, emoji: "💪", createdAt: day0 + 22 * H + M },
    { messageId: "seed-m-11", userId: dev, emoji: "❤️", createdAt: day0 + 22 * H + 5 * M },
    { messageId: "seed-g-3", userId: dev, emoji: "🎉", createdAt: g0 + 6 * M },
    { messageId: "seed-g-3", userId: omar, emoji: "🎉", createdAt: g0 + 6 * M },
  ]);
  await raw.update(t.users).set({ lastSeenAt: at - 35 * M }).where(eq(t.users.id, omar));
  await raw.update(t.users).set({ lastSeenAt: at - 4 * H }).where(eq(t.users.id, sara));
}
