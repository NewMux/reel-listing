# Deploying reel-listing

Production is Vercel (project `reel-listing`, domain `reel-listing.com`) in front
of Supabase project `paqujnerwrowtvzxmhiq`. Generation is fal.ai. Rate limiting
is Upstash Redis.

---

## Before taking real users: the blocking list

1. ~~Apply `drizzle/0010_lock_down_public_access.sql`.~~ **Done.** RLS is on and the
   `anon` / `authenticated` grants are revoked on every table. Re-verify with the queries
   below after any schema change.
2. ~~Apply `0012` then `0011`.~~ **Done.** Schema reconciled, render lock and share tokens
   added, balances redenominated from videos to clips.
3. **Upgrade Supabase off the Free plan.** The project auto-paused during this work, which
   takes the whole site down: every database call times out and the security advisor returns
   an empty result that looks like a clean bill of health. Free projects pause after about a
   week of inactivity.
4. **Upgrade Vercel to Pro.** The project is on Hobby, whose terms prohibit
   commercial use. Taking payment on Hobby risks suspension.
5. **Set a spend limit and a spend alert on the fal.ai account.** This is the
   backstop behind every credit check in the code.
6. **Verify the storage bucket is private** and has a size and MIME allowlist
   (below).
7. **Turn on leaked-password protection** in Supabase Auth. Still the only outstanding
   security-advisor finding.
8. **Run a restore drill** (below).

---

## Environment variables

Set on the Vercel project, for Production and Preview both.

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Postgres connection string. This connection owns the tables and is unaffected by the RLS lockdown. |
| `SUPABASE_URL` | Yes | Supabase project URL, server side. |
| `SUPABASE_ANON_KEY` | Yes | Used only to verify a caller's access token and to sign storage URLs as that caller. |
| `VITE_SUPABASE_URL` | Yes | Same URL, exposed to the browser bundle. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public by design. Safe only because RLS and the grants deny it everything. |
| `FAL_KEY` | Yes | fal.ai credentials. Never expose to the client. |
| `JWT_SECRET` | Yes | Signs the session cookie on the OAuth path. |
| `PUBLIC_URL` | Yes | Stable public origin, e.g. `https://reel-listing.com`. fal.ai webhook callbacks are built from this, so it must not be a per-deployment URL. |
| `UPSTASH_REDIS_REST_URL` | Yes | Rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Rate limiting. |
| `OWNER_OPEN_ID` | Recommended | The account promoted to `admin`, which is what `admin.grantCredits` requires. Set it before first sign-in; the role is assigned at upsert. |
| `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` | No | Manus OAuth. Leave unset when using Supabase Auth. |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | No | Legacy Forge storage. Leave unset; Supabase Storage is the path in use. |

**Rate limiting is not optional.** Every spend-bearing endpoint fails **closed**
when Upstash is unreachable, so missing Upstash credentials mean customers
cannot render. That is deliberate: the alternative is an uncapped fal.ai bill.

---

## Database migrations

`drizzle/meta/_journal.json` is stale: it records three MySQL-dialect entries while
migrations `0003` through `0012` are hand-written Postgres SQL. **Do not run `pnpm db:push`**
(`drizzle-kit generate && drizzle-kit migrate`) against production; it will not line up with
what is actually applied.

Apply migrations in numeric order through the Supabase SQL editor. Note that the editor runs
a whole script in **one transaction**, so a single statement naming a table that does not
exist rolls the entire script back. `0010` is written defensively for exactly this reason.

### Production was four migrations behind, and that broke the site

When this work started, the live database was missing `0005`, `0006`, `0007` and `0009`. It
was not a cosmetic gap. Drizzle selects an explicit column list, so `getUserByOpenId` asked
for `users.videosRemaining`, which did not exist; that threw on every request, `createContext`
caught it as `authUnavailable`, and **every signed-in user saw "We could not load your
account"**. The contact form inserted into a table that had never been created. `0012`
reconciles all of it.

The lesson to carry forward: check the database against `drizzle/schema.ts` before assuming a
deploy is healthy. This query names any column the code expects and the database lacks:

```sql
select 'users' as t, c.column_name from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'users';
```

