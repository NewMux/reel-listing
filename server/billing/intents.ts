/**
 * Pure translation of a Paddle webhook event into an intent to change local state.
 *
 * Deliberately free of database and network access so the rules that can actually lose
 * money -- who gets credited, how much, and whether a grant is a reset or an addition --
 * are unit-testable without Paddle or Postgres. `server/billing/apply.ts` executes what
 * this decides.
 */

import { PACK_CATALOG, PLAN_CATALOG, type Entitlement, type PackId, type PlanId } from "@shared/plans";

/** Which balance a change lands on. See drizzle/0010_billing.sql for why there are two. */
export type CreditBucket = "subscription" | "permanent";

/** What a Paddle price ID is worth to us. Resolved from env; see paddleEnv.ts. */
export type PriceRef = { type: "plan"; planId: PlanId } | { type: "pack"; packId: PackId };
export type PriceResolver = (priceId: string) => PriceRef | null;

/**
 * A structural view of the fields we read off an unmarshalled Paddle event. Declared
 * locally rather than importing the SDK's `EventEntity` union so tests can build a plain
 * object literal, and so a payload shape we do not handle cannot silently typecheck.
 */
export type PaddleEventView = {
  eventId: string;
  eventType: string;
  occurredAt?: string;
  data?: {
    id?: string;
    status?: string;
    customerId?: string | null;
    subscriptionId?: string | null;
    origin?: string;
    customData?: unknown;
    scheduledChange?: { action?: string; effectiveAt?: string } | null;
    currentBillingPeriod?: { startsAt?: string; endsAt?: string } | null;
    billingPeriod?: { startsAt?: string; endsAt?: string } | null;
    items?: PaddleLineItem[];
  };
};

export type BillingIntent =
  | { kind: "ignore"; reason: string }
  /**
   * Reset the subscription bucket to this plan's allowance for one billing period.
   * `periodStart` is the idempotency key -- a new subscription emits both
   * subscription.activated and transaction.completed, and both describe the same period.
   */
  | {
      kind: "grant-period";
      subscriptionId: string;
      planId: PlanId;
      grant: Entitlement;
      periodStart: string | null;
      periodEnd: string | null;
      status: string;
      cancelAtPeriodEnd: boolean;
      customerId: string | null;
    }
  /** Add to the permanent bucket. Pack credits never expire and never reset. */
  | { kind: "grant-pack"; packId: PackId; transactionId: string; grant: Entitlement; customerId: string | null }
  /** Status-only change: cancel, pause, past_due. Balances are never touched. */
  | {
      kind: "subscription-status";
      subscriptionId: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      periodStart: string | null;
      periodEnd: string | null;
      customerId: string | null;
    };

const asString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/**
 * The local user id Paddle is carrying for us. Set as `customData` when checkout opens.
 * Paddle copies it onto the subscription, but renewals carry the *subscription's* custom
 * data rather than the original checkout's, so this can legitimately be absent -- callers
 * must fall back to the stored paddleCustomerId.
 */
