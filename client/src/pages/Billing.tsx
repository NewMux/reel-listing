import { AlertTriangle, CreditCard, ExternalLink, Package, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppChrome";
import { useCheckout } from "@/hooks/useCheckout";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";

type PlanKey = "starter" | "pro" | "agency";

function formatDate(value: Date | string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-GB", { dateStyle: "medium" }).format(date);
}

export default function Billing() {
  const { locale } = useLocale();
  const t = copy[locale].billing;
  const tp = copy[locale].pricing;
  const overview = trpc.billing.overview.useQuery();
  const plansQuery = trpc.billing.plans.useQuery();
  const portal = trpc.billing.portalUrl.useMutation();
  const { checkout, pendingId } = useCheckout();
  const [openingPortal, setOpeningPortal] = useState(false);

  const openPortal = async () => {
    setOpeningPortal(true);
    try {
      const session = await portal.mutateAsync();
      // A user who has never checked out has no Paddle customer, so no portal exists.
      if (!session) {
        toast.info(t.manageUnavailable);
        return;
      }
      window.open(session.overviewUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.checkoutFailed);
    } finally {
      setOpeningPortal(false);
    }
  };

  const data = overview.data;
  const packs = plansQuery.data?.packs ?? [];
  const plans = plansQuery.data?.plans ?? [];
  const outOfCredit = data ? data.videos.total === 0 : false;

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[1000px] px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="serif text-4xl tracking-[-.04em] text-[#251811]">{t.title}</h1>
        <p className="mt-2 text-sm text-[#736A65]">{t.body}</p>

        {data?.billingBlocked && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#C2643C]/30 bg-[#FFEFE5] px-5 py-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#94522C]" />
            <p className="text-sm text-[#94522C]">{t.blocked}</p>
          </div>
        )}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[24px] border border-[#251811]/10 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.creditsTitle}</p>
            <p className="serif mt-4 text-5xl tracking-[-.05em] text-[#251811]">{data?.videos.total ?? "—"}</p>
            <p className="mt-1 text-sm text-[#736A65]">{t.videosLabel}</p>
            {data && (
              <ul className="mt-4 space-y-1 text-xs text-[#8C7F78]">
                <li>
                  {data.videos.subscription} — {t.planCredits}
                </li>
                <li>
                  {data.videos.permanent} — {t.packCredits}
                </li>
              </ul>
            )}
          </div>

          <div className="rounded-[24px] border border-[#251811]/10 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.planLabel}</p>
            {data?.subscription ? (
              <>
                <p className="serif mt-4 text-4xl tracking-[-.04em] text-[#251811]">
                  {tp.names[data.subscription.planId as PlanKey] ?? data.subscription.planId}
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#8C7F78]">{t.statusLabel}</dt>
                    <dd className="font-semibold text-[#473830]">{data.subscription.status}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#8C7F78]">{data.subscription.cancelAtPeriodEnd ? t.endsLabel : t.renewsLabel}</dt>
                    <dd className="font-semibold text-[#473830]">{formatDate(data.subscription.currentPeriodEnd, locale)}</dd>
                  </div>
                </dl>
                {data.subscription.cancelAtPeriodEnd && <p className="mt-3 text-xs text-[#94522C]">{t.cancelScheduled}</p>}
                <button
                  onClick={() => void openPortal()}
                  disabled={openingPortal}
                  className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#251811] text-sm font-bold text-white disabled:opacity-60"
                >
                  <CreditCard size={16} />
                  {openingPortal ? t.managePending : t.manage}
                  <ExternalLink size={14} />
                </button>
              </>
            ) : (
              <>
                <p className="serif mt-4 text-3xl tracking-[-.04em] text-[#251811]">{t.noPlan}</p>
                <p className="mt-3 text-sm text-[#736A65]">{t.outOfCreditBody}</p>
              </>
            )}
          </div>
        </section>

        {outOfCredit && !data?.subscription && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#251811]/10 bg-[#F0E8E3]/60 px-5 py-4">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-[#8C5738]" />
            <div>
              <p className="text-sm font-semibold text-[#473830]">{t.outOfCredit}</p>
              <p className="mt-1 text-sm text-[#736A65]">{t.outOfCreditBody}</p>
            </div>
          </div>
        )}

        {!data?.subscription && plans.length > 0 && (
          <section className="mt-10">
            <h2 className="serif text-2xl tracking-[-.04em] text-[#251811]">{t.choosePlan}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {plans.map(plan => (
                <button
                  key={plan.id}
                  onClick={() => void checkout({ planId: plan.id })}
                  disabled={pendingId === plan.id}
                  className="rounded-[20px] border border-[#251811]/10 bg-white p-5 text-start hover:border-[#251811]/25 disabled:opacity-60"
                >
                  <p className="text-sm font-bold text-[#7A5743]">{tp.names[plan.id as PlanKey]}</p>
                  <p className="serif mt-2 text-3xl tracking-[-.04em] text-[#251811]">{plan.usdLabel}</p>
                  <p className="text-xs text-[#8C7F78]">≈ {plan.bhdLabel}</p>
                  <p className="mt-3 text-sm text-[#51453E]">
                    {plan.videos} {tp.videosPerMonth}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {packs.length > 0 && (
          <section className="mt-10">
            <h2 className="serif text-2xl tracking-[-.04em] text-[#251811]">{t.buyPack}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {packs.map(pack => (
                <div key={pack.id} className="flex items-center justify-between gap-4 rounded-[20px] border border-[#251811]/10 bg-white p-5">
                  <div className="flex items-start gap-3">
                    <Package size={18} className="mt-1 shrink-0 text-[#8C5738]" />
                    <div>
                      <p className="serif text-2xl tracking-[-.04em] text-[#251811]">{pack.usdLabel}</p>
                      <p className="text-xs text-[#8C7F78]">
                        ≈ {pack.bhdLabel} · {pack.videos} {tp.packVideos}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void checkout({ packId: pack.id })}
                    disabled={pendingId === pack.id}
                    className="h-10 shrink-0 rounded-xl bg-[#F0EAE6] px-5 text-sm font-bold text-[#322219] hover:bg-[#E8D6CC] disabled:opacity-60"
                  >
                    {tp.packCta}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="mt-10 text-xs text-[#8C7F78]">{tp.bhdNote}</p>
      </main>
    </AppSidebar>
  );
}
