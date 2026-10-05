import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";

type Status = "verifying" | "verified" | "invalid";

export default function VerifyEmail() {
  const { locale } = useLocale();
  const t = copy[locale].auth;
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const verifyEmail = trpc.auth.verifyEmail.useMutation();
  const [status, setStatus] = useState<Status>("verifying");
  const started = useRef(false);

  useEffect(() => {
    // The link is single-use, so make sure a re-render (or StrictMode) never submits it twice.
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (token.length < 16) { setStatus("invalid"); return; }
    verifyEmail.mutateAsync({ token })
      .then(async () => {
        setStatus("verified");
        await utils.auth.me.invalidate();
        window.setTimeout(() => setLocation("/dashboard"), 1_200);
      })
      .catch(() => setStatus("invalid"));
  }, [setLocation, utils, verifyEmail]);

  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
    <PublicNav />
    <main className="mx-auto max-w-[560px] px-5 pb-20 pt-12 sm:px-8 sm:pt-20">
      <section className="rounded-[28px] border border-[#251811]/10 bg-white/85 p-6 shadow-[0_24px_70px_rgba(17,37,30,.08)] sm:p-8">
        {status === "verifying" && <div className="flex items-center gap-2 py-8 text-sm text-[#7A706B]"><Loader2 size={17} className="animate-spin" />{t.verifyingEmail}</div>}
        {status === "verified" && <p className="flex items-start gap-2 rounded-xl bg-[#F7ECE6] px-4 py-3 text-sm leading-6 text-[#70452C]"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{t.emailVerified}</p>}
        {status === "invalid" && <div>
          <h1 className="serif text-3xl tracking-[-.04em]">{t.invalidVerifyLink}</h1>
          <Link href="/auth" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#251811] text-sm font-bold text-white hover:bg-[#402E24]">{t.backToSignIn}</Link>
        </div>}
      </section>
    </main>
    <Footer />
  </div>;
}
