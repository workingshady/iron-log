import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import * as t from "./db/schema";
import { resolveProgram, type RawDB } from "./db";
import { CURRENT, EXERCISES, programVersionId } from "../program";
import type { Program } from "../program/types";
import { PRIVACY_DEFAULTS, type PrSummary, type WorkoutSummary } from "../shared/social";
import { shownKg as shownKg0, totalKg as totalKg0 } from "../shared/load";
import { DEV_IMG } from "./devassets";
import { addDays, at, bulk, dowOf, genTraining, rng, type Persona, type Training } from "./devseed";

/**
 * DEV only: a lively friend group on top of the per-user wipe — runs LAST in POST /api/dev/seed.
 * users = { dev: "dev", omar: "dev-omar", sara: "dev-sara" }; this file adds dev-youssef (friend) and dev-mona (pending request).
 * Everything for these users is deleted and rebuilt, so re-running the seed resets DEV data cleanly. Owned by the Dev-data agent.
 *
 *   dev      ≈ 80 kg intermediate, default PPL × Arnold (5 days), football on Tuesdays, first strict pull-ups coming
 *   omar     ≈ 93 kg, stronger, heavy legs, Upper/Lower 4× — misses Thursdays
 *   sara     ≈ 62 kg, strong pulls, Full Body 3× in the morning, very consistent, lots of cardio
 *   youssef  ≈ 74 kg, new (3.5 weeks), PPL, inconsistent but fast newbie gains
 */
type LoadRow = { exKey: string; weightKg?: number | null; kgBasis?: string | null };
const shownKg = (x: LoadRow) => shownKg0({ exKey: x.exKey, weightKg: x.weightKg ?? null, kgBasis: x.kgBasis });
const totalKg = (x: LoadRow) => totalKg0({ exKey: x.exKey, weightKg: x.weightKg ?? null, kgBasis: x.kgBasis });

