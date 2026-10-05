import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signStoredUrl, storageCreatePutTarget, storagePut } from "./storage";

// No R2 API token is configured in tests, so URLs are Worker-served and HMAC-signed.
describe("R2 media storage (Worker-served fallback)", () => {
  const worker = (exports as unknown as { default: Fetcher }).default;

  it("uploads to a signed PUT URL and serves it back from a signed GET URL", async () => {
    const target = await storageCreatePutTarget("property-projects/7/photo.jpg");
    expect(target.key).toMatch(/^property-projects\/7\/photo_[0-9a-f]{8}\.jpg$/);
    expect(target.url).toBe(`/manus-storage/${target.key}`);

    const put = await worker.fetch(target.uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "jpeg-bytes" });
    expect(put.status).toBe(200);
    expect(await (await env.MEDIA.get(target.key))?.text()).toBe("jpeg-bytes");

    const get = await worker.fetch((await signStoredUrl(target.url))!);
    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe("image/jpeg");
    expect(await get.text()).toBe("jpeg-bytes");
  });

  it("supports range requests for video playback", async () => {
    const { url } = await storagePut("property-projects/7/outputs/film.mp4", "0123456789", "video/mp4");
    const response = await worker.fetch((await signStoredUrl(url))!, { headers: { range: "bytes=2-5" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await response.text()).toBe("2345");
  });

  it("rejects unsigned, tampered, and wrong-method requests", async () => {
    const { url } = await storagePut("property-projects/7/secret.jpg", "x", "image/jpeg");
    const signed = new URL((await signStoredUrl(url))!);
    expect((await worker.fetch(`https://reel-listing.test${signed.pathname}`)).status).toBe(403);

    const tampered = new URL(signed);
    tampered.pathname = tampered.pathname.replace("secret", "other");
    expect((await worker.fetch(tampered)).status).toBe(403);

    expect((await worker.fetch(signed, { method: "PUT", body: "overwrite" })).status).toBe(403);
  });

  it("passes through non-stored URLs unchanged", async () => {
    expect(await signStoredUrl("https://cdn.example/pilot.png")).toBe("https://cdn.example/pilot.png");
    expect(await signStoredUrl(null)).toBeNull();
  });
});
