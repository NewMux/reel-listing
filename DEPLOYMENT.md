# Deploying reel-listing

Production is Vercel (project `reel-listing`, domain `reel-listing.com`) in front
of Supabase project `paqujnerwrowtvzxmhiq`. Generation is fal.ai. Rate limiting
is Upstash Redis.

---

## Before taking real users: the blocking list

1. **Apply `drizzle/0010_lock_down_public_access.sql`.** Until this runs, the
   Supabase anon key, which ships in the browser bundle, can read every user row
   and every project through PostgREST, and can raise any account's credit
   balance. Nothing else on this list matters as much.
2. **Apply `drizzle/0011_credit_ledger_and_render_lock.sql`.** New accounts keep
   getting free renders until it does.
3. **Upgrade Vercel to Pro.** The project is on Hobby, whose terms prohibit
   commercial use. Taking payment on Hobby risks suspension.
4. **Set a spend limit and a spend alert on the fal.ai account.** This is the
   backstop behind every credit check in the code.
5. **Verify the storage bucket is private** and has a size and MIME allowlist
   (below).
6. **Turn on leaked-password protection** in Supabase Auth.
7. **Run a restore drill** (below).

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
| `OWNER_OPEN_ID` | Recommended | The account promoted to `admin`, which is what `admin.grantCredits` requires. |
| `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` | No | Manus OAuth. Leave unset when using Supabase Auth. |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | No | Legacy Forge storage. Leave unset; Supabase Storage is the path in use. |

**Rate limiting is not optional.** Every spend-bearing endpoint fails **closed**
when Upstash is unreachable, so missing Upstash credentials mean customers
cannot render. That is deliberate: the alternative is an uncapped fal.ai bill.

---

## Database migrations

`drizzle/meta/_journal.json` is stale: it records three MySQL-dialect entries
while migrations `0003` through `0011` are hand-written Postgres SQL. **Do not
run `pnpm db:push`** (`drizzle-kit generate && drizzle-kit migrate`) against
production; it will not line up with what is actually applied.

Apply migrations in numeric order through the Supabase SQL editor, then confirm:

```sql
-- Expect rowsecurity = true for users, video_projects, contact_messages,
-- billing_accounts and credit_ledger.
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- Expect zero rows. Any row here means PostgREST can still reach that table.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated');
```

`0011` creates `billing_accounts` and `credit_ledger` with `IF NOT EXISTS`
because both already exist in production from earlier work whose shape could not
be read from here. It adds missing columns but cannot change the type of a column
that already exists with a different one. After applying it, check:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('billing_accounts', 'credit_ledger')
order by table_name, ordinal_position;
```

against `drizzle/schema.ts`, and reconcile by hand if anything differs.

---

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
  reason: "Starter plan, invoice 2026-014",
  idempotencyKey: "invoice-2026-014",
})
```

Requires an account whose `role` is `admin`, which is set from `OWNER_OPEN_ID`
at first sign-in. `idempotencyKey` must be unique per grant; re-sending the same
key returns the original balance instead of granting twice.

One clip credit is one photo. A ten-photo reel costs ten.

---

## Backups and restore

Supabase Pro takes daily backups. They are worth nothing until a restore has
been done at least once:

1. Restore the latest backup into a new Supabase project.
2. Point a local build at it with `DATABASE_URL`.
3. Sign in, list projects, and confirm credit balances match the ledger:

```sql
select u.id, u."clipCreditsRemaining", coalesce(sum(l.delta), 0) as ledger_total
from users u left join credit_ledger l on l."userId" = u.id
group by u.id, u."clipCreditsRemaining"
having u."clipCreditsRemaining" <> coalesce(sum(l.delta), 0);
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
Migrations are forward-only: `0010` and `0011` are safe to leave applied when
rolling application code back, with one exception -- `0011` drops
`users.videosRemaining`, so any build older than these commits will not start
against the migrated database. Roll back to a commit from this work or later.
