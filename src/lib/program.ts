import { useEffect, useState } from "react";
import { CURRENT, programVersionId, type Program } from "../../program";
import { registerCustom, type UserProgram } from "../../program/templates";
import { get, isDev } from "./api";

// The program the logged-in person trains: their own (user_programs) or the default plan.
// Default users (users.programId null — the owner) always get the bundled CURRENT object itself, so nothing changes for them.
// Cached in localStorage (per mode + user) so every screen works offline; refreshed after any saved change.

interface Current { default: boolean; programId: string | null; versionId: string; program: Program }
const KEY = () => `il_prog_${isDev() ? "dev" : "real"}`;
const meId = (): string | null => { try { return (JSON.parse(localStorage.getItem("il:me") ?? "null") as { id?: string } | null)?.id ?? null; } catch { return null; } };

function fromCache(): Program {
  try {
    const c = JSON.parse(localStorage.getItem(KEY()) ?? "null") as { user: string | null; program: UserProgram | null } | null;
    if (c?.program && c.user === meId()) { registerCustom(c.program.custom); return c.program; }
  } catch { /* private mode / bad JSON */ }
  return CURRENT;
}

let prog: Program = typeof window === "undefined" ? CURRENT : fromCache();
const subs = new Set<(p: Program) => void>();
// every saved edit bumps the version and every switch changes the id → the version id tells us when to re-render
const sig = (p: Program) => `${programVersionId(p)}|${p === CURRENT ? "default" : "own"}`;

function set(p: Program) {
  if (sig(p) === sig(prog)) return;
  prog = p;
  subs.forEach((f) => f(p));
}

let inflight: Promise<Program> | null = null;
/** Re-read /api/programs/current (after switching or saving a plan). */
export function refreshProgram(): Promise<Program> {
  inflight ??= get<Current>("/programs/current")
    .then((r) => {
      const p = r.default ? CURRENT : (r.program as UserProgram);
      if (p !== CURRENT) registerCustom((p as UserProgram).custom);
      try { localStorage.setItem(KEY(), JSON.stringify({ user: meId(), program: p === CURRENT ? null : p })); } catch { /* storage full */ }
      set(p);
      return p;
    })
    .catch(() => prog) // offline → keep the cached one
    .finally(() => { inflight = null; });
  return inflight;
}

let wired = false;
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("il:changed", () => void refreshProgram());
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void refreshProgram());
  void refreshProgram();
}

/** The user's Program (falls back to CURRENT). Same object for every screen; re-renders when it changes. */
export function useProgram(): Program {
  const [p, setP] = useState(prog);
  useEffect(() => {
    subs.add(setP);
    wire();
    if (p !== prog) setP(prog);
    return () => void subs.delete(setP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return p;
}

/** Non-hook read (event handlers). */
export const currentProgram = () => prog;
