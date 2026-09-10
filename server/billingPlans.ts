import { z } from "zod";
import { ENV } from "./_core/env";

const planSchema = z.object({
  priceId: z.string().min(1),
  planName: z.string().min(1),
  videoQuota: z.number().int().nonnegative(),
  stagingCreditQuota: z.number().int().nonnegative(),
  displayPrice: z.string().min(1),
});

const topupSchema = z.object({
  priceId: z.string().min(1),
  name: z.string().min(1),
  videoCredits: z.number().int().nonnegative(),
  stagingCredits: z.number().int().nonnegative(),
  displayPrice: z.string().min(1),
});

export type BillingPlan = z.infer<typeof planSchema>;
export type BillingTopup = z.infer<typeof topupSchema>;

function parseJsonList<T>(raw: string, schema: z.ZodType<T>, label: string): T[] {
  if (!raw) return [];
  try {
    const parsed = schema.array().safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.error(`[BillingPlans] ${label} failed validation:`, parsed.error.message);
      return [];
    }
    return parsed.data;
  } catch (error) {
    console.error(`[BillingPlans] ${label} is not valid JSON:`, error);
    return [];
  }
}

let _plans: BillingPlan[] | null = null;
let _topups: BillingTopup[] | null = null;

export function getBillingPlans(): BillingPlan[] {
  if (_plans === null) {
    _plans = parseJsonList(ENV.paddlePlansJson, planSchema, "PADDLE_PLANS_JSON");
    checkPriceIdOverlap();
  }
  return _plans;
}

export function getBillingTopups(): BillingTopup[] {
  if (_topups === null) {
    _topups = parseJsonList(ENV.paddleTopupsJson, topupSchema, "PADDLE_TOPUPS_JSON");
    checkPriceIdOverlap();
  }
  return _topups;
}

export function findPlanByPriceId(priceId: string): BillingPlan | undefined {
  return getBillingPlans().find(plan => plan.priceId === priceId);
}

export function findTopupByPriceId(priceId: string): BillingTopup | undefined {
  return getBillingTopups().find(topup => topup.priceId === priceId);
}

// A price id must mean exactly one thing -- the webhook handler decides "set quota" (plan) vs
// "increment quota" (top-up) purely by which list a transaction line item's price id appears in.
function checkPriceIdOverlap() {
  if (!_plans || !_topups) return;
  const planIds = new Set(_plans.map(plan => plan.priceId));
  const overlap = _topups.filter(topup => planIds.has(topup.priceId)).map(topup => topup.priceId);
  if (overlap.length > 0) {
    console.warn("[BillingPlans] price id(s) appear in both PADDLE_PLANS_JSON and PADDLE_TOPUPS_JSON:", overlap);
  }
}
