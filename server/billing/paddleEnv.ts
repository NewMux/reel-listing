/**
 * Paddle configuration, kept out of shared/plans.ts on purpose.
 *
 * plans.ts is compiled twice -- by esbuild for the server and by Vite for the browser --
 * so `process.env` there would break the client and `import.meta.env` would break the
 * server bundle. Price IDs are publishable (Paddle.js needs them in the page anyway), so
 * they are read here and handed to the client through the `billing.plans` query.
 */

import { PACK_IDS, PLAN_IDS, type PackId, type PlanId } from "@shared/plans";
import type { PriceRef, PriceResolver } from "./intents";

export type PaddleEnvironment = "sandbox" | "production";

const environment: PaddleEnvironment = process.env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";

/** `PADDLE_PRICE_STARTER`, `PADDLE_PRICE_PRO`, ... */
const planPriceIds = Object.fromEntries(
  PLAN_IDS.map(id => [id, process.env[`PADDLE_PRICE_${id.toUpperCase()}`] ?? ""]),
) as Record<PlanId, string>;

/** `PADDLE_PRICE_PACK_LISTING5` */
const packPriceIds = Object.fromEntries(
  PACK_IDS.map(id => [id, process.env[`PADDLE_PRICE_PACK_${id.toUpperCase()}`] ?? ""]),
) as Record<PackId, string>;

export const PADDLE_ENV = {
  environment,
  apiKey: process.env.PADDLE_API_KEY ?? "",
  webhookSecret: process.env.PADDLE_WEBHOOK_SECRET ?? "",
  planPriceIds,
  packPriceIds,
};

/** True once there is enough configuration to actually talk to Paddle. */
export const isPaddleConfigured = (): boolean => Boolean(PADDLE_ENV.apiKey);

/** A plan is only offered for sale once its price ID is configured. */
export const purchasablePlanIds = (): PlanId[] => PLAN_IDS.filter(id => Boolean(planPriceIds[id]));
export const purchasablePackIds = (): PackId[] => PACK_IDS.filter(id => Boolean(packPriceIds[id]));

const priceIndex = new Map<string, PriceRef>();
for (const id of PLAN_IDS) if (planPriceIds[id]) priceIndex.set(planPriceIds[id], { type: "plan", planId: id });
for (const id of PACK_IDS) if (packPriceIds[id]) priceIndex.set(packPriceIds[id], { type: "pack", packId: id });

/** Maps a Paddle price ID back to what we sell. Unknown prices resolve to null, never a default. */
export const resolvePrice: PriceResolver = priceId => priceIndex.get(priceId) ?? null;

/**
 * Sandbox and live are entirely separate Paddle accounts: different API keys, client
 * tokens, webhook secrets *and* price IDs. Shipping a sandbox key to production is the
 * most common way a Paddle launch fails, and it fails by silently taking no money, so
 * check the credential prefixes at boot and refuse to start rather than find out later.
 */
export function assertPaddleEnvConsistent(): void {
  if (!isPaddleConfigured()) return;

  const looksSandbox = PADDLE_ENV.apiKey.includes("sdbx") || PADDLE_ENV.apiKey.startsWith("pdl_sdbx");
  if (environment === "production" && looksSandbox) {
    throw new Error("PADDLE_ENVIRONMENT=production but PADDLE_API_KEY is a sandbox key. Refusing to start.");
  }
  if (environment === "sandbox" && !looksSandbox && process.env.NODE_ENV === "production") {
    console.warn("[Paddle] PADDLE_ENVIRONMENT=sandbox but the API key does not look like a sandbox key.");
  }
  if (!PADDLE_ENV.webhookSecret) {
    console.warn("[Paddle] PADDLE_WEBHOOK_SECRET is unset -- the webhook will reject every delivery.");
  }
}
