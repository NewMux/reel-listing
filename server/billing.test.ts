import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventEntity } from "@paddle/paddle-node-sdk";

const db = vi.hoisted(() => ({
  claimWebhookEvent: vi.fn(async () => true),
  releaseWebhookEvent: vi.fn(async () => undefined),
  getUserById: vi.fn(async (id: number) => ({ id, paddleCustomerId: null }) as any),
  setPaddleCustomerId: vi.fn(async () => undefined),
  upsertSubscription: vi.fn(async () => undefined),
  setUserQuota: vi.fn(async () => undefined),
  incrementVideoQuota: vi.fn(async () => undefined),
  incrementStagingCredits: vi.fn(async () => undefined),
}));

const plans = vi.hoisted(() => ({
  findPlanByPriceId: vi.fn((priceId: string) => (priceId === "pri_plan" ? { priceId: "pri_plan", planName: "Starter", videoQuota: 3, stagingCreditQuota: 5, displayPrice: "$1" } : undefined)),
  findTopupByPriceId: vi.fn((priceId: string) => (priceId === "pri_topup" ? { priceId: "pri_topup", name: "Extra", videoCredits: 5, stagingCredits: 2, displayPrice: "$1" } : undefined)),
}));

vi.mock("./db", () => db);
vi.mock("./billingPlans", () => plans);

const { handlePaddleEvent } = await import("./billing");

function fakeEvent(eventType: string, data: unknown, eventId = "evt_1"): EventEntity {
  return { eventId, eventType, data } as unknown as EventEntity;
}

describe("handlePaddleEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.claimWebhookEvent.mockResolvedValue(true);
    db.getUserById.mockResolvedValue({ id: 42, paddleCustomerId: null } as any);
  });

  it("is a no-op on a duplicate/retried delivery", async () => {
    db.claimWebhookEvent.mockResolvedValue(false);
    const event = fakeEvent("transaction.completed", { items: [{ price: { id: "pri_plan" } }], customData: { userId: 42 } });
    await handlePaddleEvent(event);
    expect(db.setUserQuota).not.toHaveBeenCalled();
    expect(db.upsertSubscription).not.toHaveBeenCalled();
  });

  it("sets quota to the plan's amount on transaction.completed for a plan price", async () => {
    const event = fakeEvent("transaction.completed", { items: [{ price: { id: "pri_plan" } }], customData: { userId: 42 } });
    await handlePaddleEvent(event);
    expect(db.setUserQuota).toHaveBeenCalledWith(42, { videosRemaining: 3, stagingCreditsRemaining: 5 });
    expect(db.incrementVideoQuota).not.toHaveBeenCalled();
  });

  it("increments quota on transaction.completed for a top-up price", async () => {
    const event = fakeEvent("transaction.completed", { items: [{ price: { id: "pri_topup" } }], customData: { userId: 42 } });
    await handlePaddleEvent(event);
    expect(db.incrementVideoQuota).toHaveBeenCalledWith(42, 5);
    expect(db.incrementStagingCredits).toHaveBeenCalledWith(42, 2);
    expect(db.setUserQuota).not.toHaveBeenCalled();
  });

  it("does nothing for an unrecognized price id", async () => {
    const event = fakeEvent("transaction.completed", { items: [{ price: { id: "pri_unknown" } }], customData: { userId: 42 } });
    await handlePaddleEvent(event);
    expect(db.setUserQuota).not.toHaveBeenCalled();
    expect(db.incrementVideoQuota).not.toHaveBeenCalled();
  });

  it("logs and returns without throwing when customData.userId is missing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const event = fakeEvent("transaction.completed", { items: [{ price: { id: "pri_plan" } }], customData: null });
    await expect(handlePaddleEvent(event)).resolves.toBeUndefined();
    expect(db.setUserQuota).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("syncs subscription state without touching quota on subscription.created", async () => {
    const event = fakeEvent("subscription.created", {
      id: "sub_1",
      status: "active",
      customerId: "ctm_1",
      items: [{ price: { id: "pri_plan" } }],
      currentBillingPeriod: { endsAt: "2026-10-01T00:00:00Z" },
      scheduledChange: null,
      customData: { userId: 42 },
    });
    await handlePaddleEvent(event);
    expect(db.setPaddleCustomerId).toHaveBeenCalledWith(42, "ctm_1");
    expect(db.upsertSubscription).toHaveBeenCalledWith({
      userId: 42,
      paddleSubscriptionId: "sub_1",
      paddlePriceId: "pri_plan",
      status: "active",
      currentPeriodEnd: new Date("2026-10-01T00:00:00Z"),
      cancelAtPeriodEnd: false,
    });
    expect(db.setUserQuota).not.toHaveBeenCalled();
  });

  it("marks cancelAtPeriodEnd when a cancel is scheduled", async () => {
    const event = fakeEvent("subscription.updated", {
      id: "sub_1",
      status: "active",
      customerId: "ctm_1",
      items: [{ price: { id: "pri_plan" } }],
      currentBillingPeriod: { endsAt: "2026-10-01T00:00:00Z" },
      scheduledChange: { action: "cancel" },
      customData: { userId: 42 },
    });
    await handlePaddleEvent(event);
    expect(db.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ cancelAtPeriodEnd: true }));
  });

  it("releases the claimed event id and rethrows if processing fails", async () => {
    db.setUserQuota.mockRejectedValueOnce(new Error("db down"));
    const event = fakeEvent("transaction.completed", { items: [{ price: { id: "pri_plan" } }], customData: { userId: 42 } });
    await expect(handlePaddleEvent(event)).rejects.toThrow("db down");
    expect(db.releaseWebhookEvent).toHaveBeenCalledWith("evt_1");
  });
});
