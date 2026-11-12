import { Hono, type Context } from "hono";
import { and, desc, eq, gte, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { Env } from "../env";
import * as t from "../db/schema";
import { db, rawDb, type RawDB } from "../db";
import { EXERCISES } from "../../program";
import { EX_GROUP, GROUPS } from "../../program/groups";
import { isPair, shownKg, totalKg } from "../../shared/load";
import {
  BADGES, LIMITS, METRIC, POST_KINDS, needsMuscle, PRIVACY_DEFAULTS, addDays, DATE_RE, epley, sanitizePrivacy, weekStartOf,
  type Badge, type Board, type BoardRow, type Challenge, type Comment, type LiftBest, type LiftDetail, type LiftRow, type LiftsBoard, type MetricId, type MuscleBoard, type Notif, type Period, type Post, type PostKind,
  type PrSummary, type Relation, type Story, type UserLite, type WeekDay, type WorkoutSummary,
} from "../../shared/social";
import { ID_RE, LITE, blockedIds, canSee, friendIds, friendIdsSql, lite, notify, privacyOf, relationOf } from "../friends";

// Friends, privacy, feed posts, likes, comments, notifications, friend profiles, leaderboard + challenges. Owned by the Social agent.
// Mounted in worker/index.ts under /api. db(c) = MY data only; rawDb(c) = unscoped → every cross-user read here filters by
// friendship + privacy explicitly. Never returned: passHash, email, googleSub, set notes, pain, journal, readiness.
export const socialRoutes = new Hono<Env>();
type C = Context<Env>;

const now = () => Date.now();
const me = (c: C) => c.var.userId;
const bad = (c: C, error: string, status: 400 | 403 | 404 | 409 | 429 = 400) => c.json({ error }, status);
const body = async <T>(c: C): Promise<Partial<T>> => { try { return (await c.req.json()) as Partial<T>; } catch { return {}; } };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const todayOf = (c: C) => { const q = c.req.query("today"); return q && DATE_RE.test(q) ? q : new Date(now() + 3 * 3600e3).toISOString().slice(0, 10); };
const idList = (ids: string[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

async function userByName(raw: RawDB, username: string) {
  const u = username.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9._]{1,30}$/.test(u)) return null;
  const [row] = await raw.select({ ...LITE, bio: t.users.bio, privacy: t.users.privacy, lastSeenAt: t.users.lastSeenAt, createdAt: t.users.createdAt }).from(t.users).where(eq(t.users.username, u));
  return row ?? null;
}
async function userById(raw: RawDB, id: string) {
  if (!ID_RE.test(id)) return null;
  const [row] = await raw.select({ ...LITE, privacy: t.users.privacy }).from(t.users).where(eq(t.users.id, id));
  return row ?? null;
}

/** Exercise display names (built-in library + custom exercises). */
async function exNames(raw: RawDB, keys: string[]) {
  const out = new Map<string, string>();
  const custom: string[] = [];
  for (const k of new Set(keys)) EXERCISES[k] ? out.set(k, EXERCISES[k].name) : custom.push(k);
  for (let i = 0; i < custom.length; i += 90) {
    const rows = await raw.select().from(t.customExercises).where(inArray(t.customExercises.key, custom.slice(i, i + 90)));
    for (const r of rows) { try { out.set(r.key, (JSON.parse(r.json) as { name?: string }).name ?? r.key); } catch { out.set(r.key, r.key); } }
  }
  for (const k of keys) if (!out.has(k)) out.set(k, k.replace(/_/g, " "));
  return out;
}

// ================================================================== users + friends

/** Search members by username prefix. Blocked people (either direction) are invisible. Returns only public columns. */
socialRoutes.get("/users/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9._]{2,30}$/.test(q)) return c.json([]);
  const raw = rawDb(c);
  const blocked = await blockedIds(raw, me(c));
  const esc = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const rows = await raw.select(LITE).from(t.users)
    .where(and(sql`${t.users.username} like ${`${esc}%`} escape '\\'`, ne(t.users.id, me(c)), blocked.length ? sql`${t.users.id} not in (${idList(blocked.slice(0, 90))})` : undefined))
    .orderBy(t.users.username).limit(20);
  const rels = await Promise.all(rows.map((r) => relationOf(raw, me(c), r.id)));
  return c.json(rows.map((r, i) => ({ ...r, relation: rels[i] })).filter((r) => r.relation !== "blocked"));
});

socialRoutes.get("/friends", async (c) => {
  const raw = rawDb(c);
  const uid = me(c);
  const rows = await raw.select().from(t.friendships).where(or(eq(t.friendships.requesterId, uid), eq(t.friendships.addresseeId, uid)));
  const other = (r: (typeof rows)[number]) => (r.requesterId === uid ? r.addresseeId : r.requesterId);
  const users = await lite(raw, rows.map(other));
  const pick = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).map((r) => ({ ...users.get(other(r))!, since: r.respondedAt ?? r.createdAt })).filter((u) => u.id);
  const friends = pick((r) => r.status === "accepted").sort((a, z) => a.username.localeCompare(z.username));
  // suggestions: friends of friends (no relation with me yet), ranked by mutual friends
  const mine = new Set(friends.map((f) => f.id));
  const known = new Set([uid, ...rows.map(other)]);
  const fof = new Map<string, number>();
  if (mine.size) {
    const ids = [...mine].slice(0, 90);
    const ff = await raw.select({ a: t.friendships.requesterId, b: t.friendships.addresseeId }).from(t.friendships)
      .where(and(eq(t.friendships.status, "accepted"), or(inArray(t.friendships.requesterId, ids), inArray(t.friendships.addresseeId, ids))));
    for (const r of ff) for (const [x, y] of [[r.a, r.b], [r.b, r.a]]) if (mine.has(x) && !known.has(y)) fof.set(y, (fof.get(y) ?? 0) + 1);
  }
  const top = [...fof.entries()].sort((a, z) => z[1] - a[1]).slice(0, 8);
  const su = await lite(raw, top.map(([id]) => id));
  return c.json({
    friends,
    incoming: pick((r) => r.status === "pending" && r.addresseeId === uid),
    outgoing: pick((r) => (r.status === "pending" || r.status === "declined") && r.requesterId === uid),
    blocked: pick((r) => r.status === "blocked" && r.requesterId === uid),
    suggestions: top.map(([id, n]) => ({ ...su.get(id)!, mutual: n })).filter((u) => u.id),
  });
});

async function pairDelete(raw: RawDB, a: string, b: string) {
  await raw.delete(t.friendships).where(or(
    and(eq(t.friendships.requesterId, a), eq(t.friendships.addresseeId, b)),
    and(eq(t.friendships.requesterId, b), eq(t.friendships.addresseeId, a)),
  ));
}

socialRoutes.post("/friends/:userId/request", async (c) => {
  const raw = rawDb(c);
  const uid = me(c), other = c.req.param("userId");
  const u = await userById(raw, other);
  if (!u || other === uid) return bad(c, "User not found", 404);
  const rel = await relationOf(raw, uid, other);
  if (rel === "blocked") return bad(c, "User not found", 404); // don't reveal blocks
  if (rel === "friends" || rel === "outgoing") return c.json({ ok: true, relation: rel });
  if (rel === "incoming") return accept(c, other); // they already asked → accept
  const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.friendships).where(and(eq(t.friendships.requesterId, uid), eq(t.friendships.status, "pending")));
  if (n >= 50) return bad(c, "Too many pending requests. Cancel some first.", 429);
  await raw.insert(t.friendships).values({ id: `fr-${crypto.randomUUID()}`, requesterId: uid, addresseeId: other, status: "pending", createdAt: now(), respondedAt: null }).onConflictDoNothing();
  await notify(raw, { userId: other, kind: "friend_request", actorId: uid, refId: uid, id: `frq-${uid}-${other}` });
  return c.json({ ok: true, relation: "outgoing" });
});

async function accept(c: C, other: string) {
  const raw = rawDb(c);
  const uid = me(c);
  const res = await raw.update(t.friendships).set({ status: "accepted", respondedAt: now() })
    .where(and(eq(t.friendships.requesterId, other), eq(t.friendships.addresseeId, uid), eq(t.friendships.status, "pending"))).returning({ id: t.friendships.id });
  if (!res.length) return bad(c, "No request from this person", 404);
  // a crossed request (me → them) is now redundant
  await raw.delete(t.friendships).where(and(eq(t.friendships.requesterId, uid), eq(t.friendships.addresseeId, other)));
  await raw.update(t.notifications).set({ readAt: now() }).where(and(eq(t.notifications.userId, uid), eq(t.notifications.kind, "friend_request"), eq(t.notifications.actorId, other)));
  await notify(raw, { userId: other, kind: "friend_accept", actorId: uid, refId: uid, id: `fra-${uid}-${other}-${now()}` });
  return c.json({ ok: true, relation: "friends" as Relation });
}
socialRoutes.post("/friends/:userId/accept", (c) => accept(c, c.req.param("userId")));

socialRoutes.post("/friends/:userId/decline", async (c) => {
  const raw = rawDb(c);
  await raw.update(t.friendships).set({ status: "declined", respondedAt: now() })
    .where(and(eq(t.friendships.requesterId, c.req.param("userId")), eq(t.friendships.addresseeId, me(c)), eq(t.friendships.status, "pending")));
  await raw.delete(t.notifications).where(and(eq(t.notifications.userId, me(c)), eq(t.notifications.kind, "friend_request"), eq(t.notifications.actorId, c.req.param("userId"))));
  return c.json({ ok: true, relation: "none" });
});

/** Cancel my request, or unfriend. (Doesn't touch blocks: use DELETE …/block.) */
socialRoutes.delete("/friends/:userId", async (c) => {
  const raw = rawDb(c);
  const uid = me(c), other = c.req.param("userId");
  await raw.delete(t.friendships).where(and(ne(t.friendships.status, "blocked"), or(
    and(eq(t.friendships.requesterId, uid), eq(t.friendships.addresseeId, other)),
    and(eq(t.friendships.requesterId, other), eq(t.friendships.addresseeId, uid), eq(t.friendships.status, "accepted")),
  )));
  await raw.delete(t.notifications).where(and(eq(t.notifications.userId, other), eq(t.notifications.kind, "friend_request"), eq(t.notifications.actorId, uid)));
  return c.json({ ok: true, relation: "none" });
});

/** Block: ends any friendship/request; they can't find, see or contact you. */
socialRoutes.post("/friends/:userId/block", async (c) => {
  const raw = rawDb(c);
  const uid = me(c), other = c.req.param("userId");
  if (!(await userById(raw, other)) || other === uid) return bad(c, "User not found", 404);
  const rows = await raw.select().from(t.friendships).where(or(
    and(eq(t.friendships.requesterId, uid), eq(t.friendships.addresseeId, other)),
    and(eq(t.friendships.requesterId, other), eq(t.friendships.addresseeId, uid)),
  ));
  if (rows.some((r) => r.status === "blocked" && r.requesterId === other)) return c.json({ ok: true, relation: "blocked" }); // they blocked me first; keep theirs
  await pairDelete(raw, uid, other);
  await raw.insert(t.friendships).values({ id: `fb-${crypto.randomUUID()}`, requesterId: uid, addresseeId: other, status: "blocked", createdAt: now(), respondedAt: now() });
  await raw.delete(t.notifications).where(or(and(eq(t.notifications.userId, uid), eq(t.notifications.actorId, other)), and(eq(t.notifications.userId, other), eq(t.notifications.actorId, uid))));
  await raw.delete(t.challengeMembers).where(and(eq(t.challengeMembers.userId, other), sql`${t.challengeMembers.challengeId} in (select id from challenges where created_by = ${uid})`));
  return c.json({ ok: true, relation: "blocked" });
});
socialRoutes.delete("/friends/:userId/block", async (c) => {
  await rawDb(c).delete(t.friendships).where(and(eq(t.friendships.requesterId, me(c)), eq(t.friendships.addresseeId, c.req.param("userId")), eq(t.friendships.status, "blocked")));
  return c.json({ ok: true, relation: "none" });
});

// ================================================================== privacy

