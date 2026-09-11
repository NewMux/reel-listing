import { creditsForReel } from "./credits";

/**
 * The plan catalogue: one definition each for price, allowance and rollover cap.
 *
 * Plan ids match the `billing_plan` enum in the database deliberately, so a plan granted by
 * a Paddle webhook and a plan displayed on the pricing page are the same word with no
 * translation table in between.
 *
 * Paddle price IDs are NOT here. They differ between sandbox and production, so they come
 * from environment variables and the two environments differ by configuration alone.
 */
export const PLANS = [
  {
    id: "solo",
    usd: 99,
    monthlyCredits: 60,
  },
  {
    id: "pro",
    usd: 249,
    monthlyCredits: 160,
  },
  {
    id: "agency",
    usd: 599,
    monthlyCredits: 400,
  },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];
export const planIds = PLANS.map(plan => plan.id) as [PlanId, ...PlanId[]];

/**
 * Unused credits roll over, but only up to this many months' worth.
 *
 * A quiet month should not be punished, so credit carries. But an unlimited balance is a
 * liability denominated in real fal.ai spend: someone could subscribe for a year, never
 * render, then cancel still holding a claim worth hundreds of dollars of compute. Two
 * months is the compromise.
 */
export const ROLLOVER_MONTHS = 2;

export function getPlan(id: string | null | undefined) {
  return PLANS.find(plan => plan.id === id) ?? null;
}

/** The most credit an account on this plan may hold after a renewal grant. */
export function rolloverCap(id: string | null | undefined) {
  const plan = getPlan(id);
  return plan ? plan.monthlyCredits * ROLLOVER_MONTHS : 0;
}

/** Full ten-photo, ten-second reels a month's allowance buys. For pricing copy. */
export function reelsPerMonth(id: string | null | undefined) {
  const plan = getPlan(id);
  return plan ? Math.floor(plan.monthlyCredits / creditsForReel(10)) : 0;
}

/**
 * The Bahraini dinar is pegged at 1 BHD = 2.659 USD, so an approximation from the USD price
 * is stable rather than a moving conversion. Shown only as a guide: Paddle cannot charge in
 * BHD, and its checkout will quote dollars.
 *
 * Source: https://www.cbb.gov.bh/facilities-interest-rates/
 */
export const BHD_PER_USD = 1 / 2.659;

export function approxBhd(usd: number) {
  return Math.round(usd * BHD_PER_USD);
}
