import { useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Loader2, MapPin, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { AppSidebar } from "@/components/AppChrome";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/lib/locale";
import { getPilotGallery, type PilotGalleryId } from "@shared/pilotGalleries";

type PilotLocale = "en" | "ar";

const pilotCopy = {
  en: {
    eyebrow: "Private pilot gallery",
    title: "Choose the frames that make the film.",
    body: "Choose from the owner-provided apartment or villa gallery. Select the images that tell the strongest story, set the sequence, and let the studio build the film.",
    apartment: "Apartment",
    villa: "Villa",
    ownerGallery: "Owner-provided gallery",
    galleryBody: "Select the strongest images from the owner-provided set, then arrange your film sequence.",
    selected: "selected",
    selectExact: "Select all available photos for this film",
    selectedOnly: "Only your selected property images enter AI production",
    sequenceTitle: "Your film sequence",
    sequenceBody: "Your order becomes the editorial sequence. Move any shot before production begins.",
    emptySequence: "Select the owner-provided photos above to build the film sequence.",
    details: "Test property details",
    propertyTitle: "Property title",
    propertyTitlePlace: "e.g. Dubai villa pilot",
    location: "Location",
    locationPlace: "Dubai, UAE",
    description: "Optional listing note",
    descriptionPlace: "A short brief to anchor the story…",
    create: "Create film from selected photos",
    processing: "Preparing the selected gallery…",
    back: "Back to dashboard",
    required: "Select all owner-provided photos before continuing.",
    detailsRequired: "Add a property title and location to continue.",
    notReady: "This owner gallery has no photos available yet.",
    order: "Film order",
    number: "Photo",
    apartmentLoaded: "9 photos loaded",
    villaLoaded: "10 photos loaded",
    alreadySelected: "You already selected all available photos.",
  },
  ar: {
    eyebrow: "معرض تجريبي خاص",
    title: "اختر اللقطات التي تصنع الفيلم.",
    body: "اختر من معرض الشقة أو الفيلا الذي أضافه المالك. حدد الصور التي تحكي القصة الأقوى، ورتب التسلسل، ودع الاستوديو يبني الفيلم.",
    apartment: "شقة",
    villa: "فيلا",
    ownerGallery: "معرض أضافه المالك",
    galleryBody: "حدد أقوى الصور من مجموعة المالك الجاهزة، ثم رتب تسلسل الفيلم.",
    selected: "مختارة",
    selectExact: "اختر جميع الصور المتاحة لهذا الفيلم",
    selectedOnly: "ستدخل صور العقار المختارة فقط في الإنتاج بالذكاء الاصطناعي",
    sequenceTitle: "تسلسل الفيلم",
    sequenceBody: "يصبح ترتيبك هو التسلسل التحريري. حرّك أي لقطة قبل بدء الإنتاج.",
    emptySequence: "اختر الصور التي أضافها المالك أعلاه لبناء تسلسل الفيلم.",
    details: "تفاصيل العقار التجريبي",
    propertyTitle: "عنوان العقار",
    propertyTitlePlace: "مثال: تجربة فيلا في دبي",
    location: "الموقع",
    locationPlace: "دبي، الإمارات",
    description: "ملاحظة اختيارية للعرض",
    descriptionPlace: "موجز قصير لتثبيت القصة…",
    create: "إنشاء الفيلم من الصور المختارة",
    processing: "جارٍ إعداد المعرض المختار…",
    back: "العودة إلى لوحة التحكم",
    required: "اختر جميع الصور التي أضافها المالك قبل المتابعة.",
    detailsRequired: "أضف عنوان العقار والموقع للمتابعة.",
    notReady: "لا توجد صور متاحة في معرض المالك بعد.",
    order: "ترتيب الفيلم",
    number: "الصورة",
    apartmentLoaded: "تم تحميل 9 صور",
    villaLoaded: "تم تحميل 10 صور",
    alreadySelected: "لقد اخترت جميع الصور المتاحة بالفعل.",
  },
} as const;

export default function PilotProject() {
  const { locale, isRtl } = useLocale();
  const t = pilotCopy[locale as PilotLocale] ?? pilotCopy.en;
  const [, setLocation] = useLocation();
  const [gallery, setGallery] = useState<PilotGalleryId>("villa");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocationValue] = useState("");
  const [error, setError] = useState("");
  const create = trpc.projects.createPilot.useMutation({
    onSuccess: data => setLocation(`/projects/${data.id}/review`),
    onError: err => setError(err.message),
  });

  const galleryImages = getPilotGallery(gallery);
  const selectionTarget = galleryImages.length;
  const selectedPhotos = useMemo(() => selectedIds.map(id => galleryImages.find(image => image.id === id)).filter(Boolean), [galleryImages, selectedIds]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const galleryReady = galleryImages.length > 0;

  const switchGallery = (next: PilotGalleryId) => {
    setGallery(next);
    setSelectedIds([]);
    setError("");
  };

  const toggleSelected = (id: string) => {
    setError("");
    setSelectedIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= selectionTarget) {
        setError(t.alreadySelected);
        return current;
      }
      return [...current, id];
    });
  };

  const moveSelected = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedIds.length) return;
    setSelectedIds(current => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const submit = () => {
    setError("");
    if (!galleryReady) return setError(t.notReady);
    if (selectedIds.length !== selectionTarget) return setError(t.required);
    if (!title.trim() || !location.trim()) return setError(t.detailsRequired);
    create.mutate({
      gallery,
      imageIds: selectedIds,
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim(),
    });
  };

  const loadedLabel = gallery === "apartment" ? t.apartmentLoaded : t.villaLoaded;

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[1260px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <button onClick={() => setLocation("/dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#756A63] transition hover:text-[#251811]">{isRtl ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}{t.back}</button>

        <div className="mt-8 grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div className="lg:sticky lg:top-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#825E49]">{t.eyebrow}</p>
            <h1 className="serif mt-3 max-w-[500px] text-5xl leading-[.98] tracking-[-.05em]">{t.title}</h1>
            <p className="mt-5 max-w-[500px] text-sm leading-7 text-[#746963]">{t.body}</p>
            <div className="mt-8 rounded-[22px] border border-[#D4B9A9] bg-[#F0E3DC] p-5">
              <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#E9C6B2] text-[#653215]"><Sparkles size={17} /></span><div><p className="text-sm font-bold text-[#503C31]">{t.selectedOnly}</p><p className="mt-2 text-sm leading-6 text-[#7C716B]">{t.sequenceBody}</p></div></div>
              <div className="mt-5 flex items-center gap-2 border-t border-[#D1AF9C] pt-4 text-xs font-bold text-[#71472F]"><Check size={15} />{selectedIds.length}/{selectionTarget} {t.selected}</div>
            </div>
          </div>

          <div className="rounded-[27px] border border-[#251811]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.05)] sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-sm font-bold text-[#402F25]">{t.ownerGallery}</h2><p className="mt-1 max-w-lg text-xs leading-5 text-[#817975]">{t.galleryBody}</p></div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${galleryReady ? "bg-[#E9C6B2] text-[#623921]" : "bg-[#FFE1D0] text-[#8B3808]"}`}>{loadedLabel}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-[#F2ECE9] p-1">
              {(["apartment", "villa"] as const).map(id => <button type="button" key={id} onClick={() => switchGallery(id)} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${gallery === id ? "bg-white text-[#251811] shadow-sm" : "text-[#766D68] hover:text-[#251811]"}`}>{id === "apartment" ? t.apartment : t.villa}</button>)}
            </div>

            <p className="mt-5 text-xs font-bold uppercase tracking-[.1em] text-[#825E49]">{t.selectExact} · {selectedIds.length}/{selectionTarget} {t.selected}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {galleryImages.map((image, index) => {
                const rank = selectedIds.indexOf(image.id);
                const isSelected = selectedSet.has(image.id);
                return <div key={image.id} className={`group relative overflow-hidden rounded-xl border ${isSelected ? "border-[#935C3C] ring-2 ring-[#E9C6B2]" : "border-[#251811]/10"}`}>
                  <button type="button" onClick={() => toggleSelected(image.id)} aria-pressed={isSelected} className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-[#F1ECE9] text-start outline-none focus-visible:ring-2 focus-visible:ring-[#8D583A]">
                    <img src={image.url} className={`h-full w-full object-cover transition ${isSelected ? "brightness-[.78]" : "group-hover:scale-[1.03]"}`} alt={`${t.number} ${index + 1}`} />
                    <span className="absolute start-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#251811]/80 text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span>
                    {isSelected && <span className="absolute inset-0 grid place-items-center"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#E9C6B2] text-[#5B3118] shadow-lg"><Check size={19} /></span></span>}
                    {isSelected && <span className="absolute bottom-1.5 start-1.5 rounded-md bg-[#251811]/85 px-1.5 py-1 text-[10px] font-bold text-white">{rank + 1}</span>}
                  </button>
                </div>;
              })}
            </div>

            {!galleryReady && <p className="mt-4 flex gap-2 rounded-xl bg-[#FFE1D0] px-3 py-2.5 text-xs font-medium leading-5 text-[#8B3808]"><AlertCircle size={15} className="shrink-0" />{t.notReady}</p>}

            <div className="mt-7 rounded-2xl border border-[#251811]/8 bg-[#F8F5F3] p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.1em] text-[#825E49]">{t.sequenceTitle}</p><p className="mt-1 text-xs leading-5 text-[#817975]">{t.sequenceBody}</p></div><span className="shrink-0 rounded-full bg-[#E9C6B2] px-2.5 py-1 text-[10px] font-bold text-[#623921]">{selectedIds.length}/{selectionTarget}</span></div>
              {selectedPhotos.length === 0 ? <p className="mt-4 rounded-xl bg-white px-3 py-4 text-center text-xs font-semibold text-[#948D89]">{t.emptySequence}</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {selectedPhotos.map((photo, index) => photo && <div key={photo.id} className="flex items-center gap-2 rounded-xl bg-white p-2"><img src={photo.url} alt={`${t.number} ${index + 1}`} className="h-12 w-16 shrink-0 rounded-lg object-cover" /><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E9C6B2] text-[10px] font-bold text-[#6B422A]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#604E44]">{photo.name}</span><div className="flex shrink-0 gap-1"><button type="button" disabled={index === 0} onClick={() => moveSelected(index, -1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#251811]/10 text-[#705F55] disabled:opacity-25" aria-label={`${t.order} ${index + 1} up`}><ArrowUp size={13} /></button><button type="button" disabled={index === selectedPhotos.length - 1} onClick={() => moveSelected(index, 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#251811]/10 text-[#705F55] disabled:opacity-25" aria-label={`${t.order} ${index + 1} down`}><ArrowDown size={13} /></button></div></div>)}
              </div>}
            </div>

            <div className="mt-7 grid gap-5">
              <p className="text-xs font-bold uppercase tracking-[.1em] text-[#825E49]">{t.details}</p>
              <label className="grid gap-2 text-sm font-bold text-[#402F25]">{t.propertyTitle}<input value={title} onChange={event => setTitle(event.target.value)} placeholder={t.propertyTitlePlace} className="h-11 rounded-xl border border-[#251811]/12 bg-[#FCFBFA] px-3 text-sm font-normal outline-none transition focus:border-[#855235] focus:ring-2 focus:ring-[#E9C6B2]" /></label>
              <label className="grid gap-2 text-sm font-bold text-[#402F25]">{t.location}<span className="relative"><MapPin size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-[#80746D]" /><input value={location} onChange={event => setLocationValue(event.target.value)} placeholder={t.locationPlace} className="h-11 w-full rounded-xl border border-[#251811]/12 bg-[#FCFBFA] pe-3 ps-9 text-sm font-normal outline-none transition focus:border-[#855235] focus:ring-2 focus:ring-[#E9C6B2]" /></span></label>
              <label className="grid gap-2 text-sm font-bold text-[#402F25]">{t.description}<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t.descriptionPlace} rows={2} className="rounded-xl border border-[#251811]/12 bg-[#FCFBFA] px-3 py-2.5 text-sm font-normal outline-none transition focus:border-[#855235] focus:ring-2 focus:ring-[#E9C6B2]" /></label>
            </div>

            {error && <p className="mt-4 flex gap-2 rounded-xl bg-[#FFEFE5] px-3 py-2.5 text-xs font-medium text-[#94522C]"><AlertCircle size={15} className="shrink-0" />{error}</p>}
            <button disabled={create.isPending} onClick={submit} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#251811] text-sm font-bold text-white transition hover:bg-[#402E24] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-70">{create.isPending && <Loader2 size={16} className="animate-spin" />}{create.isPending ? t.processing : t.create}</button>
          </div>
        </div>
      </main>
    </AppSidebar>
  );
}