export async function seedRich(raw: RawDB, users: Record<string, string>) {
  const { dev, omar, sara } = users;
  const youssef = "dev-youssef", mona = "dev-mona";
  const all = [dev, omar, sara, youssef];
  const everyone = [...all, mona];
  const T = Date.now();
  const today = new Date(T + 3 * 3600e3).toISOString().slice(0, 10); // Cairo
  const back = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
  const H = 3600e3, M = 60e3, D = 24 * H;
  const flags = new Set<string>();
  /** true the first time cond holds for this label (a one-off missed day inside a 3-day window, whatever weekday today is) */
  const once = (label: string, cond: boolean) => (cond && !flags.has(label) ? (flags.add(label), true) : false);
  const within = (d: string, lo: number, hi: number) => back(d) >= lo && back(d) <= hi;
  let tueBack = 14;
  while (dowOf(addDays(today, -tueBack)) !== 2) tueBack++;

  // ------------------------------------------------------------ users (+ 2 extra test people)
  for (const u of [
    { id: youssef, username: "dev_youssef", name: "Youssef Test", role: "member", createdAt: T - 25 * D },
    { id: mona, username: "dev_mona", name: "Mona Test", role: "member", createdAt: T - 2 * D },
  ]) await raw.insert(t.users).values({ ...u, passHash: "-", updatedAt: T }).onConflictDoUpdate({ target: t.users.id, set: { username: u.username, name: u.name } });
  await raw.update(t.users).set({ programId: null }).where(inArray(t.users.id, [youssef, mona]));

  // ------------------------------------------------------------ wipe everything personal + social of these people (DEV DB only)
  const ids = sql.join(everyone.map((i) => sql`${i}`), sql`, `);
  await raw.batch([
    raw.delete(t.sets).where(inArray(t.sets.userId, everyone)), raw.delete(t.sessions).where(inArray(t.sessions.userId, everyone)),
    raw.delete(t.events).where(inArray(t.events.userId, everyone)), raw.delete(t.body).where(inArray(t.body.userId, everyone)),
    raw.delete(t.tests).where(inArray(t.tests.userId, everyone)), raw.delete(t.journal).where(inArray(t.journal.userId, everyone)),
    raw.delete(t.intake).where(inArray(t.intake.userId, everyone)), raw.delete(t.feedback).where(inArray(t.feedback.userId, everyone)),
    raw.delete(t.cardio).where(inArray(t.cardio.userId, everyone)), raw.delete(t.settings).where(inArray(t.settings.userId, everyone)),
    raw.delete(t.blocks).where(inArray(t.blocks.userId, everyone)), raw.delete(t.photos).where(inArray(t.photos.userId, everyone)),
    raw.delete(t.friendships).where(or(inArray(t.friendships.requesterId, everyone), inArray(t.friendships.addresseeId, everyone))),
    raw.delete(t.postLikes).where(sql`${t.postLikes.postId} in (select id from posts where user_id in (${ids}))`),
    raw.delete(t.postComments).where(sql`${t.postComments.postId} in (select id from posts where user_id in (${ids}))`),
    raw.delete(t.posts).where(inArray(t.posts.userId, everyone)),
    // seedSocial likes its workout posts even when they don't exist (no sessions before this seed) → drop orphans so re-runs stay clean
    raw.delete(t.postLikes).where(sql`${t.postLikes.postId} not in (select id from posts)`),
    raw.delete(t.postComments).where(sql`${t.postComments.postId} not in (select id from posts)`),
    raw.delete(t.notifications).where(inArray(t.notifications.userId, everyone)),
    raw.delete(t.challengeMembers).where(sql`${t.challengeMembers.challengeId} in (select id from challenges where created_by in (${ids}))`),
    raw.delete(t.challenges).where(inArray(t.challenges.createdBy, everyone)),
    raw.delete(t.messageReactions).where(like(t.messageReactions.messageId, "rich-%")),
    raw.delete(t.messages).where(like(t.messages.id, "rich-%")),
    raw.delete(t.conversationMembers).where(or(eq(t.conversationMembers.convId, "rich-dm-dev-sara"), and(eq(t.conversationMembers.convId, "seed-grp-gym-crew"), eq(t.conversationMembers.userId, youssef)))),
    raw.delete(t.conversations).where(or(eq(t.conversations.id, "rich-dm-dev-sara"), eq(t.conversations.dmKey, [dev, sara].sort().join("|")))),
  ]);

  // ------------------------------------------------------------ programs
  const progOf = async (uid: string): Promise<Program> => {
    const [u] = await raw.select({ programId: t.users.programId }).from(t.users).where(eq(t.users.id, uid));
    return resolveProgram(raw, u);
  };
  const [pOmar, pSara] = [await progOf(omar), await progOf(sara)];
  for (const p of [CURRENT, pOmar, pSara])
    await raw.insert(t.programVersions).values({ id: programVersionId(p), name: p.name, changelog: p.changelog, snapshot: JSON.stringify(p), firstSeenAt: T - 60 * D }).onConflictDoNothing();

  // ------------------------------------------------------------ personas → training
  const isLegs = (g?: string) => g === "Quads" || g === "Hamstrings/Glutes" || g === "Calves";
  const persona: Persona[] = [
    {
      uid: dev, prog: CURRENT, days: 49, trainDow: [6, 0, 1, 3, 4], hour: 19, bench: 84, growth: 0.012, stall: ["ohp", "close_grip_bench"],
      factor: (_ex, g) => (g === "Back" ? 0.95 : isLegs(g) ? 0.95 : 1),
      miss: (d, dow) => (within(d, 21, 22) ? "sick" : once("dev-work", within(d, 36, 38)) ? "work" : once("dev-sport", dow === 1 && within(d, 27, 34)) ? "sport" : once("dev-skip", within(d, 8, 10)) ? "skip:tired" : null),
      rirBias: 0, cheat: 0.08, drops: 0.3,
      pains: [{ ex: "ohp", area: "shoulder", level: 1, note: "left shoulder a bit tight at the bottom" }, { ex: "skull_crusher", area: "elbow", level: 1, note: "elbow achy, slowed the negative" }],
      swaps: [{ from: "machine_row", to: "cable_row", reason: "busy", p: 0.15 }, { from: "pec_deck", to: "cable_fly", reason: "busy", p: 0.2 }],
      setNotes: ["felt strong", "grip failed", "lost count, about 8", "slow negatives", "great pump", "no spotter, stopped 1 short", "form off on the last rep"],
      sessionNotes: ["Gym packed after 8 pm", "Felt flat, low sleep", "Great pump 🔥", "Quick one before dinner", "الجيم كان زحمة جدا", "New playlist = new PRs 😂"],
      bodyReps: { deficit_pushup: 16, pushup: 26, hanging_knee_raise: 12, ab_wheel: 7, neck: 15 }, holdS: 34, minutesPerSet: 3.2, rpeBase: 7.3,
      readiness: { sleep: 3, energy: 3.5, mood: 4, stress: 3, soreness: 3 },
      body: { kg0: 79.4, kg1: 80.3, waist0: 85.6, waist1: 85.1, sleep: 6.9, protein: 150, steps: 8500, water: 2.6, rate: 0.82, notes: [[30, "Wedding buffet 🙈"], [12, "Refeed day"], [3, "Slept badly, neighbours"]] },
      creatine: { g: 5, rate: 0.88 },
      cardio: (_d, dow, dayKey, r) => dow === 2 ? { protocol: "football", minutes: r.int(75, 95), kcalEst: r.int(760, 900), rpe: r.int(7, 8), note: r.pick(["normal", "won 7-4 ⚽", "left knee knock, fine", "lost but scored twice"]) }
        : dayKey === "D1" && r.chance(0.6) ? { protocol: "incline_hiit30", ...(r.chance(0.15) ? { minutes: 18, status: "partial", note: "legs dead, stopped early" } : { minutes: 30 }), distanceKm: Math.round((3.4 + r.next() * 0.8) * 10) / 10, kcalMachine: r.int(290, 345), kcalEst: r.int(300, 330), rpe: r.int(7, 9), speedAdj: r.pick([0, 0, 0.5, -0.5]) }
        : dayKey === "D5" && r.chance(0.4) ? { protocol: "hill_walk30", minutes: 30, kcalEst: r.int(250, 290), rpe: 6 } : null,
      tests: [[49, "pullups", 0, "negatives only"], [35, "pullups", 1], [21, "pullups", 2], [6, "pullups", 3, "strict, chin over"], [49, "dead_hang", 32], [35, "dead_hang", 39], [21, "dead_hang", 45], [6, "dead_hang", 53],
        [49, "pushups", 28], [28, "pushups", 32], [6, "pushups", 36], [42, "plank", 62], [14, "plank", 85], [35, "hollow", 24], [7, "hollow", 36]],
      journal: [
        [47, "First week back. Everything is sore but it feels good to be in the gym again.", "win", 4],
        [41, "Work deadline week, slept 5 h twice. Still made 4/5 sessions.", "life,sleep", 3],
        [37, "Missed Pull — meeting ran till 9. Not stressing.", "struggle", 2],
        [30, "Football Tuesday + Legs Wednesday was a bad idea. أرجلي مش شغالة خالص", "struggle,pain", 2],
        [26, "Bench moving again. Eating more rice helps 🍚", "win,food", 4],
        [22, "Sick, fever. Rest is training too.", "life", 2],
        [17, "Back after flu. Took 10% off and it still felt heavy.", "struggle", 3],
        [12, "Idea: do dead hangs every morning while the coffee brews ☕", "idea", 4],
        [6, "3 strict pull-ups!!! First time ever 🎉 الحمد لله", "win", 5],
        [1, "Week 7 photo vs week 1 — shoulders and back clearly wider. Keep going.", "win", 5],
      ],
    },
    {
      uid: omar, prog: pOmar, days: 49, trainDow: [1, 2, 4, 5], hour: 20, bench: 104, growth: 0.013, stall: ["bench", "db_ohp"],
      factor: (_ex, g) => (isLegs(g) ? 1.32 : g === "Back" ? 1.05 : 1),
      miss: (d, dow, r) => (dow === 4 ? (r.chance(0.7) ? r.pick(["work", "family", "tired", "busy"]) : null) : once("omar-skip", within(d, 17, 19)) ? "skip:sore" : r.chance(0.04) ? r.pick(["sleep", "work"]) : null),
      rirBias: -0.4, cheat: 0.12, drops: 0.15,
      pains: [{ ex: "rdl", area: "lower back", level: 1, note: "lower back pump, kept it at 2 RIR" }],
      swaps: [{ from: "hip_thrust", to: "cable_pull_through", reason: "busy", p: 0.15 }, { from: "bss", to: "reverse_lunge", reason: "pain", p: 0.1 }],
      setNotes: ["used straps", "too light", "paused reps", "felt strong", "belt on"],
      sessionNotes: ["Late session, empty gym 🔥", "Leg day = best day", "Rushed, had a dinner after", "مكنتش عايز أروح بس رحت"],
      bodyReps: { hanging_knee_raise: 15, pushup: 36 }, holdS: 45, minutesPerSet: 3.4, rpeBase: 7.8,
      readiness: { sleep: 3, energy: 3.5, mood: 3.5, stress: 2.5, soreness: 3 },
      equip: { leg_press: "plates", hip_thrust: "barbell" },
      body: { kg0: 92.8, kg1: 93.9, waist0: 92.0, waist1: 92.4, sleep: 6.3, protein: 195, steps: 7000, water: 3.2, rate: 0.6, notes: [[20, "Mom's mahshi 😋"], [8, "Bulking slowly"]] },
      creatine: { g: 5, rate: 0.7 },
      cardio: (_d, dow, _k, r) => dow === 3 && r.chance(0.5) ? { protocol: "football", minutes: r.int(60, 90), kcalEst: r.int(700, 950), rpe: r.int(6, 8), note: "5-a-side" } : dow === 6 && r.chance(0.3) ? { protocol: "hill_walk20", minutes: 20, kcalEst: r.int(170, 200), rpe: 5 } : null,
      tests: [[46, "pullups", 6], [25, "pullups", 7], [4, "pullups", 9], [46, "pushups", 35], [25, "pushups", 38], [4, "pushups", 41], [46, "dead_hang", 48], [4, "dead_hang", 58], [25, "plank", 90]],
      journal: [
        [45, "New plan: Upper/Lower 4 days. Let's see if 4 days fits with work.", "idea", 4],
        [33, "Another Thursday gone. Need to fix this — maybe move Upper B to Friday.", "struggle", 2],
        [24, "Squat 130 × 5 felt smooth. Legs are my thing 🦵", "win", 5],
        [18, "Knees + quads super sore after BSS, skipped the session.", "pain", 2],
        [10, "عزومة كبيرة النهارده، بروتين كتير 😂", "food,life", 4],
        [3, "Sleep has been bad, 6 h average. Need to put the phone away.", "sleep", 3],
      ],
    },
    {
      uid: sara, prog: pSara, days: 49, trainDow: [6, 1, 3], hour: 8, bench: 46, growth: 0.016, stall: ["db_ohp"],
      factor: (_ex, g) => (g === "Back" ? 1.45 : g === "Biceps" ? 1.3 : g === "Forearms/Grip" ? 1.2 : isLegs(g) ? 1.08 : 1),
      miss: (d) => (once("sara-travel", within(d, 25, 27)) ? "travel" : null),
      rirBias: 0.3, cheat: 0.02, drops: 0.25,
      pains: [{ ex: "bss", area: "knee", level: 1, note: "right knee clicky, shorter step" }],
      swaps: [{ from: "machine_row", to: "cs_row", reason: "busy", p: 0.15 }],
      setNotes: ["slow negatives", "paused reps", "great pump", "easy", "felt strong"],
      sessionNotes: ["7 am crew 🌅", "Coffee first, then pulls", "Short on time, kept rests tight", "Best session in weeks!", "صحيت بدري ورحت الجيم ☀️"],
      bodyReps: { pushup: 13 }, holdS: 55, minutesPerSet: 3, rpeBase: 7,
      readiness: { sleep: 4, energy: 4, mood: 4, stress: 3.5, soreness: 3.5 },
      body: { kg0: 62.6, kg1: 61.9, waist0: 70.5, waist1: 69.4, sleep: 7.5, protein: 120, steps: 11500, water: 2.4, rate: 0.92, notes: [[28, "Travel day, ate out"], [14, "Period week, bloated"]] },
      creatine: { g: 3, rate: 0.96 },
      cardio: (_d, dow, dayKey, r) => dow === 5 && r.chance(0.85) ? { protocol: "zone2_40", minutes: 40, distanceKm: Math.round((3.6 + r.next() * 0.5) * 10) / 10, kcalMachine: r.int(230, 270), kcalEst: r.int(220, 250), rpe: 4 }
        : dayKey === "D2" && r.chance(0.5) ? { protocol: "hiit20", minutes: 20, distanceKm: Math.round((2.6 + r.next() * 0.4) * 10) / 10, kcalMachine: r.int(190, 230), kcalEst: r.int(180, 210), rpe: r.int(7, 9), speedAdj: r.pick([0, 0.5, 0.5]) }
        : dow === 2 && r.chance(0.4) ? { protocol: "hill_walk30", minutes: 30, kcalEst: r.int(190, 220), rpe: 5 } : null,
      tests: [[47, "pullups", 3], [33, "pullups", 4], [19, "pullups", 5], [5, "pullups", 6, "all strict, 2 s down"], [47, "dead_hang", 52], [19, "dead_hang", 63], [5, "dead_hang", 71], [47, "pushups", 12], [19, "pushups", 15], [5, "pushups", 18], [33, "plank", 70], [5, "plank", 95]],
      journal: [
        [48, "Starting Full Body 3×. Goal: 8 strict pull-ups by spring.", "idea", 4],
        [36, "Morning sessions are a game changer. Done before the day starts.", "win", 5],
        [26, "Travelling for work, missed Saturday. Walked 18k steps instead.", "life", 3],
        [19, "5 pull-ups! Grip is the limit now, adding dead hangs.", "win", 5],
        [14, "Low energy week, kept the weights and just moved well.", "struggle,sleep", 3],
        [9, "Meal prep Sunday: chicken, rice, roasted veg 🍗", "food", 4],
        [5, "6 strict pull-ups 😭🎉 أخيرا", "win", 5],
        [2, "Knee is fine again. Calves need love.", "pain", 4],
      ],
    },
    {
      uid: youssef, prog: CURRENT, days: 24, trainDow: [0, 2, 4], hour: 21, bench: 58, growth: 0.025, stall: [],
      factor: () => 0.9, miss: (_d, _w, r) => (r.chance(0.2) ? r.pick(["busy", "motivation", "sleep", "work", "family"]) : null),
      rirBias: 0.6, cheat: 0.15, drops: 0.1, pains: [], swaps: [{ from: "ohp", to: "db_ohp", reason: "no_equipment", p: 0.5 }],
      setNotes: ["too heavy", "form off", "what is RIR 😅"], sessionNotes: ["Still learning the machines", "Late session after work"],
      bodyReps: { deficit_pushup: 10, pushup: 20, hanging_knee_raise: 8, ab_wheel: 4, neck: 12 }, holdS: 28, minutesPerSet: 3.6, rpeBase: 7.5,
      readiness: { sleep: 3, energy: 3, mood: 4, stress: 3, soreness: 2.5 },
      body: { kg0: 74.1, kg1: 74.7, waist0: 82, waist1: 82, sleep: 6.5, protein: 110, steps: 6500, water: 2, rate: 0.3, notes: [] },
      creatine: null, cardio: () => null,
      tests: [[22, "pushups", 22], [22, "pullups", 2], [22, "dead_hang", 30], [2, "pushups", 25]],
      journal: [[23, "Day 1. Omar convinced me. Let's go.", "win", 4], [8, "Missed 2 days this week, need a better routine.", "struggle", 3]],
    },
  ];
  const train: Record<string, Training> = {};
  for (const p of persona) train[p.uid] = genTraining(p, today);

  // dev's closed Month 1 gets a short Claude-style review (Months screen)
  const devB1 = train[dev].blocks.find((b) => b.status === "done");
  if (devB1) devB1.review = "**Month 1 review**\n\n- Adherence strong (sick week aside). Bench +6 %, squat +8 %.\n- OHP stalled 3 sessions → switch to 3×8-10 next block.\n- Pull-ups 0 → 2: keep negatives + dead hangs.\n- Sleep < 6.5 h on 4 nights; those sessions had RPE 8-9.";

  // ------------------------------------------------------------ settings
  const weekMarks: Record<string, string> = {};
  for (let i = -49; i <= 14; i++) { const d = addDays(today, i); if (dowOf(d) === 2) weekMarks[d] = "football"; }
  weekMarks[addDays(today, 4)] = "busy";
  const settings: Record<string, Record<string, string>> = {
    [dev]: { schedule: "B (Sat start, Egypt weekend)", barKg: "20", ezKg: "10", plates: "25,20,15,10,5,2.5,1.25", creatineTarget: "5", heightCm: "174", bodyKg: "80", level: "returning", weekMarks: JSON.stringify(weekMarks) },
    [omar]: { schedule: "A (Mon start)", barKg: "20", ezKg: "12", creatineTarget: "5", heightCm: "182", bodyKg: "93", level: "regular", "equip:leg_press": "plates" },
    [sara]: { schedule: "B (Sat start, Egypt weekend)", barKg: "15", ezKg: "7.5", creatineTarget: "3", heightCm: "165", bodyKg: "62", level: "regular" },
    [youssef]: { schedule: "B (Sat start, Egypt weekend)", barKg: "20", ezKg: "10", heightCm: "178", bodyKg: "74", level: "new" },
  };

  // ------------------------------------------------------------ insert training (bulk, json_each)
  const cat = (k: keyof Training) => all.flatMap((u) => train[u][k] as object[]);
  await bulk(raw, t.blocks, cat("blocks"), 20);
  await bulk(raw, t.sessions, cat("sessions"), 15); // plan JSON is big
  await bulk(raw, t.sets, cat("sets"), 150);
  await bulk(raw, t.feedback, cat("feedback"), 200);
  await bulk(raw, t.events, cat("events"), 200);
  await bulk(raw, t.body, cat("body"), 200);
  await bulk(raw, t.intake, cat("intake"), 200);
  await bulk(raw, t.cardio, cat("cardio"), 200);
  await bulk(raw, t.tests, cat("tests"), 200);
  await bulk(raw, t.journal, cat("journal"), 200);
  await bulk(raw, t.settings, Object.entries(settings).flatMap(([userId, kv]) => Object.entries(kv).map(([key, value]) => ({ userId, key, value }))), 200);

  // ------------------------------------------------------------ photos (embedded placeholder JPEGs)
  const r = rng("rich-social");
  const photoRows: (typeof t.photos.$inferInsert)[] = [];
  const ph = (id: string, userId: string, img: string, refKind: string, b: number, o: { caption?: string; visibility?: string; exKey?: string; sessionId?: string; refId?: string } = {}) => {
    const x = DEV_IMG[img];
    photoRows.push({ id, userId, refKind, refId: o.refId ?? null, exKey: o.exKey ?? null, sessionId: o.sessionId ?? null, date: addDays(today, -b), caption: o.caption ?? null, mime: "image/jpeg",
      w: x.w, h: x.h, bytes: x.bytes, data: x.data, visibility: o.visibility ?? "friends", thumb: x.thumb, createdAt: T - b * D - r.int(1, 10) * H });
    return id;
  };
  const doneOn = (u: string, pred: (s: Training["sessions"][number]) => boolean) => train[u].sessions.filter((s) => s.status === "done" && pred(s));
  const lastDone = (u: string, n = 0) => { const xs = doneOn(u, () => true); return xs[xs.length - 1 - n]; };
  const journalOn = (u: string, b: number) => train[u].journal.find((j) => j.date === addDays(today, -b))?.id;
  ph("dev-ph-avatar", dev, "avatar_dev", "avatar", 40);
  ph("omar-ph-avatar", omar, "avatar_omar", "avatar", 45);
  ph("sara-ph-avatar", sara, "avatar_sara", "avatar", 47);
  ph("youssef-ph-avatar", youssef, "avatar_youssef", "avatar", 23);
  ph("dev-ph-prog-1", dev, "progress_front_a", "progress", 48, { caption: "Week 1 · front" });
  ph("dev-ph-prog-7", dev, "progress_front_b", "progress", 1, { caption: "Week 7 · front" });
  ph("dev-ph-pulldown", dev, "cable_stack", "exercise", 40, { exKey: "pulldown", caption: "Pin at 45, knee pad 3rd hole", visibility: "private" });
  ph("dev-ph-meal", dev, "meal_chicken", "journal", 26, { refId: journalOn(dev, 26), caption: "Rice + chicken = bench gains", visibility: "private" });
  ph("dev-ph-football", dev, "football", "other", tueBack, { caption: "Tuesday 5-a-side" });
  ph("dev-ph-bar", dev, "barbell_close", "session", 27, { sessionId: doneOn(dev, (s) => back(s.date) >= 27 && s.dayKey === "D1").pop()?.id });
  ph("omar-ph-legpress", omar, "leg_press", "exercise", 38, { exKey: "leg_press", caption: "Seat 6, feet high & wide" });
  ph("omar-ph-gym", omar, "gym_dusk", "other", 12, { caption: "11 pm gym" });
  ph("omar-ph-db", omar, "dumbbells", "other", 30);
  ph("omar-ph-prog", omar, "progress_side", "progress", 4, { caption: "Bulk check-in", visibility: "private" });
  ph("sara-ph-hike", sara, "mountains", "other", 27, { caption: "Weekend hike" });
  ph("sara-ph-oats", sara, "meal_oats", "journal", 9, { refId: journalOn(sara, 9) });
  ph("sara-ph-shaker", sara, "shaker", "other", 9);
  ph("sara-ph-tread", sara, "treadmill", "session", 11, { caption: "HIIT 20 numbers", sessionId: doneOn(sara, (s) => back(s.date) >= 11).pop()?.id });
  ph("sara-ph-cairo", sara, "cairo", "other", 20, { caption: "Sunrise walk" });
  ph("sara-ph-private", sara, "progress_side", "progress", 3, { caption: "check-in (private)", visibility: "private" });
  ph("youssef-ph-hello", youssef, "abstract_chevron", "other", 23);
  const phStmts = photoRows.map((p) => raw.insert(t.photos).values(p));
  for (let i = 0; i < phStmts.length; i += 6) await raw.batch(phStmts.slice(i, i + 6) as unknown as Parameters<RawDB["batch"]>[0]);

  // ------------------------------------------------------------ profiles + privacy
  const profile: Record<string, { name: string; bio: string; avatarId: string; privacy: object; seen: number }> = {
    [dev]: { name: "Test user", bio: "DEV mode · PPL × Arnold · chasing strict pull-ups 🧗 · football on Tuesdays", avatarId: "dev-ph-avatar", privacy: { leaderboard: true, body: "friends", profile: "members" }, seen: T - 5 * M },
    [omar]: { name: "Omar Test", bio: "Leg day enjoyer 🦵 Upper/Lower 4× · squat 140 loading…", avatarId: "omar-ph-avatar", privacy: { leaderboard: true, body: "friends", profile: "members" }, seen: T - 2 * M },
    [sara]: { name: "Sara Test", bio: "Pull-ups > everything · 7 am lifter ☀️ · Full Body 3×", avatarId: "sara-ph-avatar", privacy: { leaderboard: true, profile: "members" }, seen: T - 40 * M },
    [youssef]: { name: "Youssef Test", bio: "New here 👋 learning the ropes", avatarId: "youssef-ph-avatar", privacy: { leaderboard: true, online: "private" }, seen: T - 26 * H },
    [mona]: { name: "Mona Test", bio: "Just joined", avatarId: "", privacy: {}, seen: T - 3 * H },
  };
  for (const [id, p] of Object.entries(profile))
    await raw.update(t.users).set({ name: p.name, bio: p.bio, avatarId: p.avatarId || null, privacy: JSON.stringify({ ...PRIVACY_DEFAULTS, ...p.privacy }), lastSeenAt: p.seen }).where(eq(t.users.id, id));

  // ------------------------------------------------------------ friendships (one row per pair, as worker/friends.ts expects)
  const fr = (a: string, b: string, daysAgo: number, status = "accepted") =>
    ({ id: `rich-fr-${a}-${b}`, requesterId: a, addresseeId: b, status, createdAt: T - daysAgo * D, respondedAt: status === "accepted" ? T - daysAgo * D + r.int(1, 20) * H : null });
  const friendRows = [fr(omar, dev, 50), fr(dev, sara, 48), fr(sara, omar, 44), fr(omar, youssef, 25), fr(youssef, dev, 24), fr(sara, youssef, 22), fr(mona, dev, 0.2, "pending")];
  await raw.insert(t.friendships).values(friendRows);

  // ------------------------------------------------------------ posts
  const names = (k: string) => EXERCISES[k]?.name ?? k.replace(/_/g, " ");
  const summary = (u: string, sid: string): WorkoutSummary => {
    const s = train[u].sessions.find((x) => x.id === sid)!;
    const work = train[u].sets.filter((x) => x.sessionId === sid && x.kind !== "W" && !x.deleted).sort((a, z) => a.doneAt - z.doneAt);
    const byEx = new Map<string, typeof work>();
    for (const x of work) (byEx.get(x.exKey) ?? byEx.set(x.exKey, []).get(x.exKey)!).push(x);
    const best = (xs: typeof work) => {
      const w = xs.filter((x) => x.reps).sort((a, z) => (shownKg(z) ?? 0) - (shownKg(a) ?? 0) || (z.reps ?? 0) - (a.reps ?? 0))[0];
      if (w) return shownKg(w) ? `${+(shownKg(w)!).toFixed(2)} kg × ${w.reps}` : `${w.reps} reps`;
      const s2 = xs.filter((x) => x.seconds).sort((a, z) => (z.seconds ?? 0) - (a.seconds ?? 0))[0];
      return s2 ? `${s2.seconds} s` : null;
    };
    return {
      dayName: s.dayName, date: s.date, minutes: Math.round((s.endedAt! - s.startedAt!) / 60000), sets: work.length, hardSets: work.filter((x) => x.kind === "N" || x.kind === "F").length,
      volume: Math.round(work.reduce((a, x) => a + totalKg(x) * (x.reps ?? 0), 0)),
      exercises: [...byEx.entries()].slice(0, 12).map(([k, xs]) => ({ name: names(k), sets: xs.length, best: best(xs) })),
      prs: work.filter((x) => x.pr === 1).slice(0, 6).map((x) => ({ name: names(x.exKey), kg: shownKg(x), reps: x.reps ?? null })),
    };
  };
  /** best PR set of an exercise (weighted, ≤ 12 reps) logged at least `minBack` days ago */
  const prSet = (u: string, ex: string, minBack = 0) => train[u].sets.filter((x) => x.exKey === ex && x.pr === 1 && x.weightKg && (x.reps ?? 99) <= 12 && x.doneAt <= T - minBack * D).pop();
  const prData = (x: Training["sets"][number]): PrSummary => {
    const kg = shownKg(x);
    return { name: names(x.exKey), kg, reps: x.reps ?? null, e1rm: kg && x.reps && x.reps <= 12 ? Math.round(kg * (1 + x.reps / 30) * 10) / 10 : null, date: new Date(x.doneAt + 3 * H).toISOString().slice(0, 10) };
  };
  type P = typeof t.posts.$inferInsert;
  const posts: P[] = [];
  const post = (id: string, userId: string, kind: string, text: string | null, createdAt: number, o: Partial<P> = {}) => {
    posts.push({ id, userId, kind, text, photoIds: null, sessionId: null, data: null, visibility: "friends", createdAt, updatedAt: createdAt, deleted: 0, ...o });
    return id;
  };
  const wpost = (id: string, u: string, s: Training["sessions"][number] | undefined, text: string) =>
    s && post(id, u, "workout", text, s.endedAt! + r.int(10, 50) * M, { sessionId: s.id, data: JSON.stringify(summary(u, s.id)) });
  const ppost = (id: string, u: string, x: Training["sets"][number] | undefined, text: string) => x && post(id, u, "pr", text, x.doneAt + r.int(30, 90) * M, { data: JSON.stringify(prData(x)) });
  const photoPost = (id: string, u: string, kind: "photo" | "progress", photoIds: string[], text: string, b: number, h = 19) =>
    post(id, u, kind, text, at(addDays(today, -b), h, r.int(0, 59)), { photoIds: JSON.stringify(photoIds) });

  wpost("rich-p-dev-1", dev, doneOn(dev, (s) => back(s.date) >= 43).pop(), "Back at it 💪 first full week done");
  post("rich-p-dev-2", dev, "text", "Who's in for Friday morning pull-up practice? 🧗 bring chalk", at(addDays(today, -38), 13, 20));
  ppost("rich-p-dev-3", dev, prSet(dev, "bench", 20), "Bench PR! slowly coming back 🔥");
  wpost("rich-p-dev-4", dev, doneOn(dev, (s) => s.dayKey === "D3" && back(s.date) <= 14).pop(), "Legs. مش حاسس برجلي 😵");
  photoPost("rich-p-dev-5", dev, "photo", ["dev-ph-football"], "Tuesday football ⚽ then straight to bed", tueBack, 23);
  photoPost("rich-p-dev-6", dev, "progress", ["dev-ph-prog-1", "dev-ph-prog-7"], "Week 1 → week 7. Same light, same time. Shoulders finally showing up 📸", 1, 21);
  wpost("rich-p-dev-7", dev, lastDone(dev), "Push day ✅ strict pull-ups next");
  wpost("rich-p-omar-1", omar, doneOn(omar, (s) => s.dayKey === "D2" && back(s.date) >= 20).pop(), "Squat day. 140 is coming 😤");
  photoPost("rich-p-omar-2", omar, "photo", ["omar-ph-legpress"], "My leg press setup for whoever asked: seat 6, feet high and wide", 37, 22);
  ppost("rich-p-omar-3", omar, prSet(omar, "squat", 3), "Squat PR 🦵🔥 الحمد لله");
  post("rich-p-omar-4", omar, "text", "Thursdays and me are not friends 😅 moving Upper B to Friday again", at(addDays(today, -26), 23, 5));
  photoPost("rich-p-omar-5", omar, "photo", ["omar-ph-gym", "omar-ph-db"], "Empty gym at 11 pm = best gym", 12, 23);
  wpost("rich-p-omar-6", omar, lastDone(omar), "Hip thrusts felt amazing today. Lower B done");
  wpost("rich-p-sara-1", sara, doneOn(sara, (s) => back(s.date) >= 40).pop(), "Morning session done before work ☀️");
  photoPost("rich-p-sara-2", sara, "photo", ["sara-ph-hike", "sara-ph-cairo"], "Weekend hike instead of cardio 🏔️", 27, 18);
  ppost("rich-p-sara-3", sara, prSet(sara, "pulldown", 6) ?? prSet(sara, "cable_row", 6), "Pulldown PR 💪 pull-ups next");
  post("rich-p-sara-4", sara, "text", "6 strict pull-ups!!! A year ago I couldn't do one 😭🎉 أخيرا", at(addDays(today, -5), 9, 40));
  photoPost("rich-p-sara-5", sara, "photo", ["sara-ph-oats", "sara-ph-shaker"], "Pre-workout breakfast: oats, blueberries, banana + 3 g creatine", 9, 7);
  wpost("rich-p-sara-6", sara, lastDone(sara), "Full body C ✅ calves are humbled");
  post("rich-p-sara-priv", sara, "text", "(private) note to self: deload soon, knee a bit clicky", T - 1 * H, { visibility: "private" });
  photoPost("rich-p-you-1", youssef, "photo", ["youssef-ph-hello"], "Joined Iron Log 👋 tracking everything from today", 23, 20);
  wpost("rich-p-you-2", youssef, doneOn(youssef, (s) => s.dayKey === "D1").at(0), "First real push day. أول مرة أعمل bench بجد");
  post("rich-p-you-3", youssef, "text", "Is 3× a week enough to start? asking for a friend (me) 😂", at(addDays(today, -6), 22, 15));
  await bulk(raw, t.posts, posts, 10);

  // likes + comment threads
  const friendsOf = (u: string) => friendRows.filter((f) => f.status === "accepted" && (f.requesterId === u || f.addresseeId === u)).map((f) => (f.requesterId === u ? f.addresseeId : f.requesterId));
  const likes: (typeof t.postLikes.$inferInsert)[] = [];
  const comments: (typeof t.postComments.$inferInsert)[] = [];
  const notifs: (typeof t.notifications.$inferInsert)[] = [];
  const unreadAfter = T - 30 * H; // newer notifications are unread
  const notif = (id: string, userId: string, kind: string, actorId: string | null, refId: string | null, createdAt: number) => {
    if (actorId === userId) return;
    notifs.push({ id, userId, kind, actorId, refId, createdAt, readAt: createdAt < unreadAfter ? createdAt + r.int(5, 300) * M : null });
  };
  const threads: Record<string, [string, string][]> = {
    "rich-p-dev-1": [[omar, "Welcome back bro 🔥"], [sara, "Consistency > everything 👏"], [dev, "Thanks! sore everywhere 😂"]],
    "rich-p-dev-2": [[sara, "I'm in!"], [omar, "If I wake up 😅"], [dev, "9 am, no excuses"], [youssef, "Can I join? I can do 2 😂"]],
    "rich-p-dev-3": [[omar, "Beast 🔥"], [sara, "Told you the rice works 🍚"], [omar, "Next stop 100 kg"]],
    "rich-p-dev-4": [[omar, "Welcome to my world 😂"], [sara, "Walk it off, 10k steps tomorrow"]],
    "rich-p-dev-5": [[omar, "Next time pass the ball 😂"], [dev, "I scored twice!!"], [omar, "Both offside"]],
    "rich-p-dev-6": [[sara, "Huge difference!! 😍"], [omar, "Shoulders 3D now 🔥"], [youssef, "Goals"], [dev, "7 weeks of not skipping laterals 😅"]],
    "rich-p-dev-7": [[sara, "Pull-up practice Friday?"], [dev, "Yes!"]],
    "rich-p-omar-1": [[dev, "What weight on the squats?"], [omar, "130 × 5, belt on"], [sara, "Strong 💪"]],
    "rich-p-omar-2": [[youssef, "Thanks! that's me who asked 🙏"], [dev, "Saving this"]],
    "rich-p-omar-3": [[dev, "Monster 🦵"], [sara, "Legs for days"], [youssef, "😳😳"]],
    "rich-p-omar-4": [[sara, "Friday is the new Thursday 😂"], [dev, "Put it on the week planner and pin it"], [omar, "Done ✅"]],
    "rich-p-omar-5": [[sara, "11 pm?? I'm asleep by 10 😴"], [omar, "Different species"]],
    "rich-p-omar-6": [[dev, "🔥🔥"]],
    "rich-p-sara-1": [[dev, "7 am?! respect"], [omar, "I'd still be asleep"]],
    "rich-p-sara-2": [[dev, "Where is this?"], [sara, "Wadi Degla 🏜️"], [omar, "Next time call us"]],
    "rich-p-sara-3": [[omar, "Pulling more than me soon 😅"], [dev, "Teach us"]],
    "rich-p-sara-4": [[dev, "WOW 🎉🎉"], [omar, "Legend"], [youssef, "I can do 2 😭"], [sara, "@dev_youssef you'll get there, dead hangs every day!"], [dev, "مبروك يا بطلة"]],
    "rich-p-sara-5": [[dev, "Recipe pls"], [sara, "50 g oats, milk, berries, banana. That's it"]],
    "rich-p-sara-6": [[omar, "Calves are genetic 😂"], [sara, "Excuses 😂"]],
    "rich-p-you-1": [[omar, "Finally!! 💪"], [sara, "Welcome 👋"], [dev, "Welcome to the crew"]],
    "rich-p-you-2": [[omar, "Proud of you bro"], [dev, "Form looked good on the video"]],
    "rich-p-you-3": [[sara, "Yes! 3 good days beat 5 skipped ones"], [omar, "Start with 3, earn the 4th"], [youssef, "Deal 🤝"]],
  };
  for (const p of posts) {
    if (p.visibility !== "friends") continue;
    const fs = friendsOf(p.userId);
    let ts = p.createdAt;
    for (const f of fs) if (r.chance(0.8)) {
      const la = Math.min(T - M, p.createdAt + r.int(5, 600) * M);
      likes.push({ postId: p.id, userId: f, createdAt: la });
      notif(`lk-${p.id}-${f}`, p.userId, "like", f, p.id, la);
    }
    (threads[p.id] ?? []).forEach(([u, text], i) => {
      ts = Math.min(T - (threads[p.id].length - i) * M, ts + r.int(4, 120) * M);
      const cid = `rich-cm-${p.id.slice(7)}-${i}`;
      comments.push({ id: cid, postId: p.id, userId: u, text, createdAt: ts, deleted: 0 });
      notif(`cm-${cid}`, p.userId, "comment", u, p.id, ts);
    });
  }
  await bulk(raw, t.postLikes, likes, 200);
  await bulk(raw, t.postComments, comments, 100);

  // ------------------------------------------------------------ challenges: finished (dev won) · running ×2 · upcoming
  const doneIn = (u: string, from: string, to: string) => train[u].sessions.filter((s) => s.status === "done" && s.date >= from && s.date <= to).length;
  const c1From = addDays(today, -35), c1To = addDays(today, -15);
  const others = Math.max(doneIn(omar, c1From, c1To), doneIn(sara, c1From, c1To));
  const c1Target = Math.max(others + 1, Math.min(doneIn(dev, c1From, c1To), others + 2));
  const ch = (id: string, createdBy: string, title: string, metric: string, target: number | null, muscle: string | null, from: number, to: number) =>
    ({ id, createdBy, title, metric, target, muscle, startDate: addDays(today, -from), endDate: addDays(today, -to), visibility: "friends", createdAt: T - (from + 2) * D });
  await raw.insert(t.challenges).values([
    ch("rich-ch-done", dev, "October workout sprint", "workouts", c1Target, null, 35, 15),
    ch("rich-ch-sets", omar, "November hard sets", "hard_sets", 200, null, 10, -18),
    ch("rich-ch-back", sara, "Back attack 🧗", "muscle_sets", 45, "Back", 6, -8),
    ch("rich-ch-cardio", sara, "December cardio 300", "cardio_minutes", 300, null, -5, -35),
  ]);
  const mem = (c: string, u: string, joinedDaysAgo: number) => ({ challengeId: c, userId: u, joinedAt: T - joinedDaysAgo * D });
  await raw.insert(t.challengeMembers).values([
    mem("rich-ch-done", dev, 37), mem("rich-ch-done", omar, 36), mem("rich-ch-done", sara, 36),
    mem("rich-ch-sets", omar, 12), mem("rich-ch-sets", dev, 11), mem("rich-ch-sets", sara, 11), mem("rich-ch-sets", youssef, 9),
    mem("rich-ch-back", sara, 8), mem("rich-ch-back", dev, 7), mem("rich-ch-back", youssef, 6),
    mem("rich-ch-cardio", sara, 1), mem("rich-ch-cardio", dev, 0.5),
  ]);
  const at2 = (b: number, h: number) => at(addDays(today, -b), h, r.int(0, 59));
  notif("rich-n-chi-1", omar, "challenge_invite", dev, "rich-ch-done", at2(37, 12));
  notif("rich-n-chi-2", sara, "challenge_invite", dev, "rich-ch-done", at2(37, 12));
  notif("rich-n-chj-1", dev, "challenge_join", omar, "rich-ch-done", at2(36, 9));
  notif("rich-n-chj-2", dev, "challenge_join", sara, "rich-ch-done", at2(36, 8));
  for (const u of [dev, omar, sara]) notif(`chd-rich-ch-done-${u}`, u, u === dev ? "challenge_won" : "challenge_done", null, "rich-ch-done", at2(14, 10));
  for (const u of [dev, sara, youssef]) notif(`rich-n-chi-s-${u}`, u, "challenge_invite", omar, "rich-ch-sets", at2(12, 22));
  notif("rich-n-chj-3", omar, "challenge_join", youssef, "rich-ch-sets", at2(9, 21));
  for (const u of [dev, youssef]) notif(`rich-n-chi-b-${u}`, u, "challenge_invite", sara, "rich-ch-back", at2(8, 8));
  notif("rich-n-chj-4", sara, "challenge_join", dev, "rich-ch-back", at2(7, 19));
  notif("rich-n-chi-c-dev", dev, "challenge_invite", sara, "rich-ch-cardio", T - 26 * H);
  notif("rich-n-chi-c-omar", omar, "challenge_invite", sara, "rich-ch-cardio", T - 26 * H);
  notif("rich-n-chj-5", sara, "challenge_join", dev, "rich-ch-cardio", T - 12 * H);

  // friend accepts, cheers, a pending request for dev
  for (const f of friendRows) {
    if (f.status === "accepted") notif(`rich-n-fa-${f.id}`, f.requesterId, "friend_accept", f.addresseeId, f.addresseeId, f.respondedAt!);
    else notif(`rich-n-fr-${f.id}`, f.addresseeId, "friend_request", f.requesterId, f.requesterId, f.createdAt);
  }
  const cheer = (from: string, to: string, b: number, h: number, chId: string | null = null) => {
    const ts = b === 0 ? T - h * H : at2(b, h);
    notif(`cheer-${from}-${to}-${addDays(today, -b)}`, to, "cheer", from, chId, ts);
  };
  cheer(sara, dev, 0, 3); cheer(omar, dev, 2, 22); cheer(dev, omar, 1, 21); cheer(dev, sara, 5, 10); cheer(youssef, sara, 5, 12);
  cheer(omar, youssef, 3, 23, "rich-ch-sets"); cheer(sara, omar, 0, 6, "rich-ch-sets"); cheer(dev, youssef, 9, 20);
  await bulk(raw, t.notifications, notifs, 150);

  // ------------------------------------------------------------ chat: a DM dev ↔ sara + Youssef joins the group
  const dm = "rich-dm-dev-sara";
  const d0 = T - 3 * D;
  const msg = (id: string, convId: string, senderId: string, createdAt: number, text: string | null, o: Partial<typeof t.messages.$inferInsert> = {}) =>
    ({ id, convId, senderId, kind: "text", text, mediaId: null, sticker: null, replyToId: null, createdAt, editedAt: null, deleted: 0, ...o });
  const dmLines: [string, number, string, Partial<typeof t.messages.$inferInsert>?][] = [
    [sara, d0, "How many pull-ups did you get today?"],
    [dev, d0 + 4 * M, "3 strict!! first time 🎉"],
    [sara, d0 + 5 * M, "YESSS 🎉🎉 told you the negatives work"],
    [dev, d0 + 6 * M, "Your program is working on me too 😂"],
    [sara, d0 + 8 * M, "Next: add dead hangs after every pull day, 2 × max"],
    [dev, d0 + 9 * M, "On it 💪"],
    [sara, d0 + 22 * H, "Morning! are you joining the cardio challenge in December?"],
    [dev, d0 + 22 * H + 20 * M, "300 minutes… with football I'm basically done 😂"],
    [sara, d0 + 22 * H + 21 * M, "Football counts, yes 😅"],
    [dev, T - 13 * H, "Joined ✅"],
    [sara, T - 12 * H, "", { kind: "sticker", sticker: "pr" }],
    [sara, T - 50 * M, "Saw your progress photo, huge difference 😍 مبروك", { replyToId: null }],
  ];
  const dmRows = dmLines.map(([who, ts, text, o], i) => msg(`rich-dm-${i + 1}`, dm, who, Math.round(ts), text || null, o));
  const grp = "seed-grp-gym-crew";
  const [gExists] = await raw.select({ id: t.conversations.id }).from(t.conversations).where(eq(t.conversations.id, grp));
  const g0 = T - 20 * H;
  const gRows = gExists ? [
    msg("rich-g-1", grp, omar, g0, "added Youssef", { kind: "system" }),
    msg("rich-g-2", grp, youssef, g0 + 2 * M, "Hey everyone 👋 thanks for the add"),
    msg("rich-g-3", grp, sara, g0 + 3 * M, "Welcome!! Saturday 9 am, you're coming 😄"),
    msg("rich-g-4", grp, dev, g0 + 5 * M, "Leaderboard just got more interesting"),
    msg("rich-g-5", grp, youssef, g0 + 6 * M, "I'm last on everything 😂"),
    msg("rich-g-6", grp, omar, T - 2.5 * H, "Hard sets challenge update: I'm coming for you all 😤"),
  ] : [];
  await raw.batch([
    raw.insert(t.conversations).values({ id: dm, kind: "dm", title: null, dmKey: [dev, sara].sort().join("|"), createdBy: sara, theme: JSON.stringify({ accent: "violet", bubble: "round", wallpaper: "none" }), createdAt: d0 - H, lastMessageAt: dmRows[dmRows.length - 1].createdAt }),
    raw.insert(t.conversationMembers).values([{ convId: dm, userId: dev, joinedAt: d0 - H, lastReadAt: T - 12 * H }, { convId: dm, userId: sara, joinedAt: d0 - H, lastReadAt: T - 50 * M }]),
    ...(gExists ? [
      raw.insert(t.conversationMembers).values({ convId: grp, userId: youssef, joinedAt: g0, lastReadAt: g0 + 6 * M }).onConflictDoNothing(),
      raw.update(t.conversations).set({ lastMessageAt: gRows[gRows.length - 1].createdAt }).where(eq(t.conversations.id, grp)),
    ] : []),
  ] as unknown as Parameters<RawDB["batch"]>[0]);
  await bulk(raw, t.messages, [...dmRows, ...gRows], 50);
  await raw.insert(t.messageReactions).values([
    { messageId: "rich-dm-2", userId: sara, emoji: "🎉", createdAt: d0 + 5 * M },
    { messageId: "rich-dm-12", userId: dev, emoji: "❤️", createdAt: T - 45 * M },
    ...(gExists ? [{ messageId: "rich-g-2", userId: sara, emoji: "👋", createdAt: g0 + 3 * M }, { messageId: "rich-g-6", userId: dev, emoji: "😂", createdAt: T - 2 * H }] : []),
  ]);
}

