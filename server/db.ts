import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { contactMessages, InsertContactMessage, InsertUser, InsertVideoProject, users, videoProjects } from "../drizzle/schema";
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

/** Atomically decrements the user's included-video quota. Returns the new count, or null if they have none left. */
export async function decrementVideoQuota(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  const result = await db
    .update(users)
    .set({ videosRemaining: sql`${users.videosRemaining} - 1` })
    .where(and(eq(users.id, userId), gt(users.videosRemaining, 0)))
    .returning({ videosRemaining: users.videosRemaining });
  return result[0]?.videosRemaining ?? null;
}

/** Refunds one video credit, used when a render fails to actually start after the quota was already spent. */
export async function incrementVideoQuota(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ videosRemaining: sql`${users.videosRemaining} + 1` }).where(eq(users.id, userId));
}

/** Atomically decrements the user's virtual-staging credit balance. Returns the new count, or null if they have none left. */
export async function decrementStagingCredits(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Account storage is temporarily unavailable.");
  const result = await db
    .update(users)
    .set({ stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} - 1` })
    .where(and(eq(users.id, userId), gt(users.stagingCreditsRemaining, 0)))
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
  updates: Partial<Pick<InsertVideoProject, "status" | "revisionNotes" | "finalVideoUrl" | "promptRequestIds" | "generatedPrompts" | "falRequestIds" | "clipUrls" | "renderProgress" | "renderPhase" | "renderError" | "mediaUrls" | "mediaKeys" | "mediaNames" | "mediaTypes">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Project storage is temporarily unavailable.");
  await db
    .update(videoProjects)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(videoProjects.userId, userId), eq(videoProjects.id, projectId)));
  return getVideoProject(userId, projectId);
}
