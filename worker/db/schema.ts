import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// All times are unix milliseconds (UTC). Dates are "YYYY-MM-DD" in the user's local time.
// After editing: `npm run db:generate` then `npm run db:migrate` (local) / `npm run db:migrate:remote`.

/** Snapshot of every program version that was ever used. */
export const programVersions = sqliteTable("program_versions", {
  id: text("id").primaryKey(), // "ppl-arnold@1.0.0"
  name: text("name").notNull(),
  changelog: text("changelog"),
  snapshot: text("snapshot").notNull(), // full Program JSON
  firstSeenAt: integer("first_seen_at").notNull(),
});

/**
 * A block = one run through the program (≈ one month: Week 1 → Week 4 deload). Template vs instance: the program
 * version is the template, the block is your instance of it. The plan position is counted per block, so the same
 * program can be repeated month after month. Baseline (est. maxes + bodyweight at the start) and summary (at the end)
 * are stored so months can be compared later even if formulas change.
 */
export const blocks = sqliteTable("blocks", {
  id: text("id").primaryKey(),
  n: integer("n").notNull(), // 1, 2, 3 … in order
  name: text("name").notNull(), // "Month 1 · Nov 2026"
  programId: text("program_id").notNull(),
  startVersion: text("start_version").notNull(), // "ppl-arnold@2.5.0"
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull(), // active | done
  goal: text("goal"),
  notes: text("notes"),
  review: text("review"), // Claude's review of the month (markdown)
  baseline: text("baseline"), // JSON {bodyKg, e1rm: {exKey: kg}}
  summary: text("summary"), // JSON snapshot when the block closes
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** One row per workout attempt, missed day, or skipped session. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    programVersionId: text("program_version_id").notNull(),
    blockId: text("block_id"), // which month/block (null only for rows from before blocks existed and not yet linked)
    week: integer("week").notNull(),
    dayKey: text("day_key").notNull(), // "D1"
    dayName: text("day_name").notNull(),
    /** active | done | abandoned | missed (excuse logged, plan does NOT advance) | skipped (dropped, plan advances) */
    status: text("status").notNull(),
    /** planned = next in order · picked = chosen out of order · extra = additional session */
    kind: text("kind").notNull().default("planned"),
    date: text("date").notNull(),
    startedAt: integer("started_at"),
    endedAt: integer("ended_at"),
    /** The exact plan for this session (swaps / added sets included). */
    plan: text("plan").notNull(),
    readiness: text("readiness"), // JSON {sleep,energy,mood,stress,soreness} 1-5
    rpe: integer("rpe"), // whole-session effort 1-10
    bodyweight: real("bodyweight"),
    excuse: text("excuse"), // id from EXCUSES
    note: text("note"),
    tz: text("tz"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("sessions_date").on(t.date), index("sessions_status").on(t.status), index("sessions_block").on(t.blockId)],
);

/** Every logged set. Never hard-deleted (deleted = 1) so edits stay auditable. */
export const sets = sqliteTable(
  "sets",
  {
    id: text("id").primaryKey(), // generated on the phone → safe to retry offline
    sessionId: text("session_id").notNull(),
    exKey: text("ex_key").notNull(),
    itemIdx: integer("item_idx").notNull(), // position in the day's plan
    setNo: integer("set_no").notNull(),
    kind: text("kind").notNull().default("N"), // SET_KINDS
    weightKg: real("weight_kg"),
    reps: integer("reps"),
    seconds: integer("seconds"),
    meters: integer("meters"),
    assist: text("assist"), // band colour or assist kg
    rir: integer("rir"),
    target: text("target"), // JSON of the Rx at log time
    restBeforeS: integer("rest_before_s"), // real rest taken before this set
    doneAt: integer("done_at").notNull(),
    note: text("note"),
    painArea: text("pain_area"),
    painLevel: integer("pain_level"), // 1 mild · 2 moderate · 3 sharp/stop
    swappedFrom: text("swapped_from"),
    /** What the app recommended for this set (JSON {weightKg, reps, why}) — lets reviews check recommendation accuracy. */
    suggested: text("suggested"),
    /** 1 if this set was a personal record when logged. */
    pr: integer("pr").notNull().default(0),
    /** Honest form check: 1 = strict, 0 = cheated / partial reps, null = not answered. */
    strict: integer("strict"),
    /** How weightKg was entered for dumbbell pairs: "per_hand" (app default from v2.2) or "total" (both dumbbells added).
     *  null = barbell / machine / single weight. Old rows keep their numbers; this column only explains them. */
    kgBasis: text("kg_basis"),
    equip: text("equip"), // what you actually used: stack | plates | cable | smith | barbell | ez | dumbbell | bodyweight | other (weights only compare within the same)
    deleted: integer("deleted").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("sets_session").on(t.sessionId), index("sets_ex").on(t.exKey, t.doneAt)],
);

/** Per-exercise feedback after its last set (RP-style autoregulation). */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(), // `${sessionId}:${itemIdx}` — one per exercise per session
    sessionId: text("session_id").notNull(),
    exKey: text("ex_key").notNull(),
    effort: text("effort"), // easy | right | hard | too_much
    joints: text("joints"), // fine | achy | pain
    at: integer("at").notNull(),
  },
  (t) => [index("feedback_ex").on(t.exKey, t.at)],
);

