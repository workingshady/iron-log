import { Hono } from "hono";
import type { Env } from "../env";
// Chat HTTP API + WebSocket upgrade → ChatRoom Durable Object (worker/chat.ts). Owned by the Chat agent.
// Mounted in worker/index.ts under /api. Use db(c) for the user's own data, rawDb(c) for shared tables (see worker/db.ts).
export const chatRoutes = new Hono<Env>();

/** DEV seed hook: called by POST /api/dev/seed after the dev users exist. users = { dev, omar, sara } ids. */
export async function seedChat(_raw: import("../db").RawDB, _users: Record<string, string>) {}
