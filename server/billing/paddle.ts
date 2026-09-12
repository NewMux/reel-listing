/**
 * The Paddle SDK client and the few API calls we make outbound.
 *
 * Everything inbound arrives through the webhook instead; see server/billing/webhook.ts.
 */

import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { PADDLE_ENV, isPaddleConfigured } from "./paddleEnv";

let cached: Paddle | null = null;

/**
 * Lazily constructed, matching how the Upstash client in server/rateLimit.ts and the fal
 * client are built -- so an unset key degrades to a clear error at the point of use
 * instead of crashing the process at import time.
 */
export function getPaddle(): Paddle {
  if (!isPaddleConfigured()) {
    throw new Error("Payments are not configured. Set PADDLE_API_KEY to enable checkout.");
  }
  if (!cached) {
    cached = new Paddle(PADDLE_ENV.apiKey, {
      environment: PADDLE_ENV.environment === "production" ? Environment.production : Environment.sandbox,
    });
  }
  return cached;
}

/**
 * Find or create this user's Paddle customer, so the id can be stored *before* the
 * checkout overlay opens.
 *
 * That ordering matters: `customData` is the primary way a webhook finds the local user,
 * but Paddle carries the *subscription's* custom data on renewals rather than the original
 * checkout's, so it can legitimately go missing. A stored customer id is the fallback that
 * always works -- but only if it was recorded before the first payment, not after.
 */
export async function ensurePaddleCustomer(args: { email: string; name?: string | null; userId: number }): Promise<string> {
  const paddle = getPaddle();

  // Paddle rejects a duplicate email on create, so look first.
  const existing = paddle.customers.list({ email: [args.email], perPage: 1 });
  for await (const customer of existing) {
    if (customer.id) return customer.id;
  }

  const created = await paddle.customers.create({
    email: args.email,
    name: args.name ?? undefined,
    customData: { userId: String(args.userId) },
  });
  return created.id;
}

/**
 * A short-lived self-serve management link (update card, cancel). Minted per request and
 * never persisted -- these URLs expire.
 */
export async function createPortalSession(customerId: string, subscriptionIds: string[]) {
  const paddle = getPaddle();
  const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds);
  return {
    overviewUrl: session.urls.general.overview,
    subscriptions: session.urls.subscriptions.map(s => ({
      id: s.id,
      cancelUrl: s.cancelSubscription,
      updatePaymentMethodUrl: s.updateSubscriptionPaymentMethod,
    })),
  };
}
