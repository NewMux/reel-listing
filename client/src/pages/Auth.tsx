import { ArrowRight, CheckCircle2, Clapperboard, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { PublicNav, Footer } from "@/components/AppChrome";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

export default function Auth() {
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
      if (!supabase) throw new Error("Supabase Auth is not configured for this deployment.");
      const result = mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;

      if (mode === "signUp" && !result.data.session) {
        setMessage("Account created. Check your email to confirm your address, then sign in.");
        setMode("signIn");
      } else {
        await meQuery.refetch();
        setLocation("/dashboard");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to authenticate right now.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="min-h-screen bg-[#F7F5EF] text-[#11251E]">
    <PublicNav />
    <main className="mx-auto grid max-w-[1120px] gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
      <section>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#11251E]/10 bg-white/65 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.15em] text-[#687B49]"><Clapperboard size={13} /> Private workspace</div>
        <h1 className="serif mt-6 max-w-[540px] text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">Your listings, ready for their close-up.</h1>
        <p className="mt-6 max-w-[500px] text-base leading-7 text-[#5C6C63]">Sign in to open the pilot gallery, choose the owner-provided property photos, review the AI direction, and receive the finished cinematic reel in one workspace.</p>
        <div className="mt-8 space-y-3 text-sm text-[#52655A]"><p className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#6C8A37]" /> Your original photo order is preserved.</p><p className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#6C8A37]" /> AI prompt direction is created before rendering.</p><p className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#6C8A37]" /> The final MP4 stays available in your project.</p></div>
      </section>

      <section className="rounded-[28px] border border-[#11251E]/10 bg-white/85 p-6 shadow-[0_24px_70px_rgba(17,37,30,.08)] sm:p-8">
        <div className="flex gap-2 rounded-xl bg-[#F0F2E9] p-1"><button type="button" onClick={() => { setMode("signIn"); setError(""); setMessage(""); }} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${mode === "signIn" ? "bg-white text-[#11251E] shadow-sm" : "text-[#68766E]"}`}>Sign in</button><button type="button" onClick={() => { setMode("signUp"); setError(""); setMessage(""); }} className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold ${mode === "signUp" ? "bg-white text-[#11251E] shadow-sm" : "text-[#68766E]"}`}>Create account</button></div>
        <h2 className="serif mt-8 text-3xl tracking-[-.04em]">{mode === "signIn" ? "Welcome back." : "Create your workspace."}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B7A71]">{mode === "signIn" ? "Continue creating refined listing films." : "Use your email to save projects and access the owner-provided pilot gallery."}</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#687B49]">Email</span><input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#11251E]/12 bg-[#FCFCF9] px-4 text-sm outline-none focus:border-[#759345]" placeholder="you@agency.com" /></label>
          <label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#687B49]">Password</span><input required minLength={6} type="password" autoComplete={mode === "signIn" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#11251E]/12 bg-[#FCFCF9] px-4 text-sm outline-none focus:border-[#759345]" placeholder="At least 6 characters" /></label>
          {message && <p className="flex items-start gap-2 rounded-xl bg-[#F0F7E6] px-4 py-3 text-sm leading-6 text-[#4C702C]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{message}</p>}
          {error && <p className="rounded-xl bg-[#FFF1E5] px-4 py-3 text-sm leading-6 text-[#94572C]">{error}</p>}
          <button disabled={busy} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#11251E] text-sm font-bold text-white hover:bg-[#244035] disabled:cursor-wait disabled:opacity-70">{busy ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}{mode === "signIn" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-[#7A877F]">By continuing, you agree to the <Link href="/terms" className="font-semibold underline underline-offset-2">Terms</Link> and <Link href="/privacy" className="font-semibold underline underline-offset-2">Privacy Policy</Link>.</p>
      </section>
    </main>
    <Footer />
  </div>;
}
