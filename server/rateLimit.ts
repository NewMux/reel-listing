/**
 * Checks a Workers Rate Limiting binding for the given key (e.g. "contact:1.2.3.4"). Fails
 * open -- returns allowed when the binding is missing or errors -- so a misconfiguration
 * degrades to "no rate limiting" rather than breaking the underlying feature.
 */
export async function checkRateLimit(limiter: RateLimitBinding | undefined, key: string): Promise<{ allowed: boolean }> {
  if (!limiter) return { allowed: true };
  try {
    const result = await limiter.limit({ key });
    return { allowed: result.success };
  } catch (error) {
    console.warn("[RateLimit] check failed, allowing request:", error);
    return { allowed: true };
  }
}

type RateLimitBinding = { limit(options: { key: string }): Promise<{ success: boolean }> };
