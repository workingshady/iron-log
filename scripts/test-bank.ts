// `npx tsx scripts/test-bank.ts` — exercise bank sanity: smart alternatives per swap reason, ratios, defaults.
import { smartAlts, genericRatio, defaultRx, equipOf, kindOf } from "../program/bank";
const cases: [string, string | null][] = [["bench", null], ["bench", "pain"], ["bench", "equipment busy"], ["ez_curl", "pain"], ["squat", "too hard"], ["pushdown", null], ["leg_extension", "no equipment"]];
for (const [k, r] of cases) console.log(k.padEnd(14), (r ?? "-").padEnd(15), "→", smartAlts(k, r, 5).join(", "));
console.log("bench 80×6 → pec_deck ×12:", (80 * genericRatio("bench", "pec_deck", 6, 12)!).toFixed(1));
console.log("bench 80×6 → incline_bench ×6:", (80 * genericRatio("bench", "incline_bench", 6, 6)!).toFixed(1));
console.log("ez_curl 30 → preacher:", (30 * genericRatio("ez_curl", "preacher_curl")!).toFixed(1));
for (const k of ["deadlift", "pec_deck", "db_kickback", "side_plank", "hip_adduction", "smith_shrug", "lean_lateral"]) console.log(k.padEnd(14), equipOf(k).padEnd(10), kindOf(k).padEnd(10), JSON.stringify(defaultRx(k)));
