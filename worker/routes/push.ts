import { Hono } from "hono";
import type { Env } from "../env";
// Phone notifications (Web Push): subscribe / unsubscribe / test / prefs. Owned by the Push agent.
export const pushRoutes = new Hono<Env>();
