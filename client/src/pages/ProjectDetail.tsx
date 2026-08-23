import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Download, Film, Link2, Loader2, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { AppSidebar, StatusPill } from "@/components/AppChrome";
import { stitchClips, type StitchProgress } from "@/lib/stitchVideos";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";

function estimate(status: string, locale: "en" | "ar") {
  if (status === "Review") return locale === "en" ? "Awaiting your approval" : "بانتظار موافقتك";
  if (status === "Processing") return locale === "en" ? "Generating with fal.ai" : "جارٍ التوليد عبر fal.ai";
  if (status === "Done") return locale === "en" ? "Ready for delivery" : "جاهز للتسليم";
  return locale === "en" ? "Securing your media" : "جارٍ تأمين وسائطك";
}

function safeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "reel-listing-film";
}

export default function ProjectDetail() {
  const { locale } = useLocale();
  const t = copy[locale];
  const [, params] = useRoute("/projects/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [assemblyProgress, setAssemblyProgress] = useState<StitchProgress | null>(null);
  const [localFinalVideoUrl, setLocalFinalVideoUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const assemblyRef = useRef(false);
  const utils = trpc.useUtils();
  const project = trpc.projects.get.useQuery({ id }, { enabled: Number.isSafeInteger(id) });
  const render = trpc.projects.renderStatus.useQuery(
    { id },
    {
      enabled: Number.isSafeInteger(id) && (project.data?.status === "Processing" || project.data?.status === "Done"),
      refetchInterval: project.data?.status === "Processing" ? 3_000 : false,
    },
  );
  const createOutputTarget = trpc.media.createUploadTarget.useMutation();
  const complete = trpc.projects.complete.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id });
      utils.projects.list.invalidate();
      utils.projects.renderStatus.invalidate({ id });
    },
  });

  const assembleFinalReel = async () => {
    const clipUrls = render.data?.clipUrls;
    if (assemblyRef.current || !clipUrls?.length || clipUrls.some(url => !url) || render.data?.phase !== "assembly") return;
    assemblyRef.current = true;
    setRenderError(null);
    setDeliveryNotice(null);
    try {
      const finalBlob = await stitchClips(clipUrls as string[], progress => setAssemblyProgress(progress));
      const target = await createOutputTarget.mutateAsync({ name: `${safeFileName(project.data?.title || "reel-listing-film")}.mp4`, type: "video/mp4" });
      const upload = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: finalBlob });
      if (!upload.ok) throw new Error(`The final reel could not be saved (${upload.status}).`);
      await complete.mutateAsync({ id, finalVideoUrl: target.url });
      setLocalFinalVideoUrl(target.url);
      setAssemblyProgress({ progress: 100, currentStep: locale === "en" ? "Your cinematic reel is ready to share." : "فيلمك السينمائي جاهز للمشاركة." });
      const message = locale === "en" ? "Your cinematic reel is ready to share." : "فيلمك السينمائي جاهز للمشاركة.";
      setDeliveryNotice(message);
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The final reel could not be assembled.";
      setRenderError(message);
      toast.error(message);
    } finally {
      assemblyRef.current = false;
    }
  };

  useEffect(() => {
    if (render.data?.phase === "assembly" && !localFinalVideoUrl && !assemblyRef.current) void assembleFinalReel();
  }, [render.data?.phase, render.data?.completedShots, localFinalVideoUrl]);

  if (project.isLoading) return <AppSidebar><div className="p-10 text-sm text-[#65746B]">{t.common.loading}</div></AppSidebar>;
  if (!project.data) return <AppSidebar><div className="p-10 text-sm text-[#65746B]">Project not found.</div></AppSidebar>;

  const data = project.data;
  const renderStatus = render.data;
  const displayStatus = localFinalVideoUrl || renderStatus?.status === "Done" || data.status === "Done" ? "Done" : data.status;
  const finalVideoUrl = localFinalVideoUrl || renderStatus?.finalVideoUrl || data.finalVideoUrl;
  const canDeliver = displayStatus === "Done" && !!finalVideoUrl;
  const progress = assemblyProgress?.progress ?? renderStatus?.overallProgress ?? 0;
  const completedShots = renderStatus?.completedShots ?? 0;
  const shots = data.mediaUrls.map((sourceUrl, index) => {
    const persisted = renderStatus?.shots[index];
    const state = persisted?.state || (data.status === "Done" ? "complete" : "queued");
    return { index, sourceUrl, roomType: persisted?.roomType || `Property shot ${index + 1}`, prompt: persisted?.prompt || "AI direction will appear when generation begins.", state };
  });

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
    window.setTimeout(() => { window.location.href = finalVideoUrl; }, 600);
  };

  const isAssembling = renderStatus?.phase === "assembly" || assemblyProgress !== null;
  const currentStep = assemblyProgress?.currentStep || renderStatus?.currentStep || (locale === "en" ? "Starting cinematic production…" : "جارٍ بدء الإنتاج السينمائي…");

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
              {canDeliver ? <video src={finalVideoUrl || undefined} controls className="aspect-video w-full bg-[#10291f]" /> : <div className="grid aspect-video place-items-center p-8 text-center"><span className={`grid h-14 w-14 place-items-center rounded-full ${displayStatus === "Processing" ? "bg-white text-[#426D3D]" : "bg-[#CFE1A5] text-[#4F7524]"}`}>{displayStatus === "Processing" ? <Loader2 className="animate-spin" size={23} /> : displayStatus === "Done" ? <CheckCircle2 size={24} /> : <Film size={24} />}</span><p className="mt-4 text-sm font-bold text-[#31513C]">{displayStatus === "Processing" ? (isAssembling ? (locale === "en" ? "Assembling your reel" : "جارٍ جمع فيلمك") : (locale === "en" ? "Generating your clips" : "جارٍ توليد المقاطع")) : estimate(displayStatus, locale)}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#657A6B]">{displayStatus === "Processing" ? currentStep : t.project.unavailable}</p></div>}
            </div>

            {displayStatus === "Processing" && (renderStatus || assemblyProgress) && <div className="mt-6 rounded-[24px] border border-[#11251E]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.04)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#6E8249]">{locale === "en" ? "Production progress" : "تقدم الإنتاج"}</p><h2 className="serif mt-2 text-3xl tracking-[-.04em]">{isAssembling ? (locale === "en" ? "One final stitch" : "اللمسة النهائية") : (locale === "en" ? "Building your film" : "جارٍ بناء فيلمك")}</h2></div><span className="text-2xl font-bold tracking-[-.05em] text-[#52712F]">{progress}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E8EDDF]"><div className="h-full rounded-full bg-[#719741] transition-all duration-500" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#7B897F]"><span>{currentStep}</span><span>{completedShots}/{data.mediaUrls.length} {locale === "en" ? "clips" : "مقاطع"}</span></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">{shots.map(shot => <div key={shot.index} className={`rounded-xl border p-2 ${shot.state === "complete" ? "border-[#C7D9A4] bg-[#F1F7E5]" : shot.state === "rendering" ? "border-[#E4D6B8] bg-[#FFF9ED]" : "border-[#E7E9E1] bg-[#FAFAF7]"}`}><div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#E5E8DE]"><img src={shot.sourceUrl} className="h-full w-full object-cover" alt={`${locale === "en" ? "Shot" : "لقطة"} ${shot.index + 1}`} />{shot.state === "complete" && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#D8E9B2] text-[#4A6B2A]"><CheckCircle2 size={12} /></span>}{shot.state === "rendering" && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[#836A38]"><Loader2 size={12} className="animate-spin" /></span>}</div><p className="mt-2 truncate text-[10px] font-bold text-[#4E6555]">{shot.roomType}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#7A877F]">{shot.prompt}</p></div>)}</div></div>}
            {renderStatus?.phase === "failed" && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6C5B0] bg-[#FFF1E5] px-4 py-3 text-sm leading-6 text-[#94572C]"><span>{renderStatus.error || "fal.ai could not complete one or more clips."}</span></div>}
            {renderError && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6C5B0] bg-[#FFF1E5] px-4 py-3 text-sm leading-6 text-[#94572C]"><span>{renderError}</span><button onClick={() => { setAssemblyProgress(null); void assembleFinalReel(); }} className="rounded-lg bg-[#94572C] px-3 py-1.5 text-xs font-bold text-white">{locale === "en" ? "Try assembly again" : "حاول الجمع مرة أخرى"}</button></div>}
          </div>

          <aside className="h-fit rounded-[27px] border border-[#11251E]/10 bg-white p-6 shadow-[0_16px_40px_rgba(17,37,30,.05)]">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#6E8249]">{t.project.delivery}</p>
            <h2 className="serif mt-3 text-3xl tracking-[-.04em]">{t.project.overview}</h2>
            <div className="mt-7 rounded-2xl bg-[#F1F3E9] p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#496B3F]"><Clock3 size={17} /></span><div><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#758079]">{t.project.estimate}</p><p className="mt-0.5 text-sm font-bold text-[#2C4738]">{estimate(displayStatus, locale)}</p></div></div></div>
            {displayStatus === "Processing" && <div className="mt-4 rounded-2xl border border-[#C9D9AD] bg-[#F3F8E8] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#496C35]"><Sparkles size={15} />{isAssembling ? (locale === "en" ? "Final assembly" : "الجمع النهائي") : (locale === "en" ? "fal.ai production" : "إنتاج fal.ai")}</div><p className="mt-2 text-xs leading-5 text-[#70806E]">{isAssembling ? (locale === "en" ? "Your completed clips are being stitched in their original upload order and saved as one final reel." : "يتم جمع المقاطع المكتملة حسب ترتيب رفعها وحفظها كفيلم نهائي واحد.") : (locale === "en" ? "fal.ai is generating one cinematic motion clip from each property photo. You can leave this page and return later." : "يقوم fal.ai بتوليد مقطع سينمائي متحرك من كل صورة للعقار. يمكنك مغادرة الصفحة والعودة لاحقاً.")}</p></div>}
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
