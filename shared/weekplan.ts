// Adaptive week: finds the best way to fit the remaining sessions of this program week around
// football / busy days. It tries EVERY arrangement (≤ 7 days × ≤ 5 sessions) and keeps the lowest penalty score.
//
// Hard rules (never broken):
//  • No lifting on a football day (unless "lift too") or a busy day.
//  • Heavy LEGS never the day before, the day of, or the day after football (≥ 48 h guidance for match + heavy legs).
// Soft rules (penalty points — lower total wins):
//  • Session left out this week ............................... 12   (Legs in a football week: 6 — football loaded your legs)
//  • Legs 2 days before football ................................ 2
//  • Out of program order (per swapped pair) .................... 1.5
//  • Same muscles on back-to-back days: Pull→Chest+Back (back) 1.5, Push→Shoulders+Arms (delts/triceps) 1.5,
//    Push→Chest+Back (chest) 1, Pull→Shoulders+Arms (biceps) 0.5, Legs↔Shoulders+Arms (leg booster) 0.5
//  • Hard days in a row (lifting + football): the 3rd → 0.3, each beyond 3 → 1.2 (same-muscle rest matters more
//    than calendar streaks; upper body after football is fine)
//  • YOUR choices win: a day you pinned to a session (or to rest) is fixed; everything else fits around it.
//  • Lifting on one of your rest days 0.4 · resting on one of your training days 0.4
//  • Resting the day after football: −0.3 (recovery bonus)
//  • Tiny nudge (0.02/day) toward training earlier, so spare days stay at the end of the week.

/** "football" | "busy" | "rest" (keep this day free) | "pin:D5" (do that session here). */
export type Mark = "football" | "busy" | "rest" | `pin:${string}`;
export interface DayIn { iso: string; dow: number } // dow 0 = Sunday
export interface SlotIn { dayKey: string; dayName: string; status: "done" | "skipped" | "open" }
export interface PlanDay {
  iso: string;
  dow: number;
  kind: "done" | "planned" | "football" | "busy" | "rest" | "past";
  dayKey?: string;
  dayName?: string;
  note?: string;
  today?: boolean;
  /** You chose this day yourself. */
  pinned?: boolean;
}
export interface WeekPlanOut {
  days: PlanDay[];
  unplaced: { dayKey: string; dayName: string; advice: string; action?: "legs_lite" | "skip_sport" | "carry" }[];
  todayKey: string | null;
  todayKind: PlanDay["kind"] | null;
  summary: string;
}

const isLegs = (s: { dayKey: string; dayName: string }) => /leg/i.test(s.dayName) || s.dayKey === "D3";
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

/** The 7 dates of the calendar week containing `today`, starting on `weekStart` (0 = Sun … 6 = Sat). */
export function weekDates(today: string, weekStart: number): DayIn[] {
  const t = new Date(`${today}T12:00:00Z`);
  const back = (t.getUTCDay() - weekStart + 7) % 7;
  const start = addDays(today, -back);
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(start, i);
    return { iso, dow: new Date(`${iso}T12:00:00Z`).getUTCDay() };
  });
}

/** Muscle overlap penalty for two sessions on consecutive days (order-independent). */
function overlap(a: string, b: string): number {
  const k = (x: string) => (/push/i.test(x) ? "push" : /pull/i.test(x) ? "pull" : /leg/i.test(x) ? "legs" : /chest/i.test(x) ? "cb" : /shoulder|arm/i.test(x) ? "sa" : x);
  const p = [k(a), k(b)].sort().join("+");
  return ({ "cb+pull": 1.5, "push+sa": 1.5, "cb+push": 1, "pull+sa": 0.5, "legs+sa": 0.5 } as Record<string, number>)[p] ?? 0;
}

