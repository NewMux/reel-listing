import type { EventEntity } from "@paddle/paddle-node-sdk";
import { claimWebhookEvent, getUserById, incrementStagingCredits, incrementVideoQuota, releaseWebhookEvent, setPaddleCustomerId, setUserQuota, upsertSubscription } from "./db";
import { findPlanByPriceId, findTopupByPriceId } from "./billingPlans";

function userIdFromCustomData(customData: Record<string, unknown> | null): number | null {
  const raw = customData?.userId;
  const userId = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(userId) ? userId : null;
}

async function syncSubscription(data: {
  id: string;
  status: string;
  customerId: string;
  items: Array<{ price: { id: string } | null }>;
  currentBillingPeriod: { endsAt: string } | null;
  scheduledChange: { action: string } | null;
  customData: Record<string, unknown> | null;
}) {
  const userId = userIdFromCustomData(data.customData);
  if (!userId) {
    console.error("[Billing] subscription event missing customData.userId, cannot sync:", data.id);
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    console.error("[Billing] subscription event references unknown userId:", userId);
    return;
  }
  if (!user.paddleCustomerId) await setPaddleCustomerId(userId, data.customerId);

  const priceId = data.items[0]?.price?.id ?? "";
  await upsertSubscription({
    userId,
    paddleSubscriptionId: data.id,
    paddlePriceId: priceId,
    status: data.status as "active" | "trialing" | "past_due" | "paused" | "canceled",
    currentPeriodEnd: data.currentBillingPeriod ? new Date(data.currentBillingPeriod.endsAt) : null,
    cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
  });
}

async function grantFromTransaction(data: { items: Array<{ price: { id: string } | null }>; customData: Record<string, unknown> | null }) {
  const userId = userIdFromCustomData(data.customData);
  if (!userId) {
    console.error("[Billing] transaction.completed missing customData.userId, cannot grant quota");
    return;
  }
  for (const item of data.items) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    const plan = findPlanByPriceId(priceId);
    if (plan) {
      await setUserQuota(userId, { videosRemaining: plan.videoQuota, stagingCreditsRemaining: plan.stagingCreditQuota });
      continue;
    }
    const topup = findTopupByPriceId(priceId);
    if (topup) {
      if (topup.videoCredits > 0) await incrementVideoQuota(userId, topup.videoCredits);
      if (topup.stagingCredits > 0) await incrementStagingCredits(userId, topup.stagingCredits);
    }
  }
}

export async function handlePaddleEvent(event: EventEntity): Promise<void> {
  const claimed = await claimWebhookEvent(event.eventId, event.eventType);
  if (!claimed) return; // duplicate/retried delivery, already processed

  try {
    switch (event.eventType) {
      case "subscription.created":
      case "subscription.updated":
      case "subscription.canceled": {
        const data = event.data as unknown as {
          id: string;
          status: string;
          customerId: string;
          items: Array<{ price: { id: string } | null }>;
          currentBillingPeriod: { endsAt: string } | null;
          scheduledChange: { action: string } | null;
          customData: Record<string, unknown> | null;
        };
        await syncSubscription(data);
        break;
      }
      case "transaction.completed": {
        const data = event.data as unknown as { items: Array<{ price: { id: string } | null }>; customData: Record<string, unknown> | null };
        await grantFromTransaction(data);
        break;
      }
      default:
        break; // ignored event type, still marked processed above
    }
  } catch (error) {
    await releaseWebhookEvent(event.eventId);
    throw error;
  }
}
