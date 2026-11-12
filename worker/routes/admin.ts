import { Hono, type Context } from "hono";
import type { Env } from "../env";
import { CURRENT, programVersionId } from "../../program";
import { HISTORY } from "../../program/history";
import { templateById } from "../../program/templates";
import { mergePrivacy } from "../../shared/social";
import { RESET_PREFIX } from "./auth";

// Owner-only admin API (role === "owner"). Every handler below is behind `ownerGate`.
//
// Privacy boundary (the app's privacy policy promises it): the admin sees ACCOUNTS, ACTIVITY METADATA, COUNTS, USAGE,
// STORAGE and TRENDS — never another person's private content. No query here selects journal text, set/session notes,
// pain, readiness, chat message text, captions, photo/voice data, or body measurements (the latest bodyweight only when
// that person shares body stats with friends). Secrets (pass_hash, google_sub, push keys, reset-code hashes) never leave.
// The one exception is GET /admin/users/:id/export: a person's own full data for a data-portability request (still
// without secrets and without the binary photo/voice payloads).
//
//   GET    /api/admin/overview?off=<minutes east of UTC>   KPIs, trends, features, heatmap, consistency, leaderboard, insights
//   GET    /api/admin/users                                users table (counts only)
//   GET    /api/admin/users/:id?off=                       one user's activity metadata
//   POST   /api/admin/users/:id/suspend {suspended:bool}   role member <-> suspended (owner refused)
//   DELETE /api/admin/users/:id {confirm:<username>}       delete the account + every row of theirs (owner refused)
//   GET    /api/admin/users/:id/export                     their data as JSON (portability)
//   GET    /api/admin/security                             invites, lockouts, recent sign-ins
//   DELETE /api/admin/invites/:code                        revoke any invite
//   DELETE /api/admin/lockouts?key=                        unlock a username / IP
//   GET    /api/admin/system                               row counts, DB size, versions
// Reset codes reuse POST /api/account/reset-code (account.ts).
export const adminRoutes = new Hono<Env>();

type C = Context<Env>;
const DAY = 86_400_000;
const D1_FREE_BYTES = 500 * 1024 * 1024;

adminRoutes.use("/admin/*", async (c, next) => {
  if (c.var.role !== "owner") return c.json({ error: "Only the owner can open the admin dashboard" }, 403);
  c.header("Cache-Control", "private, no-store");
  return next();
});

const bind = (c: C) => (c.var.dev ? c.env.DB_DEV : c.env.DB);
type Row = Record<string, unknown>;
const all = async <T = Row>(c: C, sql: string, ...args: unknown[]) => ((await bind(c).prepare(sql).bind(...args).all<T>()).results ?? []) as T[];
/** Run several read statements in one round trip (D1 batch). */
async function many(c: C, list: [string, ...unknown[]][]) {
  const b = bind(c);
  const res = await b.batch(list.map(([s, ...a]) => b.prepare(s).bind(...a)));
  return res.map((r) => (r.results ?? []) as Row[]);
}
const n = (v: unknown) => Number(v ?? 0) || 0;

/** "+180 minutes" (SQLite date modifier) from ?off= (minutes east of UTC). Defaults to Cairo (UTC+3). */
function tzMod(c: C) {
  const raw = Number(c.req.query("off") ?? 180);
  const off = Number.isFinite(raw) ? Math.max(-840, Math.min(840, Math.round(raw))) : 180;
  return { off, mod: `${off >= 0 ? "+" : ""}${off} minutes` };
}
const localDay = (ms: number, off: number) => new Date(ms + off * 60_000).toISOString().slice(0, 10);
const addDays = (iso: string, k: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
function dayRange(today: string, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
}
/** Index of the 7-day bucket a day falls in, counted back from today (0 = last 7 days). */
const weekIdx = (today: string, d: string) => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / (7 * DAY));
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);

/** All signals that someone used the app (no content): taps, sets, messages sent, posts, last-seen ping. */
const ACT = (since: string) => `with act as (
  select user_id u, at t from events where at >= ${since}
  union all select user_id, done_at from sets where deleted = 0 and done_at >= ${since}
  union all select sender_id, created_at from messages where created_at >= ${since}
  union all select user_id, created_at from posts where created_at >= ${since}
  union all select id, last_seen_at from users where last_seen_at >= ${since}
)`;

type U = { id: string; username: string; name: string | null; avatarId: string | null; role: string; email: string | null; google: number; programId: string | null; privacy: string | null; lastSeenAt: number | null; createdAt: number };
const USER_COLS = "id, username, name, avatar_id avatarId, role, email, google_sub is not null google, program_id programId, privacy, last_seen_at lastSeenAt, created_at createdAt";

async function planNames(c: C, users: U[]) {
  const ids = [...new Set(users.map((u) => u.programId).filter(Boolean))] as string[];
  const rows = ids.length ? await all<{ id: string; name: string; template: string | null }>(c, `select id, name, template from user_programs where id in (${ids.map(() => "?").join(",")})`, ...ids) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return (u: U) => {
    if (!u.programId) return u.role === "owner" ? { name: CURRENT.name, template: "default" } : null;
    const p = byId.get(u.programId);
    if (!p) return null;
    return { name: p.name, template: p.template ? templateById(p.template)?.meta.name ?? p.template : "custom" };
  };
}

