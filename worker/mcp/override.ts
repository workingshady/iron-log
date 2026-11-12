// One-time override of a single workout (MCP tool customize_next_workout).
// Stored in the user's settings as  override:<week>-<dayKey>  = {name?, items: Rx[], why, by, at}.
// POST /api/sessions calls takeOverride(): when that week/day starts, the override becomes the session's plan and the
// setting is deleted (used once). The program itself is untouched; the next month runs the normal plan again.
import { and, eq } from "drizzle-orm";
import * as t from "../db/schema";
import type { DB } from "../db";
import { EXERCISES, type Rx } from "../../program";
import { toItem } from "../../shared/plan";
import { registerCustom, type UserProgram } from "../../program/templates";
import type { PlanItem } from "../../shared/api";

export interface Override { name?: string; items: Rx[]; why: string; by: string; at: number }
export const overrideKey = (week: number, dayKey: string) => `override:${week}-${dayKey}`;

export function parseOverride(v: string | null | undefined): Override | null {
  try {
    const o = JSON.parse(v ?? "") as Override;
    return o && Array.isArray(o.items) && o.items.length ? o : null;
  } catch {
    return null;
  }
}

/** The override plan for this week/day (consumed: the setting is deleted), or null → use the normal plan. Extras never use it. */
export async function takeOverride(d: DB, week: number, dayKey: string, kind?: string): Promise<{ name: string; items: PlanItem[] } | null> {
  if (kind === "extra") return null;
  const key = overrideKey(week, dayKey);
  const [row] = await d.select().from(t.settings).where(eq(t.settings.key, key));
  const o = parseOverride(row?.value);
  if (!o) return null;
  registerCustom((d.prog as UserProgram).custom);
  const items = o.items.filter((it) => EXERCISES[it.ex]);
  if (!items.length) return null;
  await d.delete(t.settings).where(and(eq(t.settings.key, key)));
  const day = d.prog.weeks.find((w) => w.n === week)?.days.find((x) => x.key === dayKey);
  return { name: o.name || day?.name || dayKey, items: items.map(({ ex, ...rx }) => toItem(ex, rx)) };
}