socialRoutes.get("/privacy", async (c) => {
  const [u] = await rawDb(c).select({ privacy: t.users.privacy }).from(t.users).where(eq(t.users.id, me(c)));
  return c.json(privacyOf(u));
});
socialRoutes.put("/privacy", async (c) => {
  const b = await body<Record<string, unknown>>(c);
  const raw = rawDb(c);
  const [u] = await raw.select({ privacy: t.users.privacy }).from(t.users).where(eq(t.users.id, me(c)));
  if (!u) return bad(c, "no profile", 404);
  const next = sanitizePrivacy(b, privacyOf(u));
  await raw.update(t.users).set({ privacy: JSON.stringify(next), updatedAt: now() }).where(eq(t.users.id, me(c)));
  return c.json(next);
});

// ================================================================== photos (friends can see photos shared with friends)

/**
 * Serves a photo if: I own it · OR we're friends and it's shared with friends · OR it's the owner's current profile photo
 * (name + avatar are what members use to find each other) and nobody blocked anybody. Immutable per id like /api/photos.
 */
socialRoutes.get("/social/photos/:id/img", async (c) => {
  const id = c.req.param("id");
  if (!ID_RE.test(id)) return bad(c, "not found", 404);
  const small = c.req.query("s") === "t";
  const raw = rawDb(c);
  const [p] = await raw.select({ userId: t.photos.userId, visibility: t.photos.visibility, mime: t.photos.mime, hasThumb: sql<number>`${t.photos.thumb} is not null` }).from(t.photos).where(eq(t.photos.id, id));
  if (!p) return bad(c, "not found", 404);
  const uid = me(c);
  let ok = p.userId === uid;
  if (!ok) {
    const rel = await relationOf(raw, uid, p.userId);
    if (rel === "friends" && p.visibility === "friends") ok = true;
    else if (rel !== "blocked") {
      const [o] = await raw.select({ avatarId: t.users.avatarId }).from(t.users).where(eq(t.users.id, p.userId));
      ok = o?.avatarId === id;
    }
  }
  if (!ok) return bad(c, "not found", 404);
  const etag = `"s${id}${small ? "-t" : ""}"`;
  const head = { "cache-control": "private, max-age=31536000, immutable", etag };
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: head });
  const [d] = await raw.select({ data: small ? sql<string>`coalesce(${t.photos.thumb}, ${t.photos.data})` : t.photos.data }).from(t.photos).where(eq(t.photos.id, id));
  const bin = Uint8Array.from(atob(d.data), (ch) => ch.charCodeAt(0));
  const type = small && p.hasThumb ? (d.data.startsWith("iVBOR") ? "image/png" : "image/jpeg") : p.mime;
  return new Response(bin, { headers: { ...head, "content-type": type, "content-length": String(bin.length) } });
});

/** Share / unshare one of MY photos with friends (db(c) = can only touch my own). */
socialRoutes.put("/social/photos/:id/visibility", async (c) => {
  const { visibility } = await body<{ visibility: string }>(c);
  if (visibility !== "friends" && visibility !== "private") return bad(c, "visibility: friends | private");
  const res = await db(c).update(t.photos).set({ visibility }).where(eq(t.photos.id, c.req.param("id"))).returning({ id: t.photos.id });
  if (!res.length) return bad(c, "not found", 404);
  return c.json({ ok: true, visibility });
});

/** My photos with their visibility (for the post composer's picker). */
socialRoutes.get("/social/my-photos", async (c) => {
  const rows = await db(c).select({ id: t.photos.id, date: t.photos.date, refKind: t.photos.refKind, caption: t.photos.caption, visibility: t.photos.visibility })
    .from(t.photos).where(ne(t.photos.refKind, "avatar")).orderBy(desc(t.photos.createdAt)).limit(120);
  return c.json(rows);
});

// ================================================================== profiles

const MS_DAY = 864e5;

/** Forgiving weekly streak: weeks in a row (Sat-Fri) with 2+ training days; the current week only counts once it qualifies. */
function weeklyStreak(dates: string[], today: string) {
  const per = new Map<string, number>();
  for (const d of new Set(dates)) { const w = weekStartOf(d); per.set(w, (per.get(w) ?? 0) + 1); }
  let w = weekStartOf(today), n = 0;
  if ((per.get(w) ?? 0) >= 2) n++;
  for (let i = 0; i < 260; i++) {
    w = addDays(w, -7);
    if ((per.get(w) ?? 0) >= 2) n++; else break;
  }
  return n;
}

async function trainingDates(raw: RawDB, ids: string[], since: string) {
  if (!ids.length) return new Map<string, string[]>();
  const rows = await raw.all<{ u: string; d: string }>(sql`
    select user_id u, date d from sessions where user_id in (${idList(ids)}) and status = 'done' and date >= ${since}
    union select user_id u, date d from cardio where user_id in (${idList(ids)}) and status != 'skipped' and date >= ${since}`);
  const out = new Map<string, string[]>();
  for (const r of rows) (out.get(r.u) ?? out.set(r.u, []).get(r.u)!).push(r.d);
  return out;
}

async function profileView(c: C, username: string, as?: "friends") {
  const raw = rawDb(c);
  const u = await userByName(raw, username);
  if (!u) return null;
  let rel = await relationOf(raw, me(c), u.id);
  if (rel === "blocked") {
    const [mine] = await raw.select({ id: t.friendships.id }).from(t.friendships).where(and(eq(t.friendships.requesterId, me(c)), eq(t.friendships.addresseeId, u.id), eq(t.friendships.status, "blocked")));
    if (!mine) return null; // they blocked me → the profile doesn't exist for me
    return { user: { id: u.id, username: u.username, name: u.name, avatarId: null }, relation: rel as Relation, preview: false };
  }
  if (as === "friends") { if (rel !== "self") return null; rel = "friends"; }
  const pv = privacyOf(u);
  const profileOpen = rel === "self" || (pv.profile !== "private" && (rel === "friends" || pv.profile === "members"));
  const today = todayOf(c);
  const see = { profile: profileOpen, workouts: canSee(pv.workouts, rel), prs: canSee(pv.prs, rel), stats: canSee(pv.stats, rel) && profileOpen, body: canSee(pv.body, rel), online: canSee(pv.online, rel), photos: rel === "friends" || rel === "self" };
  const [[friendsN], [postsN], mutual] = await Promise.all([
    raw.select({ n: sql<number>`count(*)` }).from(t.friendships).where(and(eq(t.friendships.status, "accepted"), or(eq(t.friendships.requesterId, u.id), eq(t.friendships.addresseeId, u.id)))),
    raw.select({ n: sql<number>`count(*)` }).from(t.posts).where(and(eq(t.posts.userId, u.id), eq(t.posts.deleted, 0), rel === "self" && !as ? undefined : eq(t.posts.visibility, "friends"))),
    rel === "self" ? Promise.resolve(0) : Promise.all([friendIds(raw, me(c)), friendIds(raw, u.id)]).then(([a, b]) => b.filter((x) => a.includes(x)).length),
  ]);
  const out: Record<string, unknown> = {
    user: { id: u.id, username: u.username, name: u.name, avatarId: u.avatarId }, relation: rel, preview: as === "friends", see,
    counts: { friends: friendsN.n, posts: see.photos ? postsN.n : null }, mutual,
  };
  if (see.profile) out.bio = u.bio;
  if (see.online) out.lastSeenAt = u.lastSeenAt;
  if (see.stats) {
    const [[w], [first], dates] = await Promise.all([
      raw.select({ n: sql<number>`count(*)` }).from(t.sessions).where(and(eq(t.sessions.userId, u.id), eq(t.sessions.status, "done"))),
      raw.select({ date: t.sessions.date }).from(t.sessions).where(and(eq(t.sessions.userId, u.id), eq(t.sessions.status, "done"))).orderBy(t.sessions.date).limit(1),
      trainingDates(raw, [u.id], addDays(today, -400)),
    ]);
    out.stats = { workouts: w.n, since: first?.date ?? null, streak: weeklyStreak(dates.get(u.id) ?? [], today) };
  }
  if (see.prs) {
    const prs = await raw.select({ exKey: t.sets.exKey, weightKg: t.sets.weightKg, kgBasis: t.sets.kgBasis, reps: t.sets.reps, doneAt: t.sets.doneAt }).from(t.sets)
      .where(and(eq(t.sets.userId, u.id), eq(t.sets.pr, 1), eq(t.sets.deleted, 0))).orderBy(desc(t.sets.doneAt)).limit(6);
    const [cnt] = await raw.select({ n: sql<number>`count(*)` }).from(t.sets).where(and(eq(t.sets.userId, u.id), eq(t.sets.pr, 1), eq(t.sets.deleted, 0)));
    const names = await exNames(raw, prs.map((p) => p.exKey));
    out.prs = { count: cnt.n, recent: prs.map((p) => ({ name: names.get(p.exKey)!, kg: shownKg(p), reps: p.reps, date: new Date(p.doneAt + 3 * 3600e3).toISOString().slice(0, 10) })) };
  }
  if (see.workouts) out.workouts = await recentWorkouts(raw, u.id);
  if (see.stats || see.workouts) out.week = await weekStrip(raw, u.id, today);
  if (see.stats || see.prs) out.badges = (await badgesOf(raw, u.id, today)).filter((b) => (see.prs || !b.id.startsWith("pr")) && (see.stats || b.id.startsWith("pr")) && (rel === "self" || b.earned));
  if (see.body) {
    const [bw] = await raw.select({ kg: t.body.weightKg, date: t.body.date }).from(t.body).where(and(eq(t.body.userId, u.id), sql`${t.body.weightKg} is not null`)).orderBy(desc(t.body.date)).limit(1);
    out.body = bw ?? null;
  }
  return out;
}

/** This week, Saturday → Friday: lifting and/or cardio per day. */
async function weekStrip(raw: RawDB, uid: string, today: string): Promise<WeekDay[]> {
  const from = weekStartOf(today);
  const rows = await raw.all<{ d: string; k: string }>(sql`
    select date d, 'l' k from sessions where user_id = ${uid} and status = 'done' and date >= ${from}
    union select date d, 'c' k from cardio where user_id = ${uid} and status != 'skipped' and date >= ${from}`);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i);
    return { date, lift: rows.some((r) => r.d === date && r.k === "l"), cardio: rows.some((r) => r.d === date && r.k === "c") };
  });
}

/** Longest run of qualifying weeks (2+ training days) in the last ~5 years. */
function bestStreak(dates: string[], today: string) {
  const per = new Map<string, number>();
  for (const d of new Set(dates)) { const w = weekStartOf(d); per.set(w, (per.get(w) ?? 0) + 1); }
  let best = 0, run = 0;
  for (let w = weekStartOf(addDays(today, -1820)); w <= today; w = addDays(w, 7)) {
    if ((per.get(w) ?? 0) >= 2) best = Math.max(best, ++run); else if (w !== weekStartOf(today)) run = 0;
  }
  return best;
}

async function badgesOf(raw: RawDB, uid: string, today: string): Promise<Badge[]> {
  const [agg] = await raw.all<{ w: number; p: number; v: number; c: number }>(sql`
    select (select count(*) from sessions where user_id = ${uid} and status = 'done') w,
      (select count(*) from sets where user_id = ${uid} and pr = 1 and deleted = 0) p,
      (select coalesce(sum(coalesce(weight_kg,0) * coalesce(reps,0) * case when kg_basis = 'per_hand' then 2 else 1 end), 0) from sets where user_id = ${uid} and deleted = 0 and kind != 'W') v,
      (select count(*) from cardio where user_id = ${uid} and status != 'skipped') c`);
  const dates = (await trainingDates(raw, [uid], addDays(today, -1830))).get(uid) ?? [];
  const stat = { workouts: agg?.w ?? 0, prs: agg?.p ?? 0, tonnes: Math.floor((agg?.v ?? 0) / 1000), cardio: agg?.c ?? 0, bestStreak: bestStreak(dates, today) };
  return BADGES.map((b) => ({ id: b.id, label: b.label, icon: b.icon, tier: b.tier, value: stat[b.stat], target: b.target, earned: stat[b.stat] >= b.target }));
}

