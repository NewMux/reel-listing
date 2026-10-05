import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";
import { createVideoProject, decrementVideoQuota, getDb, getVideoProjectByRequestId, updateVideoProject } from "./db";

async function makeUser() {
  const [user] = await getDb().insert(users).values({ email: `u${crypto.randomUUID()}@example.com`, videosRemaining: 1 }).returning();
  return user;
}

function project(userId: number) {
  return {
    userId,
    title: "Villa",
    location: "Dubai",
    mediaUrls: ["/manus-storage/a.jpg"],
    mediaKeys: ["property-projects/1/a.jpg"],
    mediaNames: ["a.jpg"],
    mediaTypes: ["image/jpeg"],
  };
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM video_projects; DELETE FROM users;");
});

describe("D1 data access", () => {
  it("round-trips JSON columns and defaults", async () => {
    const user = await makeUser();
    const id = await createVideoProject(project(user.id));
    const updated = await updateVideoProject(user.id, id, { clipUrls: [null, "https://fal.media/x.mp4"] });
    expect(updated?.mediaKeys).toEqual(["property-projects/1/a.jpg"]);
    expect(updated?.clipUrls).toEqual([null, "https://fal.media/x.mp4"]);
    expect(updated?.promptRequestIds).toEqual([]);
    expect(updated?.status).toBe("Review");
    expect(updated?.createdAt).toBeInstanceOf(Date);
  });

  it("finds an in-progress project by any recorded fal.ai request id", async () => {
    const user = await makeUser();
    const id = await createVideoProject(project(user.id));
    await updateVideoProject(user.id, id, { status: "Processing", promptRequestIds: ["p-1", null], falRequestIds: [null, "r-2"] });

    expect((await getVideoProjectByRequestId("p-1"))?.id).toBe(id);
    expect((await getVideoProjectByRequestId("r-2"))?.id).toBe(id);
    expect(await getVideoProjectByRequestId("r-")).toBeUndefined();

    await updateVideoProject(user.id, id, { status: "Done" });
    expect(await getVideoProjectByRequestId("r-2")).toBeUndefined();
  });

  it("never lets the video quota go negative", async () => {
    const user = await makeUser();
    expect(await decrementVideoQuota(user.id)).toBe(0);
    expect(await decrementVideoQuota(user.id)).toBeNull();
  });
});
