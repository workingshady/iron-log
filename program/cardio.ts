// Treadmill cardio — protocols, weekly placement, and a calorie estimate.
// Placement rules (research): lift FIRST, cardio after or on separate days (interference mostly disappears when
// separated — Schumann 2023); running interferes more than walking/cycling (Wilson 2012), so most sessions are
// incline WALKS; no hard intervals on or the day before leg day. Fat loss comes from the calorie deficit, cardio helps.
// Speeds in km/h, incline in %. Edit freely; keys are stored in the DB (don't rename, add new ones).

export type SegKind = "warm" | "hard" | "easy" | "hill" | "steady" | "cool";
export interface Row { label: string; min: number; speed: number; incline: number; kind: SegKind }
export interface Block { rounds?: number; rows: Row[] }
export interface CardioProtocol {
  key: string;
  name: string;
  short: string; // one line under the title
  minutes: number;
  blocks: Block[];
  feel: string[]; // how it should feel
  adjust: string; // how to scale
  intensity: "easy" | "moderate" | "hard";
}

export const PROTOCOLS: Record<string, CardioProtocol> = {
  incline_hiit30: {
    key: "incline_hiit30", name: "30-min incline intervals", minutes: 30, intensity: "hard",
    short: "Short runs + uphill power walks — big burn, easy on the legs",
    blocks: [
      { rows: [{ label: "Warm-up walk", min: 2, speed: 5.0, incline: 2, kind: "warm" }, { label: "Faster warm-up", min: 2, speed: 6.0, incline: 4, kind: "warm" }] },
      { rounds: 7, rows: [{ label: "RUN", min: 1, speed: 9.5, incline: 5, kind: "hard" }, { label: "Power walk", min: 2, speed: 5.8, incline: 5, kind: "easy" }] },
      { rows: [{ label: "Hill finisher walk", min: 3, speed: 5.5, incline: 10, kind: "hill" }, { label: "Cool-down", min: 2, speed: 4.5, incline: 2, kind: "cool" }] },
    ],
    feel: ["Runs ≈ 8/10 — too breathless to talk", "Walks = recovery but brisk, never stop", "Incline stays 5% in the intervals — only change speed"],
    adjust: "Runs too hard → 9.0 km/h. Too easy → 10.0 km/h.",
  },
  hiit20: {
    key: "hiit20", name: "20-min short intervals", minutes: 20, intensity: "hard",
    short: "Quick hard session for a busy day",
    blocks: [
      { rows: [{ label: "Warm-up walk", min: 3, speed: 5.5, incline: 3, kind: "warm" }] },
      { rounds: 6, rows: [{ label: "RUN", min: 1, speed: 9.5, incline: 2, kind: "hard" }, { label: "Walk", min: 1.5, speed: 5.5, incline: 5, kind: "easy" }] },
      { rows: [{ label: "Cool-down", min: 2, speed: 4.5, incline: 1, kind: "cool" }] },
    ],
    feel: ["Runs 8/10", "Walks: catch your breath, keep moving"],
    adjust: "Too hard → 9.0 km/h or 5 rounds. Too easy → 10.0 km/h.",
  },
  hill_walk30: {
    key: "hill_walk30", name: "30-min hill walk", minutes: 30, intensity: "moderate",
    short: "Steady uphill walk — leg-friendly fat burner",
    blocks: [
      { rows: [
        { label: "Warm-up", min: 3, speed: 5.0, incline: 3, kind: "warm" },
        { label: "Hill walk", min: 25, speed: 5.5, incline: 10, kind: "hill" },
        { label: "Cool-down", min: 2, speed: 4.5, incline: 2, kind: "cool" },
      ] },
    ],
    feel: ["≈ 6/10 — you can talk in short sentences", "Don't hold the rails, swing your arms"],
    adjust: "Too easy → incline 12%. Calves burning early → 8% and 5.8 km/h.",
  },
  hill_walk20: {
    key: "hill_walk20", name: "20-min easy hill walk", minutes: 20, intensity: "easy",
    short: "Light, optional — recovery + a few extra calories",
    blocks: [{ rows: [{ label: "Warm-up", min: 2, speed: 5.0, incline: 2, kind: "warm" }, { label: "Easy hill walk", min: 16, speed: 5.3, incline: 8, kind: "steady" }, { label: "Cool-down", min: 2, speed: 4.5, incline: 1, kind: "cool" }] }],
    feel: ["≈ 5/10 — comfortable, nose breathing"],
    adjust: "Keep it easy; it should not affect tomorrow's session.",
  },
  express15: {
    key: "express15", name: "15-min express intervals", minutes: 15, intensity: "hard",
    short: "Busy day: short and sharp, still counts",
    blocks: [
      { rows: [{ label: "Warm-up walk", min: 2, speed: 5.5, incline: 3, kind: "warm" }] },
      { rounds: 6, rows: [{ label: "RUN", min: 0.75, speed: 9.5, incline: 3, kind: "hard" }, { label: "Walk", min: 1, speed: 5.5, incline: 6, kind: "easy" }] },
      { rows: [{ label: "Cool-down", min: 2.5, speed: 4.5, incline: 1, kind: "cool" }] },
    ],
    feel: ["Runs 8/10", "Walks: breathe, keep moving"],
    adjust: "Too hard → 9.0 km/h. Too easy → 10.0 km/h.",
  },
  zone2_40: {
    key: "zone2_40", name: "40-min zone-2 incline walk", minutes: 40, intensity: "easy",
    short: "Rest-day cardio for heart health and recovery (optional)",
    blocks: [{ rows: [{ label: "Warm-up", min: 3, speed: 5.0, incline: 2, kind: "warm" }, { label: "Zone 2 walk", min: 35, speed: 5.5, incline: 7, kind: "steady" }, { label: "Cool-down", min: 2, speed: 4.5, incline: 1, kind: "cool" }] }],
    feel: ["≈ 4-5/10 — you can hold a conversation", "Podcast pace"],
    adjust: "Heart rate climbing too high → drop incline, not speed.",
  },
};