async function recentWorkouts(raw: RawDB, uid: string) {
  const sess = await raw.select({ id: t.sessions.id, date: t.sessions.date, dayName: t.sessions.dayName, startedAt: t.sessions.startedAt, endedAt: t.sessions.endedAt }).from(t.sessions)
    .where(and(eq(t.sessions.userId, uid), eq(t.sessions.status, "done"))).orderBy(desc(t.sessions.date), desc(t.sessions.startedAt)).limit(5);
  if (!sess.length) return [];
  const agg = await raw.select({ s: t.sets.sessionId, exKey: t.sets.exKey, kind: t.sets.kind, weightKg: t.sets.weightKg, kgBasis: t.sets.kgBasis, reps: t.sets.reps, pr: t.sets.pr }).from(t.sets)
    .where(and(eq(t.sets.userId, uid), eq(t.sets.deleted, 0), inArray(t.sets.sessionId, sess.map((s) => s.id))));
  return sess.map((s) => {
    const xs = agg.filter((x) => x.s === s.id && x.kind !== "W");
    return {
      date: s.date, dayName: s.dayName, minutes: s.startedAt && s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null,
      sets: xs.length, volume: Math.round(xs.reduce((a, x) => a + totalKg(x) * (x.reps ?? 0), 0)), prs: xs.filter((x) => x.pr === 1).length,
    };
  });
}

socialRoutes.get("/social/profile/:username", async (c) => {
  const v = await profileView(c, c.req.param("username"), c.req.query("as") === "friend" ? "friends" : undefined);
  return v ? c.json(v) : bad(c, "User not found", 404);
});

/** A friend's photos that are shared with friends (metadata only; images via /api/social/photos). */
socialRoutes.get("/social/users/:username/photos", async (c) => {
  const raw = rawDb(c);
  const u = await userByName(raw, c.req.param("username"));
  if (!u) return bad(c, "User not found", 404);
  const rel = await relationOf(raw, me(c), u.id);
  const self = rel === "self" && c.req.query("as") !== "friend";
  if (rel !== "friends" && rel !== "self") return c.json([]);
  const rows = await raw.select({ id: t.photos.id, date: t.photos.date, caption: t.photos.caption, refKind: t.photos.refKind, w: t.photos.w, h: t.photos.h }).from(t.photos)
    .where(and(eq(t.photos.userId, u.id), ne(t.photos.refKind, "avatar"), self ? undefined : eq(t.photos.visibility, "friends")))
    .orderBy(desc(t.photos.date), desc(t.photos.createdAt)).limit(120);
  return c.json(rows);
});

// ================================================================== posts + feed

/** Can `uid` see this post? Author always; friends when it's shared with friends; never when deleted or blocked. */
async function visiblePost(raw: RawDB, uid: string, postId: string) {
  if (!ID_RE.test(postId)) return null;
  const [p] = await raw.select().from(t.posts).where(and(eq(t.posts.id, postId), eq(t.posts.deleted, 0)));
  if (!p) return null;
  if (p.userId === uid) return p;
  if (p.visibility !== "friends") return null;
  return (await relationOf(raw, uid, p.userId)) === "friends" ? p : null;
}

async function hydrate(raw: RawDB, uid: string, rows: (typeof t.posts.$inferSelect)[]): Promise<Post[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const blocked = new Set(await blockedIds(raw, uid));
  const [users, likes, liked, comments, last] = await Promise.all([
    lite(raw, rows.map((r) => r.userId)),
    raw.select({ p: t.postLikes.postId, n: sql<number>`count(*)` }).from(t.postLikes).where(inArray(t.postLikes.postId, ids)).groupBy(t.postLikes.postId),
    raw.select({ p: t.postLikes.postId }).from(t.postLikes).where(and(inArray(t.postLikes.postId, ids), eq(t.postLikes.userId, uid))),
    raw.select({ p: t.postComments.postId, n: sql<number>`count(*)` }).from(t.postComments).where(and(inArray(t.postComments.postId, ids), eq(t.postComments.deleted, 0))).groupBy(t.postComments.postId),
    raw.select({ p: t.postComments.postId, u: t.postComments.userId, text: t.postComments.text, at: t.postComments.createdAt }).from(t.postComments)
      .where(and(inArray(t.postComments.postId, ids), eq(t.postComments.deleted, 0))).orderBy(desc(t.postComments.createdAt)).limit(200),
  ]);
  // "Liked by omar and 2 others": the two most recent likers that aren't me, friends first
  const fset = new Set(await friendIds(raw, uid));
  const likers = await raw.select({ p: t.postLikes.postId, u: t.postLikes.userId }).from(t.postLikes)
    .where(and(inArray(t.postLikes.postId, ids), ne(t.postLikes.userId, uid))).orderBy(desc(t.postLikes.createdAt)).limit(300);
  const prevU = await lite(raw, [...last.map((l) => l.u), ...likers.map((l) => l.u)]);
  const likeN = new Map(likes.map((l) => [l.p, l.n]));
  const mine = new Set(liked.map((l) => l.p));
  const comN = new Map(comments.map((x) => [x.p, x.n]));
  return rows.map((r) => {
    const pv = last.find((l) => l.p === r.id && !blocked.has(l.u));
    let photoIds: string[] = [], data = null;
    try { photoIds = r.photoIds ? (JSON.parse(r.photoIds) as string[]) : []; } catch { /* ignore */ }
    try { data = r.data ? JSON.parse(r.data) : null; } catch { /* ignore */ }
    return {
      id: r.id, kind: r.kind as PostKind, text: r.text, photoIds, data, visibility: r.visibility as Post["visibility"], createdAt: r.createdAt, updatedAt: r.updatedAt,
      author: users.get(r.userId) ?? { id: r.userId, username: "unknown", name: null, avatarId: null },
      likes: likeN.get(r.id) ?? 0, liked: mine.has(r.id), comments: comN.get(r.id) ?? 0,
      preview: pv ? { username: prevU.get(pv.u)?.username ?? "", text: pv.text.slice(0, 140) } : null, mine: r.userId === uid,
      likedBy: likers.filter((l) => l.p === r.id && !blocked.has(l.u)).sort((a, z) => Number(fset.has(z.u)) - Number(fset.has(a.u))).slice(0, 2).map((l) => prevU.get(l.u)).filter((x): x is UserLite => !!x),
    };
  });
}

/** Cursor = "<createdAt>_<id>" of the last post on the previous page. */
function cursorWhere(cur: string | undefined): SQL | undefined {
  const m = /^(\d{1,15})_([\w.-]{2,64})$/.exec(cur ?? "");
  if (!m) return undefined;
  const at = Number(m[1]);
  return or(lt(t.posts.createdAt, at), and(eq(t.posts.createdAt, at), lt(t.posts.id, m[2])));
}

/** Feed: my posts + friends' posts shared with friends, newest first. ?user=<username> = one person's posts (profile). */
socialRoutes.get("/feed", async (c) => {
  const raw = rawDb(c);
  const uid = me(c);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 10, 1), 30);
  let who: SQL;
  const uname = c.req.query("user");
  if (uname) {
    const u = await userByName(raw, uname);
    if (!u) return c.json({ posts: [], next: null });
    const rel = await relationOf(raw, uid, u.id);
    const asFriend = rel === "self" && c.req.query("as") === "friend";
    if (rel !== "self" && rel !== "friends") return c.json({ posts: [], next: null });
    who = rel === "self" && !asFriend ? eq(t.posts.userId, uid) : and(eq(t.posts.userId, u.id), eq(t.posts.visibility, "friends"))!;
  } else {
    who = or(eq(t.posts.userId, uid), and(sql`${t.posts.userId} in ${friendIdsSql(uid)}`, eq(t.posts.visibility, "friends")))!;
  }
  const rows = await raw.select().from(t.posts).where(and(eq(t.posts.deleted, 0), who, cursorWhere(c.req.query("cursor"))))
    .orderBy(desc(t.posts.createdAt), desc(t.posts.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return c.json({ posts: await hydrate(raw, uid, page), next: rows.length > limit && last ? `${last.createdAt}_${last.id}` : null });
});

socialRoutes.get("/posts/:id", async (c) => {
  const raw = rawDb(c);
  const p = await visiblePost(raw, me(c), c.req.param("id"));
  if (!p) return bad(c, "Post not found", 404);
  return c.json((await hydrate(raw, me(c), [p]))[0]);
});

/** What I can share: recent finished workouts + recent PRs (my own data via db(c)). */
socialRoutes.get("/social/shareable", async (c) => {
  const d = db(c);
  const raw = rawDb(c);
  const sess = await d.select({ id: t.sessions.id, date: t.sessions.date, dayName: t.sessions.dayName }).from(t.sessions).where(eq(t.sessions.status, "done")).orderBy(desc(t.sessions.date), desc(t.sessions.startedAt)).limit(10);
  const prs = await d.select({ id: t.sets.id, exKey: t.sets.exKey, weightKg: t.sets.weightKg, kgBasis: t.sets.kgBasis, reps: t.sets.reps, doneAt: t.sets.doneAt }).from(t.sets)
    .where(and(eq(t.sets.pr, 1), eq(t.sets.deleted, 0))).orderBy(desc(t.sets.doneAt)).limit(10);
  const names = await exNames(raw, prs.map((p) => p.exKey));
  return c.json({ workouts: sess, prs: prs.map((p) => ({ id: p.id, name: names.get(p.exKey), kg: shownKg(p), reps: p.reps, doneAt: p.doneAt })) });
});

/** Snapshot of MY finished workout. Only aggregates + exercise names: never notes, pain, readiness or RPE. */
async function workoutSummary(c: C, sessionId: string): Promise<WorkoutSummary | null> {
  const d = db(c);
  const [s] = await d.select().from(t.sessions).where(and(eq(t.sessions.id, sessionId), eq(t.sessions.status, "done")));
  if (!s) return null;
  const sets = await d.select({ exKey: t.sets.exKey, kind: t.sets.kind, weightKg: t.sets.weightKg, kgBasis: t.sets.kgBasis, reps: t.sets.reps, seconds: t.sets.seconds, pr: t.sets.pr, doneAt: t.sets.doneAt })
    .from(t.sets).where(and(eq(t.sets.sessionId, sessionId), eq(t.sets.deleted, 0))).orderBy(t.sets.doneAt);
  const work = sets.filter((x) => x.kind !== "W");
  const names = await exNames(rawDb(c), work.map((x) => x.exKey));
  const byEx = new Map<string, typeof work>();
  for (const x of work) (byEx.get(x.exKey) ?? byEx.set(x.exKey, []).get(x.exKey)!).push(x);
  const best = (xs: typeof work) => {
    const w = xs.filter((x) => x.reps).sort((a, z) => (shownKg(z) ?? 0) - (shownKg(a) ?? 0) || (z.reps ?? 0) - (a.reps ?? 0))[0];
    if (w) return shownKg(w) ? `${+(shownKg(w)!).toFixed(2)} kg × ${w.reps}` : `${w.reps} reps`;
    const s2 = xs.filter((x) => x.seconds).sort((a, z) => (z.seconds ?? 0) - (a.seconds ?? 0))[0];
    return s2 ? `${s2.seconds} s` : null;
  };
  return {
    dayName: s.dayName, date: s.date, minutes: s.startedAt && s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null,
    sets: work.length, hardSets: work.filter((x) => x.kind === "N" || x.kind === "F").length,
    volume: Math.round(work.reduce((a, x) => a + totalKg(x) * (x.reps ?? 0), 0)),
    exercises: [...byEx.entries()].slice(0, 12).map(([k, xs]) => ({ name: names.get(k)!, sets: xs.length, best: best(xs) })),
    prs: work.filter((x) => x.pr === 1).slice(0, 6).map((x) => ({ name: names.get(x.exKey)!, kg: shownKg(x), reps: x.reps })),
    muscles: muscleSets(work),
  };
}

/** Hard sets per muscle group, biggest first (for the little bar viz on workout cards). */
function muscleSets(work: { exKey: string; kind: string | null }[]) {
  const m = new Map<string, number>();
  for (const x of work) if ((x.kind === "N" || x.kind === "F") && EX_GROUP[x.exKey]) m.set(EX_GROUP[x.exKey], (m.get(EX_GROUP[x.exKey]) ?? 0) + 1);
  return [...m.entries()].sort((a, z) => z[1] - a[1]).slice(0, 6).map(([group, sets]) => ({ group, sets }));
}

