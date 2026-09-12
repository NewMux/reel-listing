# Deploying reel-listing on Hetzner + Coolify

Everything self-hosted on one box: Coolify, Supabase (Postgres + Auth + Storage), and the
app container. Only fal.ai and Paddle are external, because they have to be.

---

## 0. Before you start: what can and cannot go live today

**Paddle cannot take real money on day one.** A new seller account needs identity
verification, and domain approval takes up to 5–7 business days when it goes to manual
review. Bahrain is a supported seller country, so NewMux being a Manama entity is not a
blocker — only the calendar is.

Sandbox needs no approval. Build and test the whole flow there; going live is a
configuration change, not a code change (see §7).

---

## 1. Server

A **CPX31** (4 vCPU / 8 GB / 160 GB) is the right size. The Supabase stack alone wants
~4 GB. The app container is light: video generation runs on fal.ai and final assembly runs
in the customer's browser via ffmpeg.wasm, so the box is mostly idling.

```bash
# Ubuntu 24.04, as root
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Point DNS at the server before requesting certificates:

| Record | Value |
|---|---|
| `A  @` | server IP |
| `A  supabase` | server IP |

---

## 2. Supabase

Coolify → **New Resource → Service → Supabase**. Deploy it, set its domain to
`https://supabase.your-domain.com`, and record the generated `ANON_KEY`, `SERVICE_ROLE_KEY`
and Postgres password.

Get these right the first time — the Supabase template is the most involved service Coolify
ships, and changing the JWT secret or database credentials afterwards means surgery.

In Supabase Studio → Authentication → URL Configuration, set the site URL to
`https://your-domain.com` and add `https://your-domain.com/reset-password` as a redirect
URL, or password reset links will bounce.

---

## 3. Schema

Do **not** run `pnpm db:push`. `drizzle/meta/_journal.json` is stale — it still claims
dialect `mysql` and lists only `0000`–`0002` while `drizzle/` holds twelve Postgres files —
so drizzle-kit would generate a bogus diff. Use the runner instead:

```bash
DATABASE_URL=postgres://... pnpm db:migrate --dry-run   # see what would run
DATABASE_URL=postgres://... pnpm db:migrate
```

It applies each `drizzle/*.sql` once, in filename order, inside a transaction, tracking
what it has run in a `_migrations` table. That tracking is required rather than tidy:
`0004_reel_media_storage.sql` uses bare `create policy` with no `if not exists`, so
re-running it errors.

**Against the existing managed Supabase project only**, where `0000`–`0009` were applied by
hand, baseline first so they are not re-run:

```bash
DATABASE_URL=<old-supabase-url> pnpm db:migrate --baseline
DATABASE_URL=<old-supabase-url> pnpm db:migrate      # applies 0010 and 0011
```

---

## 4. Moving existing data

Skip this if you are starting clean.

```bash
# Schema + data. auth.users and auth.identities carry the bcrypt password hashes, so
# accounts survive the move -- omit them and every customer has to re-register.
pg_dump "$OLD_DATABASE_URL" --schema=public --schema=auth --no-owner --no-privileges -f dump.sql
psql "$NEW_DATABASE_URL" -f dump.sql
```

Then copy the `reel-listing-media` bucket's objects across (Supabase Studio's storage
browser, or the S3-compatible API). `0011_storage_bucket.sql` creates the bucket itself;
`0004` supplies its four RLS policies. Verify one signed-URL read before you cut DNS —
storage failures are invisible until someone opens a project.

---

## 5. The app

Coolify → **New Resource → Application → Public/Private Repository**, branch
`claude/epic-lamport-myc4tp`, build pack **Dockerfile**, port **3000**, health check path
**`/healthz`**.

### Build variables (not environment variables)

Vite inlines these at build time. Setting them as runtime environment variables does
nothing — the bundle is already compiled.

```
VITE_SUPABASE_URL=https://supabase.your-domain.com
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_PADDLE_CLIENT_TOKEN=<test_... client token, NOT the API key>
VITE_PADDLE_ENVIRONMENT=sandbox
```

### Runtime environment variables

See `.env.example` for the annotated list. The ones that will bite you:

- **`PUBLIC_URL`** — must be your real domain. It is read at module load to build the
  fal.ai render callback, and defaults to `https://reel-listing.com`. Leave it unset and
  every render job registers its webhook against the old domain, so renders submit fine and
  then never advance.
- **`DATABASE_URL`** — the self-hosted Postgres.
- **`FAL_KEY`**, **`SUPABASE_URL`**, **`SUPABASE_ANON_KEY`**.
- **Paddle**: `PADDLE_ENVIRONMENT`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, and one
  `PADDLE_PRICE_*` per plan and pack.

Leave `BUILT_IN_FORGE_*` and `OAUTH_SERVER_URL` unset. They are Manus-platform integrations;
with them absent, storage uses Supabase Storage and auth uses Supabase, which is the path
the app already runs on.

---

## 6. Paddle

1. Create a **sandbox** account. Create one product per plan with a **monthly recurring**
   price in **USD**, and one product for the credit pack with a **one-time** price.
   Copy each `pri_...` into the matching `PADDLE_PRICE_*`.
2. Paddle → Notifications → **New destination**, URL
   `https://your-domain.com/api/webhooks/paddle`. Subscribe to:
   `subscription.activated`, `subscription.updated`, `subscription.canceled`,
   `subscription.past_due`, `subscription.paused`, `subscription.resumed`,
   `transaction.completed`.
   Copy that destination's secret into `PADDLE_WEBHOOK_SECRET` — each destination has its
   own, and it is not the API key.
3. Send a test notification. A signed delivery that we cannot map to an account returns
   200 and is recorded unlinked; a bad signature returns 400; a processing failure returns
   500 so Paddle retries.

### Sandbox → live

Sandbox and live are entirely separate Paddle accounts. Going live replaces the API key,
the client token, the webhook secret **and every price ID** — it is a whole set of values,
not one flag. The server refuses to boot if `PADDLE_ENVIRONMENT=production` is paired with
a sandbox-looking API key, because a sandbox key in production fails by silently taking no
money.

Before Paddle will approve the account it reviews your public pages: pricing, terms, refund
policy, and contact details must all be reachable and consistent with what you charge.

---

## 7. Verify

```bash
curl -sS https://your-domain.com/healthz                      # {"ok":true,...}
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST https://your-domain.com/api/webhooks/paddle          # 400 (no signature)
```

Then, in the browser:

1. Sign up. `/billing` shows **1** credit — the one-time trial grant.
2. `/pricing` → a plan → Paddle's test card `4242 4242 4242 4242`.
3. `/billing` reflects the plan allowance, and `billing_events` has a row.
4. Create a project, upload photos, approve. The balance drops by one and
   `credit_ledger` shows both the grant and the spend.
5. Let a render finish — this is what proves `PUBLIC_URL` is right.

---

## Known constraints

- **One container.** `server/uploadSessions.ts` keeps upload chunks in a module-level Map,
  and rate limiting falls back to an in-process window. Both are correct for a single
  replica and wrong behind two without sticky sessions.
- **Renders advance only while a browser tab polls**, or when a fal.ai webhook lands. Close
  the tab before assembly and the clips finish on fal.ai but nothing stitches them. The
  long-running host removes the 10s ceiling that forced this design, so moving assembly
  server-side with native ffmpeg is now possible — it is not done here.
- **Annual plans are not sold.** Entitlements are granted by webhook with no scheduler, so
  an annual price would either dump twelve periods of credit on day one or never reset.
  Selling annual needs a periodic top-up path first.
- `vercel.json` is left in place as a rollback target. It is unused by this deployment.
