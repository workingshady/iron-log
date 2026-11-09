import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into /migrations; wrangler applies them to D1.
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
});