/** Preview of the share card before posting (my own finished workout). */
socialRoutes.get("/social/workout-preview/:sessionId", async (c) => {
  const w = await workoutSummary(c, c.req.param("sessionId"));
  return w ? c.json(w) : bad(c, "Workout not found", 404);
});

async function prSummary(c: C, setId: string): Promise<PrSummary | null> {
  const [x] = await db(c).select().from(t.sets).where(and(eq(t.sets.id, setId), eq(t.sets.pr, 1), eq(t.sets.deleted, 0)));
  if (!x) return null;
  const kg = shownKg(x);
  const names = await exNames(rawDb(c), [x.exKey]);
  return { name: names.get(x.exKey)!, kg, reps: x.reps, e1rm: kg && x.reps && x.reps <= 12 ? Math.round(kg * (1 + x.reps / 30) * 10) / 10 : null, date: new Date(x.doneAt + 3 * 3600e3).toISOString().slice(0, 10) };
}

socialRoutes.post("/posts", async (c) => {
  const b = await body<{ id: string; kind: string; text: string; photoIds: string[]; sessionId: string; setId: string; visibility: string }>(c);
  const id = String(b.id ?? "");
  if (!ID_RE.test(id)) return bad(c, "bad id");
  const kind = b.kind as PostKind;
  if (!POST_KINDS.includes(kind)) return bad(c, "bad kind");
  const visibility = b.visibility === "private" ? "private" : "friends";
  const text = str(b.text, LIMITS.postText) || null;
  const photoIds = Array.isArray(b.photoIds) ? [...new Set(b.photoIds.map(String))].slice(0, LIMITS.photosPerPost) : [];
  const raw = rawDb(c);
  const d = db(c);
  const [exists] = await raw.select({ id: t.posts.id, userId: t.posts.userId }).from(t.posts).where(eq(t.posts.id, id));
  if (exists) return exists.userId === me(c) ? c.json({ ok: true, id }) : bad(c, "bad id", 409); // idempotent retry
  const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.posts).where(and(eq(t.posts.userId, me(c)), gte(t.posts.createdAt, now() - MS_DAY)));
  if (n >= 30) return bad(c, "That's a lot of posts today. Try again tomorrow.", 429);
  if (photoIds.length) {
    if (!photoIds.every((p) => ID_RE.test(p))) return bad(c, "bad photo id");
    const own = await d.select({ id: t.photos.id }).from(t.photos).where(inArray(t.photos.id, photoIds));
    if (own.length !== photoIds.length) return bad(c, "photo not found", 404);
  }
  let data: WorkoutSummary | PrSummary | null = null;
  let sessionId: string | null = null;
  if (kind === "workout") {
    if (!ID_RE.test(String(b.sessionId ?? ""))) return bad(c, "Pick a finished workout");
    const [dup] = await raw.select({ id: t.posts.id }).from(t.posts).where(and(eq(t.posts.userId, me(c)), eq(t.posts.sessionId, String(b.sessionId)), eq(t.posts.deleted, 0)));
    if (dup) return bad(c, "This workout is already shared", 409);
    data = await workoutSummary(c, String(b.sessionId));
    if (!data) return bad(c, "Workout not found (only finished workouts can be shared)", 404);
    sessionId = String(b.sessionId);
  } else if (kind === "pr") {
    if (!ID_RE.test(String(b.setId ?? ""))) return bad(c, "Pick a PR");
    data = await prSummary(c, String(b.setId));
    if (!data) return bad(c, "PR not found", 404);
  } else if (kind === "photo" || kind === "progress") {
    if (!photoIds.length) return bad(c, "Add at least one photo");
  } else if (!text) return bad(c, "Write something");
  // a post shared with friends shares its photos with friends (the composer says so)
  if (photoIds.length && visibility === "friends") await d.update(t.photos).set({ visibility: "friends" }).where(inArray(t.photos.id, photoIds));
  await raw.insert(t.posts).values({ id, userId: me(c), kind, text, photoIds: photoIds.length ? JSON.stringify(photoIds) : null, sessionId, data: data ? JSON.stringify(data) : null, visibility, createdAt: now(), updatedAt: now(), deleted: 0 });
  return c.json({ ok: true, id });
});

socialRoutes.put("/posts/:id", async (c) => {
  const b = await body<{ text: string; visibility: string }>(c);
  const set: Partial<typeof t.posts.$inferInsert> = { updatedAt: now() };
  if (b.text !== undefined) set.text = str(b.text, LIMITS.postText) || null;
  if (b.visibility !== undefined) { if (b.visibility !== "friends" && b.visibility !== "private") return bad(c, "bad visibility"); set.visibility = b.visibility; }
  const res = await rawDb(c).update(t.posts).set(set).where(and(eq(t.posts.id, c.req.param("id")), eq(t.posts.userId, me(c)), eq(t.posts.deleted, 0))).returning({ kind: t.posts.kind, text: t.posts.text });
  if (!res.length) return bad(c, "Post not found", 404);
  return c.json({ ok: true });
});

socialRoutes.delete("/posts/:id", async (c) => {
  const raw = rawDb(c);
  const res = await raw.update(t.posts).set({ deleted: 1, updatedAt: now() }).where(and(eq(t.posts.id, c.req.param("id")), eq(t.posts.userId, me(c)))).returning({ id: t.posts.id });
  if (!res.length) return bad(c, "Post not found", 404);
  await raw.delete(t.notifications).where(and(inArray(t.notifications.kind, ["like", "comment"]), eq(t.notifications.refId, c.req.param("id"))));
  return c.json({ ok: true });
});

socialRoutes.post("/posts/:id/like", async (c) => {
  const raw = rawDb(c);
  const p = await visiblePost(raw, me(c), c.req.param("id"));
  if (!p) return bad(c, "Post not found", 404);
  await raw.insert(t.postLikes).values({ postId: p.id, userId: me(c), createdAt: now() }).onConflictDoNothing();
  await notify(raw, { userId: p.userId, kind: "like", actorId: me(c), refId: p.id, id: `lk-${p.id}-${me(c)}` });
  const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.postLikes).where(eq(t.postLikes.postId, p.id));
  return c.json({ ok: true, likes: n, liked: true });
});
socialRoutes.delete("/posts/:id/like", async (c) => {
  const raw = rawDb(c);
  const id = c.req.param("id");
  await raw.delete(t.postLikes).where(and(eq(t.postLikes.postId, id), eq(t.postLikes.userId, me(c))));
  await raw.delete(t.notifications).where(and(eq(t.notifications.id, `lk-${id}-${me(c)}`), sql`${t.notifications.readAt} is null`));
  const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.postLikes).where(eq(t.postLikes.postId, id));
  return c.json({ ok: true, likes: n, liked: false });
});

/** Who liked a post (visible to anyone who can see the post; blocked people hidden). */
socialRoutes.get("/posts/:id/likes", async (c) => {
  const raw = rawDb(c);
  const p = await visiblePost(raw, me(c), c.req.param("id"));
  if (!p) return bad(c, "Post not found", 404);
  const blocked = new Set(await blockedIds(raw, me(c)));
  const rows = await raw.select({ u: t.postLikes.userId }).from(t.postLikes).where(eq(t.postLikes.postId, p.id)).orderBy(desc(t.postLikes.createdAt)).limit(200);
  const users = await lite(raw, rows.map((r) => r.u));
  return c.json(rows.filter((r) => !blocked.has(r.u)).map((r) => users.get(r.u)).filter(Boolean));
});

socialRoutes.get("/posts/:id/comments", async (c) => {
  const raw = rawDb(c);
  const p = await visiblePost(raw, me(c), c.req.param("id"));
  if (!p) return bad(c, "Post not found", 404);
  const blocked = new Set(await blockedIds(raw, me(c)));
  const rows = await raw.select().from(t.postComments).where(and(eq(t.postComments.postId, p.id), eq(t.postComments.deleted, 0))).orderBy(t.postComments.createdAt).limit(300);
  const users = await lite(raw, rows.map((r) => r.userId));
  const out: Comment[] = rows.filter((r) => !blocked.has(r.userId)).map((r) => ({
    id: r.id, text: r.text, createdAt: r.createdAt, author: users.get(r.userId) ?? { id: r.userId, username: "unknown", name: null, avatarId: null },
    canDelete: r.userId === me(c) || p.userId === me(c),
  }));
  return c.json(out);
});

socialRoutes.post("/posts/:id/comments", async (c) => {
  const b = await body<{ id: string; text: string }>(c);
  const raw = rawDb(c);
  const p = await visiblePost(raw, me(c), c.req.param("id"));
  if (!p) return bad(c, "Post not found", 404);
  const id = String(b.id ?? "");
  if (!ID_RE.test(id)) return bad(c, "bad id");
  const text = str(b.text, LIMITS.comment);
  if (!text) return bad(c, "Write a comment");
  const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.postComments).where(and(eq(t.postComments.userId, me(c)), gte(t.postComments.createdAt, now() - 3600e3)));
  if (n >= 60) return bad(c, "Slow down a little.", 429);
  const ins = await raw.insert(t.postComments).values({ id, postId: p.id, userId: me(c), text, createdAt: now(), deleted: 0 }).onConflictDoNothing().returning({ id: t.postComments.id });
  if (ins.length) await notify(raw, { userId: p.userId, kind: "comment", actorId: me(c), refId: p.id, id: `cm-${id}` });
  return c.json({ ok: true, id });
});

/** Delete a comment: its author, or the author of the post. */
socialRoutes.delete("/comments/:id", async (c) => {
  const raw = rawDb(c);
  const [cm] = await raw.select({ id: t.postComments.id, userId: t.postComments.userId, postId: t.postComments.postId }).from(t.postComments).where(eq(t.postComments.id, c.req.param("id")));
  if (!cm) return bad(c, "Comment not found", 404);
  const [p] = await raw.select({ userId: t.posts.userId }).from(t.posts).where(eq(t.posts.id, cm.postId));
  if (cm.userId !== me(c) && p?.userId !== me(c)) return bad(c, "Not allowed", 403);
  await raw.update(t.postComments).set({ deleted: 1 }).where(eq(t.postComments.id, cm.id));
  await raw.delete(t.notifications).where(eq(t.notifications.id, `cm-${cm.id}`));
  return c.json({ ok: true });
});

// ================================================================== notifications

socialRoutes.get("/notifications", async (c) => {
  const raw = rawDb(c);
  const uid = me(c);
  const before = Number(c.req.query("before")) || 0;
  const blocked = await blockedIds(raw, uid);
  const rows = await raw.select().from(t.notifications)
    .where(and(eq(t.notifications.userId, uid), before ? lt(t.notifications.createdAt, before) : undefined, blocked.length ? sql`coalesce(${t.notifications.actorId}, '') not in (${idList(blocked.slice(0, 90))})` : undefined))
    .orderBy(desc(t.notifications.createdAt)).limit(40);
  const users = await lite(raw, rows.map((r) => r.actorId ?? ""));
  const postIds = rows.filter((r) => (r.kind === "like" || r.kind === "comment") && r.refId).map((r) => r.refId!);
  const chIds = rows.filter((r) => r.kind.startsWith("challenge_") && r.refId).map((r) => r.refId!);
  const posts = postIds.length ? await raw.select({ id: t.posts.id, text: t.posts.text, kind: t.posts.kind, data: t.posts.data, deleted: t.posts.deleted, photoIds: t.posts.photoIds }).from(t.posts).where(inArray(t.posts.id, [...new Set(postIds)].slice(0, 90))) : [];
  const chs = chIds.length ? await raw.select({ id: t.challenges.id, title: t.challenges.title }).from(t.challenges).where(inArray(t.challenges.id, [...new Set(chIds)].slice(0, 90))) : [];
  const snip = (p: (typeof posts)[number]) => {
    if (p.text) return p.text.slice(0, 80);
    try { const d = JSON.parse(p.data ?? "null") as { dayName?: string; name?: string } | null; return d?.dayName ?? d?.name ?? `${p.kind} post`; } catch { return `${p.kind} post`; }
  };
  const relKinds = new Set(["friend_request", "friend_accept", "cheer"]);
  const relIds = [...new Set(rows.filter((r) => relKinds.has(r.kind) && r.actorId).map((r) => r.actorId!))].slice(0, 30);
  const rels = new Map(await Promise.all(relIds.map(async (id) => [id, await relationOf(raw, uid, id)] as const)));
  const thumbOf = (p: (typeof posts)[number] | undefined) => { try { return p && !p.deleted && p.photoIds ? (JSON.parse(p.photoIds) as string[])[0] ?? null : null; } catch { return null; } };
  const out: Notif[] = rows.map((r) => {
    const p = posts.find((x) => x.id === r.refId);
    const ch = chs.find((x) => x.id === r.refId);
    return {
      id: r.id, kind: r.kind, actor: r.actorId ? users.get(r.actorId) ?? null : null, refId: p?.deleted ? null : r.refId, snippet: p ? (p.deleted ? "(deleted post)" : snip(p)) : ch ? ch.title : null,
      createdAt: r.createdAt, read: r.readAt != null, thumb: thumbOf(p), relation: r.actorId ? rels.get(r.actorId) : undefined,
    };
  });
  return c.json({ items: out, next: rows.length === 40 ? rows[rows.length - 1].createdAt : null });
});

