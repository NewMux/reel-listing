import { useRoute } from "wouter";
import { Brand } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { wrapperCopy } from "@/lib/wrapperCopy";
import { trpc } from "@/lib/trpc";

/** Public watch page for a shared reel: no account needed, nothing but the video and its title. */
export default function SharedReel() {
  const { locale } = useLocale();
  const w = wrapperCopy[locale];
  const [, params] = useRoute("/r/:token");
  const token = params?.token || "";
  const reel = trpc.shared.get.useQuery({ token }, { enabled: token.length >= 16, retry: false, refetchOnWindowFocus: false });

  return (
    <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
      <header className="mx-auto flex max-w-[960px] items-center justify-between px-5 py-5 sm:px-8"><a href="/"><Brand /></a></header>
      <main className="mx-auto max-w-[960px] px-5 pb-20 sm:px-8">
        {reel.isLoading && <p className="py-24 text-center text-sm text-[#746A65]">{copy[locale].common.loading}</p>}
        {!reel.isLoading && !reel.data && <p className="py-24 text-center text-sm font-semibold text-[#746A65]">{w.shared.unavailable}</p>}
        {reel.data && <>
          <p className="text-xs font-semibold text-[#817772]">{reel.data.location}</p>
          <h1 className="serif mt-2 text-4xl tracking-[-.05em] sm:text-5xl">{reel.data.title}</h1>
          {reel.data.description && <p className="mt-4 max-w-[620px] text-sm leading-7 text-[#756B65]">{reel.data.description}</p>}
          <div className="mt-7 overflow-hidden rounded-[27px] bg-[#291910]">
            <video src={reel.data.videoUrl} controls playsInline className="max-h-[78vh] w-full" />
          </div>
        </>}
        <a href="/" className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#251811]/10 bg-white px-5 py-4 text-sm">
          <span className="font-semibold text-[#6D584C]">{w.shared.madeWith}</span>
          <span className="font-bold text-[#251811] underline">{w.shared.makeYours}</span>
        </a>
      </main>
    </div>
  );
}
