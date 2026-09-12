import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerFalWebhook } from "./webhooks";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerPaddleWebhook } from "../billing/webhook";

export function createApiApp() {
  const app = express();

  // A liveness probe for the reverse proxy. Deliberately does not touch the database:
  // getDb() returns null on a failed connection and the app keeps serving, so a
  // DB-backed check here would flap the container rather than report anything useful.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true, uptime: process.uptime() });
  });

  // Must precede express.json(): Paddle signs the exact request bytes, and body-parser
  // short-circuits on req._body once json() has run, which would leave the raw payload
  // unrecoverable and fail every signature check.
  registerPaddleWebhook(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerFalWebhook(app);
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
