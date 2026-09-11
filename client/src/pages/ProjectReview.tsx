import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Clock3, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { AppSidebar, StatusPill } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";
import { FAL_CLIP_SECONDS } from "@shared/video";
import { CAMERA_PRESETS, matchCameraPreset, ROOM_TYPE_CHOICES } from "@shared/shotPresets";

export default function ProjectReview() {
  const { locale, isRtl } = useLocale();
  const t = copy[locale];
  const [, params] = useRoute("/projects/:id/review");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [approveError, setApproveError] = useState("");
  const project = trpc.projects.get.useQuery({ id }, { enabled: Number.isSafeInteger(id) });
  const shotDirections = trpc.projects.shotDirections.useQuery(
    { id },
    { enabled: Number.isSafeInteger(id), refetchInterval: query => query.state.data?.ready === false ? 2_000 : false },
  );
  const utils = trpc.useUtils();
  const billing = trpc.billing.summary.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const approve = trpc.projects.approve.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id });
      utils.projects.list.invalidate();
      setLocation(`/projects/${id}`);
    },
    onError: err => setApproveError(err.message),
  });
  const request = trpc.projects.requestChanges.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id });
      setNotes("");
      setShowNotes(false);
    },
  });
  const reorder = trpc.projects.reorder.useMutation({
    onSuccess: () => utils.projects.get.invalidate({ id }),
  });
  const updateShotOverride = trpc.projects.updateShotOverride.useMutation({
    onSuccess: (_data, variables) => {
      setShotError(prev => ({ ...prev, [variables.index]: "" }));
      utils.projects.shotDirections.invalidate({ id });
    },
    // Surface a rejected camera move beside the photo it belongs to, not as a page-level toast.
    onError: (error, variables) => setShotError(prev => ({ ...prev, [variables.index]: error.message })),
  });

  // Local drafts for the camera-move textareas: seeded once per photo the first time real
  // AI/override data arrives, then left alone -- otherwise the 2s classification poll would
  // wipe out whatever the user is mid-typing.
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<number, boolean>>({});
  const [shotError, setShotError] = useState<Record<number, string>>({});
  const seededRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const shotAnalysis = shotDirections.data?.shotAnalysis;
    const customCameraMoves = shotDirections.data?.customCameraMoves;
    if (!shotAnalysis) return;
    const toSeed: Record<number, string> = {};
    let changed = false;
    shotAnalysis.forEach((analysis, index) => {
      if (seededRef.current.has(index) || (!analysis && !customCameraMoves?.[index])) return;
      seededRef.current.add(index);
      toSeed[index] = customCameraMoves?.[index] || analysis?.cameraMove || "";
      changed = true;
    });
    if (changed) setDrafts(prev => ({ ...prev, ...toSeed }));
  }, [shotDirections.data]);

  if (project.isLoading) return <AppSidebar><div className="p-10 text-sm text-[#746A65]">{t.common.loading}</div></AppSidebar>;
  if (!project.data) return <AppSidebar><div className="p-10 text-sm text-[#746A65]">{t.common.projectNotFound}</div></AppSidebar>;
  const data = project.data;
  // One photo becomes one clip, and one clip costs one credit.
  const needed = data.mediaUrls.length;
  const available = billing.data?.clipCredits ?? 0;
  // Do not block on a balance we have not loaded yet; the server enforces it regardless.
  const affordable = billing.data === undefined || available >= needed;
  const shots = shotDirections.data?.shots;
  const clipCount = data.mediaUrls.length;
  const durations = data.mediaUrls.map((_, index) => shotDirections.data?.clipDurations?.[index] || FAL_CLIP_SECONDS);
  const duration = durations.reduce((sum, seconds) => sum + seconds, 0);
  const eachLabel = durations.every(seconds => seconds === durations[0]) ? `${durations[0]}s` : "5–10s";
  const canReorder = data.status === "Review";
  const moveShot = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (!canReorder || reorder.isPending || nextIndex < 0 || nextIndex >= data.mediaUrls.length) return;
    const order = data.mediaUrls.map((_, i) => i);
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    reorder.mutate({ id, order });
  };

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[1260px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <button onClick={() => setLocation("/dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#756A63] transition hover:text-[#251811]">{isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t.common.back}</button>

        <div className="mt-8 grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div className="lg:sticky lg:top-8">
            <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.review.eyebrow}</p><StatusPill status={data.status} /></div>
            <h1 className="serif mt-3 max-w-[480px] text-5xl leading-[.98] tracking-[-.05em]">{t.review.title}</h1>
            <p className="mt-5 max-w-[480px] text-sm leading-7 text-[#746963]">{t.review.body}</p>

            <div className="mt-8 rounded-[22px] bg-[#F0E3DC] p-5">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#E9C6B2] text-[#653215]"><Sparkles size={17} /></span><div><p className="text-sm font-bold text-[#463328]">{data.title}</p><p className="mt-0.5 text-xs text-[#7B706A]">{data.location}</p></div></div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#D1AF9C] pt-4"><div><p className="text-lg font-bold tracking-[-.04em] text-[#53321F]">{clipCount}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#806B5F]">{t.review.clipsLabel}</p></div><div><p className="text-lg font-bold tracking-[-.04em] text-[#53321F]">{eachLabel}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#806B5F]">{t.review.eachLabel}</p></div><div><p className="text-lg font-bold tracking-[-.04em] text-[#53321F]">~{duration}s</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#806B5F]">{t.review.finalReelLabel}</p></div></div>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#251811]/8 bg-white/70 p-4 text-sm leading-6 text-[#756B65]"><Clock3 size={17} className="mt-0.5 shrink-0 text-[#825E49]" />{t.review.orderNote}</div>
          </div>

          <div className="rounded-[27px] border border-[#251811]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.05)] sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-sm font-bold text-[#402F25]">{t.review.storyboard}</h2><p className="mt-1 max-w-lg text-xs leading-5 text-[#817975]">{t.review.storyboardBody}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#F3EBE7] px-3 py-1.5 text-xs font-bold text-[#795E4E]">{clipCount} {t.review.photosLabel}</span></div></div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {data.mediaUrls.map((url, index) => (
                <div key={url} className="group overflow-hidden rounded-2xl border border-[#251811]/10 bg-[#F6F2EF]">
                  <div className="relative aspect-[4/3] overflow-hidden"><img src={url} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" alt={`${t.review.photoAlt} ${index + 1}`} /><span className="absolute start-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#251811]/75 text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span></div>
                  <div className="p-3"><p className="truncate text-xs font-bold text-[#4C3B31]">{shots ? shots[index]?.roomType || `${t.review.shotFallback} ${index + 1}` : t.review.analyzing}</p><p className="mt-1 line-clamp-2 text-[10px] font-medium text-[#948D89]">{shots ? shots[index]?.prompt : t.review.analyzing}</p>{canReorder && <div className="mt-2 flex gap-1.5"><button type="button" disabled={index === 0 || reorder.isPending} onClick={() => moveShot(index, -1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#251811]/10 text-[#705F55] disabled:opacity-25" aria-label={`${t.review.moveUp} ${index + 1}`}><ArrowUp size={15} /></button><button type="button" disabled={index === data.mediaUrls.length - 1 || reorder.isPending} onClick={() => moveShot(index, 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[#251811]/10 text-[#705F55] disabled:opacity-25" aria-label={`${t.review.moveDown} ${index + 1}`}><ArrowDown size={15} /></button></div>}</div>
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-[#251811]/8 bg-[#F8F5F3] p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#825E49]"><Sparkles size={14} />{t.review.storyboard}</div>
              <p className="mt-2 text-[11px] leading-4 text-[#8A7F79]">{t.shot.freeEditsNote}</p>
              <div className="mt-3 space-y-2.5">
                {data.mediaUrls.map((_, index) => {
                  const hasOverride = !!shotDirections.data?.customCameraMoves?.[index];
                  const analysisReady = !!shotDirections.data?.shotAnalysis?.[index];
                  const activeDuration = shotDirections.data?.clipDurations?.[index] || 10;
                  const activePreset = matchCameraPreset(shotDirections.data?.customCameraMoves?.[index]);
                  const activeRoom = shotDirections.data?.shotAnalysis?.[index]?.shotType ?? "unknown";
                  return (
                    <div key={index} className="rounded-xl bg-white p-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E9C6B2] text-[10px] font-bold text-[#6B422A]">{index + 1}</span>
                        <p className="flex-1 truncate text-xs font-bold text-[#4C3B31]">{shots ? shots[index]?.roomType : t.review.analyzing}</p>
                        {hasOverride && <span className="shrink-0 rounded-full bg-[#E9C6B2] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.06em] text-[#6B422A]">{t.review.customBadge}</span>}
                        <div className="flex shrink-0 gap-1">
                          {([5, 10] as const).map(seconds => (
                            <button
                              key={seconds}
                              type="button"
                              disabled={!canReorder || updateShotOverride.isPending}
                              onClick={() => updateShotOverride.mutate({ id, index, durationSeconds: seconds })}
                              className={`h-7 rounded-full px-2.5 text-[10px] font-bold transition ${activeDuration === seconds ? "bg-[#251811] text-white" : "bg-[#F3EBE7] text-[#795E4E] hover:bg-[#EADFD9]"} disabled:opacity-50`}
                            >{seconds}s</button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[#8A7F79]">{t.shot.movementLabel}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {CAMERA_PRESETS.map(preset => (
                            <button
                              key={preset.id}
                              type="button"
                              disabled={!canReorder || !analysisReady || updateShotOverride.isPending}
                              onClick={() => updateShotOverride.mutate({ id, index, cameraPreset: activePreset === preset.id ? null : preset.id })}
                              className={`h-7 rounded-full px-2.5 text-[10px] font-bold transition ${activePreset === preset.id ? "bg-[#251811] text-white" : "bg-[#F3EBE7] text-[#795E4E] hover:bg-[#EADFD9]"} disabled:opacity-50`}
                            >{t.shot.moves[preset.id]}</button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="text-[10px] font-bold uppercase tracking-[.08em] text-[#8A7F79]" htmlFor={`room-${index}`}>{t.shot.roomLabel}</label>
                        <select
                          id={`room-${index}`}
                          value={activeRoom}
                          disabled={!canReorder || !analysisReady || updateShotOverride.isPending}
                          onChange={event => updateShotOverride.mutate({ id, index, roomType: event.target.value as (typeof ROOM_TYPE_CHOICES)[number] })}
                          className="mt-1.5 h-8 w-full rounded-lg border border-[#251811]/10 bg-[#FAF8F7] px-2 text-xs font-semibold text-[#604E44] outline-none disabled:opacity-60"
                        >
                          {ROOM_TYPE_CHOICES.map(room => <option key={room} value={room}>{t.shot.rooms[room]}</option>)}
                        </select>
                      </div>

                      {canReorder && (
                        <button
                          type="button"
                          onClick={() => setAdvancedOpen(prev => ({ ...prev, [index]: !prev[index] }))}
                          className="mt-2.5 text-[10px] font-bold text-[#825E49] underline"
                        >{t.shot.advanced}</button>
                      )}

                      {advancedOpen[index] && (
                        <div className="mt-2">
                          <textarea
                            value={drafts[index] ?? ""}
                            onChange={event => setDrafts(prev => ({ ...prev, [index]: event.target.value }))}
                            onBlur={() => updateShotOverride.mutate({ id, index, cameraMove: (drafts[index] ?? "").trim() || null })}
                            disabled={!canReorder || !analysisReady}
                            placeholder={analysisReady ? t.review.cameraMovePlaceholder : t.review.analyzing}
                            rows={2}
                            className="w-full resize-none rounded-lg border border-[#251811]/8 bg-[#FAF8F7] p-2 text-xs leading-5 text-[#604E44] outline-none placeholder:text-[#A49E9A] disabled:opacity-60"
                          />
                          <p className="mt-1 text-[10px] leading-4 text-[#8A7F79]">{t.shot.advancedHint}</p>
                        </div>
                      )}

                      {shotError[index] && <p className="mt-2 rounded-lg bg-[#FFEFE5] px-2 py-1.5 text-[10px] leading-4 text-[#94522C]">{shotError[index]}</p>}

                      {hasOverride && canReorder && (
                        <button
                          type="button"
                          onClick={() => {
                            const suggestion = shotDirections.data?.shotAnalysis?.[index]?.cameraMove || "";
                            setDrafts(prev => ({ ...prev, [index]: suggestion }));
                            updateShotOverride.mutate({ id, index, cameraMove: null });
                          }}
                          className="mt-1.5 block text-[10px] font-bold text-[#825E49] underline"
                        >{t.review.resetToAi}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {data.revisionNotes && <div className="mt-5 rounded-xl bg-[#F7EDE7] p-3.5"><p className="text-[11px] font-bold uppercase tracking-[.1em] text-[#885334]">{t.review.changeSent}</p><p className="mt-1 text-sm leading-6 text-[#695347]">{data.revisionNotes}</p></div>}

            {data.status === "Review" ? <>
              {approveError && <p className="mt-5 flex gap-2 rounded-xl bg-[#FFEFE5] px-3 py-2.5 text-xs font-medium leading-5 text-[#94522C]"><AlertCircle size={15} className="shrink-0" />{approveError}</p>}
              {needed > 0 && (
                affordable
                  // Say what approving costs before it is clicked, not after.
                  ? <p className="mt-5 rounded-xl bg-[#F3EDE9] px-3 py-2.5 text-xs font-semibold leading-5 text-[#6A4A38]">{t.billing.costNote.replace("{needed}", String(needed))}</p>
                  : <p className="mt-5 rounded-xl bg-[#FFEFE5] px-3 py-2.5 text-xs font-semibold leading-5 text-[#94522C]">{t.billing.needCredits.replace("{needed}", String(needed)).replace("{have}", String(available))}</p>
              )}
              <button disabled={approve.isPending || !affordable} onClick={() => { setApproveError(""); approve.mutate({ id }); }} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#251811] text-sm font-bold text-white transition hover:bg-[#402E24] disabled:cursor-not-allowed disabled:opacity-60">{approve.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{approve.isPending ? t.review.preparing : t.review.approve}</button>
              <button onClick={() => setShowNotes(!showNotes)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#251811]/12 text-sm font-bold text-[#503F35] transition hover:bg-[#F6F2EF]"><MessageSquareText size={16} />{t.review.request}</button>
              {showNotes && <div className="mt-4 rounded-xl border border-[#251811]/10 bg-[#F8F4F1] p-3"><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder={t.review.notePlace} rows={3} className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[#A49E9A]" /><button disabled={notes.trim().length < 3 || request.isPending} onClick={() => request.mutate({ id, notes })} className="mt-3 h-9 w-full rounded-lg bg-[#E9C6B2] text-xs font-bold text-[#512E1A] disabled:opacity-50">{request.isPending ? t.common.loading : t.review.send}</button></div>}
            </> : <button onClick={() => setLocation(`/projects/${id}`)} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#251811] text-sm font-bold text-white">{t.review.viewProduction}</button>}
          </div>
        </div>
      </main>
    </AppSidebar>
  );
}
