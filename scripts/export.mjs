// npm run export          → dumps the LIVE (Cloudflare) database to private/exports/<date>/
// npm run export:local    → dumps the local dev database
// Output: one JSON per table + summary.md (what Claude reads first during a review).
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const where = process.argv.includes("--local") ? "--local" : "--remote";
const tables = ["program_versions", "sessions", "sets", "events", "body", "tests", "journal", "settings", "intake", "feedback"];
const dir = `private/exports/${new Date().toISOString().slice(0, 10)}${where === "--local" ? "-local" : ""}`;
mkdirSync(dir, { recursive: true });

const q = (sql) => {
  const out = execSync(`npx wrangler d1 execute iron-log ${where} --json --command "${sql}"`, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out)[0].results;
};

const data = {};
for (const t of tables) {
  data[t] = q(`SELECT * FROM ${t}`);
  writeFileSync(`${dir}/${t}.json`, JSON.stringify(data[t], null, 1));
  console.log(`${t}: ${data[t].length} rows`);
}

// quick human summary
const S = data.sessions, X = data.sets.filter((s) => !s.deleted);
const done = S.filter((s) => s.status === "done");
const lines = [
  `# Export ${new Date().toISOString()}`,
  ``,
  `Sessions: ${done.length} done · ${S.filter((s) => s.status === "abandoned").length} partial · ${S.filter((s) => s.status === "missed").length} missed · ${S.filter((s) => s.status === "skipped").length} skipped`,
  `Sets: ${X.length} · events: ${data.events.length}`,
  ``,
  `## Sessions`,
  ...S.sort((a, b) => a.date.localeCompare(b.date)).map((s) => `- ${s.date} W${s.week} ${s.day_name} — ${s.status}${s.excuse ? ` (${s.excuse})` : ""}${s.started_at && s.ended_at ? ` · ${Math.round((s.ended_at - s.started_at) / 60000)} min` : ""}${s.rpe ? ` · RPE ${s.rpe}` : ""}${s.note ? ` · "${s.note}"` : ""}`),
  ``,
  `## Sets by exercise`,
];
const byEx = {};
for (const s of X) (byEx[s.ex_key] ??= []).push(s);
for (const [k, list] of Object.entries(byEx)) {
  lines.push(`### ${k}`);
  const bySess = {};
  for (const s of list) (bySess[s.session_id] ??= []).push(s);
  for (const [sid, ss] of Object.entries(bySess)) {
    const d = S.find((x) => x.id === sid)?.date ?? "?";
    lines.push(`- ${d}: ` + ss.map((s) => `${s.kind !== "N" ? s.kind + ":" : ""}${s.assist ? s.assist + " " : ""}${s.weight_kg ?? "BW"}×${s.reps ?? (s.seconds ? s.seconds + "s" : s.meters + "m")}${s.rir != null ? "@" + s.rir : ""}${s.pain_level ? ` ⚠${s.pain_area}${s.pain_level}` : ""}${s.note ? ` "${s.note}"` : ""}${s.swapped_from ? ` [swap from ${s.swapped_from}]` : ""}`).join(", "));
  }
}
const cre = {};
for (const i of data.intake.filter((x) => x.item === "creatine")) cre[i.date] = (cre[i.date] ?? 0) + i.amount;
lines.push("", "## Creatine (g/day)", ...Object.entries(cre).sort().map(([d, g]) => `- ${d}: ${g}`));
lines.push("", "## Body", ...data.body.map((b) => `- ${b.date}: ${[b.weight_kg && b.weight_kg + "kg", b.waist_cm && "waist " + b.waist_cm, b.sleep_h && "sleep " + b.sleep_h + "h", b.protein_g && "protein " + b.protein_g + "g", b.energy && "energy " + b.energy].filter(Boolean).join(", ")}`));
lines.push("", "## Journal", ...data.journal.map((j) => `- ${j.date}${j.tags ? ` [${j.tags}]` : ""}: ${j.text}`));
writeFileSync(`${dir}/summary.md`, lines.join("\n"));
console.log(`\n→ ${dir}/summary.md`);
