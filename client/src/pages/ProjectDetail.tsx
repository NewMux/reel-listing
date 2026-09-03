import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Download, Film, Link2, Loader2, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";
import { AppSidebar, StatusPill } from "@/components/AppChrome";
import { stitchClips, type StitchProgress } from "@/lib/stitchVideos";
import { copy, Locale, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";
import { withRetry } from "@shared/retry";

function estimate(status: string, locale: Locale) {
  const t = copy[locale].project;
  if (status === "Review") return t.reviewEstimate;
  if (status === "Processing") return t.processingEstimate;
  if (status === "Done") return t.doneEstimate;
  return t.uploadingEstimate;
}

function safeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "reel-listing-film";
}

export default function ProjectDetail() {
  const { locale, isRtl } = useLocale();
  const t = copy[locale];
  const [, params] = useRoute("/projects/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [assemblyProgress, setAssemblyProgress] = useState<StitchProgress | null>(null);
  const [localFinalVideoUrl, setLocalFinalVideoUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [sourceAspect, setSourceAspect] = useState<{ w: number; h: number } | null>(null);
  const [failureStreak, setFailureStreak] = useState(0);
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
      await withRetry(async () => {
        const upload = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: finalBlob });
        if (!upload.ok) {
          const providerMessage = (await upload.text().catch(() => "")).trim();
          throw new Error(providerMessage ? `The final reel could not be saved (${upload.status}): ${providerMessage.slice(0, 240)}` : `The final reel could not be saved (${upload.status}).`);
        }
        return upload;
      }, { label: "final reel upload" });
      await complete.mutateAsync({ id, finalVideoUrl: target.url });
      setLocalFinalVideoUrl(target.url);
      setAssemblyProgress({ progress: 100, currentStep: t.project.reelReady });
      setDeliveryNotice(t.project.reelReady);
      toast.success(t.project.reelReady);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.project.assembleError;
      setRenderError(message);
      toast.error(message);
    } finally {
      assemblyRef.current = false;
    }
  };

  useEffect(() => {
    if (render.data?.phase === "assembly" && !localFinalVideoUrl && !assemblyRef.current) void assembleFinalReel();
  }, [render.data?.phase, render.data?.completedShots, localFinalVideoUrl]);

  // A single "failed" poll is often just a transient hiccup that self-heals on the next
  // poll (a fal.ai shot can be retried by simply polling again). Require it to persist
  // across a couple of poll cycles before treating it as a real, user-facing failure.
  useEffect(() => {
    setFailureStreak(current => (render.data?.phase === "failed" ? current + 1 : 0));
  }, [render.data?.phase, render.data?.completedShots]);

  const firstSourceUrl = project.data?.mediaUrls[0];
  useEffect(() => {
    if (!firstSourceUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setSourceAspect({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = firstSourceUrl;
    return () => { cancelled = true; };
  }, [firstSourceUrl]);

  if (project.isLoading) return <AppSidebar><div className="p-10 text-sm text-[#746A65]">{t.common.loading}</div></AppSidebar>;
  if (!project.data) return <AppSidebar><div className="p-10 text-sm text-[#746A65]">{t.common.projectNotFound}</div></AppSidebar>;

  const data = project.data;
  const renderStatus = render.data;
  const displayStatus = localFinalVideoUrl || renderStatus?.status === "Done" || data.status === "Done" ? "Done" : data.status;
  const finalVideoUrl = localFinalVideoUrl || renderStatus?.finalVideoUrl || data.finalVideoUrl;
  const isFailed = failureStreak >= 2;
  const canDeliver = displayStatus === "Done" && !!finalVideoUrl;
  const progress = assemblyProgress?.progress ?? renderStatus?.overallProgress ?? 0;
  const completedShots = renderStatus?.completedShots ?? 0;
  const shots = data.mediaUrls.map((sourceUrl, index) => {
    const persisted = renderStatus?.shots[index];
    const state = persisted?.state || (data.status === "Done" ? "complete" : "queued");
    return { index, sourceUrl, roomType: persisted?.roomType || `${t.project.shotLabel} ${index + 1}`, prompt: persisted?.prompt || "AI direction will appear when generation begins.", state };
  });

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setDeliveryNotice(t.project.linkCopied);
      toast.success(t.project.linkCopied);
    } catch {
      toast.error(t.project.shareError);
    }
  };

  const download = () => {
    if (!canDeliver || !finalVideoUrl) {
      toast.error(t.project.notReadyYet);
      return;
    }
    setDeliveryNotice(t.project.opening);
    toast.success(t.project.opening);
    window.setTimeout(() => { window.location.href = finalVideoUrl; }, 600);
  };

  const isAssembling = renderStatus?.phase === "assembly" || assemblyProgress !== null;
  const currentStep = assemblyProgress?.currentStep || renderStatus?.currentStep || t.project.startingProduction;
  const isPortrait = !!sourceAspect && sourceAspect.h > sourceAspect.w;
  const playerAspectStyle = sourceAspect ? { aspectRatio: `${sourceAspect.w} / ${sourceAspect.h}` } : undefined;

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[1220px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <button onClick={() => setLocation("/dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#756A63] transition hover:text-[#251811]">{isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t.project.back}</button>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3"><StatusPill status={displayStatus} /><p className="text-xs font-semibold text-[#817772]">{data.location}</p></div>
            <h1 className="serif mt-3 text-5xl tracking-[-.05em]">{data.title}</h1>
            {data.description && <p className="mt-4 max-w-[580px] text-sm leading-7 text-[#756B65]">{data.description}</p>}

            <div className={`mt-8 overflow-hidden rounded-[27px] bg-[#E7DDD7] ${isPortrait ? "mx-auto max-w-[420px]" : ""}`}>
              {canDeliver ? <video src={finalVideoUrl || undefined} controls className={`w-full bg-[#291910] ${sourceAspect ? "" : "aspect-video"}`} style={playerAspectStyle} /> : <div className={`grid place-items-center p-8 text-center ${sourceAspect ? "" : "aspect-video"}`} style={playerAspectStyle}><span className={`grid h-14 w-14 place-items-center rounded-full ${isFailed ? "bg-[#FFEFE5] text-[#94522C]" : displayStatus === "Processing" ? "bg-white text-[#6D4F3D]" : "bg-[#E1BBA5] text-[#754224]"}`}>{isFailed ? <span className="text-xl font-bold">!</span> : displayStatus === "Processing" ? <Loader2 className="animate-spin" size={23} /> : displayStatus === "Done" ? <CheckCircle2 size={24} /> : <Film size={24} />}</span><p className="mt-4 text-sm font-bold text-[#513D31]">{isFailed ? t.project.generationStopped : displayStatus === "Processing" ? (isAssembling ? t.project.assemblingReel : t.project.generatingClips) : estimate(displayStatus, locale)}</p><p className="mt-1 max-w-xs text-xs leading-5 text-[#7A6D65]">{isFailed ? (renderStatus?.error || t.project.renderStoppedBody) : displayStatus === "Processing" ? currentStep : t.project.unavailable}</p></div>}
            </div>

            {displayStatus === "Processing" && (renderStatus || assemblyProgress) && <div className="mt-6 rounded-[24px] border border-[#251811]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.04)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#825E49]">{t.project.productionProgress}</p><h2 className="serif mt-2 text-3xl tracking-[-.04em]">{isAssembling ? t.project.finalStitch : t.project.buildingFilm}</h2></div><span className="text-2xl font-bold tracking-[-.05em] text-[#71472F]">{progress}%</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EDE4DF]"><div className="h-full rounded-full bg-[#976141] transition-all duration-500" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#89807B]"><span>{currentStep}</span><span>{completedShots}/{data.mediaUrls.length} {t.project.clipsLabel}</span></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">{shots.map(shot => <div key={shot.index} className={`rounded-xl border p-2 ${shot.state === "complete" ? "border-[#D9B7A4] bg-[#F7ECE5]" : shot.state === "failed" ? "border-[#E6C4B0] bg-[#FFEFE5]" : shot.state === "rendering" ? "border-[#E4C8B8] bg-[#FFF4ED]" : "border-[#E9E4E1] bg-[#FAF8F7]"}`}><div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#E8E2DE]"><img src={shot.sourceUrl} className="h-full w-full object-cover" alt={`${t.project.shotLabel} ${shot.index + 1}`} />{shot.state === "complete" && <span className="absolute end-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#E9C6B2] text-[#6B422A]"><CheckCircle2 size={12} /></span>}{shot.state === "rendering" && <span className="absolute end-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[#835338]"><Loader2 size={12} className="animate-spin" /></span>}</div><p className="mt-2 truncate text-[10px] font-bold text-[#65564E]">{shot.roomType}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#877F7A]">{shot.prompt}</p></div>)}</div></div>}
            {isFailed && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6C4B0] bg-[#FFEFE5] px-4 py-3 text-sm leading-6 text-[#94522C]"><span>{renderStatus?.error || t.project.falIncomplete}</span></div>}
            {renderError && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6C4B0] bg-[#FFEFE5] px-4 py-3 text-sm leading-6 text-[#94522C]"><span>{renderError}</span><button onClick={() => { setAssemblyProgress(null); void assembleFinalReel(); }} className="rounded-lg bg-[#94522C] px-3 py-1.5 text-xs font-bold text-white">{t.project.tryAgain}</button></div>}
          </div>

          <aside className="h-fit rounded-[27px] border border-[#251811]/10 bg-white p-6 shadow-[0_16px_40px_rgba(17,37,30,.05)]">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.project.delivery}</p>
            <h2 className="serif mt-3 text-3xl tracking-[-.04em]">{t.project.overview}</h2>
            <div className="mt-7 rounded-2xl bg-[#F3EDE9] p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-[#6B4F3F]"><Clock3 size={17} /></span><div><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#807975]">{t.project.estimate}</p><p className="mt-0.5 text-sm font-bold text-[#47362C]">{estimate(displayStatus, locale)}</p></div></div></div>
            {displayStatus === "Processing" && <div className="mt-4 rounded-2xl border border-[#D9BDAD] bg-[#F8EEE8] p-4"><div className="flex items-center gap-2 text-xs font-bold text-[#6C4935]"><Sparkles size={15} />{isAssembling ? t.project.finalAssembly : t.project.falProduction}</div><p className="mt-2 text-xs leading-5 text-[#80756E]">{isAssembling ? t.project.assemblyBody : t.project.falProductionBody}</p></div>}
            {canDeliver && <div className="mt-4 rounded-2xl border border-[#D29D7F] bg-[#F8EDE6] px-4 py-3 text-sm font-semibold leading-6 text-[#67412B]"><div className="flex items-center gap-2"><CheckCircle2 size={16} />{t.project.reelReadyBanner}</div></div>}
            {deliveryNotice && <div role="status" className="mt-4 rounded-2xl border border-[#D29D7F] bg-[#F8EDE6] px-4 py-3 text-sm font-semibold leading-6 text-[#67412B]">{deliveryNotice}</div>}
            {data.revisionNotes && <div className="mt-4 rounded-2xl border border-[#E2CABC] bg-[#FFF4ED] p-4"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#84614D]">{t.project.requestNotes}</p><p className="mt-2 text-sm leading-6 text-[#6D584C]">{data.revisionNotes}</p></div>}
            <div className="mt-6 grid gap-2"><button disabled={!canDeliver} onClick={download} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#251811] text-sm font-bold text-white transition hover:bg-[#402E24] disabled:cursor-not-allowed disabled:bg-[#E9E4E1] disabled:text-[#A09A97]"><Download size={16} />{t.project.download}</button><button onClick={share} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#251811]/12 text-sm font-bold text-[#503F35] transition hover:bg-[#F6F2EF]"><Share2 size={16} />{t.project.share}</button></div>
            <div className="mt-6 flex items-center gap-2 border-t border-[#251811]/8 pt-5 text-xs text-[#877F7A]"><Link2 size={14} />{t.project.privateLink}<span className="ms-auto text-[10px] font-bold uppercase tracking-[.1em] text-[#AAA4A0]">{data.mediaUrls.length} {t.project.framesLabel}</span></div>
          </aside>
        </div>
      </main>
    </AppSidebar>
  );
}
