import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ENV } from "./_core/env";

let warnedMissingConfig = false;

function getRatelimit(): Ratelimit | null {
  if (!ENV.upstashRedisUrl || !ENV.upstashRedisToken) {
    if (!warnedMissingConfig) {
      console.warn("[RateLimit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not configured -- rate limiting is disabled.");
      warnedMissingConfig = true;
    }
    return null;
  }
  return new Ratelimit({
    redis: new Redis({ url: ENV.upstashRedisUrl, token: ENV.upstashRedisToken }),
    limiter: Ratelimit.slidingWindow(5, "10 m"),
    prefix: "reel-listing",
  });
}

const shared = getRatelimit();

/**
 * Checks a rate limit for the given key (e.g. "contact:1.2.3.4"). Fails open --
 * returns allowed when Upstash isn't configured -- so an unset env var degrades
 * to "no rate limiting" rather than breaking the underlying feature.
 */
export async function checkRateLimit(key: string): Promise<{ allowed: boolean }> {
  if (!shared) return { allowed: true };
  try {
    const result = await shared.limit(key);
    return { allowed: result.success };
  } catch (error) {
    console.warn("[RateLimit] check failed, allowing request:", error);
    return { allowed: true };
  }
}