export function planWeek(input: {
  today: string;
  dates: DayIn[];
  /** index = dow → "rest" = preferred rest day; anything else = preferred training day. null = no preference. */
  schedule: string[] | null;
  slots: SlotIn[]; // this program week, in program order
  doneOn: Record<string, string>; // iso → dayName of a finished lifting session
  marks: Record<string, Mark>;
  liftOnFootball?: Record<string, boolean>;
}): WeekPlanOut {
  const { today, dates, schedule, slots, doneOn, marks } = input;
  const football = new Set(Object.entries(marks).filter(([, m]) => m === "football").map(([d]) => d));
  const fb = (iso: string, k: number) => football.has(addDays(iso, k));
  const remaining = slots.filter((s) => s.status === "open");
  const doneToday = !!doneOn[today];
  const future = dates.filter((d) => d.iso > today || (d.iso === today && !doneToday));
  const canLift = (d: DayIn) => marks[d.iso] !== "busy" && marks[d.iso] !== "rest" && (!football.has(d.iso) || !!input.liftOnFootball?.[d.iso]);
  const pinOf = (d: DayIn) => { const m = marks[d.iso]; return m?.startsWith("pin:") ? m.slice(4) : null; };
  const prefersTrain = (d: DayIn) => (schedule ? schedule[d.dow] !== "rest" : true);
  const legsHard = (iso: string) => football.has(iso) || fb(iso, 1) || fb(iso, -1);
  const n = future.length;
  const plan: (SlotIn | null)[] = new Array(n).fill(null);
  const used: boolean[] = new Array(remaining.length).fill(false);
  const futureIdx = new Map(future.map((d, k) => [d.iso, k]));

  const nameOn = (iso: string): string | null => {
    if (doneOn[iso]) return doneOn[iso];
    const k = futureIdx.get(iso);
    return k != null && plan[k] ? plan[k]!.dayName : null;
  };

  function score(): number {
    let s = 0;
    remaining.forEach((r, i) => { if (!used[i]) s += isLegs(r) && football.size ? 6 : 12; });
    const order = plan.filter((p): p is SlotIn => !!p).map((p) => remaining.indexOf(p));
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) if (order[i] > order[j]) s += 1.5;
    future.forEach((d, k) => {
      const p = plan[k];
      if (p) {
        if (isLegs(p) && fb(d.iso, 2)) s += 2;
        const prev = nameOn(addDays(d.iso, -1));
        if (prev) s += overlap(prev, p.dayName);
        if (!prefersTrain(d)) s += 0.4;
        s += 0.02 * k;
      } else if (canLift(d)) {
        if (prefersTrain(d)) s += 0.4;
        if (fb(d.iso, -1)) s -= 0.3;
      }
    });
    let run = 0;
    for (let i = -3; i < dates.length; i++) {
      const iso = addDays(dates[0].iso, i);
      if (nameOn(iso) || football.has(iso)) { run++; if (run === 3) s += 0.3; if (run > 3) s += 1.2; } else run = 0;
    }
    return s;
  }

  // sessions you pinned to a (valid) future day are reserved for that day — never placed earlier/elsewhere
  // (bug before: Legs pinned to Sat got put on Fri because the search fills days in order)
  const reserved = new Set(future.filter((d) => {
    const pin = pinOf(d);
    const r = pin ? remaining.find((x) => x.dayKey === pin) : null;
    return !!r && !(isLegs(r) && legsHard(d.iso));
  }).map((d) => pinOf(d)!));

  let bestScore = Infinity;
  let bestPlan: (SlotIn | null)[] = [...plan];
  function dfs(k: number) {
    if (k === n) {
      const sc = score();
      if (sc < bestScore - 1e-9) { bestScore = sc; bestPlan = [...plan]; }
      return;
    }
    const d = future[k];
    const pin = pinOf(d);
    const pinIdx = pin ? remaining.findIndex((r) => r.dayKey === pin) : -1;
    if (pinIdx >= 0 && !used[pinIdx] && !(isLegs(remaining[pinIdx]) && legsHard(d.iso))) {
      // your choice: only this session on this day
      used[pinIdx] = true; plan[k] = remaining[pinIdx]; dfs(k + 1); used[pinIdx] = false; plan[k] = null;
      return;
    }
    plan[k] = null; // rest / no lifting
    dfs(k + 1);
    if (!canLift(d)) return;
    for (let i = 0; i < remaining.length; i++) {
      if (used[i]) continue;
      if (reserved.has(remaining[i].dayKey)) continue; // waits for its pinned day
      if (isLegs(remaining[i]) && legsHard(d.iso)) continue;
      used[i] = true;
      plan[k] = remaining[i];
      dfs(k + 1);
      used[i] = false;
      plan[k] = null;
    }
  }
  dfs(0);

  const assigned = new Map<string, SlotIn>();
  future.forEach((d, k) => { if (bestPlan[k]) assigned.set(d.iso, bestPlan[k]!); });

  const days: PlanDay[] = dates.map((d) => {
    const base = { iso: d.iso, dow: d.dow, today: d.iso === today };
    if (doneOn[d.iso]) return { ...base, kind: "done", dayName: doneOn[d.iso] };
    const a = assigned.get(d.iso);
    if (a) {
      const note = football.has(d.iso) ? "after football — keep it short"
        : isLegs(a) && fb(d.iso, 2) ? "2 days before football: leave 3 reps in the tank, no drop sets"
        : /shoulder|arm/i.test(a.dayName) && (fb(d.iso, 1) || fb(d.iso, -1)) ? "football next to it: skip the leg booster (split squats)"
        : fb(d.iso, 1) ? "football tomorrow: no failure sets, skip hard cardio" : undefined;
      return { ...base, kind: "planned", dayKey: a.dayKey, dayName: a.dayName, note, pinned: pinOf(d) === a.dayKey };
    }
    if (football.has(d.iso)) return { ...base, kind: "football", note: "football = your cardio today" };
    if (pinOf(d) && d.iso >= today) return { ...base, kind: "rest", note: `can't do ${remaining.find((r) => r.dayKey === pinOf(d))?.dayName ?? "that session"} here — already done, or Legs right next to football (48 h rule)` };
    if (marks[d.iso] === "busy") return { ...base, kind: "busy" };
    if (d.iso < today) return { ...base, kind: "past" };
    return { ...base, kind: "rest", pinned: marks[d.iso] === "rest", note: fb(d.iso, -1) ? "recovery after football (easy walk / mobility)" : undefined };
  });

  const placed = new Set(assigned.values());
  const left = remaining.filter((r) => !placed.has(r));
  const unplaced: WeekPlanOut["unplaced"] = left.map((s) => {
    if (isLegs(s) && football.size) {
      const free = future.find((d) => canLift(d) && !assigned.has(d.iso) && !legsHard(d.iso));
      if (free) return { dayKey: s.dayKey, dayName: s.dayName, action: "legs_lite" as const, advice: `Legs fits as Legs-lite on ${dayName(free.iso)}: squat + RDL + calves, 2 sets each. Or skip it — football already loaded your legs.` };
      const swap = future.find((d) => canLift(d) && assigned.has(d.iso) && !legsHard(d.iso));
      if (swap) return { dayKey: s.dayKey, dayName: s.dayName, action: "skip_sport" as const, advice: `Not enough free days this week, so Legs is the one left out — football already trained your legs. Rather do Legs? Start it on ${dayName(swap.iso)} instead of ${assigned.get(swap.iso)!.dayName} (that one moves to next week).` };
      return { dayKey: s.dayKey, dayName: s.dayName, action: "skip_sport" as const, advice: "No safe day for heavy Legs this week (football too close on both sides). Skip it — football counts as your leg day." };
    }
    return { dayKey: s.dayKey, dayName: s.dayName, action: "carry" as const, advice: `${s.dayName} doesn't fit this week — it moves to next week (the week just stretches). Short on time? Add its first 3 exercises to your next session.` };
  });

  const t = days.find((d) => d.today) ?? null;
  const seq = future.map((_, k) => bestPlan[k]).filter((p): p is SlotIn => !!p).map((p) => remaining.indexOf(p));
  const moved = seq.some((v, i) => i > 0 && seq[i - 1] > v);
  const summary = [
    football.size ? `${football.size} football day${football.size > 1 ? "s" : ""}` : "",
    unplaced.length ? `${unplaced.length} session${unplaced.length > 1 ? "s don't" : " doesn't"} fit` : remaining.length ? "everything fits" : "week done",
    moved ? "order adjusted" : "",
  ].filter(Boolean).join(" · ");
  return { days, unplaced, todayKey: t?.kind === "planned" ? t.dayKey ?? null : null, todayKind: t?.kind ?? null, summary };
}
