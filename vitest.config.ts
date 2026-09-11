import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // shared/ carries logic both the client and the server depend on (retry, shot presets,
    // the unsupported-move filter that stands between a customer's typing and a paid render),
    // so it needs covering too -- a server-only glob silently skipped it.
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "shared/**/*.test.ts", "shared/**/*.spec.ts"],
  },
});
