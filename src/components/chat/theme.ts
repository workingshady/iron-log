import type { CSSProperties } from "react";
import type { ChatTheme } from "../../lib/chat";

// Per-conversation look, stored in conversations.theme (validated by the server: accent / bubble / wallpaper ids).
// Every accent is light enough for dark ink text (≥ 7:1).

export const ACCENTS: { id: string; label: string; bg: string; ink: string }[] = [
  { id: "lime", label: "Lime", bg: "#c8f560", ink: "#10140a" },
  { id: "blue", label: "Blue", bg: "#8cc8ff", ink: "#08131f" },
  { id: "violet", label: "Violet", bg: "#c7b3ff", ink: "#140c24" },
  { id: "amber", label: "Amber", bg: "#ffc56b", ink: "#1f1404" },
  { id: "pink", label: "Pink", bg: "#ffa8d4", ink: "#260818" },
  { id: "teal", label: "Teal", bg: "#7ae0cf", ink: "#04201b" },
  { id: "coral", label: "Coral", bg: "#ff9a8a", ink: "#260a06" },
];

export const BUBBLES: { id: string; label: string; r: number; tail: number }[] = [
  { id: "round", label: "Round", r: 20, tail: 6 },
  { id: "soft", label: "Soft", r: 14, tail: 4 },
  { id: "sharp", label: "Sharp", r: 6, tail: 2 },
];

const svg = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
const C = "rgba(255,255,255,0.045)";

export const WALLPAPERS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "Plain", css: "none" },
  { id: "dots", label: "Dots", css: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='3' cy='3' r='1.6' fill='${C}'/></svg>`) },
  { id: "grid", label: "Grid", css: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><path d='M28 0H0v28' fill='none' stroke='${C}' stroke-width='1'/></svg>`) },
  { id: "plates", label: "Plates", css: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><g fill='none' stroke='${C}' stroke-width='2'><circle cx='18' cy='18' r='10'/><circle cx='18' cy='18' r='3'/><path d='M44 54h20M44 50v8M64 50v8M40 52v4M68 52v4'/></g></svg>`) },
  { id: "waves", label: "Waves", css: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='48' height='16'><path d='M0 8q12-8 24 0t24 0' fill='none' stroke='${C}' stroke-width='1.5'/></svg>`) },
  { id: "diag", label: "Lines", css: svg(`<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><path d='M-2 18L18-2' stroke='${C}' stroke-width='1.5'/></svg>`) },
];

export function resolveTheme(t: ChatTheme | null | undefined) {
  const accent = ACCENTS.find((a) => a.id === t?.accent) ?? ACCENTS[0];
  const bubble = BUBBLES.find((b) => b.id === t?.bubble) ?? BUBBLES[0];
  const wall = WALLPAPERS.find((w) => w.id === t?.wallpaper) ?? WALLPAPERS[0];
  return { accent, bubble, wall };
}

/** CSS variables for the room: --ch-acc / --ch-ink (my bubbles), --ch-r / --ch-tail (corner radii). */
export function themeVars(t: ChatTheme | null | undefined): CSSProperties {
  const { accent, bubble, wall } = resolveTheme(t);
  return {
    ["--ch-acc" as string]: accent.bg,
    ["--ch-ink" as string]: accent.ink,
    ["--ch-r" as string]: `${bubble.r}px`,
    ["--ch-tail" as string]: `${bubble.tail}px`,
    backgroundImage: wall.css,
  };
}
