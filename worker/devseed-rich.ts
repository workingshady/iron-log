import type { RawDB } from "./db";

/**
 * DEV only: realistic social layer on top of the per-user training seed — runs LAST in POST /api/dev/seed.
 * users = { dev: "dev", omar: "dev-omar", sara: "dev-sara" } (+ any extra ids this file creates).
 * Owned by the Dev-data agent.
 */
export async function seedRich(_raw: RawDB, _users: Record<string, string>) {}