// ====================================================================== overview

adminRoutes.get("/admin/overview", async (c) => {
  const { off, mod } = tzMod(c);
  const now = Date.now();
  const today = localDay(now, off);
  const since90 = now - 91 * DAY;
  const since12w = Date.parse(`${addDays(today, -83)}T00:00:00Z`) - off * 60_000;
  const [users, act, workouts, setsDaily, heat, msgs, posts, features, totals] = await many(c, [
    [`select ${USER_COLS} from users order by created_at`],
    [`${ACT("?1")} select u, date(t / 1000, 'unixepoch', ?2) d, count(*) n from act group by u, d`, since90, mod],
    [`select user_id u, date d, count(*) n from sessions where status = 'done' and date >= ?1 group by u, d`, addDays(today, -90)],
    [`select user_id u, date(done_at / 1000, 'unixepoch', ?2) d, count(*) n, sum(coalesce(weight_kg, 0) * coalesce(reps, 0)) v, sum(pr) prs
      from sets where deleted = 0 and done_at >= ?1 group by u, d`, since12w, mod],
    [`select cast(strftime('%w', done_at / 1000, 'unixepoch', ?2) as int) wd, cast(strftime('%H', done_at / 1000, 'unixepoch', ?2) as int) h, count(*) n
      from sets where deleted = 0 and done_at >= ?1 group by wd, h`, since90, mod],
    [`select date(created_at / 1000, 'unixepoch', ?2) d, count(*) n from messages where created_at >= ?1 group by d`, since90, mod],
    [`select date(created_at / 1000, 'unixepoch', ?2) d, count(*) n from posts where deleted = 0 and created_at >= ?1 group by d`, since90, mod],
    [`select type, count(*) n, count(distinct user_id) users from events where at >= ?1 group by type order by n desc limit 12`, now - 30 * DAY],
    [`select (select count(*) from posts where deleted = 0) posts, (select count(*) from photos where ref_kind != 'avatar') photos,
      (select count(*) from messages where deleted = 0) messages, (select count(*) from sessions where status = 'done') workouts,
      (select count(*) from push_subscriptions) push`],
  ]);
  const us = users as unknown as U[];
  const nameOf = new Map(us.map((u) => [u.id, u.name || u.username]));
  const days90 = dayRange(today, 90);

  // --- daily active users + last activity per person
  const dauMap = new Map<string, Set<string>>();
  const lastDay = new Map<string, string>();
  const activeDays = new Map<string, Set<string>>();
  for (const r of act) {
    const u = String(r.u), d = String(r.d);
    if (!nameOf.has(u)) continue;
    (dauMap.get(d) ?? dauMap.set(d, new Set()).get(d)!).add(u);
    (activeDays.get(u) ?? activeDays.set(u, new Set()).get(u)!).add(d);
    if (!lastDay.has(u) || lastDay.get(u)! < d) lastDay.set(u, d);
  }
  const activeIn = (k: number) => us.filter((u) => { const l = lastDay.get(u.id); return l && l > addDays(today, -k); }).length;
  const dau = days90.map((d) => ({ d, n: dauMap.get(d)?.size ?? 0 }));

  // --- workouts / sets per day & week
  const wDay = new Map<string, number>();
  const perUser = new Map<string, { w7: number; w30: number; s7: number; s30: number; v30: number; pr30: number; weeks: number[] }>();
  const pu = (u: string) => perUser.get(u) ?? perUser.set(u, { w7: 0, w30: 0, s7: 0, s30: 0, v30: 0, pr30: 0, weeks: Array(8).fill(0) }).get(u)!;
  for (const r of workouts) {
    const d = String(r.d), k = n(r.n);
    wDay.set(d, (wDay.get(d) ?? 0) + k);
    const wi = weekIdx(today, d);
    const p = pu(String(r.u));
    if (wi === 0) p.w7 += k;
    if (wi >= 0 && wi < 8) p.weeks[7 - wi] += k;
    if (d > addDays(today, -30)) p.w30 += k;
  }
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: addDays(today, -(11 - i) * 7 - 6), sets: 0, volume: 0, workouts: 0 }));
  for (const r of setsDaily) {
    const d = String(r.d), wi = weekIdx(today, d);
    if (wi >= 0 && wi < 12) { weeks[11 - wi].sets += n(r.n); weeks[11 - wi].volume += n(r.v); }
    const p = pu(String(r.u));
    if (wi === 0) p.s7 += n(r.n);
    if (d > addDays(today, -30)) { p.s30 += n(r.n); p.v30 += n(r.v); p.pr30 += n(r.prs); }
  }
  for (const [d, k] of wDay) { const wi = weekIdx(today, d); if (wi >= 0 && wi < 12) weeks[11 - wi].workouts += k; }
  const dailyOf = (rows: Row[]) => { const m = new Map(rows.map((r) => [String(r.d), n(r.n)])); return days90.map((d) => ({ d, n: m.get(d) ?? 0 })); };
  const msgDaily = dailyOf(msgs), postDaily = dailyOf(posts);
  const sumLast = (a: { n: number }[], k: number, skip = 0) => a.slice(a.length - k - skip, a.length - skip).reduce((s, x) => s + x.n, 0);

  // --- signups per month (all time)
  const signups = new Map<string, number>();
  for (const u of us) { const m = localDay(u.createdAt, off).slice(0, 7); signups.set(m, (signups.get(m) ?? 0) + 1); }
  const months: { m: string; n: number; total: number }[] = [];
  if (us.length) {
    let m = localDay(us[0].createdAt, off).slice(0, 7);
    const end = today.slice(0, 7);
    let total = 0;
    for (let i = 0; i < 36 && m <= end; i++) {
      total += signups.get(m) ?? 0;
      months.push({ m, n: signups.get(m) ?? 0, total });
      const [y, mo] = m.split("-").map(Number);
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    }
  }

  // --- plans in use
  const plan = await planNames(c, us);
  const plans = new Map<string, { name: string; template: string; users: number }>();
  for (const u of us) {
    const p = plan(u);
    const key = p ? `${p.template}|${p.name}` : "none";
    const cur = plans.get(key) ?? { name: p?.name ?? "No plan yet", template: p?.template ?? "-", users: 0 };
    cur.users++;
    plans.set(key, cur);
  }

  // --- leaderboard (last 30 days) + weekly consistency grid (last 8 weeks)
  const board = us.map((u) => {
    const p = perUser.get(u.id) ?? pu(u.id);
    return { id: u.id, username: u.username, name: u.name, avatarId: u.avatarId, workouts7: p.w7, workouts30: p.w30, sets7: p.s7, sets30: p.s30, volume30: Math.round(p.v30), prs30: p.pr30, activeDays30: [...(activeDays.get(u.id) ?? [])].filter((d) => d > addDays(today, -30)).length, weeks: p.weeks, lastActive: lastDay.get(u.id) ?? null };
  }).sort((a, b) => b.workouts30 - a.workouts30 || b.sets30 - a.sets30 || b.activeDays30 - a.activeDays30);
  const weekStarts = Array.from({ length: 8 }, (_, i) => addDays(today, -(7 - i) * 7 - 6));
  const consistency = Array.from({ length: 9 }, (_, k) => ({ weeks: k, users: board.filter((b) => b.weeks.filter((w) => w > 0).length === k).length }));

  // --- heatmap weekday × hour
  const heatmap = (heat as { wd: number; h: number; n: number }[]).map((r) => ({ wd: n(r.wd), h: n(r.h), n: n(r.n) }));

  // --- KPIs
  const t = totals[0] ?? {};
  const storage = await storageInfo(c);
  const setsWeek = weeks[11].sets, setsPrev = weeks[10].sets;
  const wWeek = weeks[11].workouts, wPrev = weeks[10].workouts;
  const kpis = {
    users: us.filter((u) => u.role !== "suspended").length, suspended: us.filter((u) => u.role === "suspended").length,
    activeToday: dauMap.get(today)?.size ?? 0, active7: activeIn(7), active30: activeIn(30),
    workoutsWeek: wWeek, workoutsPrev: wPrev, setsWeek, setsPrev,
    posts: n(t.posts), photos: n(t.photos), messagesToday: msgDaily[89].n, messagesYesterday: msgDaily[88].n, push: n(t.push),
    storageBytes: storage.bytes, storageLimit: D1_FREE_BYTES, storageExact: storage.exact,
  };

  // --- plain-language insights (rules, newest signal first)
  const insights: { tone: "good" | "warn" | "bad" | "info"; text: string }[] = [];
  const members = us.filter((u) => u.role !== "suspended");
  const trained = members.filter((u) => (perUser.get(u.id)?.w7 ?? 0) > 0).length;
  if (members.length) insights.push({ tone: trained / members.length >= 0.5 ? "good" : "warn", text: `${trained} of ${members.length} ${members.length === 1 ? "person" : "people"} trained in the last 7 days.` });
  const m7 = sumLast(msgDaily, 7), mPrev = sumLast(msgDaily, 7, 7);
  if (m7 && !mPrev) insights.push({ tone: "good", text: `${m7} messages sent in the last 7 days (none the week before).` });
  else if (m7 || mPrev) insights.push({ tone: m7 >= mPrev ? "good" : "info", text: `Messages ${m7 >= mPrev ? "up" : "down"} ${Math.abs(pct(m7, mPrev))}% vs the week before (${m7} vs ${mPrev}).` });
  if (setsWeek || setsPrev) insights.push({ tone: setsWeek >= setsPrev ? "good" : "warn", text: `${setsWeek.toLocaleString("en-US")} sets logged this week, ${setsWeek >= setsPrev ? "up" : "down"} ${Math.abs(pct(setsWeek, setsPrev))}% on last week.` });
  for (const u of members) {
    const l = lastDay.get(u.id);
    const gap = l ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${l}T00:00:00Z`)) / DAY) : null;
    if (gap != null && gap >= 5) insights.push({ tone: gap >= 14 ? "bad" : "warn", text: `${u.name || u.username} hasn't opened the app in ${gap} days.` });
    else if (gap == null && now - u.createdAt > 3 * DAY) insights.push({ tone: "warn", text: `${u.name || u.username} joined but hasn't been active in 90 days.` });
  }
  const top = board[0];
  if (top && top.workouts30) insights.push({ tone: "info", text: `Most active: ${top.name || top.username} with ${top.workouts30} workout${top.workouts30 === 1 ? "" : "s"} in 30 days.` });
  const peak = heatmap.reduce((b, x) => (x.n > b.n ? x : b), { wd: 0, h: 0, n: 0 });
  if (peak.n) insights.push({ tone: "info", text: `Busiest training slot: ${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][peak.wd]} around ${peak.h % 12 || 12} ${peak.h < 12 ? "am" : "pm"}.` });
  const used = storage.bytes / D1_FREE_BYTES;
  insights.push({ tone: used > 0.8 ? "bad" : used > 0.5 ? "warn" : "good", text: `Database is ${Math.max(0.1, Math.round(used * 1000) / 10)}% of the 500 MB free limit.` });

  return c.json({
    today, kpis, insights,
    dau, workoutsDaily: days90.map((d) => ({ d, n: wDay.get(d) ?? 0 })), weeks, messagesDaily: msgDaily, postsDaily: postDaily,
    signups: months, features: features.map((f) => ({ type: String(f.type), n: n(f.n), users: n(f.users) })),
    heatmap, plans: [...plans.values()].sort((a, b) => b.users - a.users), leaderboard: board, weekStarts, consistency,
  });
});

