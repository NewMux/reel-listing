import express, { type Express } from "express";
import { getPaddleClient } from "../paddleClient";
import { handlePaddleEvent } from "../billing";
import { ENV } from "./env";

// Unlike the fal.ai webhook, this one grants real money-backed entitlements (quota), so its
// signature IS verified -- Paddle's SDK does HMAC-SHA256 over the raw request body against the
// Paddle-Signature header. Must be registered before the global express.json() body parser so
// this route keeps access to the raw, unparsed body the signature was computed over.
export function registerPaddleWebhook(app: Express) {
  app.post("/api/webhooks/paddle", express.raw({ type: "application/json" }), async (req, res) => {
    const signature = (req.headers["paddle-signature"] as string) || "";
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString() : "";

    if (!ENV.paddleWebhookSecret || !rawBody) {
      res.status(400).send("bad request");
      return;
    }

    let event;
    try {
      event = await getPaddleClient().webhooks.unmarshal(rawBody, ENV.paddleWebhookSecret, signature);
    } catch (error) {
      console.warn("[PaddleWebhook] signature verification failed:", error);
      res.status(400).send("invalid signature");
      return;
    }

    if (!event) {
      res.status(200).send("ignored");
      return;
    }

    try {
      await handlePaddleEvent(event);
      res.status(200).send("ok");
    } catch (error) {
      console.error(`[PaddleWebhook] handling failed for ${event.eventType}:`, error);
      res.status(500).send("processing failed"); // Paddle retries delivery on a non-2xx response
    }
  });
}
