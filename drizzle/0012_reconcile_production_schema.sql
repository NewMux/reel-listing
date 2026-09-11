-- Bring the database up to what the application code expects.
--
-- Production was found four migrations behind this repository (0005, 0006, 0007, 0009),
-- which is not a cosmetic gap: Drizzle selects an explicit column list, so `getUserByOpenId`
-- asking for a column that does not exist threw on every request, `createContext` caught it
-- as authUnavailable, and every signed-in user saw "We could not load your account". The
-- contact form inserted into a table that was never created, and the Review page's per-shot
-- camera controls read three columns that were never added.
--
-- Everything here is idempotent so it can be run against a database at any point on that
-- range, and so re-running it after a partial failure is safe.

-- From 0005. Restores the contact form.
CREATE TABLE IF NOT EXISTS "contact_messages" (
  "id" serial PRIMARY KEY,
  "name" varchar(160) NOT NULL,
  "email" varchar(320) NOT NULL,
  "message" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- From 0009. Restores per-photo shot analysis and the client's camera/length overrides.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "shotAnalysis" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "customCameraMoves" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "clipDurations" jsonb DEFAULT '[]'::jsonb;

-- From 0007. Virtual-staging credits are still a separate counter from render credits.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stagingCreditsRemaining" integer DEFAULT 0 NOT NULL;

-- Deliberately NOT restoring 0006's `users.videosRemaining`. Render credit lives in
-- `billing_accounts.creditBalance`, which already exists in this database with a ledger
-- behind it. Re-adding the column would recreate the two-sources-of-truth problem.

-- Same lockdown as 0010, for the table this migration just created.
DO $$
BEGIN
  IF to_regclass('public.contact_messages') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "public"."contact_messages" FROM anon, authenticated';
    EXECUTE 'ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;
