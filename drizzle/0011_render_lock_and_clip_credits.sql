-- Per-project render bookkeeping, and the switch from video-denominated to
-- clip-denominated credits.
--
-- This migration deliberately does NOT create billing_accounts or credit_ledger. Both
-- already exist in the production database with a fuller design than the application was
-- ever wired to -- billingAccountId, an entryType enum carrying reservation/consumption/
-- release, a UNIQUE referenceId that serves as the idempotency key, and creditBalance as the
-- materialised balance. An earlier draft of this file tried to add its own parallel columns
-- to those tables, which would have left the original NOT NULL columns unsatisfied and made
-- every credit movement throw at runtime. The code now adopts the existing schema instead.

-- `creditsSpent` records exactly what a project reserved so a release returns that amount
-- rather than a guessed one. `renderLockedAt` is the idempotency guard that stops two
-- concurrent callers from each submitting a full set of paid fal.ai jobs. `shareToken`
-- backs the public /s/:token page.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "creditsSpent" integer DEFAULT 0 NOT NULL;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "renderLockedAt" timestamp with time zone;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "shareToken" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "video_projects_share_token_idx" ON "video_projects" ("shareToken");

-- Redenominate existing balances from videos to clips.
--
-- Credit was sold as whole videos, but cost is per clip: a one-photo reel costs fal.ai a
-- tenth of what a ten-photo reel costs, and charging both the same credit was the pricing
-- bug this change exists to fix. A held balance converts at the ten-photo reel it was sold
-- as, so nobody loses value. Guarded by the referenceId unique index, so re-running this
-- migration cannot inflate a balance a second time.
INSERT INTO "credit_ledger" ("billingAccountId", "userId", "entryType", "amount", "balanceAfter", "referenceId", "description")
SELECT b."id", b."userId", 'adjustment', b."creditBalance" * 9, b."creditBalance" * 10,
       'redenominate:v1:account:' || b."id",
       'Redenominated from video credits to clip credits at 10 clips per reel'
FROM "billing_accounts" b
WHERE b."creditBalance" > 0
ON CONFLICT ("referenceId") DO NOTHING;

UPDATE "billing_accounts" b
SET "creditBalance" = b."creditBalance" * 10, "updatedAt" = now()
WHERE b."creditBalance" > 0
  AND EXISTS (
    SELECT 1 FROM "credit_ledger" l
    WHERE l."referenceId" = 'redenominate:v1:account:' || b."id"
      AND l."balanceAfter" = b."creditBalance" * 10
  );
