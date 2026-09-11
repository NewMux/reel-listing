import { useRoute } from "wouter";
import { Film, Loader2 } from "lucide-react";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";

/**
 * The signed-out view of a finished reel.
 *
 * An agent's whole reason for making one of these is to send it to a client, so the link has
 * to work for someone with no account. The server returns only the title, location, and the
 * finished video for a valid token -- never the source photos, the owner, or the project id.
 */
export default function SharedReel() {
  const { locale } = useLocale();
  const t = copy[locale];
  const [, params] = useRoute("/s/:token");
  const token = params?.token ?? "";
  const shared = trpc.projects.getShared.useQuery({ token }, { enabled: token.length >= 16, retry: false });

  return (
    <div className="min-h-screen bg-[#F7F2EF] text-[#251811]">
      <PublicNav />
      <main className="mx-auto max-w-[900px] px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        {shared.isLoading && (
          <div className="grid place-items-center rounded-[27px] bg-[#E7DDD7] py-24 text-[#6D4F3D]">
            <Loader2 className="animate-spin" size={26} />
          </div>
        )}

        {shared.error && (
          <div className="grid place-items-center rounded-[27px] border border-[#251811]/10 bg-white px-6 py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#F0EAE6] text-[#754224]"><Film size={24} /></span>
            <h1 className="serif mt-6 text-4xl tracking-[-.04em]">{t.share.unavailableTitle}</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#7A6D65]">{t.share.unavailableBody}</p>
          </div>
        )}

        {shared.data && (
          <>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#83604C]">{t.share.eyebrow}</p>
            <h1 className="serif mt-4 text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">{shared.data.title}</h1>
            <p className="mt-3 text-sm font-semibold text-[#817772]">{shared.data.location}</p>
            <div className="mt-8 overflow-hidden rounded-[27px] bg-[#291910]">
              <video src={shared.data.finalVideoUrl ?? undefined} controls playsInline className="aspect-video w-full" />
            </div>
            {shared.data.description && (
              <p className="mt-6 max-w-[620px] text-sm leading-7 text-[#756B65]">{shared.data.description}</p>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
