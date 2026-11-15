-- Credits (1 credit = 1 second of generated video), per-clip retry state, server-side
-- assembly, and public share links.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credits" integer NOT NULL DEFAULT 30;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" varchar(32);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paddleCustomerId" varchar(64);

CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "delta" integer NOT NULL,
  "reason" varchar(40) NOT NULL,
  "reference" varchar(160) NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_reference_idx" ON "credit_ledger" ("reference");
CREATE INDEX IF NOT EXISTS "credit_ledger_user_idx" ON "credit_ledger" ("userId");

-- Existing accounts keep what they had: each included video becomes 100 credits
-- (10 photos x 10 seconds). Guarded by the ledger's unique reference, so re-running this
-- migration cannot convert a balance twice.
WITH converted AS (
  INSERT INTO "credit_ledger" ("userId", "delta", "reason", "reference")
  SELECT "id", "videosRemaining" * 100 - "credits", 'migration', 'migration:0010:' || "id"
  FROM "users"
  ON CONFLICT ("reference") DO NOTHING
  RETURNING "userId", "delta"
)
UPDATE "users" SET "credits" = "users"."credits" + converted."delta"
FROM converted WHERE "users"."id" = converted."userId";

ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "customPrompts" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "clipErrors" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "assemblyRequestId" varchar(80);
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "renderLockedAt" timestamp with time zone;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "shareToken" varchar(40);
CREATE UNIQUE INDEX IF NOT EXISTS "video_projects_share_token_idx" ON "video_projects" ("shareToken");
CREATE INDEX IF NOT EXISTS "video_projects_assembly_request_idx" ON "video_projects" ("assemblyRequestId");