/** DB size: D1 reports it in every result's meta (size_after). Falls back to SQLite pages, then to an estimate. */
async function storageInfo(c: C) {
  const b = bind(c);
  try {
    const r = await b.prepare("select 1").run();
    const size = (r.meta as { size_after?: number } | undefined)?.size_after;
    if (size) return { bytes: size, exact: true };
  } catch { /* ignore */ }
  try {
    const [pc] = await all<{ page_count: number }>(c, "pragma page_count");
    const [ps] = await all<{ page_size: number }>(c, "pragma page_size");
    if (pc?.page_count && ps?.page_size) return { bytes: pc.page_count * ps.page_size, exact: true };
  } catch { /* ignore */ }
  const [e] = await all<{ p: number; m: number; s: number; ev: number }>(c, `select (select coalesce(sum(bytes), 0) * 1.37 + count(*) * 25000 from photos) p, (select coalesce(sum(bytes), 0) * 1.37 from media) m,
    (select count(*) from sets) s, (select count(*) from events) ev`);
  return { bytes: Math.round(n(e?.p) + n(e?.m) + n(e?.s) * 400 + n(e?.ev) * 200), exact: false };
}

// ====================================================================== users

adminRoutes.get("/admin/users", async (c) => {
  const now = Date.now();
  const [users, wk, st, ph, po, fr, pushes, logins, act] = await many(c, [
    [`select ${USER_COLS} from users order by created_at`],
    [`select user_id u, count(*) n from sessions where status = 'done' group by user_id`],
    [`select user_id u, count(*) n, sum(pr) prs from sets where deleted = 0 group by user_id`],
    [`select user_id u, count(*) n from photos where ref_kind != 'avatar' group by user_id`],
    [`select user_id u, count(*) n from posts where deleted = 0 group by user_id`],
    [`select requester_id a, addressee_id b from friendships where status = 'accepted'`],
    [`select user_id u, count(*) n from push_subscriptions group by user_id`],
    [`select key, at from login_attempts where key like 'last:%'`],
    [`${ACT("?1")} select u, max(t) t from act group by u`, now - 90 * DAY],
  ]);
  const map = (rows: Row[], k = "n") => new Map(rows.map((r) => [String(r.u), n(r[k])]));
  const W = map(wk), S = map(st), P = map(st, "prs"), PH = map(ph), PO = map(po), PU = map(pushes), A = map(act, "t");
  const friends = new Map<string, number>();
  for (const f of fr) for (const k of [String(f.a), String(f.b)]) friends.set(k, (friends.get(k) ?? 0) + 1);
  const L = new Map(logins.map((r) => [String(r.key).slice(5), n(r.at)]));
  const us = users as unknown as U[];
  const plan = await planNames(c, us);
  return c.json({
    users: us.map((u) => ({
      id: u.id, username: u.username, name: u.name, avatarId: u.avatarId, role: u.role, email: u.email, google: !!u.google,
      createdAt: u.createdAt, lastSeen: Math.max(n(u.lastSeenAt), A.get(u.id) ?? 0, L.get(u.id) ?? 0) || null, lastLogin: L.get(u.id) ?? null,
      workouts: W.get(u.id) ?? 0, sets: S.get(u.id) ?? 0, prs: P.get(u.id) ?? 0, photos: PH.get(u.id) ?? 0, posts: PO.get(u.id) ?? 0,
      friends: friends.get(u.id) ?? 0, devices: PU.get(u.id) ?? 0, plan: plan(u)?.name ?? null, me: u.id === c.var.userId,
    })),
  });
});

