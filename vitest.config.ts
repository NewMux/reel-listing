import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

const templateRoot = path.resolve(import.meta.dirname);

// Tests run inside workerd with the bindings from wrangler.jsonc (local D1, R2, email,
// rate limiters); D1 migrations are applied once per test file by server/test/setup.ts.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(templateRoot, "drizzle", "migrations"));
  return {
    root: templateRoot,
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            PUBLIC_URL: "https://reel-listing.test",
            OWNER_EMAIL: "owner@reel-listing.test",
            FAL_KEY: "",
            R2_ACCOUNT_ID: "",
            R2_ACCESS_KEY_ID: "",
            R2_SECRET_ACCESS_KEY: "",
          },
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(templateRoot, "client", "src"),
        "@shared": path.resolve(templateRoot, "shared"),
        "@assets": path.resolve(templateRoot, "attached_assets"),
      },
    },
    test: {
      include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
      setupFiles: ["./server/test/setup.ts"],
    },
  };
});
