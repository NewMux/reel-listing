import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { billingEvents, contactMessages, creditLedger, InsertContactMessage, InsertUser, InsertVideoProject, subscriptions, users, videoProjects } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, {
        prepare: false,
        max: 5,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = {
    openId: user.openId,
    lastSignedIn: new Date(),
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
  };
  const updateSet: Partial<InsertUser> = { lastSignedIn: new Date(), role: values.role };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }

  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.openId,
    set: updateSet,
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export type CreditBucket = "subscription" | "permanent";
/** Which balance a spend came out of, and what is left in it. */
export type SpendResult = { bucket: CreditBucket; remaining: number };

/**
 * Spends one video credit, draining the perishable subscription allowance before the
 * permanent (pack / grandfathered) balance. Returns null when both are empty.
 *
 * Each UPDATE carries its own `> 0` guard, so neither bucket can be driven negative by
 * concurrent requests; the transaction only ensures the pair is consistent with itself.
 */
export async function decrementVideoQuota(userId: number): Promise<SpendResult | null> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  return db.transaction(async tx => {
    const fromSubscription = await tx
      .update(users)
      .set({ subscriptionVideosRemaining: sql`${users.subscriptionVideosRemaining} - 1` })
      .where(and(eq(users.id, userId), eq(users.billingBlocked, false), gt(users.subscriptionVideosRemaining, 0)))
      .returning({ remaining: users.subscriptionVideosRemaining });
    if (fromSubscription[0]) return { bucket: "subscription" as const, remaining: fromSubscription[0].remaining };

    const fromPermanent = await tx
      .update(users)
      .set({ videosRemaining: sql`${users.videosRemaining} - 1` })
      .where(and(eq(users.id, userId), eq(users.billingBlocked, false), gt(users.videosRemaining, 0)))
      .returning({ remaining: users.videosRemaining });
    if (fromPermanent[0]) return { bucket: "permanent" as const, remaining: fromPermanent[0].remaining };

    return null;
  });
}

/** Refunds one video credit to the bucket it was taken from, when a render fails to start. */
export async function incrementVideoQuota(userId: number, bucket: CreditBucket = "permanent"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const column = bucket === "subscription" ? users.subscriptionVideosRemaining : users.videosRemaining;
  const set =
    bucket === "subscription"
      ? { subscriptionVideosRemaining: sql`${column} + 1` }
      : { videosRemaining: sql`${column} + 1` };
  await db.update(users).set(set).where(eq(users.id, userId));
}

/** Spends one staging credit, subscription allowance first. Returns null when both are empty. */
export async function decrementStagingCredits(userId: number): Promise<SpendResult | null> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  return db.transaction(async tx => {
    const fromSubscription = await tx
      .update(users)
      .set({ subscriptionStagingRemaining: sql`${users.subscriptionStagingRemaining} - 1` })
      .where(and(eq(users.id, userId), eq(users.billingBlocked, false), gt(users.subscriptionStagingRemaining, 0)))
      .returning({ remaining: users.subscriptionStagingRemaining });
    if (fromSubscription[0]) return { bucket: "subscription" as const, remaining: fromSubscription[0].remaining };

    const fromPermanent = await tx
      .update(users)
      .set({ stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} - 1` })
      .where(and(eq(users.id, userId), eq(users.billingBlocked, false), gt(users.stagingCreditsRemaining, 0)))
      .returning({ remaining: users.stagingCreditsRemaining });
    if (fromPermanent[0]) return { bucket: "permanent" as const, remaining: fromPermanent[0].remaining };

    return null;
  });
}

/** Refunds one staging credit to the bucket it was taken from. */
export async function incrementStagingCredits(userId: number, bucket: CreditBucket = "permanent"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const set =
    bucket === "subscription"
      ? { subscriptionStagingRemaining: sql`${users.subscriptionStagingRemaining} + 1` }
      : { stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} + 1` };
  await db.update(users).set(set).where(eq(users.id, userId));
}

/** True when the account has at least one video credit in either bucket and is not blocked. */
export async function hasVideoCredit(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  const rows = await db
    .select({
      subscription: users.subscriptionVideosRemaining,
      permanent: users.videosRemaining,
      blocked: users.billingBlocked,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  return !row.blocked && row.subscription + row.permanent > 0;
}

export async function listVideoProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videoProjects).where(eq(videoProjects.userId, userId)).orderBy(desc(videoProjects.createdAt));
}

export async function getVideoProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.userId, userId), eq(videoProjects.id, projectId)))
    .limit(1);
  return result[0];
}

/** Finds the in-progress project a fal.ai request_id belongs to, for webhook-triggered refreshes that have no user session to scope the lookup by. */
export async function getVideoProjectByRequestId(requestId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const idJson = JSON.stringify([requestId]);
  const result = await db
    .select()
    .from(videoProjects)
    .where(
      and(
        eq(videoProjects.status, "Processing"),
        sql`(${videoProjects.promptRequestIds} @> ${idJson}::jsonb OR ${videoProjects.falRequestIds} @> ${idJson}::jsonb)`,
      ),
    )
    .limit(1);
  return result[0];
}

