import type { Express, Request } from "express";
import { getPlan, PlanId, rolloverCap } from "../shared/plans";
import { ENV } from "./_core/env";
import { getBillingAccountBySubscriptionId, grantSubscriptionCredits, updateBillingAccount } from "./db";
import { verifyPaddleSignature } from "./paddleSignature";

/**
 * Paddle is the merchant of record, and this endpoint is the only place the app learns that
 * a customer paid. Nothing here runs before the signature is verified, and an unverified
 * request never reaches the credit code at all.
 *
 * https://developer.paddle.com/webhooks/overview
 */

type PaddleItem = { price?: { id?: unknown } | null };
type PaddleEvent = {
  event_type?: unknown;
  data?: {
    id?: unknown;
    status?: unknown;
    customer_id?: unknown;
    subscription_id?: unknown;
    current_billing_period?: { ends_at?: unknown } | null;
    items?: PaddleItem[] | null;
    custom_data?: { userId?: unknown } | null;
  } | null;
};

/** Which of our plans a Paddle price id belongs to, or null if we do not sell it. */
function planForPriceId(priceId: string): PlanId | null {
  const entries = Object.entries(ENV.paddlePriceIds) as [PlanId, string][];
  return entries.find(([, configured]) => configured && configured === priceId)?.[0] ?? null;
}

/** The first purchased line item that maps to one of our plans. */
function planFromItems(items: PaddleItem[] | null | undefined): PlanId | null {
  for (const item of items ?? []) {
    const priceId = item?.price?.id;
    if (typeof priceId === "string") {
      const plan = planForPriceId(priceId);
      if (plan) return plan;
    }
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Which account this event belongs to.
 *
 * Prefers the subscription id, which is stable across renewals. Falls back to the userId we
 * attached at checkout -- trustworthy here only because the signature has already been
 * verified, so the custom data is our own, echoed back by Paddle rather than attacker-supplied.
 */
async function resolveUserId(data: NonNullable<PaddleEvent["data"]>): Promise<number | null> {
  const subscriptionId = asString(data.subscription_id) ?? asString(data.id);
  if (subscriptionId) {
    const account = await getBillingAccountBySubscriptionId(subscriptionId);
    if (account) return account.userId;
  }
  const fromCheckout = data.custom_data?.userId;
  const parsed = typeof fromCheckout === "number" ? fromCheckout : Number(fromCheckout);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function periodEnd(data: NonNullable<PaddleEvent["data"]>): Date | null {
  const endsAt = asString(data.current_billing_period?.ends_at);
  if (!endsAt) return null;
  const parsed = new Date(endsAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function handleEvent(event: PaddleEvent): Promise<void> {
  const eventType = asString(event.event_type);
  const data = event.data;
  if (!eventType || !data) return;

  const userId = await resolveUserId(data);
  if (!userId) {
    console.warn(`[PaddleWebhook] ${eventType} could not be matched to an account; ignoring.`);
    return;
  }

  switch (eventType) {
    case "transaction.completed": {
      // Money has actually moved. This is the only event that grants credit.
      const plan = planFromItems(data.items);
      if (!plan) {
        console.warn(`[PaddleWebhook] transaction.completed for a price we do not sell; ignoring.`);
        return;
      }
      const transactionId = asString(data.id);
      if (!transactionId) return;
      const catalogue = getPlan(plan)!;
      // Keyed on Paddle's transaction id, so their retries -- and ours -- are free.
      const balance = await grantSubscriptionCredits({
        userId,
        credits: catalogue.monthlyCredits,
        capCredits: rolloverCap(plan),
        referenceId: `paddle:txn:${transactionId}`,
        description: `${plan} plan, Paddle transaction ${transactionId}`,
      });
      console.info(`[PaddleWebhook] granted ${catalogue.monthlyCredits} credits to user ${userId}; balance ${balance}.`);
      return;
    }

    case "subscription.created":
    case "subscription.updated":
    case "subscription.canceled": {
      // State only. A cancellation deliberately leaves the balance alone: those credits were
      // paid for, and taking them back at cancellation would be a refund we did not make.
      const plan = planFromItems(data.items);
      await updateBillingAccount(userId, {
        ...(plan ? { plan } : {}),
        status: asString(data.status) ?? "active",
        externalCustomerId: asString(data.customer_id),
        externalSubscriptionId: asString(data.id),
        currentPeriodEnd: periodEnd(data),
      });
      console.info(`[PaddleWebhook] ${eventType} recorded for user ${userId}.`);
      return;
    }

    default:
      // Paddle sends far more than we subscribe to; ignoring the rest is correct.
      return;
  }
}

export function registerPaddleWebhook(app: Express) {
  app.post("/api/webhooks/paddle", async (req: Request, res) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const verified = verifyPaddleSignature(
      rawBody ?? JSON.stringify(req.body ?? {}),
      req.get("paddle-signature") ?? undefined,
      ENV.paddleWebhookSecret,
    );

    if (!verified.ok) {
      // 403 rather than 200: a rejected webhook is either misconfiguration or an attack, and
      // in both cases Paddle retrying is the behaviour we want.
      console.warn(`[PaddleWebhook] rejected request: ${verified.reason}`);
      res.status(403).send(verified.reason);
      return;
    }

    try {
      await handleEvent(req.body as PaddleEvent);
    } catch (error) {
      // 500 so Paddle retries. The referenceId on every credit movement makes that safe.
      console.error("[PaddleWebhook] handler failed:", error);
      res.status(500).send("handler failed");
      return;
    }

    res.status(200).send("ok");
  });
}
