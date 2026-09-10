import { initializePaddle, type Paddle } from "@paddle/paddle-js";

let paddlePromise: Promise<Paddle | undefined> | null = null;

export function getPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
    const environment = import.meta.env.VITE_PADDLE_ENV === "production" ? "production" : "sandbox";
    paddlePromise = token ? initializePaddle({ token, environment }) : Promise.resolve(undefined);
  }
  return paddlePromise;
}

export async function openPaddleCheckout(opts: { priceId: string; customerEmail?: string | null; customData: { userId: number } }) {
  const paddle = await getPaddle();
  if (!paddle) throw new Error("Checkout is not available right now.");
  paddle.Checkout.open({
    items: [{ priceId: opts.priceId, quantity: 1 }],
    ...(opts.customerEmail ? { customer: { email: opts.customerEmail } } : {}),
    customData: opts.customData,
  });
}