/** Badge count for the nav (cheap; also refreshes "last seen" at most once a minute). */
socialRoutes.get("/notifications/unread", async (c) => {
  const raw = rawDb(c);
  const uid = me(c);
  const [[{ n }], [{ r }]] = await Promise.all([
    raw.select({ n: sql<number>`count(*)` }).from(t.notifications).where(and(eq(t.notifications.userId, uid), sql`${t.notifications.readAt} is null`)),
    raw.select({ r: sql<number>`count(*)` }).from(t.friendships).where(and(eq(t.friendships.addresseeId, uid), eq(t.friendships.status, "pending"))),
  ]);
  await raw.update(t.users).set({ lastSeenAt: now() }).where(and(eq(t.users.id, uid), sql`coalesce(${t.users.lastSeenAt}, 0) < ${now() - 60_000}`));
  return c.json({ count: n, requests: r });
});

/** Mark read: {ids:[…]} or everything. */
socialRoutes.post("/notifications/read", async (c) => {
  const b = await body<{ ids: string[] }>(c);
  const ids = Array.isArray(b.ids) ? b.ids.map(String).filter((x) => ID_RE.test(x)).slice(0, 90) : null;
  await rawDb(c).update(t.notifications).set({ readAt: now() })
    .where(and(eq(t.notifications.userId, me(c)), sql`${t.notifications.readAt} is null`, ids ? inArray(t.notifications.id, ids.length ? ids : ["-"]) : undefined));
  return c.json({ ok: true });
});

// ================================================================== leaderboard + challenges

/**
 * Value of one metric per user over [from, to] (dates inclusive; from = null → all time). Aggregated in SQL so all-time
 * boards stay cheap. Volume: SUM(kg × reps) grouped by exercise + kg basis, then × 2 for dumbbell pairs logged per hand
 * (same as shared/load.ts totalKg). Hard sets = kinds N + F. Streak ignores the range (it's "current").
 */
async function metricValues(raw: RawDB, ids: string[], metric: MetricId, from: string | null, to: string, muscle: string | null): Promise<Map<string, number>> {
  const out = new Map<string, number>(ids.map((i) => [i, 0]));
  if (!ids.length) return out;
  const range = (col: string) => sql.raw(col).append(from ? sql` >= ${from} and ${sql.raw(col)} <= ${to}` : sql` <= ${to}`);
  if (metric === "workouts" || metric === "minutes" || metric === "consistency") {
    const rows = await raw.all<{ u: string; d: number; m: number; ms: number; all: number }>(sql`
      select user_id u,
        sum(case when status = 'done' and kind != 'extra' then 1 else 0 end) d,
        sum(case when status in ('missed','skipped') and coalesce(excuse,'') not in ('planned','sick') then 1 else 0 end) m,
        sum(case when status = 'done' and started_at is not null and ended_at - started_at between 300000 and 18000000 then ended_at - started_at else 0 end) ms,
        sum(case when status = 'done' then 1 else 0 end) "all"
      from sessions where user_id in (${idList(ids)}) and ${range("date")} group by user_id`);
    for (const r of rows) {
      out.set(r.u, metric === "workouts" ? r.all : metric === "minutes" ? Math.round(r.ms / 60000) : r.d + r.m ? Math.round((r.d / (r.d + r.m)) * 100) : 0);
    }
    return out;
  }
  if (metric === "cardio_minutes" || metric === "cardio_sessions") {
    const rows = await raw.all<{ u: string; m: number; n: number }>(sql`select user_id u, sum(coalesce(minutes,0)) m, count(*) n from cardio where user_id in (${idList(ids)}) and status != 'skipped' and ${range("date")} group by user_id`);
    for (const r of rows) out.set(r.u, metric === "cardio_sessions" ? r.n : Math.round(r.m));
    return out;
  }
  if (metric === "streak") {
    const dates = await trainingDates(raw, ids, addDays(to, -400));
    for (const i of ids) out.set(i, weeklyStreak(dates.get(i) ?? [], to));
    return out;
  }
  // set-based metrics
  const rows = await raw.all<{ u: string; ex: string; b: string | null; k: string; n: number; v: number; p: number }>(sql`
    select x.user_id u, x.ex_key ex, x.kg_basis b, x.kind k, count(*) n, sum(coalesce(x.weight_kg,0) * coalesce(x.reps,0)) v, sum(x.pr) p
    from sets x join sessions s on s.id = x.session_id and s.user_id = x.user_id
    where x.user_id in (${idList(ids)}) and x.deleted = 0 and ${range("s.date")}
    group by x.user_id, x.ex_key, x.kg_basis, x.kind`);
  for (const r of rows) {
    const hard = r.k === "N" || r.k === "F";
    let add = 0;
    if (metric === "hard_sets") add = hard ? r.n : 0;
    else if (metric === "prs") add = r.p;
    else if (metric === "muscle_sets") add = hard && EX_GROUP[r.ex] === muscle ? r.n : 0;
    else if (metric === "volume") add = r.k === "W" ? 0 : r.v * (isPair(r.ex) ? (r.b === "per_hand" ? 2 : 1) : 1);
    else if (metric === "muscle_volume") add = r.k === "W" || EX_GROUP[r.ex] !== muscle ? 0 : r.v * (isPair(r.ex) ? (r.b === "per_hand" ? 2 : 1) : 1);
    out.set(r.u, (out.get(r.u) ?? 0) + add);
  }
  if (metric === "volume" || metric === "muscle_volume") for (const [k, v] of out) out.set(k, Math.round(v));
  return out;
}

/** Competition ranking (1, 1, 3). Zero = not ranked yet ("getting started", never shown as last place). */
function rank(values: Map<string, number>) {
  const sorted = [...values.entries()].filter(([, v]) => v > 0).sort((a, z) => z[1] - a[1]);
  const r = new Map<string, number>();
  sorted.forEach(([id, v], i) => r.set(id, i > 0 && sorted[i - 1][1] === v ? r.get(sorted[i - 1][0])! : i + 1));
  return r;
}

function periodRange(period: Period, today: string): { from: string | null; to: string; prevFrom: string | null; prevTo: string } {
  if (period === "week") { const from = weekStartOf(today); return { from, to: today, prevFrom: addDays(from, -7), prevTo: addDays(today, -7) }; }
  if (period === "month") {
    const from = `${today.slice(0, 8)}01`;
    const pm = new Date(`${from}T12:00:00Z`); pm.setUTCMonth(pm.getUTCMonth() - 1);
    const prevFrom = pm.toISOString().slice(0, 10);
    const dim = new Date(Date.UTC(pm.getUTCFullYear(), pm.getUTCMonth() + 1, 0)).getUTCDate();
    return { from, to: today, prevFrom, prevTo: `${prevFrom.slice(0, 8)}${String(Math.min(Number(today.slice(8)), dim)).padStart(2, "0")}` };
  }
  return { from: null, to: today, prevFrom: null, prevTo: addDays(today, -7) };
}

const isMetric = (m: unknown): m is MetricId => typeof m === "string" && m in METRIC;
const isMuscle = (m: unknown): m is string => typeof m === "string" && (GROUPS as readonly string[]).includes(m);

socialRoutes.get("/compete/board", async (c) => {
  const raw = rawDb(c);
  const uid = me(c);
  const metric = isMetric(c.req.query("metric")) ? (c.req.query("metric") as MetricId) : "workouts";
  const period: Period = (["week", "month", "all"] as const).find((p) => p === c.req.query("period")) ?? "week";
  const muscle = needsMuscle(metric) ? (isMuscle(c.req.query("muscle")) ? c.req.query("muscle")! : "Back") : null;
  const today = todayOf(c);
  const { from, to, prevFrom, prevTo } = periodRange(period, today);
  const [meRow] = await raw.select({ privacy: t.users.privacy }).from(t.users).where(eq(t.users.id, uid));
  const joined = privacyOf(meRow).leaderboard;
  const fids = await friendIds(raw, uid);
  const fr = fids.length ? await raw.select({ id: t.users.id, privacy: t.users.privacy }).from(t.users).where(inArray(t.users.id, fids.slice(0, 89))) : [];
  const optedIn = fr.filter((f) => privacyOf(f).leaderboard).map((f) => f.id);
  const board: Board = { joined, metric, period, muscle, from: from ?? "", to, rows: [], hidden: fids.length - optedIn.length };
  if (!joined) return c.json(board); // reciprocity: join to see the board
  const ids = [uid, ...optedIn];
  const [cur, prev] = await Promise.all([
    metricValues(raw, ids, metric, from, to, muscle),
    metric === "streak" || metric === "consistency" ? Promise.resolve(null) : metricValues(raw, ids, metric, prevFrom, prevTo, muscle),
  ]);
  const r = rank(cur), pr = prev ? rank(prev) : null;
  const users = await lite(raw, ids);
  // sparkline: the same metric for the last 8 calendar weeks (streak has no weekly value)
  const wk0 = weekStartOf(today);
  const weeks = metric === "streak" ? [] : await Promise.all(Array.from({ length: 8 }, (_, i) => {
    const from = addDays(wk0, -7 * (7 - i));
    return metricValues(raw, ids, metric, from, i === 7 ? today : addDays(from, 6), muscle);
  }));
  const dates = await trainingDates(raw, ids, addDays(today, -400));
  board.rows = ids.map((id): BoardRow => ({
    user: users.get(id)!, value: cur.get(id) ?? 0, rank: r.get(id) ?? 0, prevRank: pr ? pr.get(id) ?? null : null, me: id === uid,
    trend: weeks.length ? weeks.map((w) => w.get(id) ?? 0) : undefined, streak: weeklyStreak(dates.get(id) ?? [], today),
  }))
    .filter((x) => x.user)
    .sort((a, z) => (a.rank || 1e9) - (z.rank || 1e9) || a.user.username.localeCompare(z.user.username));
  return c.json(board);
});

/** Cheer a friend (Strava "kudos" for a whole week): 1 per pair per day → notification. */
socialRoutes.post("/cheer/:userId", async (c) => {
  const raw = rawDb(c);
  const uid = me(c), other = c.req.param("userId");
  if ((await relationOf(raw, uid, other)) !== "friends") return bad(c, "Only friends can cheer", 403);
  const day = todayOf(c);
  const [recent] = await raw.select({ id: t.notifications.id }).from(t.notifications)
    .where(and(eq(t.notifications.userId, other), eq(t.notifications.actorId, uid), eq(t.notifications.kind, "cheer"), gte(t.notifications.createdAt, now() - 20 * 3600e3)));
  if (recent) return bad(c, "You already cheered them today 💪", 429);
  const b = await body<{ challengeId: string }>(c);
  await notify(raw, { userId: other, kind: "cheer", actorId: uid, refId: typeof b.challengeId === "string" && ID_RE.test(b.challengeId) ? b.challengeId : null, id: `cheer-${uid}-${other}-${day}` });
  return c.json({ ok: true });
});

