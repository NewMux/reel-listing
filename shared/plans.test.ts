import { describe, expect, it } from "vitest";
import { approxBhd, getPlan, PLANS, planIds, reelsPerMonth, ROLLOVER_MONTHS, rolloverCap } from "./plans";
import { creditsForReel } from "./credits";

/** Mirrors grantSubscriptionCredits: grant the allowance, then expire above the cap. */
function renew(balance: number, planId: string) {
  const plan = getPlan(planId)!;
  const granted = balance + plan.monthlyCredits;
  const cap = rolloverCap(planId);
  return granted > cap ? cap : granted;
}

describe("plan catalogue", () => {
  it("uses ids that match the billing_plan database enum", () => {
    expect(planIds).toEqual(["solo", "pro", "agency"]);
  });

  it("keeps every plan above a 60% gross margin at $0.56 a credit", () => {
    for (const plan of PLANS) {
      const margin = (plan.usd - plan.monthlyCredits * 0.56) / plan.usd;
      expect(margin, plan.id).toBeGreaterThan(0.6);
    }
  });

  it("gets more expensive and more generous in the same order", () => {
    for (let i = 1; i < PLANS.length; i += 1) {
      expect(PLANS[i].usd).toBeGreaterThan(PLANS[i - 1].usd);
      expect(PLANS[i].monthlyCredits).toBeGreaterThan(PLANS[i - 1].monthlyCredits);
    }
  });

  it("reports whole reels a month's allowance buys", () => {
    expect(creditsForReel(10)).toBe(20);
    expect(reelsPerMonth("solo")).toBe(3);
    expect(reelsPerMonth("pro")).toBe(8);
    expect(reelsPerMonth("agency")).toBe(20);
  });

  it("returns nothing for a plan it does not sell", () => {
    expect(getPlan("enterprise")).toBeNull();
    expect(getPlan(null)).toBeNull();
    expect(rolloverCap("enterprise")).toBe(0);
  });

  it("shows a stable dinar approximation from the pegged rate", () => {
    expect(approxBhd(99)).toBe(37);
    expect(approxBhd(249)).toBe(94);
    expect(approxBhd(599)).toBe(225);
  });
});

describe("rollover cap", () => {
  it("carries unused credit forward in full while under the cap", () => {
    // Solo grants 60 and caps at 120, so a 30 balance renews to a full 90.
    expect(renew(30, "solo")).toBe(90);
  });

  it("expires only the excess once the cap is reached", () => {
    expect(renew(100, "solo")).toBe(120);
    expect(renew(120, "solo")).toBe(120);
  });

  it("never reduces a balance that is already over the cap by more than the overflow", () => {
    // An account over cap from an admin grant keeps its credit down to the cap, not to zero.
    expect(renew(200, "solo")).toBe(120);
  });

  it("caps every plan at its own allowance, not a shared number", () => {
    for (const plan of PLANS) {
      expect(rolloverCap(plan.id)).toBe(plan.monthlyCredits * ROLLOVER_MONTHS);
      expect(renew(0, plan.id)).toBe(plan.monthlyCredits);
    }
  });
});
