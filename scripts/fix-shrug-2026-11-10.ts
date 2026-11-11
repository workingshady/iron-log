// One-off data fix (2026-11-11): the Pull session on 2026-11-10 logged a shrug MACHINE as "db_shrug" (per hand).
// User's note: "its device not dumbell". Relabel those 4 sets to machine_shrug (stack number = total),
// and the session plan item to match. Reps, notes, times untouched. Writes SQL to stdout.
import { readFileSync } from "node:fs";
import { toItem } from "../shared/plan";
const SID = "25700d81-6e4d-4c8e-8386-085517bff5a9";
const sessions = JSON.parse(readFileSync(process.argv[2], "utf8"));
const s = sessions.find((x: { id: string }) => x.id === SID);
const plan = JSON.parse(s.plan);
const old = plan[3];
if (old.ex !== "db_shrug") throw new Error("unexpected plan item: " + old.ex);
const { ex: _e, name: _n, metric: _m, muscles: _mu, cues: _c, yt: _y, alts: _a, step: _s, perSide: _p, ...rx } = old;
plan[3] = { ...toItem("machine_shrug", rx), swappedFrom: "bb_shrug", ...(old.swapReason ? { swapReason: old.swapReason } : {}) };
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
console.log(`UPDATE sets SET ex_key='machine_shrug', kg_basis=NULL WHERE session_id=${q(SID)} AND ex_key='db_shrug';`);
console.log(`UPDATE sessions SET plan=${q(JSON.stringify(plan))} WHERE id=${q(SID)};`);
