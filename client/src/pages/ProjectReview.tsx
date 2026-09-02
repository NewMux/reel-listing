import { useState } from "react";
import { ArrowLeft, Check, Clock3, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { AppSidebar, StatusPill } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";
import { FAL_CLIP_SECONDS } from "@shared/video";

const shotNames = {
  en: ["Hero view", "Living space", "Kitchen detail", "Dining moment", "Primary suite", "Bath detail", "Outdoor living", "The view", "Architecture", "Closing frame"],
  ar: ["المشهد الرئيسي", "مساحة المعيشة", "تفصيل المطبخ", "لحظة الطعام", "الجناح الرئيسي", "تفصيل الحمام", "المعيشة الخارجية", "الإطلالة", "الهندسة المعمارية", "المشهد الختامي"],
} as const;

const shotPrompts = {
  en: ["Forward gimbal travel", "Lateral gimbal track", "Diagonal dolly move", "Shallow architectural arc", "Subtle vertical lift", "Backward context pull", "Foreground slide", "Corner-to-corner track", "Forward and lateral drift", "Gentle descending move"],
  ar: ["حركة جيمبال أمامية", "مسار جيمبال جانبي", "حركة دولي قطرية", "قوس معماري هادئ", "ارتفاع رأسي دقيق", "تراجع لإظهار السياق", "انزلاق أمامي سلس", "مسار من زاوية إلى أخرى", "انجراف أمامي وجانبي", "هبوط لطيف"],
} as const;

export default function ProjectReview() {
  const { locale } = useLocale();
  const t = copy[locale];
  const [, params] = useRoute("/projects/:id/review");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const project = trpc.projects.get.useQuery({ id }, { enabled: Number.isSafeInteger(id) });
  const utils = trpc.useUtils();
  const approve = trpc.projects.approve.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id });
      utils.projects.list.invalidate();
      setLocation(`/projects/${id}`);
    },
  });
  const request = trpc.projects.requestChanges.useMutation({
    onSuccess: () => {
      utils.projects.get.invalidate({ id });
      setNotes("");
      setShowNotes(false);
    },
  });

  if (project.isLoading) return <AppSidebar><div className="p-10 text-sm text-[#746A65]">{t.common.loading}</div></AppSidebar>;
  if (!project.data) return <AppSidebar><div className="p-10 text-sm text-[#746A65]">Project not found.</div></AppSidebar>;
  const data = project.data;
  const names = shotNames[locale];
  const prompts = shotPrompts[locale];
  const clipCount = data.mediaUrls.length;
  const duration = clipCount * FAL_CLIP_SECONDS;

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[1260px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <button onClick={() => setLocation("/dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#756A63] transition hover:text-[#251811]"><ArrowLeft size={16} />{t.common.back}</button>

        <div className="mt-8 grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div className="lg:sticky lg:top-8">
            <div className="flex flex-wrap items-center gap-3"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.review.eyebrow}</p><StatusPill status={data.status} /></div>
            <h1 className="serif mt-3 max-w-[480px] text-5xl leading-[.98] tracking-[-.05em]">{t.review.title}</h1>
            <p className="mt-5 max-w-[480px] text-sm leading-7 text-[#746963]">{t.review.body}</p>

            <div className="mt-8 rounded-[22px] bg-[#F0E3DC] p-5">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#E9C6B2] text-[#653215]"><Sparkles size={17} /></span><div><p className="text-sm font-bold text-[#463328]">{data.title}</p><p className="mt-0.5 text-xs text-[#7B706A]">{data.location}</p></div></div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#D1AF9C] pt-4"><div><p className="text-lg font-bold tracking-[-.04em] text-[#53321F]">{clipCount}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#806B5F]">{locale === "en" ? "clips" : "مقاطع"}</p></div><div><p className="text-lg font-bold tracking-[-.04em] text-[#53321F]">{FAL_CLIP_SECONDS}s</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#806B5F]">{locale === "en" ? "each" : "لكل منها"}</p></div><div><p className="text-lg font-bold tracking-[-.04em] text-[#53321F]">~{duration}s</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-[#806B5F]">{locale === "en" ? "final reel" : "الفيلم النهائي"}</p></div></div>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#251811]/8 bg-white/70 p-4 text-sm leading-6 text-[#756B65]"><Clock3 size={17} className="mt-0.5 shrink-0 text-[#825E49]" />{locale === "en" ? "Your photos stay in this order. Approve once and reel-listing.com creates the cinematic segments and stitches them into one final reel." : "ستبقى صورك بهذا الترتيب. وافق مرة واحدة وسيُنشئ reel-listing.com المقاطع السينمائية ويجمعها في فيلم نهائي واحد."}</div>
          </div>

          <div className="rounded-[27px] border border-[#251811]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.05)] sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-sm font-bold text-[#402F25]">{t.review.storyboard}</h2><p className="mt-1 max-w-lg text-xs leading-5 text-[#817975]">{t.review.storyboardBody}</p></div><span className="rounded-full bg-[#F3EBE7] px-3 py-1.5 text-xs font-bold text-[#795E4E]">{clipCount} {locale === "en" ? "photos" : "صور"}</span></div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {data.mediaUrls.map((url, index) => (
                <div key={url} className="group overflow-hidden rounded-2xl border border-[#251811]/10 bg-[#F6F2EF]">
                  <div className="relative aspect-[4/3] overflow-hidden"><img src={url} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" alt={`${locale === "en" ? "Property photo" : "صورة العقار"} ${index + 1}`} /><span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#251811]/75 text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span></div>
                  <div className="p-3"><p className="truncate text-xs font-bold text-[#4C3B31]">{names[index] || `${locale === "en" ? "Property shot" : "لقطة العقار"} ${index + 1}`}</p><p className="mt-1 text-[10px] font-medium text-[#948D89]">{prompts[index] || prompts[index % prompts.length]}</p></div>
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-2xl border border-[#251811]/8 bg-[#F8F5F3] p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#825E49]"><Sparkles size={14} />{t.review.storyboard}</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{data.mediaUrls.map((_, index) => <div key={index} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E9C6B2] text-[10px] font-bold text-[#6B422A]">{index + 1}</span><span className="text-xs font-semibold text-[#604E44]">{prompts[index] || prompts[index % prompts.length]}</span><span className="ms-auto text-[10px] font-bold text-[#9C9692]">{FAL_CLIP_SECONDS}s</span></div>)}</div></div>

            {data.revisionNotes && <div className="mt-5 rounded-xl bg-[#F7EDE7] p-3.5"><p className="text-[11px] font-bold uppercase tracking-[.1em] text-[#885334]">{t.review.changeSent}</p><p className="mt-1 text-sm leading-6 text-[#695347]">{data.revisionNotes}</p></div>}

            {data.status === "Review" ? <>
              <button disabled={approve.isPending} onClick={() => approve.mutate({ id })} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#251811] text-sm font-bold text-white transition hover:bg-[#402E24] disabled:opacity-70">{approve.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}{approve.isPending ? (locale === "en" ? "Preparing cinematic production…" : "جارٍ إعداد الإنتاج السينمائي…") : t.review.approve}</button>
              <button onClick={() => setShowNotes(!showNotes)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#251811]/12 text-sm font-bold text-[#503F35] transition hover:bg-[#F6F2EF]"><MessageSquareText size={16} />{t.review.request}</button>
              {showNotes && <div className="mt-4 rounded-xl border border-[#251811]/10 bg-[#F8F4F1] p-3"><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder={t.review.notePlace} rows={3} className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[#A49E9A]" /><button disabled={notes.trim().length < 3 || request.isPending} onClick={() => request.mutate({ id, notes })} className="mt-3 h-9 w-full rounded-lg bg-[#E9C6B2] text-xs font-bold text-[#512E1A] disabled:opacity-50">{request.isPending ? t.common.loading : t.review.send}</button></div>}
            </> : <button onClick={() => setLocation(`/projects/${id}`)} className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#251811] text-sm font-bold text-white">{locale === "en" ? "View production" : "عرض الإنتاج"}</button>}
          </div>
        </div>
      </main>
    </AppSidebar>
  );
}
