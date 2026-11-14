// Credits are the single unit customers buy and spend: 1 credit = 1 second of generated
// video. A 10-photo reel of 10-second clips costs 100 credits.
export const CREDITS_PER_SECOND = 1;

/** Credits a brand-new account starts with -- enough for a few clips, not a full reel. */
export const FREE_TRIAL_CREDITS = 30;

export const PLAN_IDS = ["starter", "pro", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Credits granted each paid billing period. Prices live in Stripe (STRIPE_PRICE_* env vars);
 *  the displayed price strings live in the locale copy. Unused credits roll over. */
export const PLAN_CREDITS: Record<PlanId, number> = {
  starter: 300,
  pro: 800,
  agency: 2000,
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function clipCost(durationSeconds: number) {
  return Math.max(1, Math.round(durationSeconds)) * CREDITS_PER_SECOND;
}

export function renderCost(durations: number[]) {
  return durations.reduce((sum, seconds) => sum + clipCost(seconds), 0);
}
