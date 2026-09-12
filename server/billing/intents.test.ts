import { describe, expect, it } from "vitest";
import { PACK_CATALOG, PLAN_CATALOG, formatBhd, formatUsd } from "@shared/plans";
import { nextQuotaState, paddleEventToIntent, userIdFromCustomData, type PaddleEventView, type PriceResolver, type QuotaState } from "./intents";

const PRICE_STARTER = "pri_starter";
const PRICE_PRO = "pri_pro";
const PRICE_PACK = "pri_pack5";

const resolve: PriceResolver = id => {
  if (id === PRICE_STARTER) return { type: "plan", planId: "starter" };
  if (id === PRICE_PRO) return { type: "plan", planId: "pro" };
  if (id === PRICE_PACK) return { type: "pack", packId: "listing5" };
  return null;
};

const subscriptionActivated = (priceId: string, periodStart = "2026-09-01T00:00:00Z"): PaddleEventView => ({
  eventId: "evt_activated",
  eventType: "subscription.activated",
  occurredAt: periodStart,
  data: {
    id: "sub_1",
    status: "active",
    customerId: "ctm_1",
    customData: { userId: "42" },
    currentBillingPeriod: { startsAt: periodStart, endsAt: "2026-10-01T00:00:00Z" },
    items: [{ price: { id: priceId }, quantity: 1 }],
  },
});

const transactionCompleted = (
  priceId: string,
  opts: { subscriptionId?: string | null; periodStart?: string } = {},
): PaddleEventView => ({
  eventId: "evt_txn",
  eventType: "transaction.completed",
  occurredAt: "2026-09-01T00:00:05Z",
  data: {
    id: "txn_1",
    customerId: "ctm_1",
    customData: { userId: "42" },
    subscriptionId: opts.subscriptionId === undefined ? "sub_1" : opts.subscriptionId,
    billingPeriod: opts.periodStart ? { startsAt: opts.periodStart, endsAt: "2026-10-01T00:00:00Z" } : undefined,
    items: [{ price: { id: priceId }, quantity: 1 }],
  },
});

describe("paddleEventToIntent", () => {
  it("grants the plan's allowance when a subscription activates", () => {
    const intent = paddleEventToIntent(subscriptionActivated(PRICE_PRO), resolve);
    expect(intent.kind).toBe("grant-period");
    if (intent.kind !== "grant-period") return;
    expect(intent.planId).toBe("pro");
    expect(intent.grant).toEqual(PLAN_CATALOG.pro.perPeriod);
    expect(intent.subscriptionId).toBe("sub_1");
    expect(intent.periodStart).toBe("2026-09-01T00:00:00Z");
  });

  it("ignores an unrecognised price rather than defaulting to a grant", () => {
    const intent = paddleEventToIntent(subscriptionActivated("pri_not_ours"), resolve);
    // An unknown price must never be worth credit -- it falls through to a status update.
    expect(intent.kind).toBe("subscription-status");
    const txn = paddleEventToIntent(transactionCompleted("pri_not_ours", { subscriptionId: null }), resolve);
    expect(txn.kind).toBe("ignore");
  });

  it("derives the same (subscription, period) key from activation and its first transaction", () => {
    // A new subscription fires BOTH events with distinct event ids. If the two produced
    // different dedupe keys, every signup would be granted its allowance twice.
    const periodStart = "2026-09-01T00:00:00Z";
    const fromActivation = paddleEventToIntent(subscriptionActivated(PRICE_STARTER, periodStart), resolve);
    const fromTransaction = paddleEventToIntent(transactionCompleted(PRICE_STARTER, { periodStart }), resolve);

    expect(fromActivation.kind).toBe("grant-period");
    expect(fromTransaction.kind).toBe("grant-period");
    if (fromActivation.kind !== "grant-period" || fromTransaction.kind !== "grant-period") return;
    expect(fromTransaction.subscriptionId).toBe(fromActivation.subscriptionId);
    expect(fromTransaction.periodStart).toBe(fromActivation.periodStart);
    expect(fromTransaction.planId).toBe(fromActivation.planId);
  });

  it("treats a transaction with no subscription as a one-time pack", () => {
    const intent = paddleEventToIntent(transactionCompleted(PRICE_PACK, { subscriptionId: null }), resolve);
    expect(intent.kind).toBe("grant-pack");
    if (intent.kind !== "grant-pack") return;
    expect(intent.packId).toBe("listing5");
    expect(intent.grant).toEqual(PACK_CATALOG.listing5.grants);
  });

  it("never grants on cancel, pause or past_due", () => {
    for (const eventType of ["subscription.canceled", "subscription.paused", "subscription.past_due"]) {
      const intent = paddleEventToIntent(
        { eventId: "e", eventType, data: { id: "sub_1", status: "canceled", customerId: "ctm_1" } },
        resolve,
      );
      expect(intent.kind).toBe("subscription-status");
    }
  });

  it("ignores event types it does not handle", () => {
    expect(paddleEventToIntent({ eventId: "e", eventType: "report.created" }, resolve).kind).toBe("ignore");
  });

  it("reads the local user id out of customData in both string and number form", () => {
    expect(userIdFromCustomData({ userId: "42" })).toBe(42);
    expect(userIdFromCustomData({ userId: 42 })).toBe(42);
    expect(userIdFromCustomData({ userId: "abc" })).toBeNull();
    expect(userIdFromCustomData(null)).toBeNull();
  });
});

describe("nextQuotaState", () => {
  const start: QuotaState = { subscriptionVideos: 2, permanentVideos: 5, subscriptionStaging: 1, permanentStaging: 0 };

  it("resets the subscription bucket on a period grant and leaves purchased credit alone", () => {
    // The regression test for the bug this two-bucket design exists to prevent: a renewal
    // must never delete a pack the customer already paid for.
    const intent = paddleEventToIntent(subscriptionActivated(PRICE_STARTER), resolve);
    const next = nextQuotaState(start, intent);
    expect(next.subscriptionVideos).toBe(PLAN_CATALOG.starter.perPeriod.videos);
    expect(next.permanentVideos).toBe(5);
  });

  it("adds a pack to the permanent bucket and leaves the subscription allowance alone", () => {
    const intent = paddleEventToIntent(transactionCompleted(PRICE_PACK, { subscriptionId: null }), resolve);
    const next = nextQuotaState(start, intent);
    expect(next.permanentVideos).toBe(5 + PACK_CATALOG.listing5.grants.videos);
    expect(next.subscriptionVideos).toBe(2);
  });

  it("leaves the balance untouched for status-only and ignored events", () => {
    const status = paddleEventToIntent({ eventId: "e", eventType: "subscription.canceled", data: { id: "sub_1" } }, resolve);
    expect(nextQuotaState(start, status)).toEqual(start);
    expect(nextQuotaState(start, { kind: "ignore", reason: "test" })).toEqual(start);
  });
});

describe("price formatting", () => {
  it("renders BHD with three decimals, because the dinar's minor unit is 1/1000", () => {
    // 35 BHD at the CBB peg of 2.659 is what the business plan's package is priced at.
    const label = formatBhd(9_300);
    expect(label).toMatch(/34\.9\d\d/);
  });

  it("renders whole-dollar prices without trailing zeros", () => {
    expect(formatUsd(8_900)).toBe("$89");
  });
});
