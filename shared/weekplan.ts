// Adaptive week: re-fits the remaining sessions of this program week around football / busy days.
//
// Rules (sources in docs/GUIDE.md "Football weeks"):
//  • No lifting on a football day (you can toggle "lift too" on a light-game day).
//  • Heavy LEGS never the day before, the day of, or the day after football; 2 days before only if nothing else fits
//    (≥48 h between a match and heavy leg work — soccer S&C guidance).
//  • Sessions keep program order when they can; Legs is moved later (or earlier) instead of breaking a rule.
//  • Your weekly schedule's rest days are kept unless sessions would otherwise not fit.
//  • No more than 3 hard days in a row (football counts as a hard day).
//  • If a session can't fit: Legs → "Legs-lite" (squat + RDL + calves, fewer sets) on the safest day, or skip it this
//    week (football already loaded your legs); others → carry to next week (the week just stretches).

export type Mark = "football" | "busy";
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
}
export interface WeekPlanOut {
  days: PlanDay[];
  unplaced: { dayKey: string; dayName: string; advice: string; action?: "legs_lite" | "skip_sport" | "carry" }[];
  todayKey: string | null;
  summary: string;
}

const isLegs = (s: { dayKey: string; dayName: string }) => /leg/i.test(s.dayName) || s.dayKey === "D3";
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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

export function planWeek(input: {
  today: string;
  dates: DayIn[];
  schedule: string[] | null; // index = dow → dayKey | "rest"
  slots: SlotIn[]; // this program week, in program order
  doneOn: Record<string, string>; // iso → dayName of a finished lifting session
  marks: Record<string, Mark>;
  liftOnFootball?: Record<string, boolean>;
}): WeekPlanOut {
  const { today, dates, schedule, slots, doneOn, marks } = input;
  const football = new Set(Object.entries(marks).filter(([, m]) => m === "football").map(([d]) => d));
  const fbNear = (iso: string, k: number) => football.has(addDays(iso, k));
  const remaining = slots.filter((s) => s.status === "open");
  const doneToday = !!doneOn[today];

  // candidate days to lift: today (if not trained yet) and later, not busy, not football (unless "lift too")
  const future = dates.filter((d) => d.iso > today || (d.iso === today && !doneToday));
  const candidates = future.filter((d) => marks[d.iso] !== "busy" && (!football.has(d.iso) || input.liftOnFootball?.[d.iso]));
  const preferred = (d: DayIn) => !schedule || schedule[d.dow] !== "rest";

  const legsHard = (iso: string) => football.has(iso) || fbNear(iso, 1) || fbNear(iso, -1);
  const legsSoft = (iso: string) => fbNear(iso, 2);

  // hard days already in a row before a date (done sessions + football + planned so far)
  const assigned = new Map<string, SlotIn>();
  const hard = (iso: string) => !!doneOn[iso] || football.has(iso) || assigned.has(iso);
  const streakBefore = (iso: string) => { let n = 0; for (let k = 1; k <= 3; k++) { if (hard(addDays(iso, -k))) n++; else break; } return n; };

  const queue = [...remaining];
  for (let i = 0; i < candidates.length && queue.length; i++) {
    const d = candidates[i];
    const daysLeft = candidates.length - i;
    const must = queue.length >= daysLeft; // not enough days left → train today
    if (!must && !preferred(d)) continue;
    if (!must && streakBefore(d.iso) >= 3) continue;
    // first session in program order that is allowed here; legs avoids the soft zone unless it's the last chance
    let pick = queue.findIndex((s) => !isLegs(s) || (!legsHard(d.iso) && !legsSoft(d.iso)));
    if (pick < 0) pick = queue.findIndex((s) => !isLegs(s) || !legsHard(d.iso));
    if (pick < 0) continue;
    // keep Legs in order if it's next and allowed; otherwise program order already chose the next allowed one
    assigned.set(d.iso, queue[pick]);
    queue.splice(pick, 1);
  }

  const days: PlanDay[] = dates.map((d) => {
    const base = { iso: d.iso, dow: d.dow, today: d.iso === today };
    if (doneOn[d.iso]) return { ...base, kind: "done", dayName: doneOn[d.iso] };
    const a = assigned.get(d.iso);
    if (a) {
      const note = football.has(d.iso) ? "after football — keep it short" : isLegs(a) && legsSoft(d.iso) ? "2 days before football: go lighter" : !isLegs(a) && /shoulder|arm/i.test(a.dayName) && (fbNear(d.iso, 1) || fbNear(d.iso, -1)) ? "football next to it: skip the leg booster (split squats)" : undefined;
      return { ...base, kind: "planned", dayKey: a.dayKey, dayName: a.dayName, note };
    }
    if (football.has(d.iso)) return { ...base, kind: "football" };
    if (marks[d.iso] === "busy") return { ...base, kind: "busy" };
    if (d.iso < today) return { ...base, kind: "past" };
    return { ...base, kind: "rest", note: fbNear(d.iso, -1) ? "recovery after football" : undefined };
  });

  const unplaced: WeekPlanOut["unplaced"] = queue.map((s) => {
    if (isLegs(s) && football.size) {
      const safe = candidates.find((d) => !assigned.has(d.iso) && !legsHard(d.iso));
      const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long" });
      if (safe) return { dayKey: s.dayKey, dayName: s.dayName, action: "legs_lite" as const, advice: `No full Legs slot this week. Do Legs-lite on ${day(safe.iso)}: squat + RDL + calves, 2 sets each — or skip it, football already loaded your legs.` };
      // last resort: a day 2 days before football that holds another session → offer to swap it for a lighter Legs
      const swap = candidates.find((d) => !legsHard(d.iso));
      const other = swap ? assigned.get(swap.iso) : undefined;
      if (swap && other) return { dayKey: s.dayKey, dayName: s.dayName, action: "legs_lite" as const, advice: `Legs only fits on ${day(swap.iso)} (2 days before football). Option A: do Legs there instead of ${other.dayName} — lighter, RIR 3, no drop sets — and ${other.dayName} moves to next week. Option B: skip Legs this week, football counts as your leg day.` };
      return { dayKey: s.dayKey, dayName: s.dayName, action: "skip_sport" as const, advice: "No safe day for Legs (football too close). Skip Legs this week — football counts as your leg day — and log it as skipped (sport)." };
    }
    return { dayKey: s.dayKey, dayName: s.dayName, action: "carry" as const, advice: `${s.dayName} doesn't fit this week — it moves to next week (the week just stretches). Short on time? Do its first 3 exercises on your next session.` };
  });

  const todayPlan = days.find((d) => d.today && d.kind === "planned");
  const moved = remaining.filter((s, i) => { const at = [...assigned.entries()].find(([, v]) => v === s); return at && remaining.indexOf(s) !== i; });
  const fb = football.size ? `${football.size} football day${football.size > 1 ? "s" : ""}` : "";
  const summary = [fb, unplaced.length ? `${unplaced.length} session${unplaced.length > 1 ? "s don't" : " doesn't"} fit` : remaining.length ? "everything fits" : "week done", moved.length ? "order adjusted" : ""].filter(Boolean).join(" · ");
  return { days, unplaced, todayKey: todayPlan?.dayKey ?? null, summary };
}
