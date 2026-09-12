/**
 * The single source of truth for what we sell.
 *
 * Prices, allowances and Paddle price IDs live here -- never in locale.tsx, which holds
 * display copy only. Before this file the pricing page kept its numbers as positional
 * string tuples duplicated across `copy.en` and `copy.ar`, and then hardcoded a third
 * copy inline in the comparison table, so the three were free to drift apart.
 */

/**
 * The Central Bank of Bahrain pegs the dinar to the dollar at a fixed 1 BHD = 2.659 USD.
 * Paddle cannot charge in BHD (it is not one of its supported currencies), so we bill in
 * USD and show the pegged BHD figure alongside it as an approximation.
 */
export const USD_PER_BHD = 2.659;

export type PlanId = "starter" | "pro" | "agency";
export type PackId = "listing5";

/** How much of each metered thing a purchase is worth. */
export type Entitlement = {
  /** Finished listing reels. One is spent when a project is approved for render. */
  videos: number;
  /** Virtual-staging renders. */
  staging: number;
};

export type Plan = {
  id: PlanId;
  /** Amounts are in USD cents so no float arithmetic ever touches money. */
  usdMonthlyCents: number;
  /** Granted -- and reset -- at the start of every billing period. */
  perPeriod: Entitlement;
};

export type Pack = {
  id: PackId;
  usdOnceCents: number;
  /** Added to the permanent balance. Pack credits never expire and never reset. */
  grants: Entitlement;
};

export const PLAN_IDS = ["starter", "pro", "agency"] as const;
export const PACK_IDS = ["listing5"] as const;

export const PLAN_CATALOG: Record<PlanId, Plan> = {
  // Monthly only, deliberately. Entitlements are granted by webhook with no scheduler, so
  // an annual plan would either dump twelve periods of credit on day one or never reset.
  // Annual needs a periodic top-up path before it can be sold; see docs/DEPLOY.md.
  starter: { id: "starter", usdMonthlyCents: 8_900, perPeriod: { videos: 3, staging: 0 } },
  pro: { id: "pro", usdMonthlyCents: 22_900, perPeriod: { videos: 8, staging: 3 } },
  agency: { id: "agency", usdMonthlyCents: 49_900, perPeriod: { videos: 20, staging: 10 } },
};

export const PACK_CATALOG: Record<PackId, Pack> = {
  // Priced to land on the 35 BHD package from the business plan once converted at the peg.
  listing5: { id: "listing5", usdOnceCents: 9_300, grants: { videos: 5, staging: 0 } },
};

/** The one-off grant a brand new account gets, so a signup can try the product once. */
export const TRIAL_GRANT: Entitlement = { videos: 1, staging: 0 };

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);

export const isPackId = (value: unknown): value is PackId =>
  typeof value === "string" && (PACK_IDS as readonly string[]).includes(value);

export function formatUsd(cents: number, locale = "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-BH" : "en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * The pegged BHD equivalent of a USD amount. Always rendered as an approximation next to
 * the real USD price -- the customer's card is charged in USD, and saying otherwise would
 * be a lie about what Paddle does.
 */
export function formatBhd(usdCents: number, locale = "en"): string {
  const bhd = usdCents / 100 / USD_PER_BHD;
  return new Intl.NumberFormat(locale === "ar" ? "ar-BH" : "en-US", {
    style: "currency",
    currency: "BHD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(bhd);
}
