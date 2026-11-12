import { Hono } from "hono";
import type { Env } from "../env";
// PUBLIC auth routes (no login needed): sign-up with invite, Google sign-in, … Owned by the Auth agent.
// Mounted in worker/index.ts under /api. Use db(c) for the user's own data, rawDb(c) for shared tables (see worker/db.ts).
export const authRoutes = new Hono<Env>();

/** DEV seed hook: called by POST /api/dev/seed after the dev users exist. users = { dev, omar, sara } ids. */
export async function seedAuth(_raw: import("../db").RawDB, _users: Record<string, string>) {}
