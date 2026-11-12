import { drizzle } from "drizzle-orm/d1";
import { and, eq, type SQL } from "drizzle-orm";
import * as t from "./db/schema";
import type { Env } from "./env";
import { CURRENT, type Program } from "../program";

/**
 * Multi-user data isolation in ONE place.
 *
 * `db(c)` returns a Drizzle instance where every query on a personal table is automatically limited to the logged-in user:
 *   select … from(personal)  → WHERE user_id = me  (AND-ed with any .where() the handler adds)
 *   update(personal) / delete(personal) → same
 *   insert(personal).values(…) → user_id = me is stamped on every row (a client can't write into someone else's data)
 * Shared / cross-user tables (users, posts, friendships, chat, program_versions, …) are NOT scoped: use them deliberately.
 * `rawDb(c)` = unscoped access (social features, admin, migrations). Never use rawDb for personal tables without an explicit userId filter.
 */

/** Tables that hold one person's data (all have a user_id column). */
export const PERSONAL = new Set<unknown>([
  t.sessions, t.sets, t.feedback, t.cardio, t.events, t.tests, t.journal, t.intake, t.photos, t.blocks, t.settings, t.body,
]);

type Ctx = { env: Env["Bindings"]; var: Env["Variables"] };
const bindingOf = (c: Ctx) => (c.var.dev ? c.env.DB_DEV : c.env.DB);

export const rawDb = (c: Ctx) => drizzle(bindingOf(c), { schema: t });
export type RawDB = ReturnType<typeof rawDb>;

/** The user's program: their own (user_programs) or the default plan. Resolved once per request by middleware. */
export type DB = RawDB & { uid: string; prog: Program };

type AnyBuilder = { where: (w?: SQL) => AnyBuilder };
function scopeWhere<B extends object>(b: B, tbl: { userId: unknown }, uid: string): B {
  const own = eq(tbl.userId as never, uid);
  const builder = b as unknown as AnyBuilder;
  const orig = builder.where.bind(builder);
  orig(own); // scoped even if the handler never calls .where()
  builder.where = (w?: SQL) => orig(w ? and(own, w) : own);
  return b;
}

export function scopedDb(binding: D1Database, uid: string, prog: Program): DB {
  if (!uid) throw new Error("scopedDb without a user");
  const d = drizzle(binding, { schema: t });
  const proxy = new Proxy(d, {
    get(target, prop, recv) {
      if (prop === "uid") return uid;
      if (prop === "prog") return prog;
      if (prop === "select" || prop === "selectDistinct") {
        return (...args: unknown[]) => {
          const s = (target[prop] as (...a: unknown[]) => { from: (tbl: unknown) => object })(...args);
          const from = s.from.bind(s);
          s.from = (tbl: unknown) => {
            const b = from(tbl);
            return PERSONAL.has(tbl) ? scopeWhere(b, tbl as { userId: unknown }, uid) : b;
          };
          return s;
        };
      }
      if (prop === "update") {
        return (tbl: unknown) => {
          const u = target.update(tbl as never) as unknown as { set: (v: unknown) => object };
          if (!PERSONAL.has(tbl)) return u;
          const set = u.set.bind(u);
          u.set = (v: unknown) => scopeWhere(set({ ...(v as object), userId: uid }), tbl as { userId: unknown }, uid);
          return u;
        };
      }
      if (prop === "delete") {
        return (tbl: unknown) => {
          const b = target.delete(tbl as never);
          return PERSONAL.has(tbl) ? scopeWhere(b, tbl as { userId: unknown }, uid) : b;
        };
      }
      if (prop === "insert") {
        return (tbl: unknown) => {
          const i = target.insert(tbl as never) as unknown as { values: (v: unknown) => object };
          if (!PERSONAL.has(tbl)) return i;
          const values = i.values.bind(i);
          i.values = (v: unknown) => {
            const b = values(Array.isArray(v) ? v.map((r) => ({ ...r, userId: uid })) : { ...(v as object), userId: uid }) as { onConflictDoUpdate?: (cfg: { set: object }) => object };
            const up = b.onConflictDoUpdate?.bind(b);
            if (up) b.onConflictDoUpdate = (cfg: { set: object }) => up({ ...cfg, set: { ...cfg.set, userId: uid }, setWhere: eq((tbl as { userId: never }).userId, uid) } as { set: object });
            return b;
          };
          return i;
        };
      }
      return Reflect.get(target, prop, recv);
    },
  });
  return proxy as DB;
}

/** Per-request scoped database for the logged-in user (picks DB or DB_DEV). */
export const db = (c: Ctx) => scopedDb(bindingOf(c), c.var.userId, c.var.prog ?? CURRENT);

/** Which program a user follows: their saved one (user_programs) or the default. Extended by the Programs feature. */
export async function resolveProgram(raw: RawDB, user: { programId: string | null } | undefined): Promise<Program> {
  if (!user?.programId) return CURRENT;
  const [p] = await raw.select().from(t.userPrograms).where(eq(t.userPrograms.id, user.programId));
  if (!p) return CURRENT;
  try {
    return JSON.parse(p.json) as Program;
  } catch {
    return CURRENT;
  }
}
