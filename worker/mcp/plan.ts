// Plan versions for user programs: every change is a NEW version with a why, and a snapshot in program_versions so it
// can be restored ("undo" = restore an older snapshot as the next version; nothing is ever deleted).
//
// Storage (no schema change): program_versions row id "<programId>@<version>", changelog = the why,
// snapshot = the full UserProgram JSON + `_meta` {why, by: "ai" | "you", client?, at}. Rows written by the app when a
// workout starts (worker/index.ts ensureVersion) have no _meta and an `exercises` copy, which is stripped on restore.
import { and, eq, like } from "drizzle-orm";
import * as t from "../db/schema";
import type { RawDB } from "../db";
import { CURRENT, EXERCISES, programVersionId, type Program, type Rx } from "../../program";
import { GROUPS, type Group } from "../../program/groups";
import { MUSCLE_LABEL, type Muscle } from "../../program/muscles";
import { kindOf } from "../../program/bank";
import { expand, registerCustom, validateUserProgram, type CustomEx, type DItem, type Design, type UserProgram } from "../../program/templates";

export type Bump = "patch" | "minor";
export interface VersionMeta { why: string; by: "ai" | "you"; client?: string | null; at: number }
/** Changes for ONE week only (edit_day with a week): replace that week's day items after the 4-week wave is built. */
export type WeekEdits = Record<string, Record<string, Rx[]>>;
export type AiProgram = UserProgram & { weekEdits?: WeekEdits };

const MUSCLES = new Set(Object.keys(MUSCLE_LABEL));
const GROUP_SET = new Set<string>(GROUPS);
const METRICS = new Set(["weight_reps", "reps", "assist_reps", "time", "distance"]);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "ex";
export const userSlug = (uid: string) => slug(uid).slice(0, 20);

export function parseProgram(json: string | null | undefined): AiProgram | null {
  if (!json) return null;
  try {
    const p = JSON.parse(json) as AiProgram & { exercises?: unknown; _meta?: unknown };
    delete p.exercises;
    delete p._meta;
    return p;
  } catch {
    return null;
  }
}

export function bumpVersion(v: string, kind: Bump) {
  const [a, b, c] = (v || "1.0.0").split(".").map((x) => Number(x) || 0);
  return kind === "minor" ? `${a || 1}.${b + 1}.0` : `${a || 1}.${b}.${c + 1}`;
}

// ---------------------------------------------------------------- sanitizers (same rules as the plan editor)

/** Custom exercises: only "c-<me>-…" keys, known muscles/groups/metrics, short strings. */
export function cleanCustom(list: unknown, uid: string): CustomEx[] {
  if (!Array.isArray(list)) return [];
  const pre = `c-${userSlug(uid)}-`;
  const out: CustomEx[] = [];
  for (const x of list.slice(0, 50) as Partial<CustomEx>[]) {
    if (!x || typeof x.name !== "string" || !x.name.trim()) continue;
    const key = typeof x.key === "string" && x.key.startsWith(pre) && /^c-[a-z0-9-]{1,80}$/.test(x.key) ? x.key : `${pre}${slug(x.name)}-${crypto.randomUUID().slice(0, 4)}`;
    const p = (Array.isArray(x.p) ? x.p : []).filter((m) => MUSCLES.has(m)).slice(0, 4) as Muscle[];
    const s = (Array.isArray(x.s) ? x.s : []).filter((m) => MUSCLES.has(m) && !p.includes(m)).slice(0, 4) as Muscle[];
    out.push({
      key, name: x.name.trim().slice(0, 60), metric: METRICS.has(x.metric as string) ? x.metric! : "weight_reps",
      group: GROUP_SET.has(x.group as string) ? (x.group as Group) : "Core", p: p.length ? p : ["abs"], s: s.length ? s : undefined,
      cues: Array.isArray(x.cues) ? x.cues.filter((c) => typeof c === "string" && c.trim()).map((c) => c.slice(0, 120)).slice(0, 5) : undefined,
      perSide: !!x.perSide || undefined,
    });
  }
  return out;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
function cleanReps(r: unknown): DItem["reps"] | undefined {
  if (r === null) return null;
  if (Array.isArray(r) && r.length === 2) return [Math.round(Number(r[0])), Math.round(Number(r[1]))];
  if (typeof r === "string") {
    const m = r.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/);
    if (m) return [Number(m[1]), Number(m[2])];
    if (/^max$/i.test(r.trim())) return null;
  }
  const n = num(r);
  return n == null ? undefined : Math.round(n);
}

