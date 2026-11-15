// Paddle Billing, via Paddle's REST API directly (no SDK dependency). The server creates a
// transaction that carries the user and plan, the browser opens Paddle's overlay checkout on
// it, and a signed webhook turns every completed transaction -- the first payment and each
// renewal -- into credits.
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import type { User } from "../drizzle/schema";
import { PLAN_CREDITS, PLAN_IDS, type PlanId } from "../shared/billing";
import { ENV } from "./_core/env";
import { getUserById, grantCredits, updateUserBilling } from "./db";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function paddleApi() {
  return ENV.paddleEnvironment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

export function isBillingConfigured(plan?: PlanId) {
  if (!ENV.paddleApiKey || !ENV.paddleClientToken) return false;
  return plan ? Boolean(ENV.paddlePrices[plan]) : true;
}

export type CheckoutSession = {
  transactionId: string;
  clientToken: string;
  environment: "sandbox" | "production";
  email: string | null;
};

/**
 * Creates a Paddle transaction for a plan. The browser opens it in Paddle's overlay checkout;
 * the user id lives in the transaction's custom data, set here, so the client cannot change it.
 */
export async function createCheckoutSession(user: User, plan: PlanId): Promise<CheckoutSession> {
  if (!isBillingConfigured(plan)) {
    throw new Error("Online checkout is not set up yet. Contact us and we'll activate your plan.");
  }
  const body: Record<string, unknown> = {
    items: [{ price_id: ENV.paddlePrices[plan], quantity: 1 }],
    custom_data: { userId: String(user.id), plan },
  };
  if (user.paddleCustomerId) body.customer_id = user.paddleCustomerId;

  const response = await fetch(`${paddleApi()}/transactions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.paddleApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null) as { data?: { id?: string }; error?: { detail?: string } } | null;
  if (!response.ok || !json?.data?.id) {
    console.error("[Billing] Paddle transaction failed:", response.status, json?.error?.detail);
    throw new Error("Checkout could not be started. Please try again.");
  }
  return {
    transactionId: json.data.id,
    clientToken: ENV.paddleClientToken,
    environment: ENV.paddleEnvironment,
    email: user.paddleCustomerId ? null : user.email ?? null,
  };
}

/** Verifies a `Paddle-Signature` header (`ts=...;h1=...`) against the raw request body. */
export function verifyPaddleSignature(rawBody: string, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = header.split(";").map(part => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "ts")?.[1];
  // Several h1 values can be present while a secret is being rotated.
  const signatures = parts.filter(([key]) => key === "h1").map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex"));
  return signatures.some(signature => {
    const candidate = Buffer.from(signature ?? "");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

type CustomData = Record<string, unknown> | null | undefined;

/** The plan a transaction pays for, read from its price ids so it can't be spoofed by custom data. */
export function planFromTransaction(transaction: Record<string, any>): PlanId | null {
  const priceIds: string[] = (transaction.items ?? [])
    .map((item: any) => item?.price?.id ?? item?.price_id)
    .filter((id: unknown): id is string => typeof id === "string");
  return PLAN_IDS.find(plan => ENV.paddlePrices[plan] && priceIds.includes(ENV.paddlePrices[plan])) ?? null;
}

function userIdFrom(customData: CustomData) {
  const userId = Number(customData?.userId);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

/** Renewal transactions may not carry the checkout's custom data; the subscription does. */
async function subscriptionCustomData(subscriptionId: string): Promise<CustomData> {
  const response = await fetch(`${paddleApi()}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${ENV.paddleApiKey}` },
  });
  if (!response.ok) throw new Error(`Paddle subscription lookup failed: ${response.status}`);
  const json = await response.json() as { data?: { custom_data?: CustomData } };
  return json.data?.custom_data;
}

export async function handlePaddleEvent(event: { event_type?: string; data?: Record<string, any> }) {
  const data = event.data;
  if (!data) return;

  if (event.event_type === "transaction.completed") {
    const plan = planFromTransaction(data);
    if (!plan) {
      console.warn("[Billing] transaction.completed for an unknown price:", data.id);
      return;
    }
    let userId = userIdFrom(data.custom_data);
    if (!userId && typeof data.subscription_id === "string") {
      userId = userIdFrom(await subscriptionCustomData(data.subscription_id));
    }
    if (!userId || !(await getUserById(userId))) {
      console.warn("[Billing] transaction.completed without a known user:", data.id);
      return;
    }
    // Keyed on the transaction id, so Paddle's webhook retries can't grant twice.
    const granted = await grantCredits(userId, PLAN_CREDITS[plan], "subscription", `paddle:${data.id}`);
    await updateUserBilling(userId, { plan, ...(typeof data.customer_id === "string" ? { paddleCustomerId: data.customer_id } : {}) });
    if (granted) console.log(`[Billing] granted ${PLAN_CREDITS[plan]} credits to user ${userId} (${plan}).`);
    return;
  }

  if (event.event_type === "subscription.canceled") {
    const userId = userIdFrom(data.custom_data);
    if (userId) await updateUserBilling(userId, { plan: null });
  }
}

/** Must be registered before express.json(): signature verification needs the raw body bytes. */
export function registerPaddleWebhook(app: Express) {
  app.post("/api/webhooks/paddle", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
    if (!verifyPaddleSignature(rawBody, req.get("paddle-signature"), ENV.paddleWebhookSecret)) {
      res.status(400).send("invalid signature");
      return;
    }
    try {
      await handlePaddleEvent(JSON.parse(rawBody));
      res.status(200).send("ok");
    } catch (error) {
      // Non-2xx so Paddle retries: a missed grant is a paying customer without credits.
      console.error("[Billing] webhook handling failed:", error);
      res.status(500).send("error");
    }
  });
}
