// Social layer: types shared by worker/routes/social.ts and the social screens.
// Privacy model (docs/PLAN-multiuser.md): least privilege, every switch user-controlled, health-ish data private by default,
// journal / set notes / pain are never shared (not even a switch for them).

export type Vis = "friends" | "private";

export interface Privacy {
  /** Bio + header stats for people who are NOT your friends yet ("members" = anyone with an account). Friends always see it unless "private". */
  profile: "members" | "friends" | "private";
  /** Recent workouts (day name, date, duration, sets, volume) on your profile. */
  workouts: Vis;
  /** Personal records on your profile. */
  prs: Vis;
  /** Totals: workouts, streak, training since. */
  stats: Vis;
  /** Appear on the friends leaderboard (opt-in: you only see the board after you join). */
  leaderboard: boolean;
  /** Default visibility of photos you add to posts (each photo can still be changed). */
  photos: Vis;
  /** Latest bodyweight on your profile (opt-in). */
  body: Vis;
  /** "Active now / 3 h ago". */
  online: Vis;
  /** Show the Discover tab in the feed (posts people shared with everyone on Iron Log). Purely a viewing preference. */
  discover: boolean;
}

export const PRIVACY_DEFAULTS: Privacy = {
  profile: "friends",
  workouts: "friends",
  prs: "friends",
  stats: "friends",
  leaderboard: false,
  photos: "friends",
  body: "private",
  online: "friends",
  discover: true,
};

/** Merge a stored JSON string with the defaults, keeping only valid values. */
export function mergePrivacy(json: string | null | undefined): Privacy {
  let raw: Record<string, unknown> = {};
  try { raw = json ? (JSON.parse(json) as Record<string, unknown>) : {}; } catch { /* corrupt → defaults */ }
  return sanitizePrivacy(raw, PRIVACY_DEFAULTS);
}

export function sanitizePrivacy(raw: Record<string, unknown>, base: Privacy): Privacy {
  const out = { ...base };
  const vis = (v: unknown): v is Vis => v === "friends" || v === "private";
  if (raw.profile === "members" || raw.profile === "friends" || raw.profile === "private") out.profile = raw.profile;
  for (const k of ["workouts", "prs", "stats", "photos", "body", "online"] as const) if (vis(raw[k])) out[k] = raw[k] as Vis;
  if (typeof raw.leaderboard === "boolean") out.leaderboard = raw.leaderboard;
  if (typeof raw.discover === "boolean") out.discover = raw.discover;
  return out;
}

export type Relation = "self" | "friends" | "outgoing" | "incoming" | "blocked" | "none";

export interface UserLite { id: string; username: string; name: string | null; avatarId: string | null }

// ---------------------------------------------------------------- posts

export type PostKind = "text" | "photo" | "workout" | "pr" | "progress";
export const POST_KINDS: PostKind[] = ["text", "photo", "workout", "pr", "progress"];
export const LIMITS = { postText: 2000, comment: 500, photosPerPost: 10, challengeTitle: 60, mentions: 10 };
/** Who sees a post. "members" = everyone with an Iron Log account (shows in Discover); blocked people never. */
export type PostVis = "friends" | "members" | "private";
export const POST_VIS: PostVis[] = ["friends", "members", "private"];
export const isPostVis = (v: unknown): v is PostVis => v === "friends" || v === "members" || v === "private";
export type FeedTab = "friends" | "discover";

/** Snapshot of a finished workout, built on the server from the author's own logs. Never contains notes or pain. */
export interface WorkoutSummary {
  dayName: string;
  date: string;
  minutes: number | null;
  sets: number; // working sets (not warm-ups)
  hardSets: number; // N + F
  volume: number; // kg × reps
  exercises: { name: string; sets: number; best: string | null }[];
  prs: { name: string; kg: number | null; reps: number | null }[];
  /** Hard sets per muscle group (posts made after Nov 2026; older posts don't have it). */
  muscles?: { group: string; sets: number }[];
}
export interface PrSummary { name: string; kg: number | null; reps: number | null; e1rm: number | null; date: string }

export interface Post {
  id: string;
  kind: PostKind;
  text: string | null;
  photoIds: string[];
  data: WorkoutSummary | PrSummary | null;
  visibility: PostVis;
  createdAt: number;
  updatedAt: number;
  author: UserLite;
  likes: number;
  liked: boolean;
  comments: number;
  preview: { username: string; text: string } | null;
  mine: boolean;
  /** Up to 2 people who liked it (friends first, never blocked) for "Liked by omar and 2 others". */
  likedBy?: UserLite[];
}

export interface Comment {
  id: string; text: string; createdAt: number; author: UserLite; canDelete: boolean;
  /** Top-level comment this replies to (one level, Instagram-style); null = top-level. */
  parentId: string | null;
  likes: number; liked: boolean;
  /** Top-level only: replies shown inline (first 2, or all when focused) + the total. */
  replies?: Comment[]; replyCount?: number;
}

