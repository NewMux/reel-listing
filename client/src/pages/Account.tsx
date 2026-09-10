import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { openPaddleCheckout } from "@/lib/paddle";
import { trpc } from "@/lib/trpc";

function formatDate(value: string | Date | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function Account() {
  const { locale } = useLocale();
  const t = copy[locale];
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const subscriptionQuery = trpc.billing.getSubscription.useQuery();
  const plansQuery = trpc.billing.getPlans.useQuery();
  const cancelMutation = trpc.billing.cancelSubscription.useMutation();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  async function buy(priceId: string) {
    try {
      const context = await utils.billing.getCheckoutContext.fetch({ priceId });
      await openPaddleCheckout(context);
    } catch {
      toast.error(t.billing.checkoutUnavailable);
    }
  }

  async function confirmCancel() {
    try {
      await cancelMutation.mutateAsync();
      toast.success(t.billing.cancelSuccess);
      setConfirmingCancel(false);
      await utils.billing.getSubscription.invalidate();
    } catch {
      toast.error(t.billing.cancelError);
    }
  }

  const subscription = subscriptionQuery.data?.subscription ?? null;
  const statusLabels = t.billing.status as Record<string, string>;

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[900px] px-5 py-9 sm:px-8 lg:px-10 lg:py-12">
        <h1 className="serif text-4xl tracking-[-.05em] sm:text-5xl">{t.billing.title}</h1>

        <section className="mt-8 rounded-[23px] border border-[#251811]/9 bg-white p-6 sm:p-7">
          {subscriptionQuery.isLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-[#EDE3DD]" />
          ) : subscription ? (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="serif text-2xl tracking-[-.04em]">{subscription.planName || "—"}</p>
                <span className="rounded-full bg-[#F0EAE6] px-2.5 py-1 text-[11px] font-bold text-[#402E24]">{statusLabels[subscription.status] || subscription.status}</span>
              </div>
              {subscription.currentPeriodEnd && (
                <p className="mt-2 text-sm text-[#766C66]">
                  {subscription.cancelAtPeriodEnd ? t.billing.endsLabel : t.billing.renewsLabel} {formatDate(subscription.currentPeriodEnd)}
                </p>
              )}
              {!subscription.cancelAtPeriodEnd && subscription.status !== "canceled" && (
                confirmingCancel ? (
                  <div className="mt-5 rounded-xl bg-[#FFEFE5] p-4">
                    <p className="text-sm font-semibold text-[#402E24]">{t.billing.cancelConfirmTitle}</p>
                    <p className="mt-1 text-sm text-[#766C66]">{t.billing.cancelConfirmBody}</p>
                    <div className="mt-4 flex gap-2">
                      <button onClick={confirmCancel} disabled={cancelMutation.isPending} className="h-10 rounded-xl bg-[#251811] px-4 text-sm font-bold text-white disabled:opacity-60">{t.billing.cancelConfirmAction}</button>
                      <button onClick={() => setConfirmingCancel(false)} className="h-10 rounded-xl px-4 text-sm font-semibold text-[#635953] hover:bg-white">{t.billing.cancelConfirmCancel}</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConfirmingCancel(true)} className="mt-5 h-10 rounded-xl border border-[#251811]/15 px-4 text-sm font-semibold text-[#635953] hover:bg-[#F0EAE6]">{t.billing.cancelButton}</button>
                )
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-[#766C66]">{t.billing.noSubscription}</p>
              <button onClick={() => setLocation("/pricing")} className="mt-4 h-10 rounded-xl bg-[#251811] px-4 text-sm font-bold text-white">{t.billing.choosePlan}</button>
            </div>
          )}
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[23px] border border-[#251811]/9 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[.1em] text-[#7D736D]">{t.billing.videosRemaining}</p>
            <p className="serif mt-2 text-4xl tracking-[-.04em]">{subscriptionQuery.data?.videosRemaining ?? "—"}</p>
          </div>
          <div className="rounded-[23px] border border-[#251811]/9 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[.1em] text-[#7D736D]">{t.billing.stagingCreditsRemaining}</p>
            <p className="serif mt-2 text-4xl tracking-[-.04em]">{subscriptionQuery.data?.stagingCreditsRemaining ?? "—"}</p>
          </div>
        </section>

        {Boolean(plansQuery.data?.topups.length) && (
          <section className="mt-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#7D736D]">{t.billing.topupsTitle}</p>
            <p className="mt-1 text-sm text-[#766C66]">{t.billing.topupsBody}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {plansQuery.data?.topups.map(topup => (
                <div key={topup.priceId} className="flex items-center justify-between rounded-[18px] border border-[#251811]/9 bg-white p-4">
                  <div>
                    <p className="text-sm font-bold text-[#36261C]">{topup.name}</p>
                    <p className="text-sm text-[#766C66]">{topup.displayPrice}</p>
                  </div>
                  <button onClick={() => buy(topup.priceId)} className="h-9 rounded-xl bg-[#F0EAE6] px-3.5 text-sm font-bold text-[#322219] hover:bg-[#E8D6CC]">{t.billing.buy}</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </AppSidebar>
  );
}
