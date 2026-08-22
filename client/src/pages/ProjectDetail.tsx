import { useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Download, Film, Link2, Loader2, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { AppSidebar, StatusPill } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";

function estimate(status: string, locale: "en" | "ar") {
  if (status === "Review") return locale === "en" ? "Awaiting your approval" : "بانتظار موافقتك";
  if (status === "Processing") return locale === "en" ? "Manual delivery (Pilot)" : "تسليم يدوي (تجريبي)";
  if (status === "Done") return locale === "en" ? "Ready for delivery" : "جاهز للتسليم";
  return locale === "en" ? "Securing your media" : "جارٍ تأمين وسائطك";
}

export default function ProjectDetail() {
  const { locale } = useLocale();
  const t = copy[locale];
  const [, params] = useRoute("/projects/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const project = trpc.projects.get.useQuery({ id }, { enabled: Number.isSafeInteger(id) });
  const render = trpc.projects.renderStatus.useQuery(
    { id },
    {
      enabled: Number.isSafeInteger(id) && (project.data?.status === "Processing" || project.data?.status === "Done"),
      refetchInterval: project.data?.status === "Processing" ? 900 : false,
    },
  );

  if (project.isLoading) return <AppSidebar><div className="p-10 text-sm text-[#65746B]">{t.common.loading}</div></AppSidebar>;
  if (!project.data) return <AppSidebar><div className="p-10 text-sm text-[#65746B]">Project not found.</div></AppSidebar>;

  const data = project.data;
  const renderStatus = render.data;
  const displayStatus = renderStatus?.status === "Done" ? "Done" : data.status;
  const finalVideoUrl = renderStatus?.finalVideoUrl || data.finalVideoUrl;
  const canDeliver = displayStatus === "Done" && !!finalVideoUrl;
  const progress = renderStatus?.overallProgress ?? 0;
  const completedShots = renderStatus?.completedShots ?? 0;
  const shots = renderStatus?.shots || data.mediaUrls.map((sourceUrl, index) => ({ index, sourceUrl, roomType: "Property shot", prompt: "Cinematic movement", state: "queued", clipUrl: null }));

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const message = locale === "en" ? "Project link copied — ready to share." : "تم نسخ رابط المشروع وهو جاهز للمشاركة.";
      setDeliveryNotice(message);
      toast.success(message);
    } catch {
      toast.error(locale === "en" ? "Could not share this project" : "تعذرت مشاركة المشروع");
    }
  };

  const download = () => {
    if (!canDeliver || !finalVideoUrl) {
      toast.error(locale === "en" ? "The final video is not ready yet" : "الفيديو النهائي غير جاهز بعد");
      return;
    }
    const message = locale === "en" ? "Your final video is opening now." : "جارٍ فتح الفيديو النهائي الآن.";
    setDeliveryNotice(message);
    toast.success(message);
    window.setTimeout(() => { window.location.href = finalVideoUrl; }, 1200);
  };

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[1220px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <button onClick={() => setLocation("/dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#63756A] transition hover:text-[#11251E]"><ArrowLeft size={16} />{t.project.back}</button>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3"><StatusPill status={displayStatus} /><p className="text-xs font-semibold text-[#728177]">{data.location}</p></div>
            <h1 className="serif mt-3 text-5xl tracking-[-.05em]">{data.title}</h1>
            {data.description && <p className="mt-4 max-w-[580px] text-sm leading-7 text-[#65756B]">{data.description}</p>}

            <div className="mt-8 overflow-hidden rounded-[27px] bg-[#DFE7D7]">
              {canDeliver ? <video src={finalVideoUrl || undefined} controls className="aspect-video w-full bg-[#10291f]" /> : <div className="grid aspect-video place-items-center p-8 text-center"><span className={`grid h-14 w-14 place-items-center rounded-full ${displayStatus === "Processing" ? "bg-white text-[#426D3D]" : "bg-[#CFE1A5] text-[#4F7524]"}`}>{displayStatus === "Processing" ? <Loader2 className="animate-spin" size={23} /> : displayStatus === "Done" ? <CheckCircle2 size={24} /> : <Film size={24} />}</span><p className="mt-4 text-sm font-bold text-[#31513C]">{displayStatus === "Processing" ? (locale === "en" ? "Your reel is in production" : "فيلمك قيد الإنتاج") : estimate(displayStatus, locale)}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#657A6B]">{displayStatus === "Processing" ? (renderStatus?.currentStep || "Preparing your shot list…") : t.project.unavailable}</p></div>}
            </div>

            {displayStatus === "Processing" && renderStatus && <div className="mt-6 rounded-[24px] border border-[#11251E]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.04)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#6E8249]">{locale === "en" ? "Production progress" : "تقدم الإنتاج"}</p><h2 className="serif mt-2 text-3xl tracking-[-.04em]">{renderStatus.phase === "assembly" ? (locale === "en" ? "One final stitch" : "اللمسة النهائية") : (locale === "en" ? "Building your film" : "جارٍ بناء فيلمك")}</h2></div><span className="text-2xl font-bold tracking-[-.05em] text-[#52712F]">{progress}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E8EDDF]"><div className="h-full rounded-full bg-[#719741] transition-all duration-500" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex items-center justify-between text-xs text-[#7B897F]"><span>{renderStatus.currentStep}</span><span>{completedShots}/10 {locale === "en" ? "clips" : "مقاطع"}</span></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">{shots.map(shot => <div key={shot.index} className={`rounded-xl border p-2 ${shot.state === "complete" ? "border-[#C7D9A4] bg-[#F1F7E5]" : shot.state === "generating" || shot.state === "analyzing" ? "border-[#E4D6B8] bg-[#FFF9ED]" : "border-[#E7E9E1] bg-[#FAFAF7]"}`}><div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#E5E8DE]"><img src={shot.sourceUrl} className="h-full w-full object-cover" alt={`${locale === "en" ? "Shot" : "لقطة"} ${shot.index + 1}`} />{shot.state === "complete" && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#D8E9B2] text-[#4A6B2A]"><CheckCircle2 size={12} /></span>}{(shot.state === "generating" || shot.state === "analyzing") && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[#836A38]"><Loader2 size={12} className="animate-spin" /></span>}</div><p className="mt-2 truncate text-[10px] font-bold text-[#4E6555]">{shot.roomType}</p></div>)}</div></div>}
          </div>

          <aside className="h-fit rounded-[27px] border border-[#11251E]/10 bg-white p-6 shadow-[0_16px_40px_rgba(17,37,30,.05)]">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#6E8249]">{t.project.delivery}</p>
            <h2 className="serif mt-3 text-3xl tracking-[-.04em]">{t.project.overview}</h2>
            <div className="mt-7 rounded-2xl bg-[#F1F3E9] p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#496B3F]"><Clock3 size={17} /></span><div><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#758079]">{t.project.estimate}</p><p className="mt-0.5 text-sm font-bold text-[#2C4738]">{estimate(displayStatus, locale)}</p></div></div></div>
            {displayStatus === "Processing" && <div className="mt-4 rounded-2xl border border-[#C9D9AD] bg-[#F3F8E8] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#496C35]"><Sparkles size={15} />{locale === "en" ? "Pilot Production" : "إنتاج تجريبي"}</div><p className="mt-2 text-xs leading-5 text-[#70806E]">{locale === "en" ? "Your photos have been received. Because this is a private pilot, your reel is being processed manually and will be sent to you directly." : "تم استلام صورك. نظراً لأن هذا إصدار تجريبي خاص، تتم معالجة فيلمك يدوياً وسيتم إرساله إليك مباشرة."}</p></div>}
            {canDeliver && <div className="mt-4 rounded-2xl border border-[#B7D27F] bg-[#F3F8E6] px-4 py-3 text-sm font-semibold leading-6 text-[#45672B]"><div className="flex items-center gap-2"><CheckCircle2 size={16} />{locale === "en" ? "Your final reel is ready." : "فيلمك النهائي جاهز."}</div></div>}
            {deliveryNotice && <div role="status" className="mt-4 rounded-2xl border border-[#B7D27F] bg-[#F3F8E6] px-4 py-3 text-sm font-semibold leading-6 text-[#45672B]">{deliveryNotice}</div>}
            {data.revisionNotes && <div className="mt-4 rounded-2xl border border-[#E2D5BC] bg-[#FFF8ED] p-4"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#846F4D]">{t.project.requestNotes}</p><p className="mt-2 text-sm leading-6 text-[#6D604C]">{data.revisionNotes}</p></div>}
            <div className="mt-6 grid gap-2"><button disabled={!canDeliver} onClick={download} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#11251E] text-sm font-bold text-white transition hover:bg-[#244035] disabled:cursor-not-allowed disabled:bg-[#E6E9E1] disabled:text-[#97A097]"><Download size={16} />{t.project.download}</button><button onClick={share} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#11251E]/12 text-sm font-bold text-[#355041] transition hover:bg-[#F5F6EF]"><Share2 size={16} />{t.project.share}</button></div>
            <div className="mt-6 flex items-center gap-2 border-t border-[#11251E]/8 pt-5 text-xs text-[#7A877F]"><Link2 size={14} />{locale === "en" ? "Private project link" : "رابط مشروع خاص"}<span className="ms-auto text-[10px] font-bold uppercase tracking-[.1em] text-[#A0AAA2]">{data.mediaUrls.length} {locale === "en" ? "frames" : "إطارات"}</span></div>
          </aside>
        </div>
      </main>
    </AppSidebar>
  );
}
