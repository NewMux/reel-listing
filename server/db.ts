import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { billingAccounts, contactMessages, creditLedger, CreditEntryType, InsertContactMessage, InsertUser, InsertVideoProject, users, videoProjects } from "../drizzle/schema";
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

type CreditMovement = {
  userId: number;
  /** Signed, in clips: negative to reserve or consume, positive to grant or release. */
  amount: number;
  entryType: CreditEntryType;
  /**
   * Unique across the whole ledger, and the thing that makes a movement idempotent. Shaped
   * `kind:scope:id`, matching the rows already in this table (e.g. `trial:user:114`). A retry
   * collides on the unique index and moves nothing.
   */
  referenceId: string;
  description?: string | null;
  projectId?: number | null;
  metadata?: Record<string, unknown> | null;
};

/** Reads a user's billing account, creating the default trial row the first time. */
export async function ensureBillingAccount(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  // Let the column defaults supply plan and status: they are database enums, and naming
  // labels here is how you end up passing one the type does not have.
  await db.insert(billingAccounts).values({ userId }).onConflictDoNothing({ target: billingAccounts.userId });
  const result = await db.select().from(billingAccounts).where(eq(billingAccounts.userId, userId)).limit(1);
  return result[0];
}

/**
 * Moves clip credits and records why, in one transaction.
 *
 * `billing_accounts.creditBalance` is the materialised balance, so a reservation stays a
 * single conditional UPDATE (`... WHERE creditBalance >= n`). That is what makes overselling
 * impossible under concurrency: two racing reservations hit the same row, and the second
 * matches no rows once the first has drawn the balance down. The ledger row written beside it
 * is the audit trail.
 *
 * Returns the new balance, or null when the movement was refused for want of credit.
 */
export async function moveCredits(movement: CreditMovement): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  const { userId, amount, entryType, referenceId, description = null, projectId = null, metadata = null } = movement;
  if (!Number.isSafeInteger(amount) || amount === 0) throw new Error("A credit movement must be a non-zero whole number.");

  const account = await ensureBillingAccount(userId);
  if (!account) throw new Error("Account storage is temporarily unavailable.");

  return db.transaction(async tx => {
    const seen = await tx
      .select({ balanceAfter: creditLedger.balanceAfter })
      .from(creditLedger)
      .where(eq(creditLedger.referenceId, referenceId))
      .limit(1);
    // Already applied. Return the balance it produced rather than applying it twice.
    if (seen[0]) return seen[0].balanceAfter;

    const updated = await tx
      .update(billingAccounts)
      .set({ creditBalance: sql`${billingAccounts.creditBalance} + ${amount}`, updatedAt: new Date() })
      // Only a debit can be refused; a grant or release always applies.
      .where(amount < 0
        ? and(eq(billingAccounts.id, account.id), gte(billingAccounts.creditBalance, -amount))
        : eq(billingAccounts.id, account.id))
      .returning({ creditBalance: billingAccounts.creditBalance });

    const balanceAfter = updated[0]?.creditBalance;
    if (balanceAfter === undefined) return null;

    await tx.insert(creditLedger).values({
      billingAccountId: account.id,
      userId,
      projectId,
      entryType,
      amount,
      balanceAfter,
      referenceId,
      description,
      metadata,
    });
    return balanceAfter;
  });
}

/** Current clip-credit balance, or 0 when the account cannot be read. */
export async function getClipCredits(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ creditBalance: billingAccounts.creditBalance }).from(billingAccounts).where(eq(billingAccounts.userId, userId)).limit(1);
  return result[0]?.creditBalance ?? 0;
}

/** The account's credit history, newest first, for the billing panel. */
export async function listCreditLedger(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(desc(creditLedger.createdAt)).limit(limit);
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

/** Atomically decrements the user's virtual-staging credit balance./** Atomically decrements the user's virtual-staging credit balance. Returns the new count, or null if they have none left. */
export async function decrementStagingCredits(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  const result = await db
    .update(users)
    .set({ stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} - 1` })
    .where(and(eq(users.id, userId), gte(users.stagingCreditsRemaining, 1)))
    .returning({ stagingCreditsRemaining: users.stagingCreditsRemaining });
  return result[0]?.stagingCreditsRemaining ?? null;
}

/** Refunds one staging credit, used when a staging attempt fails after the credit was already spent. */
export async function incrementStagingCredits(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} + 1` }).where(eq(users.id, userId));
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
  updates: Partial<Pick<InsertVideoProject, "status" | "revisionNotes" | "finalVideoUrl" | "promptRequestIds" | "generatedPrompts" | "shotAnalysis" | "customCameraMoves" | "clipDurations" | "falRequestIds" | "clipUrls" | "renderProgress" | "renderPhase" | "renderError" | "mediaUrls" | "mediaKeys" | "mediaNames" | "mediaTypes" | "creditsSpent" | "renderLockedAt" | "shareToken" | "reelStyle">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Project storage is temporarily unavailable.");
  await db
    .update(videoProjects)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(videoProjects.userId, userId), eq(videoProjects.id, projectId)));
  return getVideoProject(userId, projectId);
}

/**
 * How long a render lock is honoured before another caller may take it over. A submission
 * runs inside a 10s function budget, so anything still holding the lock a few minutes later
 * died mid-flight and must not block the project forever.
 */
const RENDER_LOCK_TTL_MS = 5 * 60 * 1000;

/**
 * Tries to take this project's render lock. Returns true only for the caller that won it.
 *
 * This is the guard that stops duplicate fal.ai billing: submitting ten clips costs real
 * money, and the status endpoint used to submit them straight from a polled query, so two
 * overlapping polls -- or simply two browser tabs open on the same project -- could each
 * submit a full set. The conditional UPDATE means exactly one caller sees a row come back.
 */
export async function claimRenderLock(userId: number, projectId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Project storage is temporarily unavailable.");
  const staleBefore = new Date(Date.now() - RENDER_LOCK_TTL_MS);
  const result = await db
    .update(videoProjects)
    .set({ renderLockedAt: new Date() })
    .where(and(
      eq(videoProjects.userId, userId),
      eq(videoProjects.id, projectId),
      or(isNull(videoProjects.renderLockedAt), lt(videoProjects.renderLockedAt, staleBefore)),
    ))
    .returning({ id: videoProjects.id });
  return result.length > 0;
}

export async function releaseRenderLock(userId: number, projectId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(videoProjects)
    .set({ renderLockedAt: null })
    .where(and(eq(videoProjects.userId, userId), eq(videoProjects.id, projectId)));
}

/** Looks up a project by its public share token. Used by the signed-out share page only. */
export async function getVideoProjectByShareToken(shareToken: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videoProjects).where(eq(videoProjects.shareToken, shareToken)).limit(1);
  return result[0];
}
