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
  return out;
}

export type Relation = "self" | "friends" | "outgoing" | "incoming" | "blocked" | "none";

export interface UserLite { id: string; username: string; name: string | null; avatarId: string | null }

// ---------------------------------------------------------------- posts

export type PostKind = "text" | "photo" | "workout" | "pr" | "progress";
export const POST_KINDS: PostKind[] = ["text", "photo", "workout", "pr", "progress"];
export const LIMITS = { postText: 2000, comment: 500, photosPerPost: 6, challengeTitle: 60 };

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
}
export interface PrSummary { name: string; kg: number | null; reps: number | null; e1rm: number | null; date: string }

export interface Post {
  id: string;
  kind: PostKind;
  text: string | null;
  photoIds: string[];
  data: WorkoutSummary | PrSummary | null;
  visibility: Vis;
  createdAt: number;
  updatedAt: number;
  author: UserLite;
  likes: number;
  liked: boolean;
  comments: number;
  preview: { username: string; text: string } | null;
  mine: boolean;
}

export interface Comment { id: string; text: string; createdAt: number; author: UserLite; canDelete: boolean }

// ---------------------------------------------------------------- notifications

export type NotifKind = "friend_request" | "friend_accept" | "like" | "comment" | "cheer" | "challenge_invite" | "challenge_join" | "challenge_won" | "challenge_done";
export interface Notif { id: string; kind: NotifKind | string; actor: UserLite | null; refId: string | null; snippet: string | null; createdAt: number; read: boolean }

// ---------------------------------------------------------------- leaderboard + challenges

/**
 * Plan-independent metrics: they only use what every plan logs (sessions, sets, cardio), so a 3-day full-body plan and a
 * 6-day PPL compare fairly. "consistency" (done ÷ scheduled) and per-muscle sets are the fairest across plans.
 */
export type MetricId = "workouts" | "consistency" | "hard_sets" | "volume" | "minutes" | "streak" | "prs" | "cardio_minutes" | "muscle_sets";
export interface MetricDef { id: MetricId; label: string; unit: string; short: string; help: string; challenge: boolean; higher: true }
export const METRICS: MetricDef[] = [
  { id: "workouts", label: "Workouts", short: "Workouts", unit: "", help: "Finished workouts (any plan, extras count).", challenge: true, higher: true },
  { id: "consistency", label: "Consistency", short: "Consistency", unit: "%", help: "Finished ÷ (finished + missed). Fair across plans with different days per week.", challenge: false, higher: true },
  { id: "hard_sets", label: "Hard sets", short: "Hard sets", unit: "", help: "Normal + failure sets. Warm-ups and drops don't count.", challenge: true, higher: true },
  { id: "volume", label: "Volume", short: "Volume", unit: "kg", help: "kg × reps of working sets (both dumbbells counted).", challenge: true, higher: true },
  { id: "minutes", label: "Training time", short: "Minutes", unit: "min", help: "Minutes of finished workouts.", challenge: true, higher: true },
  { id: "streak", label: "Weekly streak", short: "Streak", unit: "wk", help: "Weeks in a row with 2+ workouts or cardio. This week doesn't break it until it's over.", challenge: false, higher: true },
  { id: "prs", label: "PRs", short: "PRs", unit: "", help: "Personal records set.", challenge: true, higher: true },
  { id: "cardio_minutes", label: "Cardio", short: "Cardio", unit: "min", help: "Cardio minutes (treadmill, football…).", challenge: true, higher: true },
  { id: "muscle_sets", label: "Sets per muscle", short: "Muscle sets", unit: "", help: "Hard sets for one muscle group, whatever exercise you used.", challenge: true, higher: true },
];
export const METRIC = Object.fromEntries(METRICS.map((m) => [m.id, m])) as Record<MetricId, MetricDef>;
export type Period = "week" | "month" | "all";
/** Weeks start on Saturday (Cairo, Fri-Sat weekend). */
export const WEEK_START = 6;

export interface BoardRow { user: UserLite; value: number; rank: number; prevRank: number | null; me: boolean }
export interface Board { joined: boolean; metric: MetricId; period: Period; muscle: string | null; from: string; to: string; rows: BoardRow[]; hidden: number }

export interface ChallengeMember { user: UserLite; value: number; rank: number; done: boolean; me: boolean }
export interface Challenge {
  id: string; title: string; metric: MetricId; target: number | null; muscle: string | null; startDate: string; endDate: string;
  visibility: "friends" | "invite"; createdBy: UserLite; createdAt: number;
  status: "upcoming" | "running" | "finished"; joined: boolean; canJoin: boolean; mine: boolean;
  members: ChallengeMember[]; winners: string[];
}

// ---------------------------------------------------------------- dates

export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekStartOf = (iso: string) => { const dow = new Date(`${iso}T12:00:00Z`).getUTCDay(); return addDays(iso, -((dow - WEEK_START + 7) % 7)); };
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
