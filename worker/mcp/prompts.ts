// MCP prompts: ready-made coaching requests the user can pick in Claude / ChatGPT.
export interface PromptDef { name: string; title: string; description: string; arguments?: { name: string; description: string; required?: boolean }[]; text: (a: Record<string, string>) => string }

const RULES = `Coaching rules (Iron Log review workflow):
- Progression: top of the rep range on all sets at the target RIR → add load (+2.5 kg upper / +5 kg lower, or the next dumbbell step). Stalled 2+ sessions → change the rep range or the variation.
- Effort accuracy: logged RIR vs target. Always easier → raise targets. RIR 0 everywhere → too much.
- Recovery: readiness, session RPE, sleep/body logs, workout length, real rest vs prescribed.
- Adherence: missed/skipped days and excuses (e.g. the same weekday always missed → move or shorten that day).
- Pain & swaps: repeated pain or swaps on one lift → replace it, lower volume or change grip/range. Sharp pain (3) = remove the movement.
- Journal: life context explains bad weeks. Don't punish a stressful week.
- Every plan change needs a one-line why. Show me the change before saving anything big, and remind me it can be undone.`;

export const PROMPTS: PromptDef[] = [
  {
    name: "review_last_workout", title: "Review my last workout",
    description: "How did the last session go vs. the plan, and what should change next time?",
    text: () => `Review my last Iron Log workout. Call get_overview, then get_session with id "latest", and get_exercise_history for any lift that looked off. Compare what I did with the app's suggestions and targets (weight, reps, RIR, rest), note pain and feedback, and tell me in a few bullets: what went well, what to change next time, and the weights to aim for. Only change my plan or targets if I agree.\n\n${RULES}`,
  },
  {
    name: "weekly_check_in", title: "Weekly check-in",
    description: "This week's training, recovery and adherence in one short summary.",
    text: () => `Do my weekly Iron Log check-in. Use get_overview, list_sessions for the last 7 days, get_progress (weeks: 2) and get_body_and_habits (last 14 days), and get_journal for context. Summarise in under 10 bullets: sessions done/missed and why, hard sets per muscle vs 10-20/week, effort (RIR), recovery (sleep, readiness), PRs, and one or two concrete adjustments for next week (use set_exercise_target or customize_next_workout only after I say yes).\n\n${RULES}`,
  },
  {
    name: "monthly_review", title: "Monthly review + next month",
    description: "Full review of the month and a proposal for next month's plan version.",
    text: () => `Do my monthly Iron Log review. Read get_months, get_progress (weeks: 6), list_sessions for this month, get_exercise_history for my main lifts, get_tests, get_body_and_habits and get_journal. Then:\n1. Write the review (wins, stalls, adherence, recovery, pain, what the data shows) and save it with write_month_review after I approve.\n2. Propose the next plan version: concrete changes per day with the data behind each one. When I agree, apply it with edit_day / update_plan (bump: minor) — on the built-in default plan, explain fork_plan first.\n\n${RULES}`,
  },
  {
    name: "fewer_days", title: "I only have N days a week",
    description: "Rebuild the plan for fewer (or more) training days.",
    arguments: [{ name: "days", description: "Days per week you can train, e.g. 3", required: true }],
    text: (a) => `I can only train ${a.days || 3} days a week from now on. Look at get_plan, get_progress and list_templates. Propose how to fit my plan into ${a.days || 3} days while keeping every muscle at ~10-20 hard sets/week where possible (merge days, keep the big lifts, trim isolation). Show me the new week before saving; then save it with update_plan (bump: minor) or fork_plan from a template if that's cleaner.\n\n${RULES}`,
  },
  {
    name: "pain_check", title: "Something hurts",
    description: "Adjust the plan around pain (shoulder, elbow, knee, back …).",
    arguments: [{ name: "area", description: "Where it hurts, e.g. left shoulder", required: true }],
    text: (a) => `My ${a.area || "shoulder"} hurts. Check list_sessions, get_progress (recent_pain) and get_exercise_history for the lifts that load it. Tell me which movements to pause, swap (search_exercises for joint-friendly options: machines/cables, neutral grips, smaller range) or lighten, for how long, and how to test it again. Use customize_next_workout for the next session and edit_day for lasting changes after I agree. You're not a doctor: if it's sharp, swollen or getting worse, tell me to see one.\n\n${RULES}`,
  },
];
