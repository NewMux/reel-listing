-- P0 security fix.
--
-- `public.users` and `public.video_projects` were reachable through PostgREST by the
-- `anon` and `authenticated` roles with RLS disabled, and this app publishes its Supabase
-- anon key in the browser bundle (client/src/lib/supabase.ts). Anyone who loaded the site
-- could therefore read every customer email and every project row, and could raise their
-- own render quota with a single UPDATE.
--
-- This app never talks to PostgREST. Every read and write goes through the server's own
-- postgres connection (server/db.ts, DATABASE_URL), which owns these tables and is not
-- affected by either the REVOKEs or the RLS below. So the correct posture is deny-by-default
-- for the API roles: revoke the table privileges outright, and enable RLS with no policies
-- as a second layer in case a privilege is ever re-granted by a future migration or by the
-- Supabase dashboard.

REVOKE ALL ON TABLE "public"."users" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."video_projects" FROM anon, authenticated;

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."video_projects" ENABLE ROW LEVEL SECURITY;

-- Same treatment for the billing tables. These already exist in the production database
-- with RLS on and no policies; the REVOKE is what actually stops PostgREST reaching them.
DO $$
BEGIN
  IF to_regclass('public.billing_accounts') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "public"."billing_accounts" FROM anon, authenticated';
    EXECUTE 'ALTER TABLE "public"."billing_accounts" ENABLE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public.credit_ledger') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "public"."credit_ledger" FROM anon, authenticated';
    EXECUTE 'ALTER TABLE "public"."credit_ledger" ENABLE ROW LEVEL SECURITY';
  END IF;
END
$$;

-- Stop new tables in `public` from being granted to the API roles by default, so a future
-- migration cannot silently re-open this hole.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated;

-- Contact messages hold names, email addresses, and message bodies. Same rule.
REVOKE ALL ON TABLE "public"."contact_messages" FROM anon, authenticated;
ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;
