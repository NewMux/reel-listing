// Loads Paddle.js on demand and opens the overlay checkout for a transaction the server created.
const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

type PaddleEvent = { name?: string };
type PaddleGlobal = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback?: (event: PaddleEvent) => void }) => void;
  Checkout: { open: (options: { transactionId: string; customer?: { email: string }; settings?: { successUrl?: string } }) => void };
};

declare global {
  interface Window { Paddle?: PaddleGlobal }
}

let loading: Promise<PaddleGlobal> | null = null;
let initializedToken: string | null = null;
let onEvent: ((event: PaddleEvent) => void) | null = null;

function loadPaddle(): Promise<PaddleGlobal> {
  if (window.Paddle) return Promise.resolve(window.Paddle);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PADDLE_JS;
    script.async = true;
    script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle.js did not load.")));
    script.onerror = () => { loading = null; reject(new Error("Checkout could not be loaded. Please try again.")); };
    document.head.appendChild(script);
  });
  return loading;
}

export async function openPaddleCheckout(session: {
  transactionId: string;
  clientToken: string;
  environment: "sandbox" | "production";
  email: string | null;
  successUrl: string;
  onClose?: () => void;
}) {
  const paddle = await loadPaddle();
  // Paddle.Initialize may only run once per page; the event callback is swapped per checkout.
  if (initializedToken !== session.clientToken) {
    if (session.environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token: session.clientToken, eventCallback: event => onEvent?.(event) });
    initializedToken = session.clientToken;
  }
  onEvent = event => { if (event.name === "checkout.closed") session.onClose?.(); };
  paddle.Checkout.open({
    transactionId: session.transactionId,
    ...(session.email ? { customer: { email: session.email } } : {}),
    settings: { successUrl: session.successUrl },
  });
}