export async function createVideoProject(project: InsertVideoProject) {
  const db = await getDb();
  if (!db) throw new Error("Project storage is temporarily unavailable.");
  const result = await db.insert(videoProjects).values(project).returning({ id: videoProjects.id });
  return result[0].id;
}

export async function insertContactMessage(entry: InsertContactMessage) {
  const db = await getDb();
  if (!db) throw new Error("Contact form is temporarily unavailable.");
  await db.insert(contactMessages).values(entry);
}

export async function updateVideoProject(
  userId: number,
  projectId: number,
  updates: Partial<Pick<InsertVideoProject, "status" | "revisionNotes" | "finalVideoUrl" | "promptRequestIds" | "generatedPrompts" | "shotAnalysis" | "customCameraMoves" | "clipDurations" | "falRequestIds" | "clipUrls" | "renderProgress" | "renderPhase" | "renderError" | "mediaUrls" | "mediaKeys" | "mediaNames" | "mediaTypes">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Project storage is temporarily unavailable.");
  await db
    .update(videoProjects)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(videoProjects.userId, userId), eq(videoProjects.id, projectId)));
  return getVideoProject(userId, projectId);
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function getUserByPaddleCustomerId(paddleCustomerId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.paddleCustomerId, paddleCustomerId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

/** Records the Paddle customer id, so a webhook can find this user even without customData. */
export async function linkPaddleCustomer(userId: number, paddleCustomerId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  await db.update(users).set({ paddleCustomerId, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getSubscriptionsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.updatedAt));
}

/**
 * Issues the one-time trial grant, exactly once per account.
 *
 * `trialGrantedAt` is set in the same guarded UPDATE that adds the credit, so two
 * concurrent first requests cannot both grant it.
 */
export async function grantTrialIfNew(userId: number, videos: number, staging: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const granted = await db
    .update(users)
    .set({
      videosRemaining: sql`${users.videosRemaining} + ${videos}`,
      stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} + ${staging}`,
      trialGrantedAt: new Date(),
    })
    .where(and(eq(users.id, userId), sql`${users.trialGrantedAt} is null`))
    .returning({ id: users.id });
  if (!granted[0]) return false;

  if (videos > 0) {
    await db.insert(creditLedger).values({
      userId,
      creditType: "video",
      bucket: "permanent",
      delta: videos,
      kind: "trial_grant",
      reason: "One-time trial grant on first sign-in",
    });
  }
  return true;
}

export type LedgerEntry = {
  userId: number;
  creditType: "video" | "staging";
  bucket: CreditBucket;
  delta: number;
  kind: string;
  reason?: string | null;
  refId?: string | null;
};

/** Best-effort audit write. A failed ledger insert must never fail the operation it describes. */
export async function recordLedger(entry: LedgerEntry): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(creditLedger).values(entry);
  } catch (error) {
    console.warn("[Billing] ledger write failed:", error);
  }
}

export type BillingIntentRecord = {
  eventId: string;
  eventType: string;
  occurredAt: Date | null;
  payload: unknown;
  userId: number | null;
  /** Present when the event grants a billing period's allowance. */
  period?: {
    subscriptionId: string;
    paddleCustomerId: string | null;
    planId: string;
    status: string;
    periodStart: Date | null;
    periodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    videos: number;
    staging: number;
  };
  /** Present when the event is a one-time pack purchase. */
  pack?: { transactionId: string; packId: string; videos: number; staging: number };
  /** Present when the event only changes subscription status. */
  status?: {
    subscriptionId: string;
    paddleCustomerId: string | null;
    status: string;
    cancelAtPeriodEnd: boolean;
    periodStart: Date | null;
    periodEnd: Date | null;
  };
};

export type ApplyOutcome = "applied" | "duplicate-event" | "duplicate-period" | "recorded-only";

/**
 * Persists a webhook event and whatever it entitles the user to, in ONE transaction.
 *
 * The transaction is the point: recording the event and granting the credit must commit
 * together. Recorded-then-crashed would leave the customer paid and uncredited with the
 * event already marked handled, so Paddle's retry could never repair it.
 *
 * Two independent idempotency guards:
 *   - the unique paddleEventId stops a redelivery of the *same* event, and
 *   - lastGrantedPeriodStart stops a *different* event describing the same period from
 *     granting twice. A new subscription fires both subscription.activated and
 *     transaction.completed; without this the allowance is issued twice on every signup.
 */
export async function applyBillingEvent(record: BillingIntentRecord): Promise<ApplyOutcome> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");

  return db.transaction(async tx => {
    const inserted = await tx
      .insert(billingEvents)
      .values({
        paddleEventId: record.eventId,
        eventType: record.eventType,
        userId: record.userId,
        payload: record.payload as never,
        occurredAt: record.occurredAt,
      })
      .onConflictDoNothing({ target: billingEvents.paddleEventId })
      .returning({ id: billingEvents.id });

    if (!inserted[0]) return "duplicate-event" as const;
    if (record.userId === null) return "recorded-only" as const;
    const userId = record.userId;

    if (record.status) {
      await upsertSubscriptionRow(tx, userId, {
        paddleSubscriptionId: record.status.subscriptionId,
        paddleCustomerId: record.status.paddleCustomerId,
        status: record.status.status,
        cancelAtPeriodEnd: record.status.cancelAtPeriodEnd,
        currentPeriodStart: record.status.periodStart,
        currentPeriodEnd: record.status.periodEnd,
        occurredAt: record.occurredAt,
      });
      return "applied" as const;
    }

    if (record.pack) {
      await tx
        .update(users)
        .set({
          videosRemaining: sql`${users.videosRemaining} + ${record.pack.videos}`,
          stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} + ${record.pack.staging}`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await tx.insert(creditLedger).values({
        userId,
        creditType: "video",
        bucket: "permanent",
        delta: record.pack.videos,
        kind: "pack_purchase",
        reason: `Pack ${record.pack.packId}`,
        refId: record.pack.transactionId,
      });
      return "applied" as const;
    }

    if (record.period) {
      const period = record.period;
      const existing = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.paddleSubscriptionId, period.subscriptionId))
        .limit(1);
      const current = existing[0];

      // Already granted for this exact billing period -- the sibling event beat us here.
      const alreadyGranted =
        current?.lastGrantedPeriodStart &&
        period.periodStart &&
        current.lastGrantedPeriodStart.getTime() === period.periodStart.getTime();

      await upsertSubscriptionRow(tx, userId, {
        paddleSubscriptionId: period.subscriptionId,
        paddleCustomerId: period.paddleCustomerId,
        planId: period.planId,
        status: period.status,
        cancelAtPeriodEnd: period.cancelAtPeriodEnd,
        currentPeriodStart: period.periodStart,
        currentPeriodEnd: period.periodEnd,
        occurredAt: record.occurredAt,
        lastGrantedPeriodStart: alreadyGranted ? current!.lastGrantedPeriodStart : period.periodStart,
      });

      if (alreadyGranted) return "duplicate-period" as const;

      await tx
        .update(users)
        .set({
          // SET, not add: a period allowance is perishable. The permanent bucket, which
          // holds purchased packs, is deliberately not touched here.
          subscriptionVideosRemaining: period.videos,
          subscriptionStagingRemaining: period.staging,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      await tx.insert(creditLedger).values({
        userId,
        creditType: "video",
        bucket: "subscription",
        delta: period.videos,
        kind: "subscription_period",
        reason: `Plan ${period.planId} period starting ${period.periodStart?.toISOString() ?? "unknown"}`,
        refId: period.subscriptionId,
      });
      return "applied" as const;
    }

    return "recorded-only" as const;
  });
}