export function cleanItem(it: Partial<DItem>): DItem {
  const o: DItem = { ex: String(it.ex ?? ""), sets: Math.round(Number(it.sets) || 0), rest: Math.round(num(it.rest) ?? 90) };
  const reps = cleanReps(it.reps);
  if (reps !== undefined) o.reps = reps;
  if (num(it.seconds) != null) o.seconds = num(it.seconds);
  if (num(it.meters) != null) o.meters = num(it.meters);
  if (it.rir === null) o.rir = null; else if (num(it.rir) != null) o.rir = num(it.rir);
  if (typeof it.tech === "string" && it.tech.trim()) o.tech = it.tech.trim().slice(0, 160);
  if (it.heavy) o.heavy = true;
  if (it.fin) o.fin = true;
  if (typeof it.tag === "string" && /^[A-Z][0-9]$/.test(it.tag)) o.tag = it.tag;
  return o;
}

export function cleanDesign(d: unknown): Design {
  const days = Array.isArray((d as Design)?.days) ? (d as Design).days.slice(0, 7) : [];
  return {
    days: days.map((day, i) => ({
      key: typeof day?.key === "string" && /^[A-Za-z0-9_-]{1,12}$/.test(day.key) ? day.key : `D${i + 1}`,
      name: String(day?.name ?? "").slice(0, 40),
      focus: String(day?.focus ?? "").slice(0, 80),
      items: (Array.isArray(day?.items) ? day.items : []).slice(0, 20).map(cleanItem),
    })),
  };
}

/** Rx (expanded week item) from a design-like item, for one-week edits and one-workout overrides. */
export function toRx(it: Partial<DItem> & { rir?: unknown; finisher?: boolean }): Rx {
  const c = cleanItem(it);
  const rx: Rx = { ex: c.ex, sets: c.sets, rest: c.rest };
  if (c.reps !== undefined) rx.reps = c.reps;
  if (c.seconds != null) rx.seconds = c.seconds;
  if (c.meters != null) rx.meters = c.meters;
  if (Array.isArray(it.rir) && it.rir.length === 2) rx.rir = [Number(it.rir[0]), Number(it.rir[1])];
  else if (c.rir != null) rx.rir = c.rir;
  if (c.tech) rx.tech = c.tech;
  if (c.tag) rx.tag = c.tag;
  if (it.fin || it.finisher) rx.finisher = true;
  return rx;
}

/** Readable errors for a list of Rx (one-week edits, next-workout overrides). */
export function checkRx(items: Rx[], where: string, custom?: CustomEx[] | null): string[] {
  const errs: string[] = [];
  const own = new Set((custom ?? []).map((c) => c.key));
  for (const it of items) if (it.ex.startsWith("c-") && !own.has(it.ex)) errs.push(`${where}: "${it.ex}" isn't one of your custom exercises.`);
  if (!items.length) errs.push(`${where}: needs at least one exercise.`);
  if (items.length > 20) errs.push(`${where}: at most 20 exercises.`);
  for (const it of items) {
    const nm = EXERCISES[it.ex]?.name ?? it.ex;
    if (!EXERCISES[it.ex]) { errs.push(`${where}: unknown exercise "${it.ex}" (use search_exercises for keys).`); continue; }
    if (!(it.sets >= 1 && it.sets <= 10)) errs.push(`${where} · ${nm}: sets must be 1-10.`);
    if (Array.isArray(it.reps) && (it.reps[0] < 1 || it.reps[1] < it.reps[0] || it.reps[1] > 100)) errs.push(`${where} · ${nm}: rep range looks wrong.`);
    if (typeof it.reps === "number" && (it.reps < 1 || it.reps > 100)) errs.push(`${where} · ${nm}: reps must be 1-100.`);
    if (!(it.rest >= 0 && it.rest <= 600)) errs.push(`${where} · ${nm}: rest must be 0-600 s.`);
    const r = Array.isArray(it.rir) ? it.rir : it.rir == null ? [] : [it.rir];
    if (r.some((x) => !(x >= 0 && x <= 5))) errs.push(`${where} · ${nm}: RIR must be 0-5.`);
  }
  return errs;
}

// ---------------------------------------------------------------- build / convert

