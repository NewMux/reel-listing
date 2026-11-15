-- One-off reconciliation applied to the production Supabase database ("Reel-listing",
-- paqujnerwrowtvzxmhiq) on 2026-11-15, in place of 0010_credits_wrapper.sql.
--
-- That database had drifted from drizzle/: it never received 0006 (users.videosRemaining),
-- and an earlier billing design had been applied directly in Supabase (billing_accounts plus a
-- credit_ledger with different columns). 0010 as written would have failed on both. Every
-- table was empty, so there were no balances to convert.
--
-- Nothing is dropped: the old ledger is renamed to credit_ledger_legacy, and billing_accounts
-- is left as it was. The end state matches drizzle/schema.ts.

-- 1. Move the old ledger (and everything named after it) out of the way.
ALTER TABLE "credit_ledger" RENAME TO "credit_ledger_legacy";
ALTER TABLE "credit_ledger_legacy" RENAME CONSTRAINT "credit_ledger_pkey" TO "credit_ledger_legacy_pkey";
ALTER INDEX "credit_ledger_reference_idx" RENAME TO "credit_ledger_legacy_reference_idx";
ALTER INDEX "credit_ledger_account_idx" RENAME TO "credit_ledger_legacy_account_idx";
ALTER INDEX "credit_ledger_project_idx" RENAME TO "credit_ledger_legacy_project_idx";
ALTER SEQUENCE "credit_ledger_id_seq" RENAME TO "credit_ledger_legacy_id_seq";

-- 2. Users: credit balance, plan and Paddle customer. videosRemaining is read by the app's
--    schema (deprecated, kept for the 0010 conversion elsewhere), so it must exist.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "videosRemaining" integer NOT NULL DEFAULT 3;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credits" integer NOT NULL DEFAULT 30;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" varchar(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paddleCustomerId" varchar(64);

-- 3. The ledger the app writes: append-only, unique reference so grants and refunds can't repeat.
CREATE TABLE "credit_ledger" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "delta" integer NOT NULL,
  "reason" varchar(40) NOT NULL,
  "reference" varchar(160) NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "credit_ledger_reference_idx" ON "credit_ledger" ("reference");
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" ("userId");
-- Matches the other tables: no policies, so only the server's database role can read or write.
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;

-- 4. Projects: per-clip prompts and errors, server-side assembly, and the 0008 lookup indexes.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "customPrompts" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "clipErrors" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "assemblyRequestId" varchar(80);
CREATE INDEX IF NOT EXISTS "video_projects_assembly_request_idx" ON "video_projects" ("assemblyRequestId");
CREATE INDEX IF NOT EXISTS "video_projects_prompt_request_ids_gin_idx" ON "video_projects" USING gin ("promptRequestIds");
CREATE INDEX IF NOT EXISTS "video_projects_fal_request_ids_gin_idx" ON "video_projects" USING gin ("falRequestIds");
