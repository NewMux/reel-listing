-- Every Paddle renewal, upgrade, pause and cancellation webhook finds the account by its
-- subscription id, so that lookup needs an index rather than a sequential scan. Unique
-- because one Paddle subscription belongs to exactly one billing account.
CREATE UNIQUE INDEX IF NOT EXISTS "billing_accounts_subscription_idx"
  ON "billing_accounts" ("externalSubscriptionId")
  WHERE "externalSubscriptionId" IS NOT NULL;