// ---------------------------------------------------------------- @mentions (stored as plain "@username" text)

/** "@name" not glued to a word / email / another @ before it. Group 2 = the username (case-insensitive; stored lower-case). */
export const MENTION_RE = /(^|[^\w@.])@([A-Za-z0-9._]{1,30})/g;
/** Unique lower-case usernames mentioned in a text (trailing dots dropped: "@omar." → omar), at most `max`. */
export function mentionNames(text: string | null | undefined, max = LIMITS.mentions): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(MENTION_RE)) {
    const u = m[2].replace(/\.+$/, "").toLowerCase();
    if (u && !out.includes(u)) out.push(u);
    if (out.length >= max) break;
  }
  return out;
}
/** Text split into plain parts and mentions (for rendering links to #/u/<username>). */
export function splitMentions(text: string): ({ t: string } | { u: string; raw: string })[] {
  const out: ({ t: string } | { u: string; raw: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const name = m[2].replace(/\.+$/, "");
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) out.push({ t: text.slice(last, start) });
    out.push({ u: name.toLowerCase(), raw: `@${name}` });
    last = start + 1 + name.length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
/** A suggestion in the @ popover. */
export interface MentionUser extends UserLite { friend: boolean }

// ---------------------------------------------------------------- notifications

export type NotifKind = "friend_request" | "friend_accept" | "like" | "comment" | "reply" | "comment_like" | "mention" | "cheer" | "challenge_invite" | "challenge_join" | "challenge_won" | "challenge_done";
export interface Notif {
  id: string; kind: NotifKind | string; actor: UserLite | null; refId: string | null; snippet: string | null; createdAt: number; read: boolean;
  /** First photo of the post (likes / comments), for the thumbnail on the right. */
  thumb?: string | null;
  /** My relation to the actor now (friend requests / accepts / cheers), for inline actions. */
  relation?: Relation;
  /** Post / comment / chat the notification points at (comments, replies, comment likes, mentions). */
  postId?: string | null;
  commentId?: string | null;
  convId?: string | null;
  /** Where a mention happened. */
  where?: "post" | "comment" | "chat";
}

// ---------------------------------------------------------------- leaderboard + challenges

/**
 * Plan-independent metrics: they only use what every plan logs (sessions, sets, cardio), so a 3-day full-body plan and a
 * 6-day PPL compare fairly. "consistency" (done ÷ scheduled) and per-muscle sets are the fairest across plans.
 */
export type MetricId = "workouts" | "consistency" | "hard_sets" | "volume" | "minutes" | "streak" | "prs" | "cardio_minutes" | "cardio_sessions" | "muscle_sets" | "muscle_volume";
export interface MetricDef { id: MetricId; label: string; unit: string; short: string; help: string; challenge: boolean; higher: true }
export const METRICS: MetricDef[] = [
  { id: "workouts", label: "Workouts", short: "Workouts", unit: "", help: "Finished workouts (any plan, extras count).", challenge: true, higher: true },
  { id: "consistency", label: "Consistency", short: "Consistency", unit: "%", help: "Finished ÷ (finished + missed). Fair across plans with different days per week.", challenge: false, higher: true },
  { id: "hard_sets", label: "Hard sets", short: "Hard sets", unit: "", help: "Normal + failure sets. Warm-ups and drops don't count.", challenge: true, higher: true },
  { id: "volume", label: "Volume", short: "Volume", unit: "kg", help: "kg × reps of working sets (both dumbbells counted).", challenge: true, higher: true },
  { id: "minutes", label: "Training time", short: "Minutes", unit: "min", help: "Minutes of finished workouts.", challenge: true, higher: true },
  { id: "streak", label: "Weekly streak", short: "Streak", unit: "wk", help: "Weeks in a row with 2+ workouts or cardio. This week doesn't break it until it's over.", challenge: false, higher: true },
  { id: "prs", label: "PRs", short: "PRs", unit: "", help: "Personal records set.", challenge: true, higher: true },
  { id: "cardio_minutes", label: "Cardio", short: "Cardio", unit: "min", help: "Cardio minutes (treadmill, football, padel, any sport…).", challenge: true, higher: true },
  { id: "muscle_sets", label: "Sets per muscle", short: "Muscle sets", unit: "", help: "Hard sets for one muscle group, whatever exercise you used.", challenge: true, higher: true },
  { id: "cardio_sessions", label: "Cardio sessions", short: "Cardio days", unit: "", help: "Cardio sessions done (treadmill, football, any sport…).", challenge: true, higher: true },
  { id: "muscle_volume", label: "Muscle volume", short: "Muscle kg", unit: "kg", help: "kg × reps for one muscle group (both dumbbells counted).", challenge: true, higher: true },
];
/** Metrics that need a muscle group. */
export const needsMuscle = (m: MetricId | string) => m === "muscle_sets" || m === "muscle_volume";
export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<MetricId, MetricDef>;
export type Period = "week" | "month" | "all";
/** Weeks start on Saturday (Cairo, Fri-Sat weekend). */
export const WEEK_START = 6;

export interface BoardRow {
  user: UserLite; value: number; rank: number; prevRank: number | null; me: boolean;
  /** Same metric for the last 8 calendar weeks, oldest first (sparkline). Missing for streak. */
  trend?: number[];
  /** Current weekly streak (flame). */
  streak?: number;
}
export interface Board { joined: boolean; metric: MetricId; period: Period; muscle: string | null; from: string; to: string; rows: BoardRow[]; hidden: number }

export interface ChallengeMember { user: UserLite; value: number; rank: number; done: boolean; me: boolean }
export interface Challenge {
  id: string; title: string; metric: MetricId; target: number | null; muscle: string | null; startDate: string; endDate: string;
  visibility: "friends" | "invite"; createdBy: UserLite; createdAt: number;
  status: "upcoming" | "running" | "finished"; joined: boolean; canJoin: boolean; mine: boolean;
  members: ChallengeMember[]; winners: string[];
}

// ---------------------------------------------------------------- stories, achievements, lift comparison

/** Story bubble at the top of the feed: ring = trained today (only when their workouts are visible to you). */
export interface Story { user: UserLite; me: boolean; trainedToday: boolean; lastPostId: string | null; lastPostAt: number | null }

export type BadgeIcon = "dumbbell" | "trophy" | "flame" | "weight" | "heart" | "star";
export interface BadgeDef { id: string; label: string; icon: BadgeIcon; tier: 1 | 2 | 3; stat: "workouts" | "prs" | "bestStreak" | "tonnes" | "cardio"; target: number }
/** Achievements: computed from what everyone logs (no schema). Tier 1 bronze · 2 silver · 3 gold. */
export const BADGES: BadgeDef[] = [
  { id: "w1", label: "First workout", icon: "dumbbell", tier: 1, stat: "workouts", target: 1 },
  { id: "w10", label: "10 workouts", icon: "dumbbell", tier: 1, stat: "workouts", target: 10 },
  { id: "w50", label: "50 workouts", icon: "dumbbell", tier: 2, stat: "workouts", target: 50 },
  { id: "w100", label: "100 club", icon: "dumbbell", tier: 3, stat: "workouts", target: 100 },
  { id: "pr1", label: "First PR", icon: "trophy", tier: 1, stat: "prs", target: 1 },
  { id: "pr10", label: "10 PRs", icon: "trophy", tier: 2, stat: "prs", target: 10 },
  { id: "pr50", label: "50 PRs", icon: "trophy", tier: 3, stat: "prs", target: 50 },
  { id: "s4", label: "4-week streak", icon: "flame", tier: 1, stat: "bestStreak", target: 4 },
  { id: "s12", label: "12-week streak", icon: "flame", tier: 2, stat: "bestStreak", target: 12 },
  { id: "s26", label: "Half-year streak", icon: "flame", tier: 3, stat: "bestStreak", target: 26 },
  { id: "t10", label: "10 t lifted", icon: "weight", tier: 1, stat: "tonnes", target: 10 },
  { id: "t100", label: "100 t lifted", icon: "weight", tier: 2, stat: "tonnes", target: 100 },
  { id: "t1000", label: "1,000 t lifted", icon: "weight", tier: 3, stat: "tonnes", target: 1000 },
  { id: "c10", label: "10 cardio", icon: "heart", tier: 1, stat: "cardio", target: 10 },
];
export interface Badge { id: string; label: string; icon: BadgeIcon; tier: 1 | 2 | 3; earned: boolean; value: number; target: number }
/** One day of the "this week" strip (Sat → Fri). */
export interface WeekDay { date: string; lift: boolean; cardio: boolean }

/** Lift comparison ("who lifts more"). e1RM = Epley, strict sets only (normal + failure, 1-12 reps, weight > 0). */
export interface LiftBest { e1rm: number; kg: number; reps: number; date: string }
export interface LiftRow { key: string; name: string; group: string | null; perHand: boolean; best: Record<string, LiftBest> }
export interface LiftsBoard { joined: boolean; people: UserLite[]; bodyweight: Record<string, number>; lifts: LiftRow[]; hidden: number }
export interface LiftDetail { key: string; name: string; perHand: boolean; people: UserLite[]; bodyweight: Record<string, number>; best: Record<string, LiftBest>; series: Record<string, { date: string; e1rm: number }[]> }
export interface MuscleBoard { joined: boolean; people: UserLite[]; period: Period; groups: { group: string; sets: Record<string, number> }[] }

/** Epley estimated 1-rep max (kg), rounded to 0.5. Only meaningful for 1-12 reps. */
export const epley = (kg: number, reps: number) => Math.round(kg * (1 + reps / 30) * 2) / 2;

// ---------------------------------------------------------------- dates

export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekStartOf = (iso: string) => { const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); return addDays(iso, -((dow - WEEK_START + 7) % 7)); };
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