/** Can I see this challenge? Member · or the creator is my friend and it's open to friends / I was invited. */
async function challengeAccess(raw: RawDB, uid: string, ch: typeof t.challenges.$inferSelect) {
  const [m] = await raw.select({ u: t.challengeMembers.userId }).from(t.challengeMembers).where(and(eq(t.challengeMembers.challengeId, ch.id), eq(t.challengeMembers.userId, uid)));
  if (m) return { see: true, member: true, invited: false };
  const [inv] = await raw.select({ id: t.notifications.id }).from(t.notifications).where(and(eq(t.notifications.userId, uid), eq(t.notifications.kind, "challenge_invite"), eq(t.notifications.refId, ch.id)));
  const rel = ch.createdBy === uid ? "self" : await relationOf(raw, uid, ch.createdBy);
  const see = rel === "self" || (rel === "friends" && (ch.visibility === "friends" || !!inv)) || (!!inv && rel !== "blocked");
  return { see, member: false, invited: !!inv };
}

async function challengeView(raw: RawDB, uid: string, ch: typeof t.challenges.$inferSelect, today: string): Promise<Challenge> {
  const acc = await challengeAccess(raw, uid, ch);
  const blocked = new Set(await blockedIds(raw, uid));
  const mem = (await raw.select().from(t.challengeMembers).where(eq(t.challengeMembers.challengeId, ch.id))).filter((m) => !blocked.has(m.userId));
  const status = today < ch.startDate ? "upcoming" : today > ch.endDate ? "finished" : "running";
  const ids = mem.map((m) => m.userId);
  const metric = ch.metric as MetricId;
  const vals = status === "upcoming" ? new Map(ids.map((i) => [i, 0])) : await metricValues(raw, ids, metric, ch.startDate, status === "finished" ? ch.endDate : today, ch.muscle);
  const r = rank(vals);
  const users = await lite(raw, [...ids, ch.createdBy]);
  const members = ids.map((id) => ({ user: users.get(id)!, value: vals.get(id) ?? 0, rank: r.get(id) ?? 0, done: ch.target != null && (vals.get(id) ?? 0) >= ch.target, me: id === uid }))
    .filter((m) => m.user).sort((a, z) => (a.rank || 1e9) - (z.rank || 1e9) || a.user.username.localeCompare(z.user.username));
  const winners = status !== "finished" ? [] : ch.target != null ? members.filter((m) => m.done).map((m) => m.user.id) : members.filter((m) => m.rank === 1).map((m) => m.user.id);
  if (status === "finished") {
    // one "challenge finished" / "you won" notification per member, created lazily the first time anyone looks
    for (const m of mem) await notify(raw, { userId: m.userId, kind: winners.includes(m.userId) ? "challenge_won" : "challenge_done", refId: ch.id, id: `chd-${ch.id}-${m.userId}` });
  }
  return {
    id: ch.id, title: ch.title, metric, target: ch.target, muscle: ch.muscle, startDate: ch.startDate, endDate: ch.endDate, visibility: ch.visibility as Challenge["visibility"],
    createdBy: users.get(ch.createdBy) ?? { id: ch.createdBy, username: "unknown", name: null, avatarId: null }, createdAt: ch.createdAt,
    status, joined: acc.member, canJoin: !acc.member && acc.see && status !== "finished", mine: ch.createdBy === uid, members, winners,
  };
}

socialRoutes.get("/challenges", async (c) => {
  const raw = rawDb(c);
  const uid = me(c);
  const today = todayOf(c);
  const rows = await raw.select().from(t.challenges).where(and(
    gte(t.challenges.endDate, addDays(today, -45)),
    or(
      sql`${t.challenges.id} in (select challenge_id from challenge_members where user_id = ${uid})`,
      eq(t.challenges.createdBy, uid),
      sql`${t.challenges.createdBy} in ${friendIdsSql(uid)}`,
      sql`${t.challenges.id} in (select ref_id from notifications where user_id = ${uid} and kind = 'challenge_invite')`,
    ),
  )).orderBy(desc(t.challenges.endDate)).limit(30);
  const out: Challenge[] = [];
  for (const ch of rows) {
    if (!(await challengeAccess(raw, uid, ch)).see) continue;
    out.push(await challengeView(raw, uid, ch, today));
  }
  const order = { running: 0, upcoming: 1, finished: 2 };
  out.sort((a, z) => order[a.status] - order[z.status] || (a.status === "finished" ? z.endDate.localeCompare(a.endDate) : a.endDate.localeCompare(z.endDate)));
  return c.json(out);
});

socialRoutes.get("/challenges/:id", async (c) => {
  const raw = rawDb(c);
  const [ch] = await raw.select().from(t.challenges).where(eq(t.challenges.id, c.req.param("id")));
  if (!ch || !(await challengeAccess(raw, me(c), ch)).see) return bad(c, "Challenge not found", 404);
  return c.json(await challengeView(raw, me(c), ch, todayOf(c)));
});

socialRoutes.post("/challenges", async (c) => {
  const b = await body<{ id: string; title: string; metric: string; target: number | null; muscle: string | null; startDate: string; endDate: string; visibility: string; invite: string[] }>(c);
  const raw = rawDb(c);
  const uid = me(c);
  const id = String(b.id ?? "");
  if (!ID_RE.test(id)) return bad(c, "bad id");
  const title = str(b.title, LIMITS.challengeTitle);
  if (!title) return bad(c, "Give it a name");
  if (!isMetric(b.metric) || !METRIC[b.metric].challenge) return bad(c, "Pick what counts");
  const muscle = needsMuscle(b.metric) ? (isMuscle(b.muscle) ? b.muscle : null) : null;
  if (needsMuscle(b.metric) && !muscle) return bad(c, "Pick a muscle group");
  const target = b.target == null || b.target === 0 ? null : Number(b.target);
  if (target != null && (!Number.isFinite(target) || target <= 0 || target > 1e8)) return bad(c, "Target must be a positive number");
  const today = todayOf(c);
  if (!DATE_RE.test(b.startDate ?? "") || !DATE_RE.test(b.endDate ?? "")) return bad(c, "Pick dates");
  if (b.endDate! < b.startDate! || b.endDate! < today) return bad(c, "End date must be after the start and not in the past");
  if (b.startDate! < addDays(today, -7)) return bad(c, "Start can be at most a week ago");
  if ((Date.parse(b.endDate!) - Date.parse(b.startDate!)) / MS_DAY > 92) return bad(c, "Max 3 months");
  const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.challenges).where(and(eq(t.challenges.createdBy, uid), gte(t.challenges.createdAt, now() - MS_DAY)));
  if (n >= 10) return bad(c, "Too many new challenges today", 429);
  const ins = await raw.insert(t.challenges).values({ id, createdBy: uid, title, metric: b.metric, target, muscle, startDate: b.startDate!, endDate: b.endDate!, visibility: b.visibility === "invite" ? "invite" : "friends", createdAt: now() })
    .onConflictDoNothing().returning({ id: t.challenges.id });
  if (!ins.length) return bad(c, "bad id", 409);
  await raw.insert(t.challengeMembers).values({ challengeId: id, userId: uid, joinedAt: now() }).onConflictDoNothing();
  await invite(raw, uid, id, Array.isArray(b.invite) ? b.invite : []);
  return c.json({ ok: true, id });
});

async function invite(raw: RawDB, uid: string, chId: string, users: unknown[]) {
  const fids = new Set(await friendIds(raw, uid));
  let n = 0;
  for (const u of users.map(String).filter((x) => fids.has(x)).slice(0, 50)) {
    await notify(raw, { userId: u, kind: "challenge_invite", actorId: uid, refId: chId, id: `chi-${chId}-${u}` });
    n++;
  }
  return n;
}

socialRoutes.post("/challenges/:id/invite", async (c) => {
  const raw = rawDb(c);
  const [ch] = await raw.select().from(t.challenges).where(eq(t.challenges.id, c.req.param("id")));
  if (!ch || !(await challengeAccess(raw, me(c), ch)).member) return bad(c, "Join the challenge first", 403);
  const b = await body<{ userIds: string[] }>(c);
  return c.json({ ok: true, invited: await invite(raw, me(c), ch.id, Array.isArray(b.userIds) ? b.userIds : []) });
});

socialRoutes.post("/challenges/:id/join", async (c) => {
  const raw = rawDb(c);
  const [ch] = await raw.select().from(t.challenges).where(eq(t.challenges.id, c.req.param("id")));
  if (!ch || !(await challengeAccess(raw, me(c), ch)).see) return bad(c, "Challenge not found", 404);
  if (todayOf(c) > ch.endDate) return bad(c, "This challenge is over");
  const [{ n }] = await raw.select({ n: sql<number>`count(*)` }).from(t.challengeMembers).where(eq(t.challengeMembers.challengeId, ch.id));
  if (n >= 50) return bad(c, "Challenge is full");
  const ins = await raw.insert(t.challengeMembers).values({ challengeId: ch.id, userId: me(c), joinedAt: now() }).onConflictDoNothing().returning({ u: t.challengeMembers.userId });
  if (ins.length) await notify(raw, { userId: ch.createdBy, kind: "challenge_join", actorId: me(c), refId: ch.id, id: `chj-${ch.id}-${me(c)}` });
  await raw.update(t.notifications).set({ readAt: now() }).where(and(eq(t.notifications.userId, me(c)), eq(t.notifications.kind, "challenge_invite"), eq(t.notifications.refId, ch.id)));
  return c.json({ ok: true });
});
socialRoutes.delete("/challenges/:id/join", async (c) => {
  await rawDb(c).delete(t.challengeMembers).where(and(eq(t.challengeMembers.challengeId, c.req.param("id")), eq(t.challengeMembers.userId, me(c))));
  return c.json({ ok: true });
});
socialRoutes.delete("/challenges/:id", async (c) => {
  const raw = rawDb(c);
  const res = await raw.delete(t.challenges).where(and(eq(t.challenges.id, c.req.param("id")), eq(t.challenges.createdBy, me(c)))).returning({ id: t.challenges.id });
  if (!res.length) return bad(c, "Only the creator can delete it", 403);
  await raw.delete(t.challengeMembers).where(eq(t.challengeMembers.challengeId, res[0].id));
  await raw.delete(t.notifications).where(and(sql`${t.notifications.kind} like 'challenge_%'`, eq(t.notifications.refId, res[0].id)));
  return c.json({ ok: true });
});

// ================================================================== stories (feed top row)

/** Me + friends, ring = trained today (only if their workouts are shared with friends), newest visible post to jump to. */
socialRoutes.get("/social/stories", async (c) => {
  const raw = rawDb(c);
  const uid = me(c);
  const today = todayOf(c);
  const fids = (await friendIds(raw, uid)).slice(0, 89);
  const ids = [uid, ...fids];
  const [users, privs, dates, posts] = await Promise.all([
    lite(raw, ids),
    fids.length ? raw.select({ id: t.users.id, privacy: t.users.privacy }).from(t.users).where(inArray(t.users.id, fids)) : Promise.resolve([]),
    trainingDates(raw, ids, today),
    raw.all<{ u: string; id: string; at: number }>(sql`
      select user_id u, id, max(created_at) at from posts where deleted = 0 and user_id in (${idList(ids)}) and (user_id = ${uid} or visibility = 'friends') group by user_id`),
  ]);
  const showsWorkouts = new Map(privs.map((p) => [p.id, privacyOf(p).workouts === "friends"]));
  const out: Story[] = ids.filter((id) => users.has(id)).map((id) => {
    const p = posts.find((x) => x.u === id);
    const visible = id === uid || showsWorkouts.get(id) === true;
    return { user: users.get(id)!, me: id === uid, trainedToday: visible && (dates.get(id) ?? []).includes(today), lastPostId: p?.id ?? null, lastPostAt: p?.at ?? null };
  });
  out.sort((a, z) => Number(z.me) - Number(a.me) || Number(z.trainedToday) - Number(a.trainedToday) || (z.lastPostAt ?? 0) - (a.lastPostAt ?? 0));
  return c.json(out);
});