adminRoutes.get("/admin/users/:id", async (c) => {
  const id = c.req.param("id");
  const { off, mod } = tzMod(c);
  const now = Date.now();
  const today = localDay(now, off);
  const since12w = Date.parse(`${addDays(today, -83)}T00:00:00Z`) - off * 60_000;
  const [[u], sess, setsD, act, feats, counts, invites, logins, devices, bw, storage] = await many(c, [
    [`select ${USER_COLS} from users where id = ?1`, id],
    [`select date d, status, count(*) n from sessions where user_id = ?1 and date >= ?2 group by d, status`, id, addDays(today, -83)],
    [`select date(done_at / 1000, 'unixepoch', ?3) d, count(*) n, sum(coalesce(weight_kg, 0) * coalesce(reps, 0)) v, sum(pr) prs from sets where user_id = ?1 and deleted = 0 and done_at >= ?2 group by d`, id, since12w, mod],
    [`${ACT("?2")} select date(t / 1000, 'unixepoch', ?3) d, count(*) n from act where u = ?1 group by d`, id, now - 91 * DAY, mod],
    [`select type, count(*) n from events where user_id = ?1 and at >= ?2 group by type order by n desc limit 8`, id, now - 30 * DAY],
    [`select (select count(*) from sessions where user_id = ?1 and status = 'done') workouts, (select count(*) from sessions where user_id = ?1 and status = 'missed') missed,
      (select count(*) from sessions where user_id = ?1 and status = 'skipped') skipped, (select count(*) from sets where user_id = ?1 and deleted = 0) sets,
      (select coalesce(sum(pr), 0) from sets where user_id = ?1 and deleted = 0) prs, (select count(*) from cardio where user_id = ?1 and status != 'skipped') cardio,
      (select count(*) from photos where user_id = ?1 and ref_kind != 'avatar') photos, (select count(*) from posts where user_id = ?1 and deleted = 0) posts,
      (select count(*) from post_comments where user_id = ?1 and deleted = 0) comments, (select count(*) from post_likes where user_id = ?1) likes,
      (select count(*) from messages where sender_id = ?1 and deleted = 0) messages, (select count(*) from conversation_members where user_id = ?1) chats,
      (select count(*) from friendships where status = 'accepted' and (requester_id = ?1 or addressee_id = ?1)) friends,
      (select count(*) from blocks where user_id = ?1) blocks, (select count(*) from events where user_id = ?1) events`, id],
    [`select i.code, i.uses, i.max_uses maxUses, i.expires_at expiresAt, i.created_at createdAt from invites i where i.created_by = ?1 and i.code not like ?2 order by i.created_at desc limit 20`, id, `${RESET_PREFIX}%`],
    [`select key, at from login_attempts where key in (?1, ?2)`, `last:${id}`, `prev:${id}`],
    [`select ua, created_at createdAt, last_ok_at lastOkAt from push_subscriptions where user_id = ?1 order by created_at desc`, id],
    [`select date, weight_kg kg from body_logs where user_id = ?1 and weight_kg is not null order by date desc limit 1`, id],
    [`select (select coalesce(sum(bytes), 0) from photos where user_id = ?1) photoBytes, (select coalesce(sum(bytes), 0) from media where owner_id = ?1) mediaBytes`, id],
  ]);
  if (!u) return c.json({ error: "No such user" }, 404);
  const user = u as unknown as U;
  const plan = (await planNames(c, [user]))(user);
  const privacy = mergePrivacy(user.privacy);
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: addDays(today, -(11 - i) * 7 - 6), workouts: 0, missed: 0, sets: 0, volume: 0, prs: 0 }));
  for (const r of sess) {
    const wi = weekIdx(today, String(r.d));
    if (wi < 0 || wi >= 12) continue;
    if (r.status === "done") weeks[11 - wi].workouts += n(r.n);
    if (r.status === "missed") weeks[11 - wi].missed += n(r.n);
  }
  for (const r of setsD) {
    const wi = weekIdx(today, String(r.d));
    if (wi < 0 || wi >= 12) continue;
    weeks[11 - wi].sets += n(r.n); weeks[11 - wi].volume += Math.round(n(r.v)); weeks[11 - wi].prs += n(r.prs);
  }
  const actMap = new Map(act.map((r) => [String(r.d), n(r.n)]));
  const L = new Map(logins.map((r) => [String(r.key).split(":")[0], n(r.at)]));
  const at = now;
  return c.json({
    user: {
      id: user.id, username: user.username, name: user.name, avatarId: user.avatarId, role: user.role, email: user.email, google: !!user.google,
      createdAt: user.createdAt, lastSeenAt: user.lastSeenAt, me: user.id === c.var.userId,
    },
    plan, privacy: { profile: privacy.profile, workouts: privacy.workouts, photos: privacy.photos, body: privacy.body, leaderboard: privacy.leaderboard },
    // body stats only when this person shares them with friends (privacy promise)
    bodyweight: privacy.body === "friends" && bw[0] ? { date: String(bw[0].date), kg: n(bw[0].kg) } : null,
    counts: Object.fromEntries(Object.entries(counts[0] ?? {}).map(([k, v]) => [k, n(v)])),
    weeks, activity: dayRange(today, 91).map((d) => ({ d, n: actMap.get(d) ?? 0 })),
    features: feats.map((f) => ({ type: String(f.type), n: n(f.n) })),
    invites: invites.map((i) => ({ code: String(i.code), uses: n(i.uses), maxUses: n(i.maxUses), expiresAt: i.expiresAt == null ? null : n(i.expiresAt), createdAt: n(i.createdAt), active: n(i.uses) < n(i.maxUses) && (i.expiresAt == null || n(i.expiresAt) > at) })),
    logins: { last: L.get("last") ?? null, prev: L.get("prev") ?? null },
    devices: devices.map((d) => ({ ua: d.ua ? String(d.ua) : "Unknown device", createdAt: n(d.createdAt), lastOkAt: d.lastOkAt == null ? null : n(d.lastOkAt) })),
    storage: { photoBytes: n(storage[0]?.photoBytes), mediaBytes: n(storage[0]?.mediaBytes) },
  });
});

