// Rest timer preferences — stored in server settings so they follow you to every device.
//   restAuto      "1" | "0"   start the timer by itself after each set (default on)
//   restSound     "1" | "0"   beep when rest is over (default on)
//   restVolume    "low" | "normal" | "high"
//   restVibrate   "1" | "0"   vibrate when rest is over (default on)
//   restCountdown "1" | "0"   3-2-1 beeps before the end (default off)
//   rest:<exKey>  seconds     your rest for that exercise (overrides the plan); "0" = no timer for it
import type { PlanItem } from "../../shared/api";

export type Volume = "low" | "normal" | "high";
export interface RestPrefs { auto: boolean; sound: boolean; volume: Volume; vibrate: boolean; countdown: boolean }

export function restPrefs(s?: Record<string, string> | null): RestPrefs {
  const on = (k: string, d: boolean) => (s?.[k] == null || s[k] === "" ? d : s[k] === "1");
  const v = s?.restVolume;
  return { auto: on("restAuto", true), sound: on("restSound", true), volume: v === "low" || v === "high" ? v : "normal", vibrate: on("restVibrate", true), countdown: on("restCountdown", false) };
}

/** Your rest for this exercise: per-exercise override if you set one, else the plan's. */
export function restFor(s: Record<string, string> | null | undefined, it: Pick<PlanItem, "ex" | "rest">): number {
  const o = s?.[`rest:${it.ex}`];
  return o != null && o !== "" && !Number.isNaN(Number(o)) ? Math.max(0, Number(o)) : it.rest;
}
export const hasRestOverride = (s: Record<string, string> | null | undefined, ex: string) => s?.[`rest:${ex}`] != null && s[`rest:${ex}`] !== "";

export const VOL: Record<Volume, number> = { low: 0.08, normal: 0.25, high: 0.6 };