/** Treadmill / cardio sessions (planned protocol + what was actually done). */
export const cardio = sqliteTable(
  "cardio",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    protocol: text("protocol").notNull(), // key from program/cardio.ts
    status: text("status").notNull(), // done | partial | skipped
    startedAt: integer("started_at"),
    endedAt: integer("ended_at"),
    minutes: real("minutes"),
    distanceKm: real("distance_km"), // from the treadmill screen (optional)
    kcalMachine: integer("kcal_machine"), // treadmill's number (optional)
    kcalEst: integer("kcal_est"), // app estimate (ACSM equations × bodyweight)
    rpe: integer("rpe"), // 1-10
    speedAdj: real("speed_adj"), // km/h added to run intervals (− = slower)
    note: text("note"),
    sessionId: text("session_id"), // lifting session it followed, if any
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("cardio_date").on(t.date)],
);

/** Raw click/interaction log: every tap that changes something. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id"),
    type: text("type").notNull(),
    data: text("data"),
    at: integer("at").notNull(),
  },
  (t) => [index("events_session").on(t.sessionId), index("events_at").on(t.at)],
);

/** Daily body & habits. */
export const body = sqliteTable("body", {
  date: text("date").primaryKey(),
  weightKg: real("weight_kg"),
  waistCm: real("waist_cm"),
  sleepH: real("sleep_h"),
  proteinG: integer("protein_g"),
  steps: integer("steps"),
  creatine: integer("creatine"), // 0/1
  waterL: real("water_l"),
  energy: integer("energy"), // 1-5
  note: text("note"),
  updatedAt: integer("updated_at").notNull(),
});

/** Fitness tests (pull-ups, hangs, …). */
export const tests = sqliteTable("tests", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  testKey: text("test_key").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
});

/** Free journal — your story: how it felt, life context, wins, pain. */
export const journal = sqliteTable("journal", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  text: text("text").notNull(),
  tags: text("tags"), // comma-separated: "pain,sleep" (old rows: one tag)
  mood: integer("mood"), // 1-5 (😣 → 😄), optional
  sessionId: text("session_id"),
  createdAt: integer("created_at").notNull(),
});

/** Daily intake log (creatine grams, and anything else later: protein shakes, caffeine…). */
export const intake = sqliteTable(
  "intake",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    item: text("item").notNull(), // "creatine"
    amount: real("amount").notNull(),
    unit: text("unit").notNull(), // "g"
    at: integer("at").notNull(),
  },
  (t) => [index("intake_date").on(t.item, t.date)],
);

/** Key/value settings (schedule choice, unit prefs). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * Photos attached to a set, an exercise (machine setup), a journal entry or a session. Compressed on the phone
 * (≤1280 px JPEG, ~150-350 KB) and stored as base64 in their own table so normal queries never load them.
 * D1 row limit is 2 MB; free database limit 500 MB ≈ 2,000 photos.
 */
export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    refKind: text("ref_kind").notNull(), // set | exercise | journal | session | other
    refId: text("ref_id"),
    exKey: text("ex_key"),
    sessionId: text("session_id"),
    date: text("date").notNull(),
    caption: text("caption"),
    mime: text("mime").notNull(),
    w: integer("w"),
    h: integer("h"),
    bytes: integer("bytes"),
    data: text("data").notNull(), // base64, no data: prefix
    thumb: text("thumb"), // small square-ish JPEG (≤360 px, ~15-30 KB) for grids, base64
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("photos_ref").on(t.refId), index("photos_ex").on(t.exKey), index("photos_date").on(t.date)],
);

/**
 * People who can log in. Username is unique (stored lower-case, Instagram rules: a-z 0-9 . _ , 3-30 chars) so friends
 * can be added later. Passcode is never stored: PBKDF2-SHA256 + per-user salt + server pepper ("pbkdf2$iter$salt$hash").
 * Profile = name, bio, avatar (a photo id from `photos`, refKind "avatar").
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    name: text("name"),
    bio: text("bio"),
    avatarId: text("avatar_id"),
    passHash: text("pass_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_username").on(t.username)],
);

/** Failed logins per username and per IP → growing lockout (6-digit passcodes are guessable without it). */
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(), // "u:<username>" | "ip:<address>"
  fails: integer("fails").notNull(),
  until: integer("until"), // locked until (ms)
  at: integer("at").notNull(),
});
