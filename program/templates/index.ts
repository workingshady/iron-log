// Plan templates + the questionnaire scoring. Pure data/functions: used by the worker (worker/routes/programs.ts)
// and the client (src/screens/Programs.tsx), and checked by `npm run check` (scripts/check-templates.ts).
import { EX_GROUP, type Group } from "../groups";
import { DRAFTS } from "./catalog";
import { dayMinutes, designVolume, expand, type Design, type EquipLevel, type Goal, type Level, type Template, type TemplateMeta, type UserProgram } from "./design";

export * from "./design";

export const TEMPLATES: Template[] = DRAFTS.map(({ meta, design }) => ({
  meta,
  design,
  program: expand(design, { id: `tpl-${meta.id}`, version: "1.0.0", name: meta.name, changelog: meta.blurb }),
}));
export const templateById = (id: string) => TEMPLATES.find((t) => t.meta.id === id) ?? null;

/** Direct weekly sets per muscle GROUP (the exercise's group × sets). */
export function groupVolume(design: Design): Partial<Record<Group, number>> {
  const out: Partial<Record<Group, number>> = {};
  for (const d of design.days) for (const it of d.items) { const g = EX_GROUP[it.ex]; if (g) out[g] = (out[g] ?? 0) + it.sets; }
  return out;
}

export const avgMinutes = (design: Design) => Math.round(design.days.reduce((a, d) => a + dayMinutes(d), 0) / Math.max(1, design.days.length));

// ---------------------------------------------------------------- questionnaire

export interface Answers {
  days: number;
  /** Minutes you have per session. */
  minutes: number;
  goal: Goal;
  level: Level;
  equipment: EquipLevel;
  focus: Group[];
}
const EQ_RANK: Record<EquipLevel, number> = { bodyweight: 0, dumbbells: 1, gym: 2 };
export interface Scored { meta: TemplateMeta; score: number; reasons: string[]; minutes: number; fit: boolean }

/** Ranks templates for the answers. Plans that need equipment you don't have are dropped. */
export function rankTemplates(a: Answers): Scored[] {
  const out: Scored[] = [];
  for (const t of TEMPLATES) {
    const m = t.meta;
    if (EQ_RANK[m.equipment] > EQ_RANK[a.equipment]) continue;
    const reasons: string[] = [];
    let s = 0;
    const dd = m.days - a.days;
    if (dd === 0) { s += 40; reasons.push(`Fits your ${a.days} days`); }
    else if (dd < 0) { s += 24 + 6 * dd; reasons.push(`${m.days} days — leaves ${-dd} spare`); }
    else s -= 25 * dd;
    const mins = avgMinutes(t.design);
    if (mins <= a.minutes + 5) { s += 15; reasons.push(`~${mins} min per session`); }
    else s -= Math.min(30, (mins - a.minutes) * 0.8);
    if (m.levels.includes(a.level)) { s += 15; reasons.push(`Made for ${a.level}s`); }
    else if (a.level === "beginner") s -= 20;
    else s -= 5;
    if (m.goals.includes(a.goal)) { s += 12; if (m.goals[0] === a.goal) { s += 3; reasons.push(`Built for ${a.goal === "general" ? "general fitness" : a.goal}`); } }
    if (m.equipment === a.equipment) { s += 8; if (a.equipment !== "gym") reasons.push(a.equipment === "dumbbells" ? "Dumbbells only" : "No equipment needed"); }
    if (a.focus.length) {
      const gv = groupVolume(t.design);
      const hits = a.focus.filter((g) => m.focus.includes(g) || (gv[g] ?? 0) >= 12);
      s += hits.length * 5;
      if (hits.length) reasons.push(`Extra ${hits.slice(0, 2).join(" & ").toLowerCase()} work`);
    }
    out.push({ meta: m, score: Math.round(s), reasons: reasons.slice(0, 3), minutes: mins, fit: dd <= 0 && mins <= a.minutes + 10 });
  }
  return out.sort((x, y) => y.score - x.score);
}

/** A new user program from a template. */
export function fromTemplate(t: Template, id: string, name?: string): UserProgram {
  const design: Design = JSON.parse(JSON.stringify(t.design));
  return { ...expand(design, { id, version: "1.0.0", name: name || t.meta.name, changelog: `From the ${t.meta.name} template.` }), design, template: t.meta.id, custom: [] };
}

/** Rebuild a user program after an edit (bumps the patch version: same id → the month continues, Plan shows the new version). */
export function rebuild(prev: { id: string; version?: string }, next: { name: string; design: Design; template?: string | null; custom?: UserProgram["custom"] }): UserProgram {
  const [a, b, c] = (prev.version ?? "1.0.0").split(".").map((x) => Number(x) || 0);
  const version = `${a || 1}.${b}.${c + 1}`;
  return { ...expand(next.design, { id: prev.id, version, name: next.name, changelog: "Edited in the plan editor." }), design: next.design, template: next.template ?? null, custom: next.custom ?? [] };
}

export { designVolume };
