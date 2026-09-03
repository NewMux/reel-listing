const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// Equal-jitter exponential backoff: guarantees a minimum delay (cap/2) so a
// misbehaving caller loop slows down instead of hammering a struggling upstream.
function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number) {
  const cap = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return cap / 2 + Math.random() * (cap / 2);
}

export type RetryOptions = {
  /** Extra attempts after the first, e.g. retries: 2 means up to 3 total tries. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Per-attempt wall-clock budget; does not cancel the underlying call, just stops waiting on it. */
  timeoutMs?: number;
  /** Included in the warning log on each retry, and in the final error if every attempt fails. */
  label: string;
};

/** Retries any async operation with exponential backoff. Throws the last error once attempts are exhausted. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries = 2, baseDelayMs = 400, maxDelayMs = 4_000, timeoutMs, label } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (!timeoutMs) return await fn();
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)),
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      console.warn(`[retry] ${label} attempt ${attempt + 1}/${retries + 1} failed, retrying:`, error instanceof Error ? error.message : error);
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed after ${retries + 1} attempts`);
}