type SubscriptionUpsert = {
  paddleSubscriptionId: string;
  paddleCustomerId?: string | null;
  planId?: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  occurredAt: Date | null;
  lastGrantedPeriodStart?: Date | null;
};

/**
 * Upserts the local mirror of a Paddle subscription, dropping stale deliveries.
 *
 * Paddle does not guarantee ordering, so an older `subscription.updated` arriving after a
 * newer one would otherwise resurrect a superseded status.
 */
/** The transaction handle drizzle hands to a `db.transaction` callback. */
type Tx = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0];

async function upsertSubscriptionRow(tx: Tx, userId: number, row: SubscriptionUpsert): Promise<void> {
  const existing = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.paddleSubscriptionId, row.paddleSubscriptionId))
    .limit(1);
  const current = existing[0];

  if (!current) {
    await tx.insert(subscriptions).values({
      userId,
      paddleSubscriptionId: row.paddleSubscriptionId,
      paddleCustomerId: row.paddleCustomerId ?? null,
      planId: row.planId ?? "unknown",
      status: row.status,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      lastGrantedPeriodStart: row.lastGrantedPeriodStart ?? null,
      occurredAt: row.occurredAt,
    });
    return;
  }

  const isStale = current.occurredAt && row.occurredAt && row.occurredAt < current.occurredAt;
  if (isStale) {
    // Still record a grant marker if this delivery is what issued the credit.
    if (row.lastGrantedPeriodStart) {
      await tx
        .update(subscriptions)
        .set({ lastGrantedPeriodStart: row.lastGrantedPeriodStart, updatedAt: new Date() })
        .where(eq(subscriptions.id, current.id));
    }
    return;
  }

  await tx
    .update(subscriptions)
    .set({
      userId,
      paddleCustomerId: row.paddleCustomerId ?? current.paddleCustomerId,
      planId: row.planId ?? current.planId,
      status: row.status,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      currentPeriodStart: row.currentPeriodStart ?? current.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd ?? current.currentPeriodEnd,
      lastGrantedPeriodStart: row.lastGrantedPeriodStart ?? current.lastGrantedPeriodStart,
      occurredAt: row.occurredAt ?? current.occurredAt,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, current.id));
}

/** Most recent billing events, for the admin view. */
export async function listRecentBillingEvents(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(billingEvents).orderBy(desc(billingEvents.receivedAt)).limit(limit);
}
