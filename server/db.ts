import { drizzle } from "drizzle-orm/d1";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { contactMessages, InsertContactMessage, InsertVideoProject, videoProjects, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

export function getDb() {
  return drizzle(ENV.db);
}

export type Db = ReturnType<typeof getDb>;

export async function getUserById(id: number) {
  const result = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

/** Atomically decrements the user's included-video quota. Returns the new count, or null if they have none left. */
export async function decrementVideoQuota(userId: number): Promise<number | null> {
  const result = await getDb()
    .update(users)
    .set({ videosRemaining: sql`${users.videosRemaining} - 1` })
    .where(and(eq(users.id, userId), gt(users.videosRemaining, 0)))
    .returning({ videosRemaining: users.videosRemaining });
  return result[0]?.videosRemaining ?? null;
}

/** Refunds one video credit, used when a render fails to actually start after the quota was already spent. */
export async function incrementVideoQuota(userId: number): Promise<void> {
  await getDb().update(users).set({ videosRemaining: sql`${users.videosRemaining} + 1` }).where(eq(users.id, userId));
}

/** Atomically decrements the user's virtual-staging credit balance. Returns the new count, or null if they have none left. */
export async function decrementStagingCredits(userId: number): Promise<number | null> {
  const result = await getDb()
    .update(users)
    .set({ stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} - 1` })
    .where(and(eq(users.id, userId), gt(users.stagingCreditsRemaining, 0)))
    .returning({ stagingCreditsRemaining: users.stagingCreditsRemaining });
  return result[0]?.stagingCreditsRemaining ?? null;
}

/** Refunds one staging credit, used when a staging attempt fails after the credit was already spent. */
export async function incrementStagingCredits(userId: number): Promise<void> {
  await getDb().update(users).set({ stagingCreditsRemaining: sql`${users.stagingCreditsRemaining} + 1` }).where(eq(users.id, userId));
}

export async function listVideoProjects(userId: number) {
  return getDb().select().from(videoProjects).where(eq(videoProjects.userId, userId)).orderBy(desc(videoProjects.createdAt));
}

export async function getVideoProject(userId: number, projectId: number) {
  const result = await getDb()
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.userId, userId), eq(videoProjects.id, projectId)))
    .limit(1);
  return result[0];
}

/** Finds the in-progress project a fal.ai request_id belongs to, for webhook-triggered refreshes that have no user session to scope the lookup by. */
export async function getVideoProjectByRequestId(requestId: string) {
  const result = await getDb()
    .select()
    .from(videoProjects)
    .where(
      and(
        eq(videoProjects.status, "Processing"),
        sql`(EXISTS (SELECT 1 FROM json_each(${videoProjects.promptRequestIds}) WHERE value = ${requestId})
          OR EXISTS (SELECT 1 FROM json_each(${videoProjects.falRequestIds}) WHERE value = ${requestId}))`,
      ),
    )
    .limit(1);
  return result[0];
}

export async function createVideoProject(project: InsertVideoProject) {
  const result = await getDb().insert(videoProjects).values(project).returning({ id: videoProjects.id });
  return result[0].id;
}

export async function insertContactMessage(entry: InsertContactMessage) {
  await getDb().insert(contactMessages).values(entry);
}

export async function updateVideoProject(
  userId: number,
  projectId: number,
  updates: Partial<Pick<InsertVideoProject, "status" | "revisionNotes" | "finalVideoUrl" | "promptRequestIds" | "generatedPrompts" | "shotAnalysis" | "customCameraMoves" | "clipDurations" | "falRequestIds" | "clipUrls" | "renderProgress" | "renderPhase" | "renderError" | "mediaUrls" | "mediaKeys" | "mediaNames" | "mediaTypes">>,
) {
  await getDb()
    .update(videoProjects)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(videoProjects.userId, userId), eq(videoProjects.id, projectId)));
  return getVideoProject(userId, projectId);
}
