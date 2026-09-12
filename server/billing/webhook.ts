/**
 * Paddle's inbound webhook. This is the only place money becomes entitlement.
 *
 * Unlike the fal.ai webhook next door (server/_core/webhooks.ts), which is deliberately
 * unverified because it carries no trusted data, every byte here is trusted after the
 * signature check -- so an unverifiable request is refused rather than tolerated.
 */

import express, { type Express, type Request, type Response } from "express";
import { applyBillingEvent, getUserByEmail, getUserById, getUserByPaddleCustomerId, linkPaddleCustomer, type BillingIntentRecord } from "../db";
import { getPaddle } from "./paddle";
import { PADDLE_ENV, isPaddleConfigured, resolvePrice } from "./paddleEnv";
import { normalizePaddleEvent, paddleEventToIntent, userIdFromCustomData, type BillingIntent, type PaddleEventView } from "./intents";

export const PADDLE_WEBHOOK_PATH = "/api/webhooks/paddle";

/**
 * The exact bytes Paddle signed.
 *
 * `express.raw` normally supplies them, but a platform wrapper (Vercel's node runtime, for
 * one) can buffer and parse the request before Express ever sees it. When that happens
 * `req.body` is a plain object and the original bytes are gone -- reserializing it would
 * produce a different HMAC. Returning null here makes that state loud (a 500 and a retry)
 * rather than an inexplicable run of signature failures.
 */
function rawBody(req: Request): string | null {
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return null;
}

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Finds the local account an event belongs to.
 *
 * customData is the primary link, but Paddle carries the *subscription's* custom data on
 * renewals rather than the original checkout's, so it can legitimately be missing. The
 * stored customer id is the reliable fallback -- which is why billing.startCheckout
 * records it before the overlay ever opens.
 */
async function resolveUserId(intent: BillingIntent, event: PaddleEventView): Promise<number | null> {
  const fromCustomData = userIdFromCustomData(event.data?.customData);
  if (fromCustomData) {
    const user = await getUserById(fromCustomData);
    if (user) return user.id;
    console.warn("[Paddle] customData.userId", fromCustomData, "does not match any account");
  }

  const customerId =
    intent.kind === "grant-pack" || intent.kind === "grant-period" || intent.kind === "subscription-status"
      ? intent.customerId
      : null;
  if (!customerId) return null;

  const byCustomer = await getUserByPaddleCustomerId(customerId);
  if (byCustomer) return byCustomer.id;

  // Last resort. Only safe because Supabase verifies email ownership at sign-up, and it
  // never creates an account -- an unmatched email means the event is recorded unlinked
  // for a human to look at, not that a new user is invented.
  try {
    const customer = await getPaddle().customers.get(customerId);
    if (customer.email) {
      const byEmail = await getUserByEmail(customer.email);
      if (byEmail) {
        console.warn("[Paddle] resolved", customerId, "by email fallback -- linking it now");
        await linkPaddleCustomer(byEmail.id, customerId);
        return byEmail.id;
      }
    }
  } catch (error) {
    console.warn("[Paddle] customer lookup failed for", customerId, error);
  }
  return null;
}

function toRecord(event: PaddleEventView, intent: BillingIntent, userId: number | null): BillingIntentRecord {
  const base: BillingIntentRecord = {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: toDate(event.occurredAt),
    payload: event.data ?? null,
    userId,
  };

  if (intent.kind === "grant-period") {
    base.period = {
      subscriptionId: intent.subscriptionId,
      paddleCustomerId: intent.customerId,
      planId: intent.planId,
      status: intent.status,
      periodStart: toDate(intent.periodStart),
      periodEnd: toDate(intent.periodEnd),
      cancelAtPeriodEnd: intent.cancelAtPeriodEnd,
      videos: intent.grant.videos,
      staging: intent.grant.staging,
    };
  } else if (intent.kind === "grant-pack") {
    base.pack = {
      transactionId: intent.transactionId,
      packId: intent.packId,
      videos: intent.grant.videos,
      staging: intent.grant.staging,
    };
  } else if (intent.kind === "subscription-status") {
    base.status = {
      subscriptionId: intent.subscriptionId,
      paddleCustomerId: intent.customerId,
      status: intent.status,
      cancelAtPeriodEnd: intent.cancelAtPeriodEnd,
      periodStart: toDate(intent.periodStart),
      periodEnd: toDate(intent.periodEnd),
    };
  }

  return base;
}