export function userIdFromCustomData(customData: unknown): number | null {
  if (!customData || typeof customData !== "object") return null;
  const raw = (customData as Record<string, unknown>).userId;
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type PaddleLineItem = { price?: { id?: string } | null; quantity?: number };

/** The first item whose price maps to something we sell. Ignores add-ons we do not know. */
function resolveItems(items: PaddleLineItem[] | undefined, resolve: PriceResolver): PriceRef | null {
  for (const item of items ?? []) {
    const priceId = asString(item?.price?.id);
    if (!priceId) continue;
    const ref = resolve(priceId);
    if (ref) return ref;
  }
  return null;
}

export function paddleEventToIntent(event: PaddleEventView, resolve: PriceResolver): BillingIntent {
  const data = event.data ?? {};
  const customerId = asString(data.customerId);

  switch (event.eventType) {
    case "subscription.activated":
    case "subscription.created":
    case "subscription.resumed":
    case "subscription.updated": {
      const subscriptionId = asString(data.id);
      if (!subscriptionId) return { kind: "ignore", reason: "subscription event without an id" };

      const ref = resolveItems(data.items, resolve);
      const period = data.currentBillingPeriod ?? null;
      const status = asString(data.status) ?? "active";
      const cancelAtPeriodEnd = data.scheduledChange?.action === "cancel";

      // Only an active or trialing subscription on a price we recognise earns credit. A
      // past_due or paused subscription keeps whatever balance it has but gets no more.
      if (!ref || ref.type !== "plan" || (status !== "active" && status !== "trialing")) {
        return {
          kind: "subscription-status",
          subscriptionId,
          status,
          cancelAtPeriodEnd,
          periodStart: asString(period?.startsAt),
          periodEnd: asString(period?.endsAt),
          customerId,
        };
      }

      return {
        kind: "grant-period",
        subscriptionId,
        planId: ref.planId,
        grant: PLAN_CATALOG[ref.planId].perPeriod,
        periodStart: asString(period?.startsAt),
        periodEnd: asString(period?.endsAt),
        status,
        cancelAtPeriodEnd,
        customerId,
      };
    }

    case "subscription.canceled":
    case "subscription.past_due":
    case "subscription.paused": {
      const subscriptionId = asString(data.id);
      if (!subscriptionId) return { kind: "ignore", reason: "subscription event without an id" };
      const period = data.currentBillingPeriod ?? null;
      return {
        kind: "subscription-status",
        subscriptionId,
        // Credits already granted for the current period are deliberately left alone. The
        // customer paid for this period; taking the videos back would not be defensible.
        status: asString(data.status) ?? event.eventType.split(".")[1],
        cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
        periodStart: asString(period?.startsAt),
        periodEnd: asString(period?.endsAt),
        customerId,
      };
    }

    case "transaction.completed": {
      const ref = resolveItems(data.items, resolve);
      if (!ref) return { kind: "ignore", reason: "transaction contains no price we sell" };

      const subscriptionId = asString(data.subscriptionId);

      // A one-time pack: no subscription attached, so it adds to the permanent bucket.
      if (!subscriptionId) {
        if (ref.type !== "pack") return { kind: "ignore", reason: "plan price bought outside a subscription" };
        const transactionId = asString(data.id);
        if (!transactionId) return { kind: "ignore", reason: "transaction without an id" };
        return { kind: "grant-pack", packId: ref.packId, transactionId, grant: PACK_CATALOG[ref.packId].grants, customerId };
      }

      // A subscription payment -- the initial one or a renewal. We do not need to tell
      // those apart: both name a billing period, and the period is what we dedupe on.
      if (ref.type !== "plan") return { kind: "ignore", reason: "pack price billed against a subscription" };
      const period = data.billingPeriod ?? null;
      return {
        kind: "grant-period",
        subscriptionId,
        planId: ref.planId,
        grant: PLAN_CATALOG[ref.planId].perPeriod,
        periodStart: asString(period?.startsAt),
        periodEnd: asString(period?.endsAt),
        status: "active",
        cancelAtPeriodEnd: false,
        customerId,
      };
    }

    default:
      return { kind: "ignore", reason: `unhandled event type ${event.eventType}` };
  }
}

/** The four counters that make up a user's balance. */
export type QuotaState = {
  subscriptionVideos: number;
  permanentVideos: number;
  subscriptionStaging: number;
  permanentStaging: number;
};

/**
 * The balance after an intent is applied. Pure, so the "a renewal must not wipe a
 * purchased pack" rule is provable in a unit test rather than in production.
 */
export function nextQuotaState(current: QuotaState, intent: BillingIntent): QuotaState {
  switch (intent.kind) {
    case "grant-period":
      // SET, not add: a period allowance is perishable and does not roll over. The
      // permanent bucket is untouched.
      return {
        ...current,
        subscriptionVideos: intent.grant.videos,
        subscriptionStaging: intent.grant.staging,
      };
    case "grant-pack":
      // ADD, and only ever to the permanent bucket.
      return {
        ...current,
        permanentVideos: current.permanentVideos + intent.grant.videos,
        permanentStaging: current.permanentStaging + intent.grant.staging,
      };
    default:
      return current;
  }
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const str = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

function period(raw: unknown): { startsAt?: string; endsAt?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return { startsAt: str(obj.starts_at), endsAt: str(obj.ends_at) };
}

/**
 * Maps a raw Paddle webhook body (snake_case JSON) onto the fields we actually read.
 *
 * We parse the payload ourselves rather than using the SDK's `unmarshal`, which builds
 * strict entity objects and throws on anything it does not model -- an add-on line with no
 * unit price, or a field Paddle adds later, is enough to make it reject an event. Refusing
 * a correctly signed payment because of a field we never look at is not a trade worth
 * making, so signature checking (which we still delegate to the SDK) is kept separate from
 * interpretation, which is deliberately tolerant.
 */
export function normalizePaddleEvent(raw: unknown): PaddleEventView | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;

  const eventId = str(event.event_id);
  const eventType = str(event.event_type);
  if (!eventId || !eventType) return null;

  const data = (event.data && typeof event.data === "object" ? event.data : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(data.items) ? data.items : [];

  const scheduled = data.scheduled_change && typeof data.scheduled_change === "object"
    ? (data.scheduled_change as Record<string, unknown>)
    : null;

  return {
    eventId,
    eventType,
    occurredAt: str(event.occurred_at),
    data: {
      id: str(data.id),
      status: str(data.status),
      customerId: str(data.customer_id) ?? null,
      subscriptionId: str(data.subscription_id) ?? null,
      origin: str(data.origin),
      customData: data.custom_data ?? null,
      scheduledChange: scheduled ? { action: str(scheduled.action), effectiveAt: str(scheduled.effective_at) } : null,
      currentBillingPeriod: period(data.current_billing_period),
      billingPeriod: period(data.billing_period),
      items: rawItems.map(item => {
        const entry = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const price = (entry.price && typeof entry.price === "object" ? entry.price : {}) as Record<string, unknown>;
        return { price: { id: str(price.id) }, quantity: typeof entry.quantity === "number" ? entry.quantity : 1 };
      }),
    },
  };
}
