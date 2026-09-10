import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { findPlanByPriceId, findTopupByPriceId, getBillingPlans, getBillingTopups } from "./billingPlans";
import { getSubscriptionByUserId } from "./db";
import { getPaddleClient } from "./paddleClient";

export const billingRouter = router({
  getPlans: publicProcedure.query(() => ({
    plans: getBillingPlans(),
    topups: getBillingTopups(),
  })),

  getCheckoutContext: protectedProcedure.input(z.object({ priceId: z.string().min(1) })).query(({ ctx, input }) => {
    if (!findPlanByPriceId(input.priceId) && !findTopupByPriceId(input.priceId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown price." });
    }
    return {
      priceId: input.priceId,
      customerEmail: ctx.user.email,
      customData: { userId: ctx.user.id },
    };
  }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await getSubscriptionByUserId(ctx.user.id);
    const plan = subscription ? findPlanByPriceId(subscription.paddlePriceId) : undefined;
    return {
      subscription: subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            planName: plan?.planName ?? null,
          }
        : null,
      videosRemaining: ctx.user.videosRemaining,
      stagingCreditsRemaining: ctx.user.stagingCreditsRemaining,
    };
  }),

  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const subscription = await getSubscriptionByUserId(ctx.user.id);
    if (!subscription) throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription." });
    try {
      await getPaddleClient().subscriptions.cancel(subscription.paddleSubscriptionId, {});
      return { success: true } as const;
    } catch (error) {
      console.error("[Billing] cancelSubscription failed:", error);
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to cancel subscription right now." });
    }
  }),
});