Compare against `drizzle/schema.ts` by hand, or simply run one `select` naming every declared
column -- if it succeeds, the table matches.

### The billing tables predate this repository

`billing_accounts` and `credit_ledger` exist in production but in no migration here. They were
introduced by earlier work and the application was never wired to them. Their design is good
and `drizzle/schema.ts` now matches it exactly:

- `billing_accounts.creditBalance` is the **single source of truth** for spendable credit,
  denominated in clips. There is deliberately no second counter on `users`.
- `credit_ledger.referenceId` carries a **UNIQUE index** and is the idempotency key. Every
  movement supplies one, shaped `kind:scope:id` (e.g. `purchase:invoice-2026-014`).
- `credit_entry_type` is a database enum. Rendering uses `reservation` when a render is
  approved and `release` if it never started. `purchase` is what an admin grant writes.
- `billing_plan` is a database enum: `trial`, `solo`, `pro`, `agency`, `enterprise`. The
  Pricing page's plan names match these deliberately.

Verify after applying:

```sql
-- Expect rowsecurity = true, and zero rows from the grants query.
select tablename, rowsecurity from pg_tables where schemaname = 'public';

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated');

-- Expect zero rows: every balance must equal the sum of its ledger.
select b.id from billing_accounts b
join credit_ledger l on l."billingAccountId" = b.id
group by b.id, b."creditBalance" having b."creditBalance" <> sum(l.amount);
```

## Supabase Storage

Bucket `reel-listing-media`. It holds source photos, per-clip renders, and
finished reels, all under `property-projects/<userId>/`.

- **Private.** Never public. Every URL the app hands out is signed with a
  one-hour TTL.
- **RLS policy on `storage.objects`** must confine a user to their own prefix.
  Without it, one signed-in customer can sign another's media:

```sql
create policy "own prefix only" on storage.objects
  for all to authenticated
  using (bucket_id = 'reel-listing-media' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'reel-listing-media' and (storage.foldername(name))[2] = auth.uid()::text);
```

Adjust the path segment to match how `userId` maps to `auth.uid()` in your data
before applying, and verify with a second test account.

- **Set `file_size_limit`** to about 30 MB and **`allowed_mime_types`** to
  `image/jpeg, image/png, image/webp, video/mp4`. The upload goes straight from
  the browser to storage over a signed PUT, so the bucket is the only place
  content type and size can be enforced server-side.

---

## Granting credits

No payment gateway is wired up. Take payment out of band, then grant:

```
admin.grantCredits({
  email: "agent@example.com",
  clipCredits: 30,
  reason: "Solo plan, invoice 2026-014",
  referenceId: "invoice-2026-014",
})
```

Requires an account whose `role` is `admin`, which is set from `OWNER_OPEN_ID`
at first sign-in. `referenceId` must be unique per grant; re-sending the same one
returns the original balance instead of granting twice. It lands in the ledger as
a `purchase` entry.

One clip credit is one photo. A ten-photo reel costs ten.

---

## Backups and restore

Supabase Pro takes daily backups. They are worth nothing until a restore has
been done at least once:

1. Restore the latest backup into a new Supabase project.
2. Point a local build at it with `DATABASE_URL`.
3. Sign in, list projects, and confirm credit balances match the ledger:

```sql
select b.id, b."creditBalance", coalesce(sum(l.amount), 0) as ledger_total
from billing_accounts b left join credit_ledger l on l."billingAccountId" = b.id
group by b.id, b."creditBalance"
having b."creditBalance" <> coalesce(sum(l.amount), 0);
```

Zero rows means the materialised balance and the ledger agree. This same query
is worth running periodically against production.

---

## Monitoring

Not yet built. At minimum, before launch:

- An uptime check against `system.health`.
- A fal.ai spend alert.
- Vercel log drains or an error tracker, so a failed render is noticed without
  someone reading logs.

---

## Rollback

Vercel keeps every deployment; promote a previous one from the dashboard.
Migrations are forward-only and `0010`, `0011` and `0012` are all safe to leave
applied when rolling application code back: none of them drops a column. Older
builds that still expect `users.videosRemaining` were already broken against this
database before this work, so roll back only to a commit from this work or later.
