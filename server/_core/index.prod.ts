/**
 * The production server entrypoint.
 *
 * Deliberately separate from index.ts, which is the dev entrypoint. index.ts branches on
 * NODE_ENV and does `await import("./vite")`, and vite.ts statically imports
 * ../../vite.config -- so esbuild, which inlines that dynamic import and hoists its
 * externals to top-level `import` statements, produces a bundle that requires `vite`,
 * `@vitejs/plugin-react`, `@tailwindcss/vite` and two vite plugins at load time. All of
 * them are devDependencies, so the resulting bundle crashes on a `--prod` install before
 * executing a single line. This file never references ./vite, so the production bundle
 * carries only runtime dependencies.
 */

import { createServer } from "http";
import { createApiApp } from "./api";
import { serveStatic } from "./static";
import { assertPaddleEnvConsistent } from "../billing/paddleEnv";

const port = Number.parseInt(process.env.PORT || "3000", 10);

// Fail fast on a sandbox key in production rather than silently taking no money.
assertPaddleEnvConsistent();

const app = createApiApp();
serveStatic(app);

const server = createServer(app);

// Bind the configured port or die. The dev entrypoint scans for a free port, which behind
// a reverse proxy would silently bind somewhere the proxy is not looking and present as an
// unexplained failing health check.
server.listen(port, () => {
  console.log(`[Server] listening on :${port}`);
});

const shutdown = (signal: string) => () => {
  console.log(`[Server] ${signal} received, closing`);
  server.close(() => process.exit(0));
  // Docker sends SIGKILL after its grace period anyway; do not hang on a stuck connection.
  setTimeout(() => process.exit(0), 10_000).unref();
};
process.on("SIGTERM", shutdown("SIGTERM"));
process.on("SIGINT", shutdown("SIGINT"));
