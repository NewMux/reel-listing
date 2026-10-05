import { cloudflare } from "@cloudflare/vite-plugin";
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // The Cloudflare plugin runs server/worker.ts (with local D1/R2 bindings) inside the Vite
  // dev server, and builds the client to dist/client plus the Worker bundle for deploy.
  plugins: [
    react(),
    tailwindcss(),
    jsxLocPlugin(),
    cloudflare({
      configPath: path.resolve(import.meta.dirname, "wrangler.jsonc"),
      // Share local D1/R2 state with `wrangler d1 migrations apply --local` (Vite's root is client/).
      persistState: { path: path.resolve(import.meta.dirname, ".wrangler/state") },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
