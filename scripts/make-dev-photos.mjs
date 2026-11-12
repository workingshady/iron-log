// DEV data only: renders tasteful placeholder pictures (flat SVG scenes, no real people) to JPEG with headless Edge,
// then writes them base64-embedded into worker/devassets.ts for the DEV seed (worker/devseed-rich.ts).
// Run: node scripts/make-dev-photos.mjs   (needs puppeteer-core from private/work/e2e/node_modules + Microsoft Edge)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "private/work/e2e/package.json"));
const puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

// ---------------------------------------------------------------- scenes (viewBox 300×400 portrait, 400×300 landscape, 300×300 square)
const P = { w: 300, h: 400 }, L = { w: 400, h: 300 }, S = { w: 300, h: 300 };
const grad = (id, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const plate = (cx, cy, r, c) => `<rect x="${cx - 7}" y="${cy - r}" width="14" height="${2 * r}" rx="4" fill="${c}"/>`;
const barbell = (y, x1, x2, scale = 1) => `<rect x="${x1}" y="${y - 3 * scale}" width="${x2 - x1}" height="${6 * scale}" rx="3" fill="#c9ccd2"/>
  ${plate(x1 + 22 * scale, y, 42 * scale, "#1f2329")}${plate(x1 + 38 * scale, y, 34 * scale, "#2b3139")}${plate(x2 - 22 * scale, y, 42 * scale, "#1f2329")}${plate(x2 - 38 * scale, y, 34 * scale, "#2b3139")}`;
const figure = (cx, top, s, fill, broad = 1) => { // neutral mannequin silhouette (front pose, arms slightly out)
  const sh = 46 * s * broad, w = 30 * s;
  return `<g fill="${fill}"><circle cx="${cx}" cy="${top + 20 * s}" r="${17 * s}"/>
  <rect x="${cx - 7 * s}" y="${top + 34 * s}" width="${14 * s}" height="${12 * s}"/>
  <path d="M${cx - sh} ${top + 50 * s} Q${cx} ${top + 40 * s} ${cx + sh} ${top + 50 * s} L${cx + w} ${top + 140 * s} L${cx - w} ${top + 140 * s} Z"/>
  <path d="M${cx - sh} ${top + 52 * s} l${-14 * s} ${80 * s} l${11 * s} ${3 * s} l${16 * s} ${-70 * s} Z"/><path d="M${cx + sh} ${top + 52 * s} l${14 * s} ${80 * s} l${-11 * s} ${3 * s} l${-16 * s} ${-70 * s} Z"/>
  <path d="M${cx - w} ${top + 138 * s} L${cx + w} ${top + 138 * s} L${cx + 26 * s} ${top + 260 * s} L${cx + 6 * s} ${top + 260 * s} L${cx} ${top + 170 * s} L${cx - 6 * s} ${top + 260 * s} L${cx - 26 * s} ${top + 260 * s} Z"/></g>`;
};

const SCENES = {
  gym_dusk: [P, `<defs>${grad("g", "#1b2a49", "#e0794f")}</defs><rect width="300" height="400" fill="url(#g)"/>
    <rect x="0" y="300" width="300" height="100" fill="#14161b"/><rect x="0" y="296" width="300" height="6" fill="#2a2e36"/>
    <g fill="#0e1014"><rect x="40" y="150" width="10" height="150"/><rect x="250" y="150" width="10" height="150"/><rect x="40" y="150" width="220" height="8"/><rect x="40" y="215" width="40" height="6"/><rect x="220" y="215" width="40" height="6"/></g>
    ${barbell(212, 22, 278)}<circle cx="230" cy="80" r="26" fill="#ffd29a" opacity=".55"/>
    <g fill="#ffffff" opacity=".08"><rect x="0" y="0" width="300" height="40"/><rect x="0" y="60" width="300" height="12"/></g>`],
  barbell_close: [L, `<defs>${grad("g", "#22262e", "#0f1115")}</defs><rect width="400" height="300" fill="url(#g)"/>
    <ellipse cx="200" cy="260" rx="190" ry="18" fill="#000" opacity=".35"/>${barbell(170, 10, 390, 2.1)}
    <text x="40" y="52" fill="#9ef0b4" font-family="Arial Black,Arial" font-size="26" letter-spacing="2">LIFT DAY</text>`],
  dumbbells: [P, `<defs>${grad("g", "#2d3440", "#151920")}</defs><rect width="300" height="400" fill="url(#g)"/>
    ${[0, 1, 2, 3].map((r) => `<rect x="20" y="${110 + r * 70}" width="260" height="8" fill="#3d4450"/>` + [0, 1, 2].map((c) => `<g transform="translate(${50 + c * 80} ${92 + r * 70})"><rect x="-26" y="-6" width="12" height="28" rx="3" fill="#1d2127"/><rect x="14" y="-6" width="12" height="28" rx="3" fill="#1d2127"/><rect x="-14" y="5" width="28" height="6" fill="#aab0ba"/></g>`).join("")).join("")}
    <text x="24" y="60" fill="#ffffff" opacity=".8" font-family="Arial" font-size="20">5 · 7.5 · 10 · 12.5</text>`],
  mountains: [L, `<defs>${grad("g", "#f7c78e", "#7a9fd1")}</defs><rect width="400" height="300" fill="url(#g)"/><circle cx="300" cy="110" r="34" fill="#fff4d6"/>
    <path d="M0 230 L90 120 L150 190 L220 90 L320 200 L400 150 L400 300 L0 300Z" fill="#4c5f84"/><path d="M0 260 L120 180 L210 240 L300 170 L400 230 L400 300 L0 300Z" fill="#2f3d5a"/>
    <path d="M220 90 l-18 22 l10 -2 l8 8 l8 -8 l10 2 Z" fill="#f2f4f8"/>`],
  meal_chicken: [S, `<rect width="300" height="300" fill="#e9dccb"/><circle cx="150" cy="150" r="118" fill="#fbfbf8"/><circle cx="150" cy="150" r="98" fill="#f1efe8"/>
    <path d="M70 150 Q90 80 160 70 Q130 130 70 150Z" fill="#f4ecd8"/><g fill="#fff">${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${95 + i * 9}" cy="${118 - i * 6}" rx="6" ry="3"/>`).join("")}</g>
    <path d="M150 160 q40 -30 80 0 q-10 40 -40 46 q-36 -4 -40 -46Z" fill="#c98a4b"/><path d="M165 170 l50 -8 M168 182 l46 -6" stroke="#8e5a2b" stroke-width="4"/>
    <g fill="#5fae58">${[0, 1, 2, 3, 4].map((i) => `<circle cx="${100 + i * 14}" cy="${200 + (i % 2) * 10}" r="11"/>`).join("")}</g><circle cx="120" cy="190" r="6" fill="#e2553f"/><circle cx="140" cy="214" r="6" fill="#e2553f"/>`],
  meal_oats: [S, `<rect width="300" height="300" fill="#2f3b4a"/><circle cx="150" cy="150" r="112" fill="#e8e4dc"/><circle cx="150" cy="150" r="94" fill="#d8c19a"/>
    ${[[120, 120], [170, 115], [190, 160], [140, 180], [110, 160], [160, 150]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#3b3f8f"/>`).join("")}
    ${[[150, 105], [125, 150], [180, 190]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="14" ry="8" fill="#f2d16b"/>`).join("")}
    <path d="M200 120 q20 -10 30 10" stroke="#8b5a2b" stroke-width="6" fill="none"/>`],
  progress_front_a: [P, `<defs>${grad("g", "#3a4352", "#1a1e25")}</defs><rect width="300" height="400" fill="url(#g)"/><rect x="0" y="360" width="300" height="40" fill="#14171c"/>
    ${figure(150, 70, 1.12, "#5c6b80")}<text x="16" y="30" fill="#cfd6e0" font-family="Arial" font-size="15">WEEK 1</text>`],
  progress_front_b: [P, `<defs>${grad("g", "#3a4352", "#1a1e25")}</defs><rect width="300" height="400" fill="url(#g)"/><rect x="0" y="360" width="300" height="40" fill="#14171c"/>
    ${figure(150, 70, 1.12, "#6f86a3", 1.12)}<text x="16" y="30" fill="#cfd6e0" font-family="Arial" font-size="15">WEEK 7</text>`],
  progress_side: [P, `<defs>${grad("g", "#4a3b52", "#1d1822")}</defs><rect width="300" height="400" fill="url(#g)"/>
    ${figure(150, 70, 1.12, "#9a7fb0", 0.95)}<text x="16" y="30" fill="#e6dcef" font-family="Arial" font-size="15">CHECK-IN</text>`],
  cable_stack: [P, `<rect width="300" height="400" fill="#20242b"/><rect x="95" y="40" width="110" height="320" rx="6" fill="#2d323b"/>
    ${Array.from({ length: 14 }, (_, i) => `<rect x="110" y="${120 + i * 16}" width="80" height="13" fill="${i === 8 ? "#e6b84c" : "#5b616c"}"/><text x="196" y="${131 + i * 16}" fill="#9aa1ac" font-family="Arial" font-size="10">${(i + 1) * 5}</text>`).join("")}
    <line x1="150" y1="50" x2="150" y2="120" stroke="#c9ccd2" stroke-width="3"/><circle cx="150" cy="50" r="12" fill="none" stroke="#8a9099" stroke-width="5"/>
    <rect x="98" y="248" width="20" height="6" fill="#e6b84c"/><text x="20" y="390" fill="#e6b84c" font-family="Arial" font-size="14">pin at 45</text>`],
  leg_press: [L, `<rect width="400" height="300" fill="#1c2026"/><rect x="0" y="250" width="400" height="50" fill="#121418"/>
    <path d="M60 250 L120 150 L150 150 L95 250Z" fill="#3a4049"/><rect x="200" y="60" width="16" height="190" fill="#3a4049" transform="rotate(35 208 155)"/>
    <rect x="250" y="70" width="70" height="90" rx="6" fill="#4a515c" transform="rotate(35 285 115)"/>${plate(330, 120, 40, "#15181d")}${plate(345, 130, 34, "#2b3139")}
    <text x="24" y="40" fill="#9ef0b4" font-family="Arial" font-size="16">seat 6 · feet high</text>`],
  football: [L, `<defs>${grad("g", "#0b1630", "#103a1f")}</defs><rect width="400" height="300" fill="url(#g)"/>
    <rect x="0" y="170" width="400" height="130" fill="#1f7a3a"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${i * 80}" y="170" width="40" height="130" fill="#228a41"/>`).join("")}
    <path d="M40 300 L120 180 L280 180 L360 300" stroke="#e9f3ea" stroke-width="3" fill="none"/><circle cx="200" cy="250" r="18" fill="#fff"/>
    <path d="M200 238 l8 6 l-3 9 l-10 0 l-3 -9z" fill="#222"/><circle cx="60" cy="40" r="10" fill="#fffbe0"/><circle cx="340" cy="40" r="10" fill="#fffbe0"/>
    <path d="M60 40 L0 170 L130 170Z M340 40 L270 170 L400 170Z" fill="#fffbe0" opacity=".08"/>`],
  treadmill: [L, `<rect width="400" height="300" fill="#0d1014"/><rect x="40" y="50" width="320" height="180" rx="14" fill="#1b2027"/>
    <text x="70" y="115" fill="#59d68a" font-family="Consolas,monospace" font-size="38">32:10</text><text x="230" y="115" fill="#59d68a" font-family="Consolas,monospace" font-size="38">4.1</text>
    <text x="72" y="140" fill="#7d8692" font-family="Arial" font-size="13">TIME</text><text x="232" y="140" fill="#7d8692" font-family="Arial" font-size="13">KM</text>
    <text x="70" y="195" fill="#f0b45a" font-family="Consolas,monospace" font-size="30">312 kcal</text><text x="240" y="195" fill="#f0b45a" font-family="Consolas,monospace" font-size="30">8%</text>`],
  cairo: [L, `<defs>${grad("g", "#ffb36b", "#ffe2b8")}</defs><rect width="400" height="300" fill="url(#g)"/><circle cx="110" cy="120" r="40" fill="#fff1d2"/>
    <path d="M150 230 L230 120 L310 230Z" fill="#c78a47"/><path d="M270 230 L320 160 L370 230Z" fill="#b57a3c"/><path d="M60 230 L100 180 L140 230Z" fill="#d39a58"/>
    <rect x="0" y="228" width="400" height="72" fill="#7a5530"/><path d="M0 240 h400" stroke="#5e3f22" stroke-width="3"/>`],
  shaker: [P, `<defs>${grad("g", "#3f2a5c", "#171221")}</defs><rect width="300" height="400" fill="url(#g)"/>
    <rect x="95" y="110" width="110" height="230" rx="16" fill="#e9e6f2" opacity=".9"/><rect x="95" y="230" width="110" height="110" rx="16" fill="#bfa8e6"/>
    <rect x="88" y="80" width="124" height="40" rx="10" fill="#2a2433"/><rect x="128" y="62" width="44" height="22" rx="6" fill="#2a2433"/>
    <path d="M210 320 q40 -10 50 20 l-30 10z" fill="#dcdcdc"/><text x="20" y="40" fill="#d9c8f5" font-family="Arial" font-size="18">creatine 5 g ✓</text>`],
  abstract_chevron: [S, `<defs>${grad("g", "#10b981", "#1e3a8a", 1, 1)}</defs><rect width="300" height="300" fill="url(#g)"/>
    <path d="M70 170 L150 100 L230 170" stroke="#fff" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="60" y="205" width="180" height="12" rx="6" fill="#fff"/><rect x="48" y="190" width="14" height="42" rx="4" fill="#fff"/><rect x="238" y="190" width="14" height="42" rx="4" fill="#fff"/>`],
  avatar_dev: [S, `<defs>${grad("g", "#22c55e", "#0f766e", 1, 1)}</defs><rect width="300" height="300" fill="url(#g)"/><circle cx="230" cy="70" r="70" fill="#fff" opacity=".1"/>
    <text x="150" y="190" text-anchor="middle" fill="#fff" font-family="Arial Black,Arial" font-size="120">T</text>`],
  avatar_omar: [S, `<defs>${grad("g", "#f59e0b", "#b91c1c", 1, 1)}</defs><rect width="300" height="300" fill="url(#g)"/><rect x="-40" y="200" width="380" height="60" fill="#000" opacity=".12" transform="rotate(-12 150 230)"/>
    <text x="150" y="190" text-anchor="middle" fill="#fff" font-family="Arial Black,Arial" font-size="120">O</text>`],
  avatar_sara: [S, `<defs>${grad("g", "#a78bfa", "#2563eb", 1, 1)}</defs><rect width="300" height="300" fill="url(#g)"/><circle cx="60" cy="250" r="90" fill="#fff" opacity=".1"/>
    <text x="150" y="190" text-anchor="middle" fill="#fff" font-family="Arial Black,Arial" font-size="120">S</text>`],
  avatar_youssef: [S, `<defs>${grad("g", "#38bdf8", "#0f172a", 1, 1)}</defs><rect width="300" height="300" fill="url(#g)"/><path d="M0 300 L150 170 L300 300Z" fill="#fff" opacity=".08"/>
    <text x="150" y="190" text-anchor="middle" fill="#fff" font-family="Arial Black,Arial" font-size="120">Y</text>`],
};

// full size (long side) + thumb size per shape
const FULL = { P: [720, 960], L: [960, 720], S: [640, 640] }, THUMB = { P: [360, 480], L: [480, 360], S: [360, 360] };
const shapeOf = (s) => (s === P ? "P" : s === L ? "L" : "S");

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const out = {};
let total = 0;
for (const [key, [shape, body]] of Object.entries(SCENES)) {
  const sh = shapeOf(shape);
  const isAvatar = key.startsWith("avatar_");
  const res = {};
  for (const [tag, [w, h], q] of [["full", isAvatar ? [480, 480] : FULL[sh], 74], ["thumb", isAvatar ? [180, 180] : THUMB[sh], 62]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:#000"><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${shape.w} ${shape.h}" preserveAspectRatio="xMidYMid slice">${body}</svg></body></html>`);
    const buf = await page.screenshot({ type: "jpeg", quality: q, clip: { x: 0, y: 0, width: w, height: h } });
    res[tag] = { b64: Buffer.from(buf).toString("base64"), w, h, bytes: buf.length };
    total += res[tag].b64.length;
  }
  out[key] = res;
  console.log(key.padEnd(18), `${res.full.w}x${res.full.h}`, `${(res.full.bytes / 1024).toFixed(1)} KB`, `thumb ${(res.thumb.bytes / 1024).toFixed(1)} KB`);
}
await browser.close();

const lines = Object.entries(out).map(([k, r]) => `  ${k}: { w: ${r.full.w}, h: ${r.full.h}, bytes: ${r.full.bytes}, data: "${r.full.b64}", thumb: "${r.thumb.b64}" },`);
writeFileSync(path.join(root, "worker/devassets.ts"), `// GENERATED by scripts/make-dev-photos.mjs — DEV seed placeholder pictures (flat SVG scenes rendered to JPEG, no real people).
// Only imported by worker/devseed-rich.ts. Total base64 ≈ ${Math.round(total / 1024)} KB.
export interface DevImg { w: number; h: number; bytes: number; data: string; thumb: string }
export const DEV_IMG: Record<string, DevImg> = {
${lines.join("\n")}
};
`);
console.log(`total base64 ${Math.round(total / 1024)} KB → worker/devassets.ts`);
