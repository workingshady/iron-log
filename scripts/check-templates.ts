// `npx tsx scripts/check-templates.ts` — every plan template must pass validate() + the user-program checks,
// and its weekly volume per muscle is printed (fractional sets; target ~10-20, see program/templates/catalog.ts).
import { TEMPLATES, validateUserProgram, designVolume, avgMinutes, VOLUME_MUSCLES, bandOf } from "../program/templates";
import { MUSCLE_LABEL } from "../program/muscles";

let bad = 0;
for (const t of TEMPLATES) {
  const errs = validateUserProgram({ ...t.program, design: t.design });
  if (t.program.weeks.length !== 4 || !/deload/i.test(t.program.weeks[3].name)) errs.push("needs 4 weeks with a week-4 deload");
  if (t.design.days.length !== t.meta.days) errs.push(`meta.days ${t.meta.days} ≠ ${t.design.days.length} days`);
  const v = designVolume(t.design);
  const vol = VOLUME_MUSCLES.map((m) => `${MUSCLE_LABEL[m].split(" ")[0]} ${Math.round((v[m] ?? 0) * 2) / 2}${{ good: "", min: "·", low: "↓", high: "↑" }[bandOf(v[m] ?? 0, m)]}`).join(" · ");
  console.log(`${t.meta.id.padEnd(8)} ${errs.length ? "✗" : "✓"} ${t.meta.days}d ~${avgMinutes(t.design)}min | ${vol}`);
  errs.forEach((e) => console.log("  - " + e));
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
