import { afterEach, describe, expect, it, vi } from "vitest";

async function loadBillingPlans(env: { paddlePlansJson?: string; paddleTopupsJson?: string }) {
  vi.resetModules();
  vi.doMock("./_core/env", () => ({ ENV: { paddlePlansJson: env.paddlePlansJson ?? "", paddleTopupsJson: env.paddleTopupsJson ?? "" } }));
  return import("./billingPlans");
}

describe("billing plan config parsing", () => {
  afterEach(() => {
    vi.doUnmock("./_core/env");
    vi.resetModules();
  });

  it("returns empty lists when the env vars are unset", async () => {
    const { getBillingPlans, getBillingTopups } = await loadBillingPlans({});
    expect(getBillingPlans()).toEqual([]);
    expect(getBillingTopups()).toEqual([]);
  });

  it("parses a valid plan list and makes it findable by price id", async () => {
    const json = JSON.stringify([{ priceId: "pri_1", planName: "Starter", videoQuota: 3, stagingCreditQuota: 5, displayPrice: "$89/mo" }]);
    const { getBillingPlans, findPlanByPriceId } = await loadBillingPlans({ paddlePlansJson: json });
    expect(getBillingPlans()).toHaveLength(1);
    expect(findPlanByPriceId("pri_1")?.planName).toBe("Starter");
    expect(findPlanByPriceId("pri_missing")).toBeUndefined();
  });

  it("parses a valid top-up list", async () => {
    const json = JSON.stringify([{ priceId: "pri_top1", name: "5 extra videos", videoCredits: 5, stagingCredits: 0, displayPrice: "$45" }]);
    const { findTopupByPriceId } = await loadBillingPlans({ paddleTopupsJson: json });
    expect(findTopupByPriceId("pri_top1")?.videoCredits).toBe(5);
  });

  it("returns an empty list and logs on malformed JSON", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getBillingPlans } = await loadBillingPlans({ paddlePlansJson: "{not json" });
    expect(getBillingPlans()).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns an empty list and logs on schema-violating entries", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const json = JSON.stringify([{ priceId: "pri_1" }]);
    const { getBillingPlans } = await loadBillingPlans({ paddlePlansJson: json });
    expect(getBillingPlans()).toEqual([]);
    errorSpy.mockRestore();
  });

  it("warns when a price id appears in both plans and top-ups", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plan = JSON.stringify([{ priceId: "pri_shared", planName: "Starter", videoQuota: 3, stagingCreditQuota: 0, displayPrice: "$1" }]);
    const topup = JSON.stringify([{ priceId: "pri_shared", name: "Extra", videoCredits: 5, stagingCredits: 0, displayPrice: "$1" }]);
    const { getBillingPlans, getBillingTopups } = await loadBillingPlans({ paddlePlansJson: plan, paddleTopupsJson: topup });
    getBillingPlans();
    getBillingTopups();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
