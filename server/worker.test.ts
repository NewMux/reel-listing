import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const worker = (exports as unknown as { default: Fetcher }).default;

describe("Worker routing", () => {
  it("serves the tRPC API", async () => {
    const response = await worker.fetch("https://reel-listing.test/api/trpc/auth.me");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: { data: { json: null } } });
  });

  it("acknowledges fal.ai webhooks immediately, even for unknown requests", async () => {
    const response = await worker.fetch("https://reel-listing.test/api/webhooks/fal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request_id: "not-ours" }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("returns JSON 404s for unknown API routes", async () => {
    const response = await worker.fetch("https://reel-listing.test/api/nope");
    expect(response.status).toBe(404);
  });
});
