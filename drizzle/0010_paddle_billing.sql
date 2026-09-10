DO $$ BEGIN
  CREATE TYPE "subscription_status" AS ENUM ('active', 'trialing', 'past_due', 'paused', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paddleCustomerId" varchar(64) UNIQUE;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL UNIQUE,
  "paddleSubscriptionId" varchar(64) NOT NULL UNIQUE,
  "paddlePriceId" varchar(64) NOT NULL,
  "status" "subscription_status" NOT NULL,
  "currentPeriodEnd" timestamptz,
  "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" ("userId");

CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
  "eventId" varchar(64) PRIMARY KEY,
  "eventType" varchar(64) NOT NULL,
  "processedAt" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processed_webhook_events" ENABLE ROW LEVEL SECURITY;
