import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only; they are applied to D1 with `wrangler d1 migrations apply`.
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
});
