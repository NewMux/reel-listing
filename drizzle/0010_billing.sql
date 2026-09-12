-- Paddle billing: customer linkage, subscriptions, webhook audit, and a credit ledger.
--
-- Applied out-of-band by scripts/migrate.mjs, like 0003-0009. Do NOT run `pnpm db:push`
-- against this project: drizzle/meta/_journal.json is stale (it still claims dialect
-- "mysql" and lists only 0000-0002), so drizzle-kit would generate a bogus diff.

-- Two credit buckets, because we sell two things into one balance.
--
--   videosRemaining              -- permanent. One-time packs and grandfathered signup
--                                   credit. Never reset, never expires.
--   subscriptionVideosRemaining  -- perishable. Reset to the plan allowance at the start
--                                   of every billing period.
--
-- A single column cannot hold both: a renewal that SETs the balance would silently delete
-- a pack the customer had already paid for. Spending drains the perishable bucket first.
alter table "users" add column if not exists "subscriptionVideosRemaining" integer default 0 not null;
alter table "users" add column if not exists "subscriptionStagingRemaining" integer default 0 not null;
alter table "users" add column if not exists "paddleCustomerId" varchar(64);
-- Set after a chargeback. Blocks spending without deleting the account.
alter table "users" add column if not exists "billingBlocked" boolean default false not null;
-- Marks the one-time trial grant so it is issued exactly once per account.
alter table "users" add column if not exists "trialGrantedAt" timestamp with time zone;

-- Every signup used to receive 3 free videos from this default -- roughly $33 of fal.ai
-- spend given away with no card on file. New accounts now start empty and receive an
-- explicit, ledgered trial grant instead. ALTER DEFAULT is future-only, so existing
-- accounts keep the credits they already have.
alter table "users" alter column "videosRemaining" set default 0;

create unique index if not exists "users_paddle_customer_idx" on "users" ("paddleCustomerId");

create table if not exists "subscriptions" (
  "id" serial primary key,
  "userId" integer not null,
  "paddleSubscriptionId" varchar(64) not null,
  "paddleCustomerId" varchar(64),
  "planId" varchar(32) not null,
  "status" varchar(32) not null,
  "currentPeriodStart" timestamp with time zone,
  "currentPeriodEnd" timestamp with time zone,
  -- The billing period we last granted credit for. This -- not the webhook event id -- is
  -- what makes granting idempotent: a new subscription fires subscription.activated AND
  -- transaction.completed as two distinct events, and both describe the same period.
  -- Granting per event would hand out the allowance twice on every single signup.
  "lastGrantedPeriodStart" timestamp with time zone,
  "cancelAtPeriodEnd" boolean default false not null,
  -- Paddle does not guarantee delivery order; a stale subscription.updated is dropped.
  "occurredAt" timestamp with time zone,
  "createdAt" timestamp with time zone default now() not null,
  "updatedAt" timestamp with time zone default now() not null
);

create unique index if not exists "subscriptions_paddle_id_idx" on "subscriptions" ("paddleSubscriptionId");
create index if not exists "subscriptions_user_idx" on "subscriptions" ("userId");

-- Webhook audit trail. The unique event id stops a redelivery from being processed twice;
-- period-level idempotency is handled by subscriptions.lastGrantedPeriodStart above.
create table if not exists "billing_events" (
  "id" serial primary key,
  "paddleEventId" varchar(64) not null,
  "eventType" varchar(64) not null,
  "userId" integer,
  "payload" jsonb,
  "occurredAt" timestamp with time zone,
  "receivedAt" timestamp with time zone default now() not null
);

create unique index if not exists "billing_events_event_id_idx" on "billing_events" ("paddleEventId");
create index if not exists "billing_events_user_idx" on "billing_events" ("userId");

-- Append-only. The users counters remain the authoritative balance; this explains how a
-- balance came to be what it is, which is the difference between a five-minute answer and
-- a refund when a customer disputes their credit count.
create table if not exists "credit_ledger" (
  "id" serial primary key,
  "userId" integer not null,
  "creditType" varchar(16) not null,
  "bucket" varchar(16) not null,
  "delta" integer not null,
  "kind" varchar(32) not null,
  "reason" text,
  "refId" varchar(64),
  "createdAt" timestamp with time zone default now() not null
);

create index if not exists "credit_ledger_user_idx" on "credit_ledger" ("userId");
create index if not exists "credit_ledger_ref_idx" on "credit_ledger" ("refId");
