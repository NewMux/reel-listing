import { initializePaddle, type Paddle } from "@paddle/paddle-js";

/**
 * Paddle.js, initialised once per page load.
 *
 * The token here is the *client-side* token (`test_…` / `live_…`), not the API key --
 * they are easy to confuse and only one of them is safe to ship to a browser.
 */
const clientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const environment = (import.meta.env.VITE_PADDLE_ENVIRONMENT as string | undefined) === "production" ? "production" : "sandbox";

export const isPaddleAvailable = (): boolean => Boolean(clientToken);

let pending: Promise<Paddle | undefined> | null = null;

function loadPaddle(): Promise<Paddle | undefined> {
  if (!clientToken) return Promise.resolve(undefined);
  // Passing `environment` is not optional in sandbox: without it Paddle.js silently
  // fails to resolve prices rather than reporting an error.
  if (!pending) pending = initializePaddle({ environment, token: clientToken });
  return pending;
}

export type CheckoutArgs = {
  priceId: string;
  customerId: string;
  customData: Record<string, string>;
  email?: string | null;
  locale?: string;
};

/**
 * Opens the hosted overlay. Subscriptions and one-time packs use the same call -- whether
 * a price recurs is configured on the Paddle price, not here.
 */
export async function openCheckout(args: CheckoutArgs): Promise<void> {
  const paddle = await loadPaddle();
  if (!paddle) throw new Error("Checkout is not available on this deployment.");

  paddle.Checkout.open({
    items: [{ priceId: args.priceId, quantity: 1 }],
    customer: { id: args.customerId },
    customData: args.customData,
    settings: {
      displayMode: "overlay",
      theme: "light",
      locale: args.locale === "ar" ? "ar" : "en",
    },
  });
}
