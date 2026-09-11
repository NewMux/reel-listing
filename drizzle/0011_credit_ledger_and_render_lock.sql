-- Credits, billing accounts, idempotent rendering, and real share links.

-- 1. Credits are now counted in CLIPS, not in whole videos.
-- A one-photo reel costs fal.ai a tenth of what a ten-photo reel costs, but the old
-- `videosRemaining` counter charged both the same. Existing balances convert at the
-- ten-clip reel they were sold as.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clipCreditsRemaining" integer DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'videosRemaining'
  ) THEN
    EXECUTE 'UPDATE "users" SET "clipCreditsRemaining" = GREATEST("videosRemaining", 0) * 10 WHERE "clipCreditsRemaining" = 0';
    EXECUTE 'ALTER TABLE "users" DROP COLUMN "videosRemaining"';
  END IF;
END
$$;

-- New accounts start at zero. A render costs real money, so it must follow a payment or an
-- explicit grant, never a signup.
ALTER TABLE "users" ALTER COLUMN "clipCreditsRemaining" SET DEFAULT 0;
ALTER TABLE "users" ALTER COLUMN "stagingCreditsRemaining" SET DEFAULT 0;

-- 2. Per-project render bookkeeping.
-- `creditsSpent` records exactly what a project consumed so a refund returns that amount
-- rather than a guessed one. `renderLockedAt` is the idempotency guard that stops two
-- concurrent status polls from each submitting a full set of paid fal.ai jobs.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "creditsSpent" integer DEFAULT 0 NOT NULL;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "renderLockedAt" timestamp with time zone;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "shareToken" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "video_projects_share_token_idx" ON "video_projects" ("shareToken");

-- 3. Billing accounts. One row per user, holding the plan they are on and the identifier
-- a payment gateway will later key off. No gateway is wired yet; credits are granted by an
-- admin, and this table is the seam that a gateway webhook will write to.
CREATE TABLE IF NOT EXISTS "billing_accounts" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "plan" varchar(64) DEFAULT 'none' NOT NULL,
  "status" varchar(32) DEFAULT 'inactive' NOT NULL,
  "externalCustomerId" varchar(160),
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "billing_accounts" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "billing_accounts" ADD COLUMN IF NOT EXISTS "plan" varchar(64) DEFAULT 'none' NOT NULL;
ALTER TABLE "billing_accounts" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'inactive' NOT NULL;
ALTER TABLE "billing_accounts" ADD COLUMN IF NOT EXISTS "externalCustomerId" varchar(160);
ALTER TABLE "billing_accounts" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "billing_accounts" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_accounts_user_idx" ON "billing_accounts" ("userId");

-- 4. Credit ledger. Every movement of credit is a row: grants, spends, refunds, corrections.
-- `clipCreditsRemaining` stays the materialised balance so the oversell guard can remain a
-- single atomic conditional UPDATE, and this table is the audit trail that explains it.
-- `idempotencyKey` makes a retried grant or spend a no-op instead of a double charge.
CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "delta" integer NOT NULL,
  "kind" varchar(32) NOT NULL,
  "reason" text,
  "projectId" integer,
  "idempotencyKey" varchar(160),
  "balanceAfter" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "delta" integer;
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "kind" varchar(32);
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "projectId" integer;
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(160);
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "balanceAfter" integer;
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx" ON "credit_ledger" ("userId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_idempotency_idx" ON "credit_ledger" ("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- 5. Neither billing table is ever reached through PostgREST, same as migration 0010.
REVOKE ALL ON TABLE "billing_accounts" FROM anon, authenticated;
REVOKE ALL ON TABLE "credit_ledger" FROM anon, authenticated;
ALTER TABLE "billing_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;
