import { CheckCircle2, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { supabase } from "@/lib/supabase";

type LinkStatus = "checking" | "ready" | "invalid";

export default function ResetPassword() {
  const { locale } = useLocale();
  const t = copy[locale].auth;
  const [, setLocation] = useLocation();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) { setLinkStatus("invalid"); return; }
    let cancelled = false;

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!cancelled && event === "PASSWORD_RECOVERY") setLinkStatus("ready");
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) setLinkStatus("ready");
    });
    const timeout = window.setTimeout(() => {
      if (!cancelled) setLinkStatus(current => (current === "checking" ? "invalid" : current));
    }, 4_000);

    return () => { cancelled = true; subscription.subscription.unsubscribe(); window.clearTimeout(timeout); };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError(t.passwordMismatch); return; }

    setBusy(true);
    try {
      if (!supabase) throw new Error(t.notConfigured);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      window.setTimeout(() => setLocation("/dashboard"), 1_200);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.errorFallback);
    } finally {
      setBusy(false);
    }
  };

  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
    <PublicNav />
    <main className="mx-auto max-w-[560px] px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
      <section className="rounded-[28px] border border-[#251811]/10 bg-white/85 p-6 shadow-[0_24px_70px_rgba(17,37,30,.08)] sm:p-8">
        {linkStatus === "checking" && <div className="flex items-center gap-2 py-8 text-sm text-[#7A706B]"><Loader2 size={17} className="animate-spin" />{t.checkingResetLink}</div>}

        {linkStatus === "invalid" && <div>
          <h1 className="serif text-3xl tracking-[-.04em]">{t.invalidResetLink}</h1>
          <Link href="/auth" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#251811] text-sm font-bold text-white hover:bg-[#402E24]">{t.requestNewLink}</Link>
        </div>}

        {linkStatus === "ready" && <div>
          <h1 className="serif text-3xl tracking-[-.04em]">{t.newPasswordTitle}</h1>
          <p className="mt-2 text-sm leading-6 text-[#7A706B]">{t.newPasswordBody}</p>
          {done ? (
            <p className="mt-7 flex items-start gap-2 rounded-xl bg-[#F7ECE6] px-4 py-3 text-sm leading-6 text-[#70452C]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{t.passwordUpdated}</p>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#7B5B49]">{t.newPasswordLabel}</span><input required minLength={6} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#251811]/12 bg-[#FCFAF9] px-4 text-sm outline-none focus:border-[#936245]" placeholder={t.passwordPlaceholder} /></label>
              <label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#7B5B49]">{t.confirmPasswordLabel}</span><input required minLength={6} type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#251811]/12 bg-[#FCFAF9] px-4 text-sm outline-none focus:border-[#936245]" placeholder={t.passwordPlaceholder} /></label>
              {error && <p className="rounded-xl bg-[#FFEFE5] px-4 py-3 text-sm leading-6 text-[#94522C]">{error}</p>}
              <button disabled={busy} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#251811] text-sm font-bold text-white hover:bg-[#402E24] disabled:cursor-wait disabled:opacity-70">{busy && <Loader2 size={17} className="animate-spin" />}{t.updatePasswordSubmit}</button>
            </form>
          )}
        </div>}
      </section>
    </main>
    <Footer />
  </div>;
}