/** A full UserProgram from its parts (keeps id; the version and why are set by the caller). */
export function buildProgram(prev: AiProgram, next: { name: string; design: Design; custom: CustomEx[]; rules?: string[]; weekEdits?: WeekEdits; template?: string | null }, version: string, why: string): AiProgram {
  registerCustom(next.custom);
  const p = expand(next.design, { id: prev.id, version, name: next.name, changelog: why.slice(0, 500), rules: next.rules ?? prev.rules, tests: prev.tests });
  const weekEdits: WeekEdits = {};
  for (const [wn, days] of Object.entries(next.weekEdits ?? {})) {
    const w = p.weeks.find((x) => String(x.n) === wn);
    if (!w) continue;
    for (const [dk, items] of Object.entries(days)) {
      const day = w.days.find((d) => d.key === dk);
      if (!day) continue; // the day was removed from the plan → its one-week edit goes too
      day.items = items;
      (weekEdits[wn] ??= {})[dk] = items;
    }
  }
  const out: AiProgram = { ...p, design: next.design, template: next.template ?? prev.template ?? null, custom: next.custom };
  if (Object.keys(weekEdits).length) out.weekEdits = weekEdits;
  return out;
}

/** The built-in plan (or any Program without a design) → an editable one-week design, taken from its "Build" week (Week 2). */
export function designFromProgram(p: Program): Design {
  const w = p.weeks.find((x) => x.n === 2) ?? p.weeks[0];
  return {
    days: p.order.map((key) => {
      const d = w.days.find((x) => x.key === key) ?? p.weeks.flatMap((x) => x.days).find((x) => x.key === key)!;
      return {
        key, name: d.name.slice(0, 40), focus: d.focus.slice(0, 80),
        items: d.items.slice(0, 20).map((it) => cleanItem({
          ex: it.ex, sets: it.sets, reps: it.reps, seconds: it.seconds, meters: it.meters, rest: it.rest, tech: it.tech, tag: it.tag,
          rir: it.rir == null ? (it.finisher ? null : undefined) : Array.isArray(it.rir) ? it.rir[0] : it.rir,
          heavy: kindOf(it.ex) === "heavy" || undefined, fin: it.finisher || undefined,
        })),
      };
    }),
  };
}

export function validate(p: AiProgram): string[] {
  const errs = validateUserProgram(p);
  // custom exercises are registered isolate-wide (program/templates registerCustom): only this plan's own "c-" keys may be used
  const own = new Set((p.custom ?? []).map((c) => c.key));
  for (const d of p.design?.days ?? []) for (const it of d.items) if (it.ex.startsWith("c-") && !own.has(it.ex)) errs.push(`${d.name || d.key}: "${it.ex}" isn't one of this plan's custom exercises.`);
  for (const [wn, days] of Object.entries(p.weekEdits ?? {})) for (const [dk, items] of Object.entries(days)) errs.push(...checkRx(items, `Week ${wn} ${dk}`, p.custom));
  return errs;
}

// ---------------------------------------------------------------- storage

export async function ownProgram(d: RawDB, uid: string, id: string) {
  const [r] = await d.select().from(t.userPrograms).where(and(eq(t.userPrograms.id, id), eq(t.userPrograms.userId, uid)));
  return r ?? null;
}

/** Store a snapshot of this exact version if there's none yet (e.g. a version saved in the plan editor). */
export async function snapshotIfMissing(d: RawDB, p: AiProgram, meta?: VersionMeta) {
  const id = programVersionId(p);
  const [have] = await d.select({ id: t.programVersions.id }).from(t.programVersions).where(eq(t.programVersions.id, id));
  if (have) return;
  await d.insert(t.programVersions).values({ id, name: p.name, changelog: (meta?.why ?? p.changelog ?? "").slice(0, 500), snapshot: JSON.stringify({ ...p, _meta: meta ?? null }), firstSeenAt: meta?.at ?? Date.now() }).onConflictDoNothing();
}

/** A version id that doesn't exist yet for this program (bumps the patch again if needed). */
async function freeVersion(d: RawDB, id: string, start: string) {
  let v = start;
  for (let i = 0; i < 50; i++) {
    const [have] = await d.select({ id: t.programVersions.id }).from(t.programVersions).where(eq(t.programVersions.id, `${id}@${v}`));
    if (!have) return v;
    v = bumpVersion(v, "patch");
  }
  return v;
}

/**
 * Save a new version of a user program: snapshot the current one first (so undo always has it), then write the new
 * program + its snapshot with the why. Same program id → the month continues.
 */