// ================================================================== lift comparison ("who lifts more")

/**
 * People I may compare with: me + friends who joined the leaderboard AND share `item` (prs for lifts, stats for muscle
 * volume) with friends. Reciprocity: I must have joined too. Bodyweight only for people who share it with friends.
 */
async function comparePeople(c: C, item: "prs" | "stats") {
  const raw = rawDb(c);
  const uid = me(c);
  const [meRow] = await raw.select({ privacy: t.users.privacy }).from(t.users).where(eq(t.users.id, uid));
  const joined = privacyOf(meRow).leaderboard;
  const fids = (await friendIds(raw, uid)).slice(0, 89);
  const fr = fids.length ? await raw.select({ id: t.users.id, privacy: t.users.privacy }).from(t.users).where(inArray(t.users.id, fids)) : [];
  const ok = fr.filter((f) => { const p = privacyOf(f); return p.leaderboard && p[item] === "friends"; });
  const bodyOk = new Set([uid, ...ok.filter((f) => privacyOf(f).body === "friends").map((f) => f.id)]);
  const ids = joined ? [uid, ...ok.map((f) => f.id)] : [];
  const users = await lite(raw, ids);
  const bw: Record<string, number> = {};
  if (ids.length) {
    const rows = await raw.all<{ u: string; kg: number }>(sql`
      select b.user_id u, b.weight_kg kg from body_logs b where b.user_id in (${idList(ids)}) and b.weight_kg is not null
        and b.date = (select max(x.date) from body_logs x where x.user_id = b.user_id and x.weight_kg is not null)`);
    for (const r of rows) if (bodyOk.has(r.u)) bw[r.u] = r.kg;
  }
  return { raw, uid, joined, ids, people: ids.map((i) => users.get(i)).filter((x): x is UserLite => !!x), bodyweight: bw, hidden: fids.length - ok.length };
}

/** Per-hand kg for dumbbell pairs (same rule as shared/load shownKg), the logged number otherwise. */
const shown = (ex: string, kg: number, basis: string | null) => (isPair(ex) && basis !== "per_hand" ? kg / 2 : kg);
/** Strict sets for e1RM: normal + failure, 1-12 reps, real weight. Warm-ups, drops and rest-pause don't count. */
const STRICT = sql`x.kind in ('N','F') and x.deleted = 0 and x.reps between 1 and 12 and coalesce(x.weight_kg, 0) > 0`;

socialRoutes.get("/compete/lifts", async (c) => {
  const { raw, joined, ids, people, bodyweight, hidden } = await comparePeople(c, "prs");
  const out: LiftsBoard = { joined, people, bodyweight, lifts: [], hidden };
  if (!ids.length) return c.json(out);
  // SQLite: bare columns next to max() come from the row holding the max → the best set itself
  const rows = await raw.all<{ u: string; ex: string; b: string | null; e: number; kg: number; reps: number; d: string }>(sql`
    select x.user_id u, x.ex_key ex, x.kg_basis b, max(x.weight_kg * (1 + x.reps / 30.0)) e, x.weight_kg kg, x.reps reps, s.date d
    from sets x join sessions s on s.id = x.session_id and s.user_id = x.user_id
    where x.user_id in (${idList(ids)}) and ${STRICT} group by x.user_id, x.ex_key, x.kg_basis`);
  const by = new Map<string, Record<string, LiftBest>>();
  for (const r of rows) {
    const kg = shown(r.ex, r.kg, r.b);
    const best: LiftBest = { e1rm: epley(kg, r.reps), kg: Math.round(kg * 100) / 100, reps: r.reps, date: r.d };
    const m = by.get(r.ex) ?? by.set(r.ex, {}).get(r.ex)!;
    if (!m[r.u] || m[r.u].e1rm < best.e1rm) m[r.u] = best;
  }
  const names = await exNames(raw, [...by.keys()]);
  const top = (r: Record<string, LiftBest>) => Math.max(...Object.values(r).map((x) => x.e1rm));
  out.lifts = [...by.entries()].map(([key, best]): LiftRow => ({ key, name: names.get(key)!, group: EX_GROUP[key] ?? null, perHand: isPair(key), best }))
    .sort((a, z) => Object.keys(z.best).length - Object.keys(a.best).length || top(z.best) - top(a.best));
  return c.json(out);
});

socialRoutes.get("/compete/lifts/:exKey", async (c) => {
  const ex = c.req.param("exKey");
  if (!/^[\w.-]{1,80}$/.test(ex)) return bad(c, "bad exercise");
  const { raw, joined, ids, people, bodyweight } = await comparePeople(c, "prs");
  if (!joined) return bad(c, "Join the leaderboard first", 403);
  const rows = await raw.all<{ u: string; b: string | null; e: number; kg: number; reps: number; d: string }>(sql`
    select x.user_id u, x.kg_basis b, max(x.weight_kg * (1 + x.reps / 30.0)) e, x.weight_kg kg, x.reps reps, s.date d
    from sets x join sessions s on s.id = x.session_id and s.user_id = x.user_id
    where x.user_id in (${idList(ids)}) and x.ex_key = ${ex} and ${STRICT} group by x.user_id, s.date, x.kg_basis order by s.date`);
  const out: LiftDetail = { key: ex, name: (await exNames(raw, [ex])).get(ex)!, perHand: isPair(ex), people, bodyweight, best: {}, series: {} };
  for (const r of rows) {
    const kg = shown(ex, r.kg, r.b);
    const e = epley(kg, r.reps);
    const s = out.series[r.u] ?? (out.series[r.u] = []);
    const last = s[s.length - 1];
    if (last?.date === r.d) last.e1rm = Math.max(last.e1rm, e); else s.push({ date: r.d, e1rm: e });
    if (!out.best[r.u] || out.best[r.u].e1rm < e) out.best[r.u] = { e1rm: e, kg: Math.round(kg * 100) / 100, reps: r.reps, date: r.d };
  }
  for (const k of Object.keys(out.series)) out.series[k] = out.series[k].slice(-40);
  return c.json(out);
});

/** Hard sets per muscle group per person (people who share their stats + joined the leaderboard). */
socialRoutes.get("/compete/muscles", async (c) => {
  const period: Period = (["week", "month", "all"] as const).find((p) => p === c.req.query("period")) ?? "month";
  const { raw, ids, joined, people } = await comparePeople(c, "stats");
  const out: MuscleBoard = { joined, people, period, groups: [] };
  if (!ids.length) return c.json(out);
  const { from, to } = periodRange(period, todayOf(c));
  const rows = await raw.all<{ u: string; ex: string; n: number }>(sql`
    select x.user_id u, x.ex_key ex, count(*) n from sets x join sessions s on s.id = x.session_id and s.user_id = x.user_id
    where x.user_id in (${idList(ids)}) and x.deleted = 0 and x.kind in ('N','F') and s.date <= ${to} ${from ? sql`and s.date >= ${from}` : sql``}
    group by x.user_id, x.ex_key`);
  const g = new Map<string, Record<string, number>>();
  for (const r of rows) { const grp = EX_GROUP[r.ex]; if (!grp) continue; const m = g.get(grp) ?? g.set(grp, {}).get(grp)!; m[r.u] = (m[r.u] ?? 0) + r.n; }
  out.groups = GROUPS.filter((x) => g.has(x)).map((group) => ({ group, sets: g.get(group)! }));
  return c.json(out);
});

// ================================================================== DEV seed

// Tiny gradient PNGs (24×30, generated once) so photo posts have something to show in DEV.
const PNG: Record<string, string> = {"a":"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","b":"iVBORw0KGgoAAAANSUhEUgAAABgAAAAeCAIAAAC5TEmyAAAGxElEQVR42gXBgQbCQAAA0P1umuY0xznOcpa1rGnN5myOc5wyxpQiIiIiIkZExIiIETGi3tP05c9Y/sDyZy5/cPlDyx9e/sjyZy1/dPmzlz9n+XOXP2/585e/YPkLl794+WPLX7r88eVPLH9y+VPLn6bPv8b8C+Zfc/6F8y+af/H8S+Zfa/6l8689/zrzrzv/evOvP/8G8284/8bzL5t/0/mXz79i/pXzr5p/Nb1ojKIBRWMWDSwaVDS4aEjRWEVDi8YuGqdo3KLxisYvmqBowqKJi4YVTVo0vGhE0ciiUUWj6fnHyD8g/5j5B+YflH9w/iH5x8o/NP/Y+cfJP27+8fKPn3+C/BPmnzj/sPyT5h+ef0T+kflH5R9Nz95G9gbZ28zeMHuj7I2zN8neVvam2dvO3k72drO3l7397B1k7zB7x9mbZe80e/PsLbK3zN4qe2v6rDZmNZjV5qyGsxrNajyryay2ZjWd1fasdma1O6u9We3P6mBWh7M6ntVsVqezms9qMavlrFazWtPVy1AvoF6mekH1QuqF1Yuol6VeVL1s9XLUy1UvT7189QrUK1SvWL2YeqXqxdVLqJdUL6Vemi6fhnwC+TTlE8onkk8sn0Q+Lfmk8mnLpyOfrnx68unLZyCfoXzG8snkM5VPLp9CPqV8KvnUdPEwxAOIhykeUDyQeGDxIOJhiQcVD1s8HPFwxcMTD188AvEIxSMWDyYeqXhw8RDiIcVDiYem88rgFeCVySvIK8QrzCvCK4tXlFc2rxxeubzyeOXzKuBVyKuYV4xXKa84rwSvJK8UrzQ9uRvJHSR3M7nD5I6SO07uJLlbyZ0mdzu5O8ndTe5ecveTe5Dcw+QeJ3eW3NPkzpO7SO4yuavkrunsZrAbYDeT3SC7IXbD7EbYzWI3ym42uzns5rKbx24+uwXsFrJbzG6M3VJ24+wm2E2ym2I3TY+uRnQF0dWMrjC6ouiKoyuJrlZ0pdHVjq5OdHWjqxdd/egaRNcwusbRlUXXNLry6Cqiq4yuKrpq+uRiTC5gcjEnFzi5oMkFTy5kcrEmFzq52JOLM7m4k4s3ufiTSzC5hJNLPLmwySWdXPjkIiYXObmoyUXTx6UxLsG4NMclHJdoXOJxScalNS7puLTHpTMu3XHpjUt/XAbjMhyX8bhk4zIdl3xcinEpx6Ual5o+OhujMxidzdEZjs5odMajMxmdrdGZjs726OyMzu7o7I3O/ugcjM7h6ByPzmx0TkdnPjqL0VmOzmp01vThyRiewPBkDk9weELDEx6eyPBkDU90eLKHJ2d4cocnb3jyh6dgeAqHp3h4YsNTOjzx4UkMT3J4UsOTpg+OxuAIBkdzcISDIxoc8eBIBkdrcKSDoz04OoOjOzh6g6M/OAaDYzg4xoMjGxzTwZEPjmJwlIOjGhw1vX8w+gfQP5j9A+wfUP+A+wfSP1j9A+0f7P7B6R/c/sHrH/z+Iegfwv4h7h9Y/5D2D7x/EP2D7B9U/6DpdG/QPaB7k+4h3SO6x3RP6N6ie0r3Nt07dO/SvUf3Pt0HdB/SfUz3jO5Tuud0L+he0r2ie03v7YzeDvR2Zm8HezvU2+HejvR2Vm9Hezu7t3N6O7e383o7v7cLeruwt4t7O9bbpb0d7+1Ebyd7O9XbaTrZGmQLyNYkW0i2iGwx2RKytciWkq1Ntg7ZumTrka1PtgHZhmQbky0j25RsOdkKspVkq8hW0/HGwBuANybeQLxBeIPxhuCNhTcUb2y8cfDGxRsPb3y8CfAmxJsYbxjepHjD8UbgjcQbhTeajtYGWgO0NtEaojVCa4zWBK0ttKZobaO1g9YuWnto7aN1gNYhWsdozdA6RWuO1gKtJVortNZ0uDLgCsCVCVcQrhBcYbgicGXBFYUrG64cuHLhyoMrH64CuArhKoYrBlcpXHG4EnAl4UrBlaZ3F0Z3AboLs7uA3QXqLnB3QboLq7ug3YXdXTjdhdtdeN2F310E3UXYXcTdBesu0u6Cdxeiu5DdheouNB0UBigAKExQQFAgUGBQEFBYoKCgsEHhgMIFhQcKHxQBKEJQxKBgoEhBwUEhQCFBoUCh6Z3c6OSgk5udHHZy1MlxJyed3OrktJPbndzp5G4n9zq538mDTh528riTs06ednLeyUUnl51cdXJNb2dGOwPtzGxnsJ2hdobbGWlnVjuj7cxuZ047c9uZ1878dha0s7Cdxe2MtbO0nfF2JtqZbGeqnWl6a2q0pqA1NVtT2Jqi1hS3pqQ1tVpT2praranTmrqtqdea+q1p0JqGrWncmrLWNG1NeWsqWlPZmqrW9A/YoWeUQ/jVtAAAAABJRU5ErkJggg==","c":"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"}
;

