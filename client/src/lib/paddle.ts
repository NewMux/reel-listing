import { PlanId } from "@shared/plans";

/**
 * Paddle.js, loaded on demand.
 *
 * Deferred rather than bundled: the checkout script is only needed by someone who actually
 * clicks a plan, and loading it on every page view would cost every visitor a third-party
 * request for a feature most of them never reach.
 *
 * https://developer.paddle.com/build/checkout/build-overlay-checkout
 */

type PaddleCheckoutOptions = {
  items: { priceId: string; quantity: number }[];
  customData?: Record<string, unknown>;
  customer?: { email: string };
  settings?: { displayMode?: string; theme?: string; locale?: string; successUrl?: string };
};

type PaddleGlobal = {
  Environment?: { set: (env: string) => void };
  Initialize: (options: { token: string }) => void;
  Checkout: { open: (options: PaddleCheckoutOptions) => void };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

const PRICE_IDS: Record<PlanId, string | undefined> = {
  solo: import.meta.env.VITE_PADDLE_PRICE_SOLO,
  pro: import.meta.env.VITE_PADDLE_PRICE_PRO,
  agency: import.meta.env.VITE_PADDLE_PRICE_AGENCY,
};

export function paddlePriceId(plan: PlanId) {
  return PRICE_IDS[plan];
}

/** True when this deployment has enough configuration to take a payment at all. */
export function isPaddleConfigured() {
  return Boolean(import.meta.env.VITE_PADDLE_CLIENT_TOKEN);
}

let loader: Promise<PaddleGlobal> | null = null;

function loadPaddle(): Promise<PaddleGlobal> {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (loader) return loader;

  loader = new Promise<PaddleGlobal>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PADDLE_JS;
    script.async = true;
    script.onload = () => {
      const paddle = window.Paddle;
      if (!paddle) return reject(new Error("Paddle.js loaded without exposing itself."));
      // Sandbox has to be selected before Initialize, or the token is rejected.
      const environment = import.meta.env.VITE_PADDLE_ENV;
      if (environment === "sandbox") paddle.Environment?.set("sandbox");
      paddle.Initialize({ token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string });
      resolve(paddle);
    };
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      loader = null;
      reject(new Error("Could not reach the payment provider. Please try again."));
    };
    document.head.appendChild(script);
  });
  return loader;
}

/**
 * Opens the overlay checkout for a plan.
 *
 * `userId` rides along as custom data so the webhook can attach the purchase to the right
 * account. Paddle echoes it back inside the signed payload, which is the only reason it can
 * be trusted server-side.
 */
export async function openPlanCheckout(plan: PlanId, userId: number, email?: string | null, locale?: string) {
  const priceId = paddlePriceId(plan);
  if (!priceId) throw new Error("This plan is not available for purchase yet.");
  const paddle = await loadPaddle();
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { userId },
    ...(email ? { customer: { email } } : {}),
    settings: {
      displayMode: "overlay",
      theme: "light",
      ...(locale ? { locale } : {}),
      successUrl: `${window.location.origin}/dashboard`,
    },
  });
}
