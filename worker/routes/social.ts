import { Hono } from "hono";
import type { Env } from "../env";
// Friends, privacy, feed posts, likes, comments, notifications, friend profiles. Owned by the Social agent.
// Mounted in worker/index.ts under /api. Use db(c) for the user's own data, rawDb(c) for shared tables (see worker/db.ts).
export const socialRoutes = new Hono<Env>();

/** DEV seed hook: called by POST /api/dev/seed after the dev users exist. users = { dev, omar, sara } ids. */
export async function seedSocial(_raw: import("../db").RawDB, _users: Record<string, string>) {}
