-- P0 security fix.
--
-- `public.users` and `public.video_projects` were reachable through PostgREST by the
-- `anon` and `authenticated` roles with RLS disabled, and this app publishes its Supabase
-- anon key in the browser bundle (client/src/lib/supabase.ts). Anyone who loaded the site
-- could therefore read every customer email and every project row, and could raise their
-- own render quota with a single UPDATE.
--
-- This app never talks to PostgREST. Every read and write goes through the server's own
-- postgres connection (server/db.ts, DATABASE_URL). That role owns these tables, does not
-- force RLS on itself, and carries rolbypassrls, so neither the REVOKEs nor the RLS below
-- affect it -- verified against the production database. The correct posture is therefore
-- deny-by-default for the API roles: revoke the table privileges outright, and enable RLS
-- with no policies as a second layer in case a privilege is ever re-granted by a future
-- migration or from the Supabase dashboard.
--
-- Every table is guarded by to_regclass. Production is several migrations behind this
-- repository -- contact_messages does not exist there yet -- and the Supabase SQL editor
-- runs a script in a single transaction, so one statement naming an absent table would roll
-- back the entire lockdown and silently leave the hole open.

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'public.users',
    'public.video_projects',
    'public.contact_messages',
    'public.billing_accounts',
    'public.credit_ledger'
  ] LOOP
    IF to_regclass(target) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', target);
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
    ELSE
      RAISE NOTICE 'skipping %, it does not exist in this database', target;
    END IF;
  END LOOP;
END
$$;

-- Stop new tables in `public` from being granted to the API roles by default, so a future
-- migration cannot silently re-open this hole.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated;
