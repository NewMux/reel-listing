import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ENV } from "./_core/env";

let warnedMissingConfig = false;

/**
 * How a limiter should behave when Upstash itself is unreachable or unconfigured.
 *
 * `open` keeps the feature working at the cost of the limit (right for the contact form:
 * the worst case is spam in a table). `closed` refuses the request (right for anything that
 * spends money at fal.ai: the worst case there is an uncapped bill, which is far worse than
 * a customer seeing "try again in a moment").
 */
type FailureMode = "open" | "closed";

export type RateLimitRule = {
  /** Requests allowed inside the window. */
  limit: number;
  /** Upstash window spec, e.g. "10 m" or "1 h". */
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  failureMode: FailureMode;
};

/**
 * Named rules, so every call site is visible in one place rather than scattered as magic
 * numbers. The render limits are deliberately tight: one approval is roughly $11 of fal.ai
 * spend at ten clips.
 */
export const RATE_LIMITS = {
  contact: { limit: 5, window: "10 m", failureMode: "open" },
  projectCreate: { limit: 10, window: "1 h", failureMode: "closed" },
  renderApprove: { limit: 5, window: "1 h", failureMode: "closed" },
  shotDirections: { limit: 30, window: "1 h", failureMode: "closed" },
  stagePhoto: { limit: 20, window: "1 h", failureMode: "closed" },
  uploadTarget: { limit: 120, window: "1 h", failureMode: "closed" },
  shareView: { limit: 120, window: "10 m", failureMode: "open" },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

const limiters = new Map<string, Ratelimit>();

function isConfigured() {
  if (ENV.upstashRedisUrl && ENV.upstashRedisToken) return true;
  if (!warnedMissingConfig) {
    console.warn("[RateLimit] UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN not configured -- spend-bearing endpoints will refuse requests.");
    warnedMissingConfig = true;
  }
  return false;
}

function getLimiter(name: RateLimitName): Ratelimit | null {
  if (!isConfigured()) return null;
  const existing = limiters.get(name);
  if (existing) return existing;
  const rule = RATE_LIMITS[name];
  const limiter = new Ratelimit({
    redis: new Redis({ url: ENV.upstashRedisUrl, token: ENV.upstashRedisToken }),
    limiter: Ratelimit.slidingWindow(rule.limit, rule.window),
    prefix: `reel-listing:${name}`,
  });
  limiters.set(name, limiter);
  return limiter;
}

/**
 * Checks one named rate limit for one subject (a user id, or an IP for anonymous callers).
 *
 * Never throws: a limiter outage resolves to the rule's own failure mode rather than
 * surfacing an Upstash error to the caller.
 */
export async function checkRateLimit(name: RateLimitName, subject: string): Promise<{ allowed: boolean }> {
  const rule = RATE_LIMITS[name];
  const limiter = getLimiter(name);
  if (!limiter) return { allowed: rule.failureMode === "open" };
  try {
    const result = await limiter.limit(subject);
    return { allowed: result.success };
  } catch (error) {
    console.warn(`[RateLimit] ${name} check failed, failing ${rule.failureMode}:`, error);
    return { allowed: rule.failureMode === "open" };
  }
}
