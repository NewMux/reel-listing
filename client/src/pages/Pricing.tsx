import { Check, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Footer, PublicNav } from "@/components/AppChrome";
import { useCheckout, readPendingCheckout } from "@/hooks/useCheckout";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

type PlanKey = "starter" | "pro" | "agency";

export default function Pricing() {
  const { locale } = useLocale();
  const t = copy[locale];
  const { user } = useAuth();
  const plansQuery = trpc.billing.plans.useQuery();
  const { checkout, pendingId } = useCheckout();

  // A visitor who picked a plan while signed out lands back here after signing in.
  // Resume the checkout they already chose instead of making them pick again.
  useEffect(() => {
    if (!user) return;
    const pending = readPendingCheckout();
    if (pending) void checkout(pending);
  }, [checkout, user]);

  const plans = plansQuery.data?.plans ?? [];
  const packs = plansQuery.data?.packs ?? [];

  const cardTone = (index: number) =>
    index === 1
      ? "border-[#251811] bg-[#251811] text-[#F8F3F0] shadow-[0_26px_60px_rgba(17,37,30,.18)]"
      : "border-[#251811]/10 bg-white";

  return (
    <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
      <PublicNav />
      <main className="mx-auto max-w-[1280px] px-5 pb-24 pt-12 sm:px-8 sm:pt-20">
        <div className="mx-auto max-w-[710px] text-center">
          <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.pricing.eyebrow}</p>
          <h1 className="serif mt-4 text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">{t.pricing.title}</h1>
          <p className="mx-auto mt-5 max-w-[560px] text-base leading-7 text-[#736A65]">{t.pricing.body}</p>
          <div className="mt-8 inline-flex rounded-full border border-[#251811]/10 bg-white p-1">
            <span className="rounded-full bg-[#251811] px-4 py-2 text-xs font-bold text-white">{t.pricing.monthly}</span>
          </div>
        </div>

        {plansQuery.isLoading ? (
          <p className="mt-14 text-center text-sm text-[#736A65]">{t.pricing.loading}</p>
        ) : (
          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {plans.map((plan, index) => {
              const key = plan.id as PlanKey;
              const features = t.pricing.planFeatures[key];
              const busy = pendingId === plan.id;
              return (
                <article key={plan.id} className={`relative rounded-[27px] border p-6 sm:p-7 ${cardTone(index)}`}>
                  {index === 1 && (
                    <div className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#E9C6B2] px-3 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#572E16]">
                      <Sparkles size={12} />
                      {t.pricing.mostPopular}
                    </div>
                  )}
                  <p className={`text-sm font-bold ${index === 1 ? "text-[#E9C6B2]" : "text-[#7A5743]"}`}>{t.pricing.names[key]}</p>
                  <p className="serif mt-5 text-5xl tracking-[-.05em]">
                    {plan.usdLabel}
                    <span className={`ms-1 font-sans text-sm font-medium tracking-normal ${index === 1 ? "text-[#BAAFA9]" : "text-[#807671]"}`}>
                      {t.pricing.perMonth}
                    </span>
                  </p>
                  <p className={`mt-1 text-xs ${index === 1 ? "text-[#BAAFA9]" : "text-[#8C7F78]"}`}>≈ {plan.bhdLabel}</p>
                  <p className={`mt-3 text-sm ${index === 1 ? "text-[#D5CFCB]" : "text-[#746B66]"}`}>{t.pricing.taglines[key]}</p>
                  <button
                    onClick={() => void checkout({ planId: plan.id })}
                    disabled={busy}
                    className={`mt-7 h-11 w-full rounded-xl text-sm font-bold disabled:opacity-60 ${
                      index === 1 ? "bg-[#E9C6B2] text-[#322219] hover:bg-[#F3DACB]" : "bg-[#F0EAE6] text-[#322219] hover:bg-[#E8D6CC]"
                    }`}
                  >
                    {busy ? copy[locale].billing.checkoutOpened : t.pricing.choose}
                  </button>
                  <div className={`my-6 h-px ${index === 1 ? "bg-white/12" : "bg-[#251811]/9"}`} />
                  <ul className="space-y-3">
                    {/* Allowances come from the catalog, not from translated prose, so the
                        two languages cannot disagree about what a plan includes. */}
                    <li className={`flex gap-2 text-sm ${index === 1 ? "text-[#ECE9E7]" : "text-[#51453E]"}`}>
                      <Check size={16} className={`mt-0.5 shrink-0 ${index === 1 ? "text-[#E9C6B2]" : "text-[#8C5738]"}`} />
                      {plan.videos} {t.pricing.videosPerMonth}
                    </li>
                    {plan.staging > 0 && (
                      <li className={`flex gap-2 text-sm ${index === 1 ? "text-[#ECE9E7]" : "text-[#51453E]"}`}>
                        <Check size={16} className={`mt-0.5 shrink-0 ${index === 1 ? "text-[#E9C6B2]" : "text-[#8C5738]"}`} />
                        {plan.staging} {t.pricing.stagingPerMonth}
                      </li>
                    )}
                    {features.map(item => (
                      <li key={item} className={`flex gap-2 text-sm ${index === 1 ? "text-[#ECE9E7]" : "text-[#51453E]"}`}>
                        <Check size={16} className={`mt-0.5 shrink-0 ${index === 1 ? "text-[#E9C6B2]" : "text-[#8C5738]"}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[#8C7F78]">{t.pricing.bhdNote}</p>

        {packs.length > 0 && (
          <section className="mt-16 rounded-[28px] border border-[#251811]/10 bg-white px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="serif text-3xl tracking-[-.04em]">{t.pricing.packTitle}</h2>
                <p className="mt-2 max-w-[520px] text-sm text-[#736A65]">{t.pricing.packBody}</p>
              </div>
              <div className="flex flex-col gap-3 sm:items-end">
                {packs.map(pack => (
                  <div key={pack.id} className="flex items-center gap-4">
                    <div className="text-end">
                      <p className="serif text-3xl tracking-[-.04em]">{pack.usdLabel}</p>
                      <p className="text-xs text-[#8C7F78]">
                        ≈ {pack.bhdLabel} · {pack.videos} {t.pricing.packVideos}
                      </p>
                    </div>
                    <button
                      onClick={() => void checkout({ packId: pack.id })}
                      disabled={pendingId === pack.id}
                      className="h-11 shrink-0 rounded-xl bg-[#251811] px-6 text-sm font-bold text-white hover:bg-[#3A281D] disabled:opacity-60"
                    >
                      {pendingId === pack.id ? copy[locale].billing.checkoutOpened : t.pricing.packCta}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {plans.length > 0 && (
          <section className="mt-20 overflow-hidden rounded-[28px] border border-[#251811]/10 bg-white">
            <div className="border-b border-[#251811]/10 px-6 py-6 sm:px-8">
              <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.pricing.compare}</p>
              <h2 className="serif mt-2 text-3xl tracking-[-.04em]">{plans.map(p => t.pricing.names[p.id as PlanKey]).join(" · ")}</h2>
              <p className="mt-2 text-xs font-semibold text-[#8C7F78] sm:hidden">{t.pricing.swipeHint}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[680px] w-full text-start text-sm">
                <thead className="bg-[#F0E8E3]/55 text-[#736A64]">
                  <tr>
                    <th className="px-6 py-4 text-start font-semibold" />
                    {plans.map(plan => (
                      <th key={plan.id} className="px-6 py-4 text-start font-bold text-[#402F25]">
                        {t.pricing.names[plan.id as PlanKey]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.pricing.comparison.map((label, row) => (
                    <tr key={label} className="border-t border-[#251811]/8">
                      <td className="px-6 py-4 font-semibold text-[#473830]">{label}</td>
                      {plans.map((plan, column) => (
                        <td key={plan.id} className="px-6 py-4">
                          {/* Every cell reads from the catalog. Previously these were
                              hardcoded index ternaries that could drift from the prices. */}
                          {row === 0 ? plan.videos : row === 1 ? plan.staging : t.pricing.supportValues[column]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
