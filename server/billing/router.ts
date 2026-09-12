/** Checkout, entitlement display, and subscription management. */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  PACK_CATALOG,
  PLAN_CATALOG,
  TRIAL_GRANT,
  formatBhd,
  formatUsd,
  isPackId,
  isPlanId,
  type PackId,
  type PlanId,
} from "@shared/plans";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  getSubscriptionsForUser,
  getUserById,
  grantTrialIfNew,
  linkPaddleCustomer,
  listRecentBillingEvents,
} from "../db";
import { createPortalSession, ensurePaddleCustomer } from "./paddle";
import { PADDLE_ENV, isPaddleConfigured, purchasablePackIds, purchasablePlanIds } from "./paddleEnv";

/** Paddle statuses that still entitle the holder to their allowance. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export const billingRouter = router({
  /**
   * The public catalog. Price IDs live in server env rather than shared/plans.ts (that
   * file is compiled for both the browser and the server, so neither process.env nor
   * import.meta.env works there) and reach the client through this query.
   */
  plans: publicProcedure.query(() => ({
    environment: PADDLE_ENV.environment,
    configured: isPaddleConfigured(),
    plans: purchasablePlanIds().map(id => {
      const plan = PLAN_CATALOG[id];
      return {
        id,
        priceId: PADDLE_ENV.planPriceIds[id],
        usdCents: plan.usdMonthlyCents,
        usdLabel: formatUsd(plan.usdMonthlyCents),
        bhdLabel: formatBhd(plan.usdMonthlyCents),
        videos: plan.perPeriod.videos,
        staging: plan.perPeriod.staging,
      };
    }),
    packs: purchasablePackIds().map(id => {
      const pack = PACK_CATALOG[id];
      return {
        id,
        priceId: PADDLE_ENV.packPriceIds[id],
        usdCents: pack.usdOnceCents,
        usdLabel: formatUsd(pack.usdOnceCents),
        bhdLabel: formatBhd(pack.usdOnceCents),
        videos: pack.grants.videos,
        staging: pack.grants.staging,
      };
    }),
  })),

  /** Balances and subscription state for the signed-in user. */
  overview: protectedProcedure.query(async ({ ctx }) => {
    // Issue the one-time trial on first look, rather than as a column default that gave
    // every signup ~$33 of render credit before a card was ever attached.
    await grantTrialIfNew(ctx.user.id, TRIAL_GRANT.videos, TRIAL_GRANT.staging).catch(() => false);

    const user = await getUserById(ctx.user.id);
    const subs = await getSubscriptionsForUser(ctx.user.id);
    const active = subs.find(s => LIVE_STATUSES.has(s.status)) ?? null;

    const subscriptionVideos = user?.subscriptionVideosRemaining ?? 0;
    const permanentVideos = user?.videosRemaining ?? 0;

    return {
      videos: {
        subscription: subscriptionVideos,
        permanent: permanentVideos,
        total: subscriptionVideos + permanentVideos,
      },
      staging: {
        subscription: user?.subscriptionStagingRemaining ?? 0,
        permanent: user?.stagingCreditsRemaining ?? 0,
        total: (user?.subscriptionStagingRemaining ?? 0) + (user?.stagingCreditsRemaining ?? 0),
      },
      billingBlocked: user?.billingBlocked ?? false,
      subscription: active
        ? {
            planId: active.planId,
            status: active.status,
            currentPeriodEnd: active.currentPeriodEnd,
            cancelAtPeriodEnd: active.cancelAtPeriodEnd,
          }
        : null,
    };
  }),

  /**
   * Prepares a checkout. The overlay itself is opened by Paddle.js on the client; the
   * work here is making sure the Paddle customer exists and its id is stored *first*, so
   * the webhook can still find this account if customData does not survive the round trip.
   */
  startCheckout: protectedProcedure
    .input(z.object({ planId: z.string().optional(), packId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!isPaddleConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payments are not configured yet." });
      }
      if (!ctx.user.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add an email address to your account before checking out." });
      }

      let priceId: string;
      if (input.planId) {
        if (!isPlanId(input.planId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown plan." });
        const planId: PlanId = input.planId;

        // One subscription per account. Two would mean two allowances and two invoices.
        const subs = await getSubscriptionsForUser(ctx.user.id);
        if (subs.some(s => s.status === "active" || s.status === "trialing")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You already have an active plan. Use Manage subscription to change it.",
          });
        }
        priceId = PADDLE_ENV.planPriceIds[planId];
      } else if (input.packId) {
        if (!isPackId(input.packId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown pack." });
        const packId: PackId = input.packId;
        priceId = PADDLE_ENV.packPriceIds[packId];
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a plan or a credit pack." });
      }

      if (!priceId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "That item is not available for purchase yet." });

      const existing = await getUserById(ctx.user.id);
      let customerId = existing?.paddleCustomerId ?? null;
      if (!customerId) {
        customerId = await ensurePaddleCustomer({ email: ctx.user.email, name: ctx.user.name, userId: ctx.user.id });
        await linkPaddleCustomer(ctx.user.id, customerId);
      }

      return {
        priceId,
        customerId,
        // Primary link back to this account. The stored customerId above is the fallback.
        customData: { userId: String(ctx.user.id) },
      };
    }),

  /** A short-lived Paddle-hosted management link. Null when the user has never checked out. */
  portalUrl: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user?.paddleCustomerId) return null;

    const subs = await getSubscriptionsForUser(ctx.user.id);
    const ids = subs.filter(s => LIVE_STATUSES.has(s.status)).map(s => s.paddleSubscriptionId);
    try {
      return await createPortalSession(user.paddleCustomerId, ids);
    } catch (error) {
      console.error("[Billing] portal session failed:", error);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not open the billing portal just now." });
    }
  }),

  /** Recent webhook deliveries. The difference between a five-minute answer and a refund. */
  adminEvents: adminProcedure.query(async () => listRecentBillingEvents(50)),
});
