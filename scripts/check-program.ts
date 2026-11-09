// `npm run check` — validates every program version against the exercise library.
import { ALL_VERSIONS, validate, programVersionId } from "../program";

let bad = 0;
for (const p of ALL_VERSIONS) {
  const errs = validate(p);
  console.log(`${programVersionId(p)}: ${errs.length ? "✗" : "✓"}`);
  errs.forEach((e) => console.log("  - " + e));
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
