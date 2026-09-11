import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerFalWebhook } from "./webhooks";
import { registerPaddleWebhook } from "../paddleWebhook";
import { appRouter } from "../routers";
import { createContext } from "./context";

export function createApiApp() {
  const app = express();
  app.use(express.json({
    limit: "1mb",
    // Keep the exact bytes alongside the parsed body. Paddle signs the raw payload, and a
    // body that has been parsed and re-serialised hashes differently even when it is
    // semantically identical -- which is the usual reason a correct verifier rejects
    // everything. Capturing here leaves middleware order and every other route untouched.
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerOAuthRoutes(app);
  registerFalWebhook(app);
  registerPaddleWebhook(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  return app;
}

export default createApiApp();
