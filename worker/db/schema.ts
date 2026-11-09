import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

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

/** One row per workout attempt, missed day, or skipped session. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    programVersionId: text("program_version_id").notNull(),
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
  (t) => [index("sessions_date").on(t.date), index("sessions_status").on(t.status)],
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
    deleted: integer("deleted").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("sets_session").on(t.sessionId), index("sets_ex").on(t.exKey, t.doneAt)],
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
  tags: text("tags"),
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
