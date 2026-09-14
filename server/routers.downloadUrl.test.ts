import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Real Postgres, real routers.ts logic -- only the outbound Supabase network call is
 * faked, since no live project is reachable here. This is the test for the hard boundary
 * the whole per-clip-download feature exists around: a clip that hasn't been archived to
 * our own storage must never reach the client as a download link, under any circumstance.
 *
 * Requires DATABASE_URL to point at a scratch Postgres with the app's migrations applied
 * (see docs/DEPLOY.md's db:migrate). Skips itself when unset, so it doesn't fail CI runs
 * that have no database available -- server/*.test.ts elsewhere in this repo is pure-unit
 * and deliberately never touches a real database; this one file is the exception, by design,
 * because the property under test (routers.ts's actual boundary check) can't be proven any
 * other way without reimplementing it.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

const createSignedUrl = vi.fn(async () => ({
  data: { signedUrl: "https://example.supabase.co/storage/v1/object/sign/x?token=t" },
  error: null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}));

describe.runIf(hasDb)("projects.downloadUrl -- the vendor boundary", () => {
  let projectId: number;
  let userId: number;
  const ARCHIVED_CLIP = "/manus-storage/property-projects/test/outputs/clip-1.mp4";
  // Exactly the shape a raw, un-archived fal.ai output looks like. Standing in for what
  // clipUrls holds before the assembly worker archives it -- this must never be signed,
  // never returned to the client, full stop.
  const UNARCHIVED_CLIP = "https://v3.fal.media/files/zebra/generated-clip.mp4";

  beforeAll(async () => {
    process.env.SUPABASE_URL ||= "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY ||= "anon-key";
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new Error("DATABASE_URL is set but the database is unreachable.");

    await db.execute(`insert into users ("openId", email) values ('supabase:dl-boundary-test', 'dl-boundary@example.com') on conflict ("openId") do nothing` as never);
    const users = (await db.execute(`select id from users where "openId" = 'supabase:dl-boundary-test'` as never)) as unknown as { id: number }[];
    userId = users[0].id;
    ARCHIVED_CLIP.replace("test", String(userId));

    const rows = (await db.execute(
      `insert into video_projects ("userId", title, location, "mediaUrls", "mediaKeys", "mediaNames", "mediaTypes",
         status, "renderPhase", "finalVideoUrl", "clipUrls")
       values (${userId}, 'Boundary Test Villa', 'Manama', '["a","b"]', '["a","b"]', '["a","b"]', '["image/png","image/png"]',
         'Done', 'complete', '/manus-storage/property-projects/${userId}/outputs/final.mp4',
         '["${ARCHIVED_CLIP.replace("test", String(userId))}", "${UNARCHIVED_CLIP}"]')
       returning id` as never,
    )) as unknown as { id: number }[];
    projectId = rows[0].id;
  });

  afterAll(async () => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (db && projectId) await db.execute(`delete from video_projects where id = ${projectId}` as never);
  });

  function makeCaller() {
    return async () => {
      const { appRouter } = await import("./routers");
      const ctx = {
        user: {
          id: userId,
          openId: "supabase:dl-boundary-test",
          email: "dl-boundary@example.com",
          name: "DL Test",
          loginMethod: "supabase",
          role: "user" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        },
        supabaseAccessToken: "user-token",
        authUnavailable: false,
        req: { protocol: "https", headers: {} },
        res: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
      return appRouter.createCaller(ctx);
    };
  }

  it("signs a real, storage-archived clip", async () => {
    const caller = await makeCaller()();
    const result = await caller.projects.downloadUrl({ id: projectId, clip: 0 });
    expect(result.url).toContain("example.supabase.co");
    expect(createSignedUrl).toHaveBeenCalled();
  });

  it("refuses a clip that is still a raw fal.ai URL -- never signs it, never returns it", async () => {
    createSignedUrl.mockClear();
    const caller = await makeCaller()();
    await expect(caller.projects.downloadUrl({ id: projectId, clip: 1 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    // The whole point: no attempt was even made to sign or hand back the vendor's URL.
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("signs the final video, which is always our own storage by construction", async () => {
    const caller = await makeCaller()();
    const result = await caller.projects.downloadUrl({ id: projectId });
    expect(result.url).toContain("example.supabase.co");
  });
});
