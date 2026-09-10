import { Check } from "lucide-react";
import { toast } from "sonner";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { openPaddleCheckout } from "@/lib/paddle";
import { trpc } from "@/lib/trpc";

export default function Pricing() {
  const { locale } = useLocale();
  const t = copy[locale];
  const { user } = useAuth();
  const plansQuery = trpc.billing.getPlans.useQuery();
  const utils = trpc.useUtils();

  async function choose(priceId: string) {
    if (!user) {
      startLogin();
      return;
    }
    try {
      const context = await utils.billing.getCheckoutContext.fetch({ priceId });
      await openPaddleCheckout(context);
    } catch {
      toast.error(t.billing.checkoutUnavailable);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
      <PublicNav />
      <main className="mx-auto max-w-[1280px] px-5 pb-24 pt-12 sm:px-8 sm:pt-20">
        <div className="mx-auto max-w-[710px] text-center">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.pricing.eyebrow}</p>
          <h1 className="serif mt-4 text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">{t.pricing.title}</h1>
          <p className="mx-auto mt-5 max-w-[560px] text-base leading-7 text-[#736A65]">{t.pricing.body}</p>
        </div>
        {plansQuery.isLoading ? (
          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-[27px] bg-[#EDE3DD]" />)}
          </div>
        ) : plansQuery.data?.plans.length ? (
          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {plansQuery.data.plans.map(plan => (
              <article key={plan.priceId} className="relative rounded-[27px] border border-[#251811]/10 bg-white p-6 sm:p-7">
                <p className="text-sm font-bold text-[#7A5743]">{plan.planName}</p>
                <p className="serif mt-5 text-5xl tracking-[-.05em]">{plan.displayPrice}</p>
                <div className="my-6 h-px bg-[#251811]/9" />
                <ul className="space-y-3">
                  <li className="flex gap-2 text-sm text-[#51453E]"><Check size={16} className="mt-0.5 shrink-0 text-[#8C5738]" />{plan.videoQuota} {t.pricing.videosPerMonth}</li>
                  {plan.stagingCreditQuota > 0 && <li className="flex gap-2 text-sm text-[#51453E]"><Check size={16} className="mt-0.5 shrink-0 text-[#8C5738]" />{plan.stagingCreditQuota} {t.pricing.stagingPerMonth}</li>}
                </ul>
                <button onClick={() => choose(plan.priceId)} className="mt-7 h-11 w-full rounded-xl bg-[#F0EAE6] text-sm font-bold text-[#322219] hover:bg-[#E8D6CC]">{t.pricing.choose}</button>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-14 text-center text-sm text-[#736A65]">{t.pricing.empty}</p>
        )}
      </main>
      <Footer />
    </div>
  );
}