/** DEV seed hook: called by POST /api/dev/seed after the dev users exist. users = { dev, omar, sara } ids (DEV database only). */
export async function seedSocial(raw: RawDB, users: Record<string, string>) {
  const { dev, omar, sara } = users;
  const all = [dev, omar, sara];
  const T = Date.now();
  const H = 3600e3;
  // wipe social rows of the test users (DEV database only)
  await raw.delete(t.friendships).where(or(inArray(t.friendships.requesterId, all), inArray(t.friendships.addresseeId, all)));
  await raw.delete(t.postLikes).where(sql`${t.postLikes.postId} in (select id from posts where user_id in (${idList(all)}))`);
  await raw.delete(t.postComments).where(sql`${t.postComments.postId} in (select id from posts where user_id in (${idList(all)}))`);
  await raw.delete(t.posts).where(inArray(t.posts.userId, all));
  await raw.delete(t.notifications).where(inArray(t.notifications.userId, all));
  await raw.delete(t.challengeMembers).where(sql`${t.challengeMembers.challengeId} in (select id from challenges where created_by in (${idList(all)}))`);
  await raw.delete(t.challenges).where(inArray(t.challenges.createdBy, all));
  await raw.delete(t.photos).where(sql`${t.photos.id} like 'seed-ph-%'`);

  // friendships: dev↔omar, dev↔sara accepted; omar → sara pending
  await raw.insert(t.friendships).values([
    { id: "seed-fr-1", requesterId: omar, addresseeId: dev, status: "accepted", createdAt: T - 30 * 24 * H, respondedAt: T - 29 * 24 * H },
    { id: "seed-fr-2", requesterId: dev, addresseeId: sara, status: "accepted", createdAt: T - 20 * 24 * H, respondedAt: T - 20 * 24 * H },
    { id: "seed-fr-3", requesterId: omar, addresseeId: sara, status: "pending", createdAt: T - 5 * H, respondedAt: null },
  ]);
  // privacy: everyone on the leaderboard · omar shares bodyweight · sara hides PRs and opens her profile header to members
  const pv: Record<string, object> = { [dev]: { leaderboard: true }, [omar]: { leaderboard: true, body: "friends" }, [sara]: { leaderboard: true, prs: "private", profile: "members" } };
  for (const id of all) await raw.update(t.users).set({ privacy: JSON.stringify({ ...PRIVACY_DEFAULTS, ...pv[id] }), lastSeenAt: T - (id === omar ? 2 * 60e3 : 5 * H) }).where(eq(t.users.id, id));

  // photos owned by each user, shared with friends (+ one private photo of Sara's that friends must NOT see)
  const day = (back: number) => new Date(T + 3 * H - back * 24 * H).toISOString().slice(0, 10);
  const photo = (id: string, userId: string, key: string, back: number, visibility = "friends") =>
    ({ id, userId, refKind: "progress", refId: null, exKey: null, sessionId: null, date: day(back), caption: null, mime: "image/png", w: 24, h: 30, bytes: PNG[key].length, data: PNG[key], visibility, thumb: PNG[key], createdAt: T - back * 24 * H });
  await raw.insert(t.photos).values([
    photo("seed-ph-omar-1", omar, "a", 2), photo("seed-ph-omar-2", omar, "b", 2),
    photo("seed-ph-sara-1", sara, "c", 1), photo("seed-ph-sara-private", sara, "b", 3, "private"),
    photo("seed-ph-dev-1", dev, "b", 4),
  ]);

  // the dummy training is identical for all three → make the leaderboard interesting (DEV database only):
  // Omar lifts ~15% heavier and has 4 PRs, Sara does extra cardio and has 2 PRs, dev has 1 PR.
  await raw.update(t.sets).set({ weightKg: sql`round(${t.sets.weightKg} * 1.15, 1)` }).where(and(eq(t.sets.userId, omar), sql`${t.sets.weightKg} is not null`));
  for (const [u, k] of [[omar, 4], [sara, 2], [dev, 1]] as const) {
    const top = await raw.select({ id: t.sets.id }).from(t.sets).where(and(eq(t.sets.userId, u), eq(t.sets.kind, "N"), eq(t.sets.deleted, 0), sql`${t.sets.weightKg} is not null`)).orderBy(desc(t.sets.doneAt)).limit(k * 7);
    const ids = top.filter((_, i) => i % 7 === 0).map((x) => x.id);
    if (ids.length) await raw.update(t.sets).set({ pr: 1 }).where(inArray(t.sets.id, ids));
  }
  await raw.delete(t.cardio).where(sql`${t.cardio.id} like 'seed-cardio-%'`);
  await raw.insert(t.cardio).values([1, 3, 5].map((back) => ({ id: `seed-cardio-${back}`, userId: sara, date: day(back), protocol: "football", status: "done", startedAt: null, endedAt: null, minutes: 25 + back * 5, distanceKm: null, kcalMachine: null, kcalEst: null, rpe: 6, speedAdj: null, note: null, sessionId: null, createdAt: T - back * 24 * H })));

  // a workout post per person, snapshotted from their dummy sessions (no notes / pain)
  const posts: (typeof t.posts.$inferInsert)[] = [];
  const captions = ["Back at it 💪", "Leg day done. Can't feel my legs.", "حصة سحب حلوة النهارده"];
  for (const [i, u] of all.entries()) {
    const [s] = await raw.select().from(t.sessions).where(and(eq(t.sessions.userId, u), eq(t.sessions.status, "done"))).orderBy(desc(t.sessions.date)).limit(1);
    if (!s) continue;
    const sets = await raw.select().from(t.sets).where(and(eq(t.sets.sessionId, s.id), eq(t.sets.deleted, 0)));
    const work = sets.filter((x) => x.kind !== "W");
    const names = await exNames(raw, work.map((x) => x.exKey));
    const byEx = new Map<string, number>();
    work.forEach((x) => byEx.set(x.exKey, (byEx.get(x.exKey) ?? 0) + 1));
    const data: WorkoutSummary = {
      dayName: s.dayName, date: s.date, minutes: s.startedAt && s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null, sets: work.length,
      hardSets: work.filter((x) => x.kind === "N" || x.kind === "F").length, volume: Math.round(work.reduce((a, x) => a + totalKg(x) * (x.reps ?? 0), 0)),
      exercises: [...byEx.entries()].slice(0, 8).map(([k, n]) => ({ name: names.get(k)!, sets: n, best: null })),
      prs: work.filter((x) => x.pr === 1).slice(0, 4).map((x) => ({ name: names.get(x.exKey)!, kg: shownKg(x), reps: x.reps })),
    };
    posts.push({ id: `seed-post-w-${i}`, userId: u, kind: "workout", text: captions[i], photoIds: null, sessionId: s.id, data: JSON.stringify(data), visibility: "friends", createdAt: T - (10 + i * 7) * H, updatedAt: T - (10 + i * 7) * H, deleted: 0 });
  }
  posts.push(
    { id: "seed-post-p-omar", userId: omar, kind: "progress", text: "8 weeks in. Shoulders finally showing up.", photoIds: JSON.stringify(["seed-ph-omar-1", "seed-ph-omar-2"]), sessionId: null, data: null, visibility: "friends", createdAt: T - 2 * H, updatedAt: T - 2 * H, deleted: 0 },
    { id: "seed-post-ph-sara", userId: sara, kind: "photo", text: "New gym, new light 🌅", photoIds: JSON.stringify(["seed-ph-sara-1"]), sessionId: null, data: null, visibility: "friends", createdAt: T - 26 * H, updatedAt: T - 26 * H, deleted: 0 },
    { id: "seed-post-t-dev", userId: dev, kind: "text", text: "Who's in for Friday morning pull-up practice?", photoIds: null, sessionId: null, data: null, visibility: "friends", createdAt: T - 40 * H, updatedAt: T - 40 * H, deleted: 0 },
    { id: "seed-post-priv-sara", userId: sara, kind: "text", text: "(private post: friends must not see this)", photoIds: null, sessionId: null, data: null, visibility: "private", createdAt: T - 1 * H, updatedAt: T - 1 * H, deleted: 0 },
  );
  await raw.insert(t.posts).values(posts);
  await raw.insert(t.postLikes).values([
    { postId: "seed-post-p-omar", userId: dev, createdAt: T - H },
    { postId: "seed-post-w-0", userId: omar, createdAt: T - 9 * H }, { postId: "seed-post-w-0", userId: sara, createdAt: T - 8 * H },
    { postId: "seed-post-ph-sara", userId: dev, createdAt: T - 20 * H },
  ]);
  await raw.insert(t.postComments).values([
    { id: "seed-cm-1", postId: "seed-post-w-0", userId: omar, text: "Beast 🔥", createdAt: T - 9 * H, deleted: 0 },
    { id: "seed-cm-2", postId: "seed-post-w-0", userId: sara, text: "What weight on the rows?", createdAt: T - 8 * H, deleted: 0 },
    { id: "seed-cm-3", postId: "seed-post-t-dev", userId: sara, text: "I'm in!", createdAt: T - 30 * H, deleted: 0 },
  ]);

  // a running challenge with all three + a finished one (dev vs sara)
  await raw.insert(t.challenges).values([
    { id: "seed-ch-1", createdBy: dev, title: "November hard sets", metric: "hard_sets", target: 150, muscle: null, startDate: day(7), endDate: day(-21), visibility: "friends", createdAt: T - 7 * 24 * H },
    { id: "seed-ch-2", createdBy: sara, title: "Back week", metric: "muscle_sets", target: null, muscle: "Back", startDate: day(14), endDate: day(8), visibility: "friends", createdAt: T - 14 * 24 * H },
  ]);
  await raw.insert(t.challengeMembers).values([
    ...all.map((u) => ({ challengeId: "seed-ch-1", userId: u, joinedAt: T - 6 * 24 * H })),
    { challengeId: "seed-ch-2", userId: sara, joinedAt: T - 14 * 24 * H }, { challengeId: "seed-ch-2", userId: dev, joinedAt: T - 13 * 24 * H },
  ]);

  const n = (id: string, userId: string, kind: string, actorId: string | null, refId: string | null, ago: number, read = false) =>
    ({ id, userId, kind, actorId, refId, createdAt: T - ago * H, readAt: read ? T - ago * H + 60e3 : null });
  await raw.insert(t.notifications).values([
    n("seed-n-1", sara, "friend_request", omar, omar, 5),
    n("seed-n-2", dev, "like", omar, "seed-post-w-0", 9), n("seed-n-3", dev, "comment", omar, "seed-post-w-0", 9),
    n("seed-n-4", dev, "like", sara, "seed-post-w-0", 8), n("seed-n-5", dev, "comment", sara, "seed-post-w-0", 8),
    n("seed-n-6", dev, "cheer", sara, null, 3), n("seed-n-7", dev, "friend_accept", sara, sara, 20 * 24, true),
    n("seed-n-8", omar, "challenge_invite", dev, "seed-ch-1", 6 * 24, true), n("seed-n-9", omar, "like", dev, "seed-post-p-omar", 1),
    n("seed-n-10", dev, "comment", sara, "seed-post-t-dev", 30, true),
  ]);
}
