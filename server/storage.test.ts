import { beforeEach, describe, expect, it, vi } from "vitest";

// createSignedUrl is mocked below and returns a fake token, so no real Supabase project is
// needed to prove this app calls the SDK correctly. Whether Supabase itself honors the
// `download` option is established by its own published API (createSignedUrl's `options.download`
// parameter, documented to set Content-Disposition) -- this test is only about our wiring.
const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://example.supabase.co/signed?token=t" }, error: null }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: { from: () => ({ createSignedUrl }) },
  }),
}));

describe("storageGetSignedUrl download option", () => {
  beforeEach(() => {
    createSignedUrl.mockClear();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
  });

  it("passes the requested filename through to Supabase's download option", async () => {
    const { storageGetSignedUrl } = await import("./storage");
    await storageGetSignedUrl("property-projects/1/outputs/reel.mp4", "user-token", "My Villa.mp4");
    expect(createSignedUrl).toHaveBeenCalledWith(
      "property-projects/1/outputs/reel.mp4",
      expect.any(Number),
      { download: "My Villa.mp4" },
    );
  });

  it("omits the download option for a plain sign -- inline <video>/<img> URLs must stay playable", async () => {
    // Content-Disposition: attachment on the same URL used for <video src> would stop the
    // on-page player from rendering it, which is exactly why projects.downloadUrl mints a
    // separate signed URL rather than reusing the one project.get/renderStatus already hand
    // back for playback.
    const { storageGetSignedUrl } = await import("./storage");
    await storageGetSignedUrl("property-projects/1/outputs/reel.mp4", "user-token");
    expect(createSignedUrl).toHaveBeenCalledWith("property-projects/1/outputs/reel.mp4", expect.any(Number), undefined);
  });
});
