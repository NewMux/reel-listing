import { useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, Loader2, MapPin, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { AppSidebar } from "@/components/AppChrome";
import { trpc } from "@/lib/trpc";
import { copy, useLocale } from "@/lib/locale";
import { getPilotGallery, type PilotGalleryId } from "@shared/pilotGalleries";

const REQUIRED_SELECTED = 10;

type PilotLocale = "en" | "ar";

const pilotCopy = {
  en: {
    eyebrow: "Private pilot gallery",
    title: "Choose the ten frames that make the film.",
    body: "These are owner-provided property galleries. Testers do not upload photos; they choose the ten strongest frames, set the order, and generate the film.",
    apartment: "Apartment",
    villa: "Villa",
    ownerGallery: "Owner-provided gallery",
    galleryBody: "Choose one property type, then select exactly 10 photos from the preloaded set.",
    selected: "selected",
    selectExact: "Select exactly 10 photos",
    selectedOnly: "Only your selected 10 will be sent to AI generation",
    sequenceTitle: "Your film sequence",
    sequenceBody: "This order becomes the edit order. Move selected shots up or down before creating the project.",
    emptySequence: "Select ten photos above to build the film sequence.",
    details: "Test property details",
    propertyTitle: "Property title",
    propertyTitlePlace: "e.g. Dubai villa pilot",
    location: "Location",
    locationPlace: "Dubai, UAE",
    description: "Optional listing note",
    descriptionPlace: "A short brief to anchor the story…",
    create: "Create film from selected 10",
    processing: "Preparing the selected gallery…",
    back: "Back to dashboard",
    required: "Select exactly 10 photos before continuing.",
    detailsRequired: "Add a property title and location to continue.",
    notReady: "This gallery currently has fewer than 10 owner-provided photos. The owner must finish the set before it can be generated.",
    order: "Film order",
    number: "Photo",
    apartmentLoaded: "9 of 10 loaded",
    villaLoaded: "10 of 10 loaded",
  },
  ar: {
    eyebrow: "معرض تجريبي خاص",
    title: "اختر اللقطات العشر التي تصنع الفيلم.",
    body: "هذه معارض عقارية أضافها المالك. لا يرفع المختبرون صوراً؛ بل يختارون أقوى عشر لقطات، ويحددون ترتيبها، ثم ينشئون الفيلم.",
    apartment: "شقة",
    villa: "فيلا",
    ownerGallery: "معرض أضافه المالك",
    galleryBody: "اختر نوع العقار، ثم حدد 10 صور بالضبط من المجموعة الجاهزة.",
    selected: "مختارة",
    selectExact: "اختر 10 صور بالضبط",
    selectedOnly: "سيتم إرسال الصور العشر المختارة فقط إلى التوليد بالذكاء الاصطناعي",
    sequenceTitle: "تسلسل الفيلم",
    sequenceBody: "يصبح هذا الترتيب ترتيب المونتاج. حرّك اللقطات إلى الأعلى أو الأسفل قبل إنشاء المشروع.",
    emptySequence: "اختر عشر صور أعلاه لبناء تسلسل الفيلم.",
    details: "تفاصيل العقار التجريبي",
    propertyTitle: "عنوان العقار",
    propertyTitlePlace: "مثال: تجربة فيلا في دبي",
    location: "الموقع",
    locationPlace: "دبي، الإمارات",
    description: "ملاحظة اختيارية للعرض",
    descriptionPlace: "موجز قصير لتثبيت القصة…",
    create: "إنشاء الفيلم من الصور العشر المختارة",
    processing: "جارٍ إعداد المعرض المختار…",
    back: "العودة إلى لوحة التحكم",
    required: "اختر 10 صور بالضبط قبل المتابعة.",
    detailsRequired: "أضف عنوان العقار والموقع للمتابعة.",
    notReady: "يحتوي هذا المعرض حالياً على أقل من 10 صور أضافها المالك. يجب إكمال المجموعة قبل إمكانية التوليد.",
    order: "ترتيب الفيلم",
    number: "الصورة",
    apartmentLoaded: "تم تحميل 9 من 10",
    villaLoaded: "تم تحميل 10 من 10",
  },
} as const;

export default function PilotProject() {
  const { locale } = useLocale();
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
  const selectedPhotos = useMemo(() => selectedIds.map(id => galleryImages.find(image => image.id === id)).filter(Boolean), [galleryImages, selectedIds]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const galleryReady = galleryImages.length === REQUIRED_SELECTED;

  const switchGallery = (next: PilotGalleryId) => {
    setGallery(next);
    setSelectedIds([]);
    setError("");
  };

  const toggleSelected = (id: string) => {
    setError("");
    setSelectedIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= REQUIRED_SELECTED) {
        setError(locale === "en" ? "You already selected 10 photos. Deselect one to choose another." : "لقد اخترت 10 صور بالفعل. ألغِ تحديد صورة لاختيار أخرى.");
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
    if (selectedIds.length !== REQUIRED_SELECTED) return setError(t.required);
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
        <button onClick={() => setLocation("/dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#63756A] transition hover:text-[#11251E]"><ArrowLeft size={16} />{t.back}</button>

        <div className="mt-8 grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
          <div className="lg:sticky lg:top-8">
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#6E8249]">{t.eyebrow}</p>
            <h1 className="serif mt-3 max-w-[500px] text-5xl leading-[.98] tracking-[-.05em]">{t.title}</h1>
            <p className="mt-5 max-w-[500px] text-sm leading-7 text-[#63746A]">{t.body}</p>
            <div className="mt-8 rounded-[22px] border border-[#C6D4A9] bg-[#EAF0DC] p-5">
              <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#D8E9B2] text-[#436515]"><Sparkles size={17} /></span><div><p className="text-sm font-bold text-[#31503B]">{t.selectedOnly}</p><p className="mt-2 text-sm leading-6 text-[#6B7C70]">{t.sequenceBody}</p></div></div>
              <div className="mt-5 flex items-center gap-2 border-t border-[#BFD19C] pt-4 text-xs font-bold text-[#52712F]"><Check size={15} />{selectedIds.length}/{REQUIRED_SELECTED} {t.selected}</div>
            </div>
          </div>

          <div className="rounded-[27px] border border-[#11251E]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.05)] sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-sm font-bold text-[#254034]">{t.ownerGallery}</h2><p className="mt-1 max-w-lg text-xs leading-5 text-[#758178]">{t.galleryBody}</p></div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${galleryReady ? "bg-[#D8E9B2] text-[#416221]" : "bg-[#FFF0D0] text-[#8B5A08]"}`}>{loadedLabel}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-[#F0F2E9] p-1">
              {(["apartment", "villa"] as const).map(id => <button type="button" key={id} onClick={() => switchGallery(id)} className={`rounded-lg px-3 py-3 text-sm font-bold transition ${gallery === id ? "bg-white text-[#11251E] shadow-sm" : "text-[#68766E] hover:text-[#11251E]"}`}>{id === "apartment" ? t.apartment : t.villa}</button>)}
            </div>

            <p className="mt-5 text-xs font-bold uppercase tracking-[.1em] text-[#6E8249]">{t.selectExact}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {galleryImages.map((image, index) => {
                const rank = selectedIds.indexOf(image.id);
                const isSelected = selectedSet.has(image.id);
                return <div key={image.id} className={`group relative overflow-hidden rounded-xl border ${isSelected ? "border-[#76933C] ring-2 ring-[#D8E9B2]" : "border-[#11251E]/10"}`}>
                  <button type="button" onClick={() => toggleSelected(image.id)} aria-pressed={isSelected} className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-[#F1F0E9] text-start outline-none focus-visible:ring-2 focus-visible:ring-[#668D3A]">
                    <img src={image.url} className={`h-full w-full object-cover transition ${isSelected ? "brightness-[.78]" : "group-hover:scale-[1.03]"}`} alt={`${t.number} ${index + 1}`} />
                    <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#11251E]/80 text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span>
                    {isSelected && <span className="absolute inset-0 grid place-items-center"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#D8E9B2] text-[#355B18] shadow-lg"><Check size={19} /></span></span>}
                    {isSelected && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[#11251E]/85 px-1.5 py-1 text-[10px] font-bold text-white">{rank + 1}</span>}
                  </button>
                </div>;
              })}
            </div>

            {!galleryReady && <p className="mt-4 flex gap-2 rounded-xl bg-[#FFF0D0] px-3 py-2.5 text-xs font-medium leading-5 text-[#8B5A08]"><AlertCircle size={15} className="shrink-0" />{t.notReady}</p>}

            <div className="mt-7 rounded-2xl border border-[#11251E]/8 bg-[#F8F8F3] p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.1em] text-[#6E8249]">{t.sequenceTitle}</p><p className="mt-1 text-xs leading-5 text-[#758178]">{t.sequenceBody}</p></div><span className="shrink-0 rounded-full bg-[#D8E9B2] px-2.5 py-1 text-[10px] font-bold text-[#416221]">{selectedIds.length}/{REQUIRED_SELECTED}</span></div>
              {selectedPhotos.length === 0 ? <p className="mt-4 rounded-xl bg-white px-3 py-4 text-center text-xs font-semibold text-[#89948B]">{t.emptySequence}</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {selectedPhotos.map((photo, index) => photo && <div key={photo.id} className="flex items-center gap-2 rounded-xl bg-white p-2"><img src={photo.url} alt={`${t.number} ${index + 1}`} className="h-12 w-16 shrink-0 rounded-lg object-cover" /><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#D8E9B2] text-[10px] font-bold text-[#4A6B2A]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#446052]">{photo.name}</span><div className="flex shrink-0 gap-1"><button type="button" disabled={index === 0} onClick={() => moveSelected(index, -1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#11251E]/10 text-[#557060] disabled:opacity-25" aria-label={`${t.order} ${index + 1} up`}><ArrowUp size={13} /></button><button type="button" disabled={index === selectedPhotos.length - 1} onClick={() => moveSelected(index, 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#11251E]/10 text-[#557060] disabled:opacity-25" aria-label={`${t.order} ${index + 1} down`}><ArrowDown size={13} /></button></div></div>)}
              </div>}
            </div>

            <div className="mt-7 grid gap-5">
              <p className="text-xs font-bold uppercase tracking-[.1em] text-[#6E8249]">{t.details}</p>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.propertyTitle}<input value={title} onChange={event => setTitle(event.target.value)} placeholder={t.propertyTitlePlace} className="h-11 rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] px-3 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" /></label>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.location}<span className="relative"><MapPin size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-[#6D806E]" /><input value={location} onChange={event => setLocationValue(event.target.value)} placeholder={t.locationPlace} className="h-11 w-full rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] pe-3 ps-9 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" /></span></label>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.description}<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t.descriptionPlace} rows={2} className="rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] px-3 py-2.5 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" /></label>
            </div>

            {error && <p className="mt-4 flex gap-2 rounded-xl bg-[#FFF1E5] px-3 py-2.5 text-xs font-medium text-[#94572C]"><AlertCircle size={15} className="shrink-0" />{error}</p>}
            <button disabled={create.isPending} onClick={submit} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#11251E] text-sm font-bold text-white transition hover:bg-[#244035] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-70">{create.isPending && <Loader2 size={16} className="animate-spin" />}{create.isPending ? t.processing : t.create}</button>
          </div>
        </div>
      </main>
    </AppSidebar>
  );
}
