import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { wrapperCopy } from "@/lib/wrapperCopy";
import { trpc } from "@/lib/trpc";
import { openPaddleCheckout } from "@/lib/paddle";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { PLAN_CREDITS, type PlanId } from "@shared/billing";

const PRICE_USD: Record<PlanId, number> = { starter: 89, pro: 229, agency: 499 };

export default function Pricing() {
  const { locale } = useLocale();
  const t = copy[locale];
  const w = wrapperCopy[locale];
  const { user } = useAuth();
  const [pending, setPending] = useState<PlanId | null>(null);
  const checkout = trpc.billing.checkout.useMutation();

  const pick = async (plan: PlanId) => {
    if (!user) { startLogin(); return; }
    setPending(plan);
    try {
      const session = await checkout.mutateAsync({ plan });
      toast.message(w.pricing.opening);
      await openPaddleCheckout({
        ...session,
        successUrl: `${window.location.origin}/dashboard?checkout=success`,
        onClose: () => setPending(null),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.common.errorTitle);
      setPending(null);
    }
  };

  const plans = w.pricing.plans.map(plan => ({ ...plan, id: plan.id as PlanId }));
  const cells: ((plan: PlanId) => string)[] = [
    plan => PLAN_CREDITS[plan].toLocaleString("en-US"),
    plan => `≈ ${Math.floor(PLAN_CREDITS[plan] / 100)}`,
    plan => `$${(PRICE_USD[plan] / PLAN_CREDITS[plan]).toFixed(2)}`,
  ];

  return (
    <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
      <PublicNav />
      <main className="mx-auto max-w-[1280px] px-5 pb-24 pt-12 sm:px-8 sm:pt-20">
        <div className="mx-auto max-w-[710px] text-center">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.pricing.eyebrow}</p>
          <h1 className="serif mt-4 text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">{t.pricing.title}</h1>
          <p className="mx-auto mt-5 max-w-[560px] text-base leading-7 text-[#736A65]">{w.pricing.body}</p>
          <p className="mx-auto mt-6 inline-flex rounded-full border border-[#251811]/10 bg-white px-4 py-2 text-xs font-bold text-[#625852]">{w.creditRule} · {w.pricing.trial}</p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const featured = index === 1;
            return (
              <article key={plan.id} className={`relative rounded-[27px] border p-6 sm:p-7 ${featured ? "border-[#251811] bg-[#251811] text-[#F8F3F0] shadow-[0_26px_60px_rgba(17,37,30,.18)]" : "border-[#251811]/10 bg-white"}`}>
                {featured && <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#E9C6B2] px-3 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#572E16]"><Sparkles size={12} />{t.pricing.mostPopular}</div>}
                <p className={`text-sm font-bold ${featured ? "text-[#E9C6B2]" : "text-[#7A5743]"}`}>{plan.name}</p>
                <p className="serif mt-5 text-5xl tracking-[-.05em]">{plan.price}<span className={`ms-1 font-sans text-sm font-medium tracking-normal ${featured ? "text-[#BAAFA9]" : "text-[#807671]"}`}>{t.pricing.perMonth}</span></p>
                <p className={`mt-3 text-sm ${featured ? "text-[#D5CFCB]" : "text-[#746B66]"}`}>{plan.tagline}</p>
                <button disabled={pending !== null} onClick={() => void pick(plan.id)} className={`mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-60 ${featured ? "bg-[#E9C6B2] text-[#322219] hover:bg-[#F3DACB]" : "bg-[#F0EAE6] text-[#322219] hover:bg-[#E8D6CC]"}`}>
                  {pending === plan.id && <Loader2 size={15} className="animate-spin" />}{t.pricing.choose}
                </button>
                <div className={`my-6 h-px ${featured ? "bg-white/12" : "bg-[#251811]/9"}`} />
                <ul className="space-y-3">
                  {plan.features.map(item => <li key={item} className={`flex gap-2 text-sm ${featured ? "text-[#ECE9E7]" : "text-[#51453E]"}`}><Check size={16} className={`mt-0.5 shrink-0 ${featured ? "text-[#E9C6B2]" : "text-[#8C5738]"}`} />{item}</li>)}
                </ul>
              </article>
            );
          })}
        </div>

        <section className="mt-20 overflow-hidden rounded-[28px] border border-[#251811]/10 bg-white">
          <div className="border-b border-[#251811]/10 px-6 py-6 sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.pricing.compare}</p>
            <h2 className="serif mt-2 text-3xl tracking-[-.04em]">Starter · Pro · Agency</h2>
            <p className="mt-2 text-xs font-semibold text-[#8C7F78] sm:hidden">{t.pricing.swipeHint}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-start text-sm">
              <thead className="bg-[#F0E8E3]/55 text-[#736A64]"><tr><th className="px-6 py-4 text-start font-semibold"></th>{plans.map(plan => <th key={plan.id} className="px-6 py-4 text-start font-bold text-[#402F25]">{plan.name}</th>)}</tr></thead>
              <tbody>{w.pricing.rows.map((row, i) => <tr key={row} className="border-t border-[#251811]/8"><td className="px-6 py-4 font-semibold text-[#473830]">{row}</td>{plans.map(plan => <td key={plan.id} className="px-6 py-4">{cells[i](plan.id)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
