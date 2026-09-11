-- Redenominate credit from per-clip to per-five-seconds-of-video.
--
-- A credit was one clip regardless of length, so a five-second shot cost the same as a
-- ten-second one despite being half the fal.ai spend. That made the short "Bright and quick"
-- style cost the same as the long one for half the compute. One credit is now five seconds,
-- so a ten-second shot is two credits and price tracks what the model bills.
--
-- Existing balances were denominated in ten-second clips, so they double. Guarded by the
-- referenceId unique index: re-running this cannot inflate a balance twice.
INSERT INTO "credit_ledger" ("billingAccountId", "userId", "entryType", "amount", "balanceAfter", "referenceId", "description")
SELECT b."id", b."userId", 'adjustment', b."creditBalance", b."creditBalance" * 2,
       'redenominate:v2:account:' || b."id",
       'Redenominated to five-second credits; a ten-second shot is now two credits'
FROM "billing_accounts" b
WHERE b."creditBalance" > 0
ON CONFLICT ("referenceId") DO NOTHING;

UPDATE "billing_accounts" b
SET "creditBalance" = b."creditBalance" * 2, "updatedAt" = now()
WHERE b."creditBalance" > 0
  AND EXISTS (
    SELECT 1 FROM "credit_ledger" l
    WHERE l."referenceId" = 'redenominate:v2:account:' || b."id"
      AND l."balanceAfter" = b."creditBalance" * 2
  );
