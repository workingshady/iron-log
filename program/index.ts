import { v1 } from "./versions/v1";
import { EXERCISES } from "./exercises";
import type { Program, Rx } from "./types";

// ▶ The ONE line to change when a new program version is ready.
export const CURRENT: Program = v1;

// Every version ever used. Keep old ones so history stays readable.
export const ALL_VERSIONS: Program[] = [v1];

export { EXERCISES };
export * from "./types";
export * from "./swaps";

export const programVersionId = (p: Program) => `${p.id}@${p.version}`;

/** Throws if a version references an unknown exercise. Run with `npm run check`. */
export function validate(p: Program): string[] {
  const errs: string[] = [];
  const seen = (k: string, where: string) => {
    if (!EXERCISES[k]) errs.push(`${where}: unknown exercise "${k}"`);
  };
  for (const w of p.weeks)
    for (const d of w.days) {
      if (!p.order.includes(d.key)) errs.push(`W${w.n} ${d.key}: not in program.order`);
      d.items.forEach((it: Rx) => seen(it.ex, `W${w.n} ${d.key}`));
    }
  for (const e of Object.values(EXERCISES)) (e.alts ?? []).forEach((a) => seen(a, `alts of ${e.key}`));
  return errs;
}
