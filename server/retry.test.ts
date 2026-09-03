import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../shared/retry";

describe("withRetry", () => {
  it("returns the result on the first successful attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { label: "test" })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries after a failure and returns the eventual success", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce("recovered");
    await expect(withRetry(fn, { label: "test", retries: 2, baseDelayMs: 1, maxDelayMs: 2 })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws the last error once every attempt is exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("still failing"));
    await expect(withRetry(fn, { label: "test", retries: 2, baseDelayMs: 1, maxDelayMs: 2 })).rejects.toThrow("still failing");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("rejects with a timeout error if an attempt runs past the per-attempt budget", async () => {
    const fn = vi.fn(() => new Promise(resolve => setTimeout(resolve, 50)));
    await expect(withRetry(fn, { label: "slow op", retries: 0, timeoutMs: 5 })).rejects.toThrow(/timed out/);
  });
});
