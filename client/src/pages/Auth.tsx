import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

export default function Auth() {
  const { locale, isRtl } = useLocale();
  const t = copy[locale];
  const [, setLocation] = useLocation();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (meQuery.data) setLocation("/dashboard");
  }, [meQuery.data, setLocation]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      if (!supabase) throw new Error(t.auth.notConfigured);
      const result = mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;

      if (mode === "signUp" && !result.data.session) {
        setMessage(t.auth.signUpConfirm);
        setMode("signIn");
      } else {
        await meQuery.refetch();
        setLocation("/dashboard");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.auth.errorFallback);
    } finally {
      setBusy(false);
    }
  };

  const SubmitIcon = isRtl ? ArrowLeft : ArrowRight;

  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
    <PublicNav />
    <main className="mx-auto grid max-w-[1120px] gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
      <section>
        <h1 className="serif mt-6 max-w-[540px] text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">{t.auth.headline}</h1>
        <p className="mt-6 max-w-[500px] text-base leading-7 text-[#6C625C]">{t.auth.body}</p>
        <div className="mt-8 space-y-3 text-sm text-[#655952]">{t.auth.checklist.map(line => <p key={line} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#8A5537]" /> {line}</p>)}</div>
      </section>

      <section className="rounded-[28px] border border-[#251811]/10 bg-white/85 p-6 shadow-[0_24px_70px_rgba(17,37,30,.08)] sm:p-8">
        <div className="flex gap-2 rounded-xl bg-[#F2ECE9] p-1"><button type="button" onClick={() => { setMode("signIn"); setError(""); setMessage(""); }} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${mode === "signIn" ? "bg-white text-[#251811] shadow-sm" : "text-[#766D68]"}`}>{t.auth.signInTab}</button><button type="button" onClick={() => { setMode("signUp"); setError(""); setMessage(""); }} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${mode === "signUp" ? "bg-white text-[#251811] shadow-sm" : "text-[#766D68]"}`}>{t.auth.signUpTab}</button></div>
        <h2 className="serif mt-8 text-3xl tracking-[-.04em]">{mode === "signIn" ? t.auth.welcomeBack : t.auth.createWorkspace}</h2>
        <p className="mt-2 text-sm leading-6 text-[#7A706B]">{mode === "signIn" ? t.auth.welcomeBackBody : t.auth.createWorkspaceBody}</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#7B5B49]">{t.auth.emailLabel}</span><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#251811]/12 bg-[#FCFAF9] px-4 text-sm outline-none focus:border-[#936245]" placeholder={t.auth.emailPlaceholder} /></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#7B5B49]">{t.auth.passwordLabel}</span><input required minLength={6} type="password" autoComplete={mode === "signIn" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#251811]/12 bg-[#FCFAF9] px-4 text-sm outline-none focus:border-[#936245]" placeholder={t.auth.passwordPlaceholder} /></label>
          {message && <p className="flex items-start gap-2 rounded-xl bg-[#F7ECE6] px-4 py-3 text-sm leading-6 text-[#70452C]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{message}</p>}
          {error && <p className="rounded-xl bg-[#FFEFE5] px-4 py-3 text-sm leading-6 text-[#94522C]">{error}</p>}
          <button disabled={busy} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#251811] text-sm font-bold text-white hover:bg-[#402E24] disabled:cursor-wait disabled:opacity-70">{busy ? <Loader2 size={17} className="animate-spin" /> : <SubmitIcon size={17} />}{mode === "signIn" ? t.auth.submitSignIn : t.auth.submitSignUp}</button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-[#877F7A]">{t.auth.agreementPrefix} <Link href="/terms" className="font-semibold underline underline-offset-2">{t.common.terms}</Link> {t.auth.agreementAnd} <Link href="/privacy" className="font-semibold underline underline-offset-2">{t.common.privacy}</Link>{t.auth.agreementSuffix}</p>
      </section>
    </main>
    <Footer />
  </div>;
}
