import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import { approxBhd, PLANS } from "@shared/plans";
import { isPaddleConfigured, openPlanCheckout, paddlePriceId } from "@/lib/paddle";

// Rows line up with t.pricing.comparison: clip credits, full reels, team members, support.
// "support" is a placeholder the row renderer swaps for the per-plan support level.
const COMPARISON_VALUES = [
  ["60", "160", "400"],
  ["3", "8", "20"],
  ["1", "1", "5"],
  ["support", "support", "support"],
] as const;

export default function Pricing() {
  const { locale } = useLocale(); const t = copy[locale]; const { user } = useAuth(); const [, setLocation] = useLocation();
  const [pending, setPending] = useState<string | null>(null);

  // Signing in first is what gives the checkout a userId to attach, which is how the webhook
  // knows whose account to credit when Paddle reports the payment.
  const pick = async (index: number) => {
    if (!user) return startLogin();
    const plan = PLANS[index];
    if (!plan) return setLocation("/projects/new");
    if (!isPaddleConfigured() || !paddlePriceId(plan.id)) {
      toast.info(t.pricing.comingSoon);
      return setLocation("/contact");
    }
    setPending(plan.id);
    try {
      await openPlanCheckout(plan.id, user.id, user.email, locale);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.pricing.checkoutError);
    } finally {
      setPending(null);
    }
  };
  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]"><PublicNav/><main className="mx-auto max-w-[1280px] px-5 pb-24 pt-12 sm:px-8 sm:pt-20"><div className="mx-auto max-w-[710px] text-center"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.pricing.eyebrow}</p><h1 className="serif mt-4 text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">{t.pricing.title}</h1><p className="mx-auto mt-5 max-w-[560px] text-base leading-7 text-[#736A65]">{t.pricing.body}</p><p className="mt-8 inline-flex rounded-full border border-[#251811]/10 bg-white px-4 py-2 text-xs font-bold text-[#625852]">{t.pricing.creditNote}</p>
<p className="mt-3 text-xs text-[#8A7F79]">{t.pricing.billedUsd}</p></div><div className="mt-14 grid gap-4 lg:grid-cols-3">{t.pricing.plans.map((plan, index) => <article key={plan[0]} className={`relative rounded-[27px] border p-6 sm:p-7 ${index === 1 ? "border-[#251811] bg-[#251811] text-[#F8F3F0] shadow-[0_26px_60px_rgba(17,37,30,.18)]" : "border-[#251811]/10 bg-white"}`}>{index === 1 && <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#E9C6B2] px-3 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#572E16]"><Sparkles size={12}/>{t.pricing.mostPopular}</div>}<p className={`text-sm font-bold ${index === 1 ? "text-[#E9C6B2]" : "text-[#7A5743]"}`}>{plan[0]}</p><p className="serif mt-5 text-5xl tracking-[-.05em]">{plan[1]}<span className={`ms-1 font-sans text-sm font-medium tracking-normal ${index === 1 ? "text-[#BAAFA9]" : "text-[#807671]"}`}>{t.pricing.perMonth}</span></p>
{PLANS[index] && <p className={`mt-1 text-xs font-semibold ${index === 1 ? "text-[#BAAFA9]" : "text-[#8A7F79]"}`}>{t.pricing.approxBhd.replace("{bhd}", String(approxBhd(PLANS[index].usd)))}</p>}<p className={`mt-3 text-sm ${index === 1 ? "text-[#D5CFCB]" : "text-[#746B66]"}`}>{plan[2]}</p><button disabled={pending !== null} onClick={() => void pick(index)} className={`mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:cursor-wait disabled:opacity-70 ${index === 1 ? "bg-[#E9C6B2] text-[#322219] hover:bg-[#F3DACB]" : "bg-[#F0EAE6] text-[#322219] hover:bg-[#E8D6CC]"}`}>{pending === PLANS[index]?.id && <Loader2 size={15} className="animate-spin" />}{t.pricing.choose}</button><div className={`my-6 h-px ${index === 1 ? "bg-white/12" : "bg-[#251811]/9"}`}/><ul className="space-y-3">{plan.slice(3).map(item => <li key={item} className={`flex gap-2 text-sm ${index === 1 ? "text-[#ECE9E7]" : "text-[#51453E]"}`}><Check size={16} className={`mt-0.5 shrink-0 ${index === 1 ? "text-[#E9C6B2]" : "text-[#8C5738]"}`}/>{item}</li>)}</ul></article>)}</div><section className="mt-20 overflow-hidden rounded-[28px] border border-[#251811]/10 bg-white"><div className="border-b border-[#251811]/10 px-6 py-6 sm:px-8"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.pricing.compare}</p><h2 className="serif mt-2 text-3xl tracking-[-.04em]">Solo · Pro · Agency</h2><p className="mt-2 text-xs font-semibold text-[#8C7F78] sm:hidden">{t.pricing.swipeHint}</p></div><div className="overflow-x-auto"><table className="min-w-[680px] w-full text-start text-sm"><thead className="bg-[#F0E8E3]/55 text-[#736A64]"><tr><th className="px-6 py-4 text-start font-semibold"></th>{["Solo","Pro","Agency"].map(name => <th key={name} className="px-6 py-4 text-start font-bold text-[#402F25]">{name}</th>)}</tr></thead><tbody>{t.pricing.comparison.map((item, i) => <tr key={item} className="border-t border-[#251811]/8"><td className="px-6 py-4 font-semibold text-[#473830]">{item}</td>{COMPARISON_VALUES[i].map((value, column) => <td key={column} className="px-6 py-4">{value === "support" ? t.pricing.supportValues[column] : value}</td>)}</tr>)}</tbody></table></div></section></main><Footer/></div>;
}