async function target(c: C) {
  const [u] = await all<{ id: string; username: string; role: string }>(c, "select id, username, role from users where id = ?1", c.req.param("id"));
  return u ?? null;
}

adminRoutes.post("/admin/users/:id/suspend", async (c) => {
  const u = await target(c);
  if (!u) return c.json({ error: "No such user" }, 404);
  if (u.role === "owner" || u.id === c.var.userId) return c.json({ error: "The owner account can't be suspended." }, 400);
  const b = await c.req.json<{ suspended?: boolean }>().catch(() => ({}) as { suspended?: boolean });
  const role = b.suspended ? "suspended" : "member";
  await bind(c).prepare("update users set role = ?1, updated_at = ?2 where id = ?3").bind(role, Date.now(), u.id).run();
  // a suspended person can't log in (auth.ts) and their open invites stop working
  if (b.suspended) await bind(c).prepare("update invites set expires_at = ?1 where created_by = ?2 and code not like ?3 and (expires_at is null or expires_at > ?1)").bind(Date.now(), u.id, `${RESET_PREFIX}%`).run();
  return c.json({ ok: true, role });
});

/** Every row that belongs to one person, as [table, where-clause]. ?1 = user id, ?2 = username. Order matters (children first). */
const OWNED: [string, string][] = [
  ["post_likes", "post_id in (select id from posts where user_id = ?1) or user_id = ?1"],
  ["post_comments", "post_id in (select id from posts where user_id = ?1) or user_id = ?1"],
  ["posts", "user_id = ?1"],
  ["message_reactions", "user_id = ?1 or message_id in (select id from messages where sender_id = ?1 or conv_id in (select id from conversations where kind = 'dm' and id in (select conv_id from conversation_members where user_id = ?1)))"],
  ["messages", "sender_id = ?1 or conv_id in (select id from conversations where kind = 'dm' and id in (select conv_id from conversation_members where user_id = ?1))"],
  ["conversation_members", "user_id = ?1 or conv_id in (select id from conversations where kind = 'dm' and id in (select conv_id from conversation_members where user_id = ?1))"],
  ["conversations", "kind = 'dm' and (dm_key like ?1 || '|%' or dm_key like '%|' || ?1)"],
  ["challenge_members", "user_id = ?1 or challenge_id in (select id from challenges where created_by = ?1)"],
  ["challenges", "created_by = ?1"],
  ["notifications", "user_id = ?1 or actor_id = ?1"],
  ["friendships", "requester_id = ?1 or addressee_id = ?1"],
  ["media", "owner_id = ?1"],
  ["push_subscriptions", "user_id = ?1"],
  ["user_programs", "user_id = ?1"],
  ["custom_exercises", "user_id = ?1"],
  ["invites", `created_by = ?1 or code like '${RESET_PREFIX}' || ?1 || '.%'`],
  ["login_attempts", "key in ('last:' || ?1, 'prev:' || ?1, 'u:' || ?2)"],
  ["sets", "user_id = ?1"], ["feedback", "user_id = ?1"], ["cardio", "user_id = ?1"], ["events", "user_id = ?1"], ["tests", "user_id = ?1"],
  ["journal", "user_id = ?1"], ["intake", "user_id = ?1"], ["photos", "user_id = ?1"], ["sessions", "user_id = ?1"], ["blocks", "user_id = ?1"],
  ["user_settings", "user_id = ?1"], ["body_logs", "user_id = ?1"],
  ["users", "id = ?1"],
];