async function handle(req: Request, res: Response): Promise<void> {
  if (!isPaddleConfigured() || !PADDLE_ENV.webhookSecret) {
    console.error("[Paddle] webhook received but PADDLE_API_KEY/PADDLE_WEBHOOK_SECRET are not set");
    res.status(500).send("payments not configured");
    return;
  }

  const signature = req.header("paddle-signature");
  if (!signature) {
    res.status(400).send("missing signature");
    return;
  }

  const body = rawBody(req);
  if (body === null) {
    console.error("[Paddle] request body was parsed before the webhook saw it (got", typeof req.body, ") -- signature cannot be verified");
    res.status(500).send("raw body unavailable");
    return;
  }

  // Signature checking is delegated to the SDK; interpretation is not. unmarshal() also
  // builds strict entity objects and throws on any shape it does not model, which would
  // turn "a line item we never look at has an unexpected field" into a rejected payment.
  // Keeping the two apart means only a genuinely bad signature is refused.
  let signatureValid: boolean;
  try {
    signatureValid = await getPaddle().webhooks.isSignatureValid(body, PADDLE_ENV.webhookSecret, signature);
  } catch (error) {
    console.warn("[Paddle] signature check errored:", error);
    signatureValid = false;
  }
  if (!signatureValid) {
    // Not retryable, so 400 rather than 500 -- Paddle stops instead of backing off.
    res.status(400).send("invalid signature");
    return;
  }

  let event: PaddleEventView;
  try {
    event = normalizePaddleEvent(JSON.parse(body)) as PaddleEventView;
    if (!event) throw new Error("payload has no event_id/event_type");
  } catch (error) {
    // Signed by Paddle but unreadable by us. That is our bug, not theirs: 500 so the
    // delivery is retried once we have fixed it, rather than silently dropped.
    console.error("[Paddle] could not parse a validly signed payload:", error);
    res.status(500).send("unparseable payload");
    return;
  }

  try {
    const intent = paddleEventToIntent(event, resolvePrice);
    if (intent.kind === "ignore") {
      res.status(200).send("ignored");
      return;
    }

    const userId = await resolveUserId(intent, event);
    if (userId === null) {
      // Record it so the event is not lost, but do not retry forever on something no
      // amount of redelivery will fix.
      console.error("[Paddle] could not map event", event.eventId, event.eventType, "to a local account");
      await applyBillingEvent(toRecord(event, intent, null));
      res.status(200).send("unmapped");
      return;
    }

    if (intent.customerId) {
      const user = await getUserById(userId);
      if (user && !user.paddleCustomerId) await linkPaddleCustomer(userId, intent.customerId);
    }

    const outcome = await applyBillingEvent(toRecord(event, intent, userId));
    console.log("[Paddle]", event.eventType, event.eventId, "->", outcome, "for user", userId);
    res.status(200).send(outcome);
  } catch (error) {
    // 500 so Paddle retries with backoff. Swallowing this with a 200 would silently lose
    // a payment the customer has already made.
    console.error("[Paddle] failed to process", event.eventId, event.eventType, error);
    res.status(500).send("processing failed");
  }
}

export function registerPaddleWebhook(app: Express) {
  // Path-scoped raw parser. Must be registered before the global express.json(), which
  // sets req._body and makes every later body parser a no-op.
  // 1mb, not the app-wide 50mb: this is the only unauthenticated POST that moves money.
  app.post(PADDLE_WEBHOOK_PATH, express.raw({ type: "*/*", limit: "1mb" }), handle);
}
