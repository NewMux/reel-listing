// Stripe billing, via Stripe's REST API directly (no SDK dependency): hosted Checkout to start a
// subscription, and a signed webhook that turns each paid invoice into credits.
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import type { User } from "../drizzle/schema";
import { isPlanId, PLAN_CREDITS, type PlanId } from "../shared/billing";
import { ENV } from "./_core/env";
import { getUserById, grantCredits, updateUserBilling } from "./db";

const STRIPE_API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export function isBillingConfigured(plan?: PlanId) {
  if (!ENV.stripeSecretKey) return false;
  return plan ? Boolean(ENV.stripePrices[plan]) : true;
}

/** Creates a hosted Stripe Checkout session for a plan and returns the URL to send the customer to. */
export async function createCheckoutSession(user: User, plan: PlanId): Promise<string> {
  if (!isBillingConfigured(plan)) {
    throw new Error("Online checkout is not set up yet. Contact us and we'll activate your plan.");
  }
  const origin = ENV.publicUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": ENV.stripePrices[plan],
    "line_items[0][quantity]": "1",
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    client_reference_id: String(user.id),
    "metadata[userId]": String(user.id),
    "metadata[plan]": plan,
    // Copied onto the subscription so every renewal invoice still knows whose credits to grant.
    "subscription_data[metadata][userId]": String(user.id),
    "subscription_data[metadata][plan]": plan,
  });
  if (user.stripeCustomerId) params.set("customer", user.stripeCustomerId);
  else if (user.email) params.set("customer_email", user.email);

  const response = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.stripeSecretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const body = await response.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;
  if (!response.ok || !body?.url) {
    console.error("[Billing] checkout session failed:", response.status, body?.error?.message);
    throw new Error("Checkout could not be started. Please try again.");
  }
  return body.url;
}

/** Verifies a `Stripe-Signature` header against the raw request body. */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = header.split(",").map(part => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
  return signatures.some(signature => {
    const candidate = Buffer.from(signature);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

type Metadata = Record<string, string> | null | undefined;

/** Finds the subscription metadata on an invoice; its location differs across Stripe API versions. */
export function invoiceMetadata(invoice: Record<string, any>): Metadata {
  const candidates: Metadata[] = [
    invoice.parent?.subscription_details?.metadata,
    invoice.subscription_details?.metadata,
    invoice.lines?.data?.[0]?.metadata,
  ];
  return candidates.find(metadata => metadata && metadata.userId && metadata.plan);
}

export async function handleStripeEvent(event: { type?: string; data?: { object?: Record<string, any> } }) {
  const object = event.data?.object;
  if (!object) return;

  if (event.type === "invoice.paid") {
    const metadata = invoiceMetadata(object);
    const userId = Number(metadata?.userId);
    if (!metadata || !Number.isSafeInteger(userId) || !isPlanId(metadata.plan)) {
      console.warn("[Billing] invoice.paid without usable plan metadata:", object.id);
      return;
    }
    if (!(await getUserById(userId))) {
      console.warn("[Billing] invoice.paid for unknown user:", userId, object.id);
      return;
    }
    // Keyed on the invoice id, so Stripe's webhook retries can't grant twice.
    const granted = await grantCredits(userId, PLAN_CREDITS[metadata.plan], "subscription", `stripe:${object.id}`);
    await updateUserBilling(userId, { plan: metadata.plan, ...(typeof object.customer === "string" ? { stripeCustomerId: object.customer } : {}) });
    if (granted) console.log(`[Billing] granted ${PLAN_CREDITS[metadata.plan]} credits to user ${userId} (${metadata.plan}).`);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    const userId = Number(object.metadata?.userId);
    if (Number.isSafeInteger(userId)) await updateUserBilling(userId, { plan: null });
  }
}

/** Must be registered before express.json(): signature verification needs the raw body bytes. */
export function registerStripeWebhook(app: Express) {
  app.post("/api/webhooks/stripe", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
    if (!verifyStripeSignature(rawBody, req.get("stripe-signature"), ENV.stripeWebhookSecret)) {
      res.status(400).send("invalid signature");
      return;
    }
    try {
      await handleStripeEvent(JSON.parse(rawBody));
      res.status(200).send("ok");
    } catch (error) {
      // Non-2xx so Stripe retries: a missed grant is a paying customer without credits.
      console.error("[Billing] webhook handling failed:", error);
      res.status(500).send("error");
    }
  });
}