export async function saveVersion(
  d: RawDB, uid: string, row: typeof t.userPrograms.$inferSelect,
  next: { name: string; design: Design; custom: CustomEx[]; rules?: string[]; weekEdits?: WeekEdits },
  why: string, bump: Bump, meta: Omit<VersionMeta, "why" | "at">,
): Promise<{ ok: true; program: AiProgram; from: string } | { ok: false; errors: string[] }> {
  const old = parseProgram(row.json);
  if (!old) return { ok: false, errors: ["This plan's data is broken; ask the owner to check it."] };
  if (!why.trim()) return { ok: false, errors: ["Say why (one line): it's stored with the version and shown to the user."] };
  const version = await freeVersion(d, old.id, bumpVersion(old.version, bump));
  const prog = buildProgram(old, next, version, why.trim());
  const errs = validate(prog);
  if (errs.length) return { ok: false, errors: errs };
  const at = Date.now();
  await snapshotIfMissing(d, old);
  await d.update(t.userPrograms).set({ name: prog.name, json: JSON.stringify(prog), updatedAt: at })
    .where(and(eq(t.userPrograms.id, row.id), eq(t.userPrograms.userId, uid)));
  await snapshotIfMissing(d, prog, { ...meta, why: why.trim(), at });
  return { ok: true, program: prog, from: old.version };
}

export interface VersionRow { version: string; id: string; date: string; at: number; why: string; by: string; current: boolean; restorable: boolean }

/** Versions of one user program, newest first (current included even if it was never snapshotted). */
export async function listVersions(d: RawDB, row: typeof t.userPrograms.$inferSelect): Promise<VersionRow[]> {
  const cur = parseProgram(row.json);
  if (cur) await snapshotIfMissing(d, cur, { why: cur.changelog || "Saved in the app", by: "you", at: row.updatedAt });
  const rows = await d.select().from(t.programVersions).where(like(t.programVersions.id, `${row.id}@%`));
  const out = rows.map((r) => {
    let meta: VersionMeta | null = null;
    try { meta = (JSON.parse(r.snapshot) as { _meta?: VersionMeta | null })._meta ?? null; } catch { /* broken snapshot */ }
    const version = r.id.slice(row.id.length + 1);
    const why = meta?.why ?? r.changelog ?? "";
    const by = meta?.by === "ai" ? meta.client || "AI app" : why === "Edited in the plan editor." || meta?.by === "you" || !meta ? "you" : "you";
    return { version, id: r.id, at: r.firstSeenAt, date: new Date(r.firstSeenAt).toISOString().slice(0, 10), why, by, current: version === cur?.version, restorable: version !== cur?.version };
  });
  const key = (v: string) => v.split(".").map((x) => (Number(x) || 0).toString().padStart(5, "0")).join(".");
  return out.sort((a, b) => (key(b.version) < key(a.version) ? -1 : key(b.version) > key(a.version) ? 1 : b.at - a.at));
}

/** Restore an older version as a NEW version (patch bump). The restored plan keeps the program id → the month continues. */
export async function restoreVersion(d: RawDB, uid: string, row: typeof t.userPrograms.$inferSelect, version: string | null, why: string, meta: Omit<VersionMeta, "why" | "at">) {
  const cur = parseProgram(row.json);
  if (!cur) return { ok: false as const, errors: ["This plan's data is broken."] };
  const list = await listVersions(d, row);
  const target = version ? list.find((v) => v.version === version) : list.find((v) => !v.current && list.findIndex((x) => x.current) < list.indexOf(v));
  if (!target) return { ok: false as const, errors: [version ? `No saved version ${version}. Versions: ${list.map((v) => v.version).join(", ")}` : "There's no earlier version to go back to."] };
  if (target.current) return { ok: false as const, errors: [`${version} is already the current version.`] };
  const [snap] = await d.select().from(t.programVersions).where(eq(t.programVersions.id, target.id));
  const old = parseProgram(snap?.snapshot);
  if (!old?.design) return { ok: false as const, errors: [`Version ${target.version} has no editable design saved, so it can't be restored.`] };
  const custom = cleanCustom([...(old.custom ?? []), ...(cur.custom ?? []).filter((c) => !(old.custom ?? []).some((o) => o.key === c.key))], uid);
  const res = await saveVersion(d, uid, row, { name: old.name, design: old.design, custom, rules: old.rules, weekEdits: old.weekEdits },
    `Restored v${target.version}${why ? `: ${why}` : ""}`, "patch", meta);
  return res.ok ? { ...res, restored: target.version } : res;
}

export const isDefault = (p: Program) => p === CURRENT || !(p as UserProgram).design;
