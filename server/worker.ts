import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "./_core/context";
import { handleMediaRequest } from "./_core/media";
import { handleFalWebhook } from "./_core/webhooks";
import { appRouter } from "./routers";

const app = new Hono<{ Bindings: Env }>();

app.all("/api/trpc/*", c =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  }),
);

app.post("/api/webhooks/fal", c => handleFalWebhook(c.req.raw, promise => c.executionCtx.waitUntil(promise)));

app.on(["GET", "HEAD", "PUT"], "/api/media/*", c => handleMediaRequest(c.req.raw));

app.all("/api/*", c => c.json({ error: "Not found" }, 404));

// Everything outside /api is the single-page app, served from static assets.
app.all("*", c => c.env.ASSETS.fetch(c.req.raw));

export default app;