adminRoutes.delete("/admin/users/:id", async (c) => {
  const u = await target(c);
  if (!u) return c.json({ error: "No such user" }, 404);
  if (u.role === "owner" || u.id === c.var.userId) return c.json({ error: "The owner account can't be deleted." }, 400);
  const b = await c.req.json<{ confirm?: string }>().catch(() => ({}) as { confirm?: string });
  if (String(b.confirm ?? "").trim().toLowerCase().replace(/^@/, "") !== u.username) return c.json({ error: "Type the username exactly to confirm." }, 400);
  const d = bind(c);
  const counts: Record<string, number> = {};
  // batches of 8 statements: each batch is one transaction, the user row goes last so a failure can be retried
  for (let i = 0; i < OWNED.length; i += 8) {
    const part = OWNED.slice(i, i + 8);
    const res = await d.batch(part.map(([tbl, w]) => d.prepare(`delete from ${tbl} where ${w}`).bind(...(w.includes("?2") ? [u.id, u.username] : [u.id]))));
    part.forEach(([tbl], k) => { counts[tbl] = (counts[tbl] ?? 0) + n(res[k].meta?.changes); });
  }
  return c.json({ ok: true, deleted: counts });
});

/** Their own data for a portability request. Secrets and binary photo/voice payloads are left out. */
adminRoutes.get("/admin/users/:id/export", async (c) => {
  const u = await target(c);
  if (!u) return c.json({ error: "No such user" }, 404);
  const id = u.id;
  const tables: [string, string, string][] = [
    ["profile", "select id, username, name, bio, email, role, privacy, prefs, program_id, last_seen_at, created_at, updated_at from users where id = ?1", ""],
    ["sessions", "select * from sessions where user_id = ?1 order by date", ""],
    ["sets", "select * from sets where user_id = ?1 order by done_at", ""],
    ["feedback", "select * from feedback where user_id = ?1", ""],
    ["cardio", "select * from cardio where user_id = ?1 order by date", ""],
    ["tests", "select * from tests where user_id = ?1 order by date", ""],
    ["journal", "select * from journal where user_id = ?1 order by date", ""],
    ["intake", "select * from intake where user_id = ?1 order by date", ""],
    ["body", "select * from body_logs where user_id = ?1 order by date", ""],
    ["settings", "select key, value from user_settings where user_id = ?1", ""],
    ["blocks", "select * from blocks where user_id = ?1 order by n", ""],
    ["programs", "select * from user_programs where user_id = ?1", ""],
    ["customExercises", "select * from custom_exercises where user_id = ?1", ""],
    ["photos", "select id, ref_kind, ref_id, ex_key, session_id, date, caption, mime, w, h, bytes, visibility, created_at from photos where user_id = ?1 order by created_at", ""],
    ["posts", "select * from posts where user_id = ?1 order by created_at", ""],
    ["comments", "select id, post_id, text, created_at, deleted from post_comments where user_id = ?1", ""],
    ["likes", "select post_id, created_at from post_likes where user_id = ?1", ""],
    ["friendships", "select id, requester_id, addressee_id, status, created_at, responded_at from friendships where requester_id = ?1 or addressee_id = ?1", ""],
    ["messagesSent", "select id, conv_id, kind, text, media_id, sticker, reply_to_id, created_at, edited_at, deleted from messages where sender_id = ?1 order by created_at", ""],
    ["voiceNotes", "select id, mime, bytes, duration_ms, created_at from media where owner_id = ?1", ""],
    ["events", "select id, session_id, type, data, at from events where user_id = ?1 order by at", ""],
  ];
  const res = await many(c, tables.map(([, s]) => [s, id] as [string, ...unknown[]]));
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), app: "Iron Log", note: "Photo and voice files are listed by id; the files themselves are not included." };
  tables.forEach(([k], i) => { out[k] = k === "profile" ? res[i][0] ?? null : res[i]; });
  c.header("Content-Disposition", `attachment; filename="iron-log-${u.username}-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json(out);
});

// ====================================================================== invites & security

adminRoutes.get("/admin/security", async (c) => {
  const now = Date.now();
  const [invites, resets, locks, logins] = await many(c, [
    [`select i.code, i.uses, i.max_uses maxUses, i.expires_at expiresAt, i.created_at createdAt, u.username creator from invites i left join users u on u.id = i.created_by
      where i.code not like ?1 order by i.created_at desc limit 200`, `${RESET_PREFIX}%`],
    // reset codes: only who it is for and when it expires (the hash stays on the server)
    [`select substr(code, ${RESET_PREFIX.length + 1}, instr(substr(code, ${RESET_PREFIX.length + 1}), '.') - 1) uid, uses, expires_at expiresAt, created_at createdAt from invites where code like ?1`, `${RESET_PREFIX}%`],
    [`select key, fails, until, at from login_attempts where key like 'u:%' or key like 'ip:%' order by at desc limit 200`],
    [`select l.key, l.at, u.username, u.name, u.avatar_id avatarId from login_attempts l join users u on u.id = substr(l.key, instr(l.key, ':') + 1)
      where l.key like 'last:%' or l.key like 'prev:%' order by l.at desc limit 40`],
  ]);
  const names = new Map((await all<{ id: string; username: string }>(c, "select id, username from users")).map((r) => [r.id, r.username]));
  return c.json({
    invites: invites.map((i) => ({ code: String(i.code), creator: i.creator ? String(i.creator) : "deleted user", uses: n(i.uses), maxUses: n(i.maxUses), expiresAt: i.expiresAt == null ? null : n(i.expiresAt), createdAt: n(i.createdAt), active: n(i.uses) < n(i.maxUses) && (i.expiresAt == null || n(i.expiresAt) > now) })),
    resets: resets.map((r) => ({ username: names.get(String(r.uid)) ?? "?", used: n(r.uses) > 0, expiresAt: n(r.expiresAt), createdAt: n(r.createdAt) })),
    lockouts: locks.map((l) => ({ key: String(l.key), fails: n(l.fails), until: l.until == null ? null : n(l.until), at: n(l.at), locked: l.until != null && n(l.until) > now })),
    signIns: logins.map((l) => ({ username: String(l.username), name: l.name ? String(l.name) : null, avatarId: l.avatarId ? String(l.avatarId) : null, at: n(l.at), which: String(l.key).startsWith("last:") ? "latest" : "previous" })),
  });
});

adminRoutes.delete("/admin/invites/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return c.json({ error: "bad code" }, 400);
  const r = await bind(c).prepare("delete from invites where code = ?1").bind(code).run();
  return c.json({ ok: true, removed: n(r.meta?.changes) });
});

adminRoutes.delete("/admin/lockouts", async (c) => {
  const key = String(c.req.query("key") ?? "");
  if (!/^(u|ip):.{1,80}$/.test(key)) return c.json({ error: "bad key" }, 400);
  await bind(c).prepare("delete from login_attempts where key = ?1").bind(key).run();
  return c.json({ ok: true });
});

// ====================================================================== system

const TABLES = [
  "users", "sessions", "sets", "feedback", "cardio", "events", "tests", "journal", "intake", "body_logs", "user_settings", "photos", "media",
  "blocks", "program_versions", "posts", "post_likes", "post_comments", "notifications", "friendships", "conversations", "conversation_members",
  "messages", "message_reactions", "invites", "login_attempts", "push_subscriptions", "user_programs", "custom_exercises", "challenges", "challenge_members",
] as const;
/** Rough average bytes per row (base64 payloads measured separately) for the per-table storage estimate. */
const AVG: Partial<Record<(typeof TABLES)[number], number>> = { sessions: 2500, sets: 450, events: 220, program_versions: 30000, user_programs: 8000, blocks: 2000, journal: 500, posts: 600, messages: 250 };

adminRoutes.get("/admin/system", async (c) => {
  const [counts, bytes, versions, chats] = await many(c, [
    [`select ${TABLES.map((tb) => `(select count(*) from ${tb}) "${tb}"`).join(", ")}`],
    [`select (select coalesce(sum(bytes), 0) from photos) photoBytes, (select coalesce(sum(length(thumb)), 0) from photos) thumbChars, (select coalesce(sum(bytes), 0) from media) mediaBytes`],
    [`select program_version_id id, count(distinct user_id) users, count(*) sessions, max(date) last from sessions group by program_version_id order by last desc limit 20`],
    [`select kind, count(*) n, sum(case when last_message_at > ?1 then 1 else 0 end) active from conversations group by kind`, Date.now() - 7 * DAY],
  ]);
  const cnt = counts[0] ?? {};
  const b = bytes[0] ?? {};
  const storage = await storageInfo(c);
  const tables = TABLES.map((tb) => {
    const rows = n(cnt[tb]);
    const est = tb === "photos" ? n(b.photoBytes) * 1.37 + n(b.thumbChars) + rows * 300 : tb === "media" ? n(b.mediaBytes) * 1.37 + rows * 200 : rows * (AVG[tb] ?? 150);
    return { name: tb, rows, estBytes: Math.round(est) };
  }).sort((a, b2) => b2.estBytes - a.estBytes);
  return c.json({
    mode: c.var.dev ? "DEV database" : "Live database",
    storage: { bytes: storage.bytes, exact: storage.exact, limit: D1_FREE_BYTES, photoBytes: n(b.photoBytes), mediaBytes: n(b.mediaBytes) },
    tables, pushSubscriptions: n(cnt.push_subscriptions),
    chats: { total: chats.reduce((s, r) => s + n(r.n), 0), active7: chats.reduce((s, r) => s + n(r.active), 0), byKind: chats.map((r) => ({ kind: String(r.kind), n: n(r.n) })) },
    app: { program: programVersionId(CURRENT), programName: CURRENT.name, latest: HISTORY[0] ? { id: HISTORY[0].id, date: HISTORY[0].date, title: HISTORY[0].title } : null },
    versions: versions.map((v) => ({ id: String(v.id), users: n(v.users), sessions: n(v.sessions), last: String(v.last) })),
  });
});
