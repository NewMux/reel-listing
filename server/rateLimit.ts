import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ENV } from "./_core/env";

const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

let warnedMissingConfig = false;

function getRatelimit(): Ratelimit | null {
  if (!ENV.upstashRedisUrl || !ENV.upstashRedisToken) {
    if (!warnedMissingConfig) {
      console.warn("[RateLimit] Upstash not configured -- using the in-process limiter.");
      warnedMissingConfig = true;
    }
    return null;
  }
  return new Ratelimit({
    redis: new Redis({ url: ENV.upstashRedisUrl, token: ENV.upstashRedisToken }),
    limiter: Ratelimit.slidingWindow(LIMIT, "10 m"),
    prefix: "reel-listing",
  });
}

const shared = getRatelimit();

/**
 * In-process sliding window, used when Upstash is not configured.
 *
 * Self-hosting on a single container makes this correct rather than a degradation: there
 * is one process, so one process's view of the counters is the whole truth. It is the
 * wrong choice behind more than one replica -- but so is server/uploadSessions.ts, which
 * keeps upload chunks in a module-level Map, so this deployment cannot scale out anyway.
 *
 * Previously an unset Upstash config meant NO rate limiting at all.
 */
const hits = new Map<string, number[]>();

function checkInProcess(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at: number) => now - at < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic sweep, so a long-lived process does not accumulate a key per visitor.
  if (hits.size > 10_000) {
    for (const key of Array.from(hits.keys())) {
      const times = hits.get(key);
      if (times && times.every((at: number) => now - at >= WINDOW_MS)) hits.delete(key);
    }
  }
  return true;
}

/**
 * Checks a rate limit for the given key (e.g. "contact:1.2.3.4"). Falls back to an
 * in-process limiter when Upstash is not configured, and fails open only when Upstash
 * itself errors -- a limiter outage must not take the underlying feature down with it.
 */
export async function checkRateLimit(key: string): Promise<{ allowed: boolean }> {
  if (!shared) return { allowed: checkInProcess(key) };
  try {
    const result = await shared.limit(key);
    return { allowed: result.success };
  } catch (error) {
    console.warn("[RateLimit] check failed, allowing request:", error);
    return { allowed: true };
  }
}
