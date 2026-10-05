# reel-listing

Real-estate listing reels from property photos. React (Vite) frontend and a tRPC API, deployed
as a single **Cloudflare Worker**:

| Concern        | Cloudflare service                                           |
| -------------- | ------------------------------------------------------------ |
| Hosting        | Workers + static assets (`server/worker.ts`, SPA in `client/`) |
| Database       | D1 (`DB`), schema in `drizzle/schema.ts`                     |
| Media storage  | R2 (`MEDIA`), presigned S3-API URLs for browser/fal.ai access |
| Auth emails    | Email Service (`EMAIL` send_email binding)                   |
| Rate limiting  | Workers Rate Limiting (`CONTACT_RATE_LIMITER`, `AUTH_RATE_LIMITER`) |

Accounts are email + password (PBKDF2), stored in D1, with an HttpOnly session cookie.
Sign-up requires email confirmation; password reset is by emailed one-time link.

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars   # fill in FAL_KEY; R2 keys are optional locally
pnpm db:migrate:local            # create the local D1 tables
pnpm dev                         # http://localhost:3000 (Worker + D1/R2 run locally)
```

Locally, auth emails are not delivered: the dev server log prints where each email was
written. Without R2 API keys in `.dev.vars`, media is uploaded and served through the Worker
(`/api/media/*`) from local R2 state; fal.ai can't reach localhost, so rendering needs a
deployed environment.

```sh
pnpm check   # typecheck client and worker
pnpm test    # vitest, running inside workerd with local D1/R2
```

## One-time Cloudflare setup

```sh
npx wrangler d1 create reel-listing           # put the printed database_id in wrangler.jsonc
npx wrangler r2 bucket create reel-listing-media
npx wrangler r2 bucket cors set reel-listing-media --file scripts/r2-cors.json
pnpm db:migrate:remote
```

1. **R2 API token** (R2 → Manage API tokens, Object Read & Write on `reel-listing-media`).
   Used only to presign upload/download URLs, so large final reels go straight to R2.
2. **Email Service**: onboard the sending domain (`reel-listing.com`) for Email Sending in the
   dashboard; `EMAIL_FROM` in `wrangler.jsonc` must be an address on that domain.
3. **Secrets**:
   ```sh
   npx wrangler secret put FAL_KEY
   npx wrangler secret put R2_ACCOUNT_ID
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   npx wrangler secret put OWNER_EMAIL     # this account becomes an admin on sign-up
   ```
4. Deploy with `pnpm deploy`, then add `reel-listing.com` as a custom domain on the Worker.
   `PUBLIC_URL` must match it: fal.ai webhooks and emailed links are built from it.

## Schema changes

Edit `drizzle/schema.ts`, run `pnpm db:generate` to write a new migration into
`drizzle/migrations/`, then apply it with `pnpm db:migrate:local` / `pnpm db:migrate:remote`.
After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen` to refresh `worker-configuration.d.ts`.