/** Which cardio goes with which training day. null = no cardio (heavy leg day or the day before it). */
export const CARDIO_PLAN: Record<string, { key: string; optional?: boolean; when: string } | null> = {
  D1: { key: "incline_hiit30", when: "after lifting" },
  D2: { key: "hill_walk20", optional: true, when: "optional, easy — Legs is tomorrow" },
  D3: null, // heavy leg day: skip (10 min easy walk to cool down is fine)
  D5: { key: "hill_walk30", when: "after lifting" },
  D6: { key: "hiit20", when: "after lifting" },
  rest: { key: "zone2_40", optional: true, when: "optional, any rest day" },
};

export const CARDIO_TIPS = {
  before: ["Light snack 1.5-2 h before (banana, toast, yogurt)", "A glass of water"],
  during: ["Water bottle on the treadmill, sip during walks", "Don't hold the rails — swing your arms"],
  after: ["5 min stretching", "Protein meal (chicken, eggs, tuna, Greek yogurt)", "Don't 'reward' yourself with junk — it cancels the work"],
  stop: "Stop right away with chest pain, dizziness or nausea.",
};

/**
 * The same session adjusted for the program week (cardio follows the lifting cycle):
 *   W1 ramp-in (fewer/slower intervals) → W2 build → W3 full session → W4 deload (easier, shorter).
 * Intervals: rounds and run speed change. Hill/steady walks: incline changes. Warm-up and cool-down stay.
 */
export function forWeek(p: CardioProtocol, week: number): CardioProtocol {
  const w = Math.min(4, Math.max(1, week || 1));
  const iv: Record<string, { rounds: number[]; run: number[] }> = {
    incline_hiit30: { rounds: [5, 6, 7, 4], run: [-0.5, 0, 0, -0.5] },
    hiit20: { rounds: [4, 5, 6, 3], run: [-0.5, 0, 0, -0.5] },
    express15: { rounds: [5, 6, 6, 4], run: [-0.5, 0, 0.5, -0.5] },
  };
  const hill: Record<string, number[]> = { hill_walk30: [-2, -1, 0, -3], hill_walk20: [-1, 0, 0, -2], zone2_40: [0, 0, 1, -1] };
  let blocks = p.blocks;
  if (iv[p.key]) {
    const c = iv[p.key];
    blocks = p.blocks.map((b) => (b.rounds ? { rounds: c.rounds[w - 1], rows: b.rows.map((r) => (r.kind === "hard" ? { ...r, speed: Math.round((r.speed + c.run[w - 1]) * 10) / 10 } : r)) } : b));
  } else if (hill[p.key]) {
    const d = hill[p.key][w - 1];
    blocks = p.blocks.map((b) => ({ ...b, rows: b.rows.map((r) => (r.kind === "hill" || r.kind === "steady" ? { ...r, incline: Math.max(2, r.incline + d) } : r)) }));
  }
  const minutes = Math.round(blocks.reduce((a, b) => a + (b.rounds ?? 1) * b.rows.reduce((x, r) => x + r.min, 0), 0));
  const tag = ["ramp-in", "build", "full", "deload"][w - 1];
  return { ...p, blocks, minutes, name: p.name.replace(/^\d+-min/, `${minutes}-min`), short: `${p.short} · Week ${w} ${tag}` };
}

/** kcal estimates (ACSM equations) are ±~15% for one person; treadmill displays usually read high. */
export const KCAL_MARGIN = 0.15;
export const kcalRange = (k: number) => `${Math.round(k * (1 - KCAL_MARGIN))}-${Math.round(k * (1 + KCAL_MARGIN))}`;

/** Flatten blocks into timed segments. */
export function segments(p: CardioProtocol): (Row & { sec: number; round?: number })[] {
  const out: (Row & { sec: number; round?: number })[] = [];
  for (const b of p.blocks) for (let r = 0; r < (b.rounds ?? 1); r++) for (const row of b.rows) out.push({ ...row, sec: Math.round(row.min * 60), round: b.rounds ? r + 1 : undefined });
  return out;
}

/** ACSM metabolic equations → kcal/min. Walking < 7 km/h, running ≥ 7 km/h. kcal/min = VO2 × kg / 200. */
export function kcalPerMin(speedKmh: number, inclinePct: number, kg: number): number {
  const S = (speedKmh * 1000) / 60; // m/min
  const G = inclinePct / 100;
  const vo2 = speedKmh < 7 ? 0.1 * S + 1.8 * S * G + 3.5 : 0.2 * S + 0.9 * S * G + 3.5;
  return (vo2 * kg) / 200;
}

export function estimateKcal(p: CardioProtocol, kg: number, speedAdj = 0): number {
  return Math.round(segments(p).reduce((a, s) => a + kcalPerMin(s.speed + (s.kind === "hard" ? speedAdj : 0), s.incline, kg) * (s.sec / 60), 0));
}
