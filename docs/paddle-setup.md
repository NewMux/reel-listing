# Paddle billing setup

Billing runs on the **Reel Listing** Paddle account (live, vendor 475127). Every Paddle
value below — price ids, API key, client-side token, webhook secret, approved domain — must
come from that account. Do not use the MTDRB account.

## Catalog (already created)

Monthly USD prices, quantity fixed at 1, tax category "Standard digital goods". Credits per
payment are set in code (`shared/billing.ts`), not in Paddle.

| Plan    | Price  | Credits / month | Env var                | Price id                         |
|---------|--------|-----------------|------------------------|----------------------------------|
| Starter | $89    | 300             | `PADDLE_PRICE_STARTER` | `pri_01m7g5m5d55k82g3a0eqprptcv` |
| Pro     | $229   | 800             | `PADDLE_PRICE_PRO`     | `pri_01m7g5hj1yem9zrfccg7vg1v1n` |
| Agency  | $499   | 2,000           | `PADDLE_PRICE_AGENCY`  | `pri_01m7g5k4neq649ddyqvpjq8jt0` |

The quantity cap matters: the webhook grants one plan's credits per completed transaction.

## Environment variables

| Variable                 | Where it comes from (Reel Listing account)                                    |
|--------------------------|-------------------------------------------------------------------------------|
| `PADDLE_API_KEY`         | Developer tools → Authentication → API keys. Server only; keep secret.        |
| `PADDLE_CLIENT_TOKEN`    | Developer tools → Authentication → Client-side tokens. Public (`live_…`).     |
| `PADDLE_WEBHOOK_SECRET`  | The secret key of the notification destination below. Server only.            |
| `PADDLE_ENVIRONMENT`     | `production` (the default). Use `sandbox` only with sandbox keys and prices.  |
| `PADDLE_PRICE_STARTER`   | `pri_01m7g5m5d55k82g3a0eqprptcv`                                              |
| `PADDLE_PRICE_PRO`       | `pri_01m7g5hj1yem9zrfccg7vg1v1n`                                              |
| `PADDLE_PRICE_AGENCY`    | `pri_01m7g5k4neq649ddyqvpjq8jt0`                                              |

The API key needs permission to write transactions and read subscriptions (renewals are
matched to a user through the subscription when the transaction carries no custom data).

## Account settings

1. **Approve the checkout domain.** Checkout → Website approval: add `reel-listing.com`
   (the domain in `PUBLIC_URL`). The overlay checkout only opens on approved domains.
2. **Default payment link.** Checkout → Checkout settings: set it to a page on the approved
   domain, e.g. `https://reel-listing.com/pricing`. Paddle requires one before it will create
   transactions.
3. **Notification destination.** Developer tools → Notifications → New destination:
   - URL: `https://reel-listing.com/api/webhooks/paddle`
   - Type: webhook; usage: platform
   - Events: `transaction.completed`, `subscription.canceled`
   - Copy its secret key into `PADDLE_WEBHOOK_SECRET`.

## How it flows

1. `billing.checkout` creates a transaction with the plan's price and
   `custom_data: { userId, plan }`, and returns its id plus the client token.
2. The pricing page loads Paddle.js and opens the overlay checkout on that transaction.
3. On `transaction.completed`, the webhook verifies `Paddle-Signature`, reads the plan from
   the price paid, and grants credits keyed on the transaction id (retries can't grant twice).
4. On `subscription.canceled`, the user's plan is cleared; their credits stay.
