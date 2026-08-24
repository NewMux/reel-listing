import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Check, ImagePlus, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { AppSidebar } from "@/components/AppChrome";
import { trpc } from "@/lib/trpc";
import { useLocale } from "@/lib/locale";

const MAX_PHOTOS = 30;
const REQUIRED_SELECTED = 10;
const MAX_SELECTED_BYTES = 25 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type PilotLocale = "en" | "ar";
type PilotPhoto = { id: string; file: File; preview: string };
type UploadedMedia = { name: string; type: string; key: string; url: string };

const pilotCopy = {
  en: {
    eyebrow: "Private pilot gallery",
    title: "Choose the ten frames that make the film.",
    body: "Start with a 30-photo property set. Select the ten strongest frames, put them in the right order, and only that selection will be sent to AI generation.",
    uploadTitle: "Upload the 30-photo test set",
    uploadBody: "Add the sample property photos your testers will review. Click a photo to select or deselect it.",
    drop: "Drop up to 30 property photos here",
    browse: "or browse files",
    selected: "selected",
    selectExact: "Select exactly 10 photos",
    selectedOnly: "Only the selected 10 will be uploaded and generated",
    sequenceTitle: "Your film sequence",
    sequenceBody: "This order becomes the edit order. Move selected shots up or down before creating the project.",
    emptySequence: "Select ten photos above to build the film sequence.",
    details: "Test property details",
    propertyTitle: "Property title",
    propertyTitlePlace: "e.g. Seafront residence pilot",
    location: "Location",
    locationPlace: "Dubai Marina, Dubai",
    description: "Optional listing note",
    descriptionPlace: "A short brief to anchor the story…",
    create: "Create project from selected 10",
    processing: "Securing selected photos…",
    uploading: "Only selected photos are being uploaded",
    back: "Back to dashboard",
    remove: "Remove photo",
    selectionFull: "You already selected 10 photos. Deselect one to choose another.",
    invalid: "Use JPG, PNG, or WEBP image files.",
    tooMany: "The pilot gallery supports up to 30 photos.",
    required: "Select exactly 10 photos before continuing.",
    detailsRequired: "Add a property title and location to continue.",
    size: "Keep the selected 10 photos under 25 MB combined.",
    uploadFailed: "We could not secure the selected media. Please try again.",
    order: "Film order",
    number: "Photo",
  },
  ar: {
    eyebrow: "معرض تجريبي خاص",
    title: "اختر اللقطات العشر التي تصنع الفيلم.",
    body: "ابدأ بمجموعة من 30 صورة للعقار. اختر أقوى عشر لقطات، ورتبها بالشكل المناسب، وسيتم إرسال هذا الاختيار فقط إلى التوليد بالذكاء الاصطناعي.",
    uploadTitle: "ارفع مجموعة الاختبار المكونة من 30 صورة",
    uploadBody: "أضف صور العقار التي سيراجعها المختبرون. اضغط على الصورة لتحديدها أو إلغاء تحديدها.",
    drop: "أفلت حتى 30 صورة للعقار هنا",
    browse: "أو تصفح الملفات",
    selected: "مختارة",
    selectExact: "اختر 10 صور بالضبط",
    selectedOnly: "سيتم رفع الصور العشر المختارة وتوليدها فقط",
    sequenceTitle: "تسلسل الفيلم",
    sequenceBody: "يصبح هذا الترتيب ترتيب المونتاج. حرّك اللقطات إلى الأعلى أو الأسفل قبل إنشاء المشروع.",
    emptySequence: "اختر عشر صور أعلاه لبناء تسلسل الفيلم.",
    details: "تفاصيل العقار التجريبي",
    propertyTitle: "عنوان العقار",
    propertyTitlePlace: "مثال: تجربة منزل بحري",
    location: "الموقع",
    locationPlace: "دبي مارينا، دبي",
    description: "ملاحظة اختيارية للعرض",
    descriptionPlace: "موجز قصير لتثبيت القصة…",
    create: "إنشاء مشروع من الصور العشر المختارة",
    processing: "جارٍ تأمين الصور المختارة…",
    uploading: "جارٍ رفع الصور المختارة فقط",
    back: "العودة إلى لوحة التحكم",
    remove: "إزالة الصورة",
    selectionFull: "لقد اخترت 10 صور بالفعل. ألغِ تحديد صورة لاختيار أخرى.",
    invalid: "استخدم صور JPG أو PNG أو WEBP.",
    tooMany: "يدعم المعرض التجريبي حتى 30 صورة.",
    required: "اختر 10 صور بالضبط قبل المتابعة.",
    detailsRequired: "أضف عنوان العقار والموقع للمتابعة.",
    size: "حافظ على حجم الصور العشر المختارة تحت 25 ميغابايت إجمالاً.",
    uploadFailed: "تعذر تأمين الصور المختارة. حاول مرة أخرى.",
    order: "ترتيب الفيلم",
    number: "الصورة",
  },
} as const;

function getPhotoId(file: File, sequence: number) {
  return `${file.name}-${file.lastModified}-${file.size}-${sequence}`;
}

export default function PilotProject() {
  const { locale } = useLocale();
  const t = pilotCopy[locale as PilotLocale] ?? pilotCopy.en;
  const [, setLocation] = useLocation();
  const [photos, setPhotos] = useState<PilotPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocationValue] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sequenceRef = useRef(0);
  const photosRef = useRef<PilotPhoto[]>([]);
  const createUploadTarget = trpc.media.createUploadTarget.useMutation();
  const create = trpc.projects.create.useMutation({
    onSuccess: data => {
      setUploadProgress(100);
      setLocation(`/projects/${data.id}/review`);
    },
    onError: err => {
      setError(err.message);
      setUploadProgress(null);
    },
  });

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => () => {
    photosRef.current.forEach(photo => URL.revokeObjectURL(photo.preview));
  }, []);

  const selectedPhotos = useMemo(
    () => selectedIds.map(id => photos.find(photo => photo.id === id)).filter((photo): photo is PilotPhoto => Boolean(photo)),
    [photos, selectedIds],
  );
  const selectedBytes = useMemo(() => selectedPhotos.reduce((total, photo) => total + photo.file.size, 0), [selectedPhotos]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isBusy = create.isPending || createUploadTarget.isPending || uploadProgress !== null;

  const addFiles = (next: File[]) => {
    setError("");
    const accepted = next.filter(file => ACCEPTED_TYPES.includes(file.type));
    if (accepted.length !== next.length) {
      setError(t.invalid);
      return;
    }
    if (photos.length + accepted.length > MAX_PHOTOS) {
      setError(t.tooMany);
      return;
    }
    const additions = accepted.map(file => ({
      id: getPhotoId(file, sequenceRef.current++),
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos(current => [...current, ...additions]);
  };

  const browse = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(Array.from(event.target.files));
    event.target.value = "";
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const toggleSelected = (id: string) => {
    setError("");
    setSelectedIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= REQUIRED_SELECTED) {
        setError(t.selectionFull);
        return current;
      }
      return [...current, id];
    });
  };

  const removePhoto = (id: string) => {
    const photo = photos.find(item => item.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhotos(current => current.filter(item => item.id !== id));
    setSelectedIds(current => current.filter(item => item !== id));
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

  const clearAll = () => {
    photos.forEach(photo => URL.revokeObjectURL(photo.preview));
    setPhotos([]);
    setSelectedIds([]);
    setError("");
  };

  const submit = async () => {
    setError("");
    if (!title.trim() || !location.trim()) {
      setError(t.detailsRequired);
      return;
    }
    if (selectedPhotos.length !== REQUIRED_SELECTED) {
      setError(t.required);
      return;
    }
    if (selectedBytes > MAX_SELECTED_BYTES) {
      setError(t.size);
      return;
    }

    try {
      setUploadProgress(0);
      let completeBytes = 0;
      const uploads: UploadedMedia[] = [];
      for (const photo of selectedPhotos) {
        const target = await createUploadTarget.mutateAsync({ name: photo.file.name, type: photo.file.type });
        const upload = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": photo.file.type },
          body: photo.file,
        });
        if (!upload.ok) throw new Error(`Upload failed (${upload.status}). Please try again.`);
        uploads.push({ name: photo.file.name, type: photo.file.type, key: target.key, url: target.url });
        completeBytes += photo.file.size;
        setUploadProgress(Math.min(88, Math.round((completeBytes / selectedBytes) * 88)));
      }
      setUploadProgress(92);
      create.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim(),
        files: uploads,
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.uploadFailed);
      setUploadProgress(null);
    }
  };

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
              <div><h2 className="text-sm font-bold text-[#254034]">{t.uploadTitle}</h2><p className="mt-1 max-w-lg text-xs leading-5 text-[#758178]">{t.uploadBody}</p></div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${selectedIds.length === REQUIRED_SELECTED ? "bg-[#D8E9B2] text-[#416221]" : "bg-[#F3F0E7] text-[#796B4E]"}`}>{selectedIds.length}/{REQUIRED_SELECTED} {t.selected}</span>
            </div>

            <div onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} onClick={() => inputRef.current?.click()} className={`mt-5 grid min-h-32 cursor-pointer place-items-center rounded-2xl border border-dashed p-5 text-center transition ${dragging ? "border-[#5E8535] bg-[#EAF2D7]" : "border-[#A7B4AA] bg-[#F8F7F2] hover:border-[#668647] hover:bg-[#F2F5E7]"}`}>
              <input ref={inputRef} onChange={browse} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" />
              <div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#D8E9B2] text-[#456A26]"><ImagePlus size={19} /></span><p className="mt-3 text-sm font-bold text-[#2A4437]">{t.drop}</p><p className="mt-1 text-xs text-[#758178]">{t.browse} · {photos.length}/{MAX_PHOTOS}</p></div>
            </div>

            {photos.length > 0 && <>
              <div className="mt-5 flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#6E8249]">{t.selectExact}</p><button type="button" onClick={clearAll} className="text-xs font-semibold text-[#718078] underline underline-offset-4">{locale === "en" ? "Clear gallery" : "مسح المعرض"}</button></div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {photos.map((photo, index) => {
                  const rank = selectedIds.indexOf(photo.id);
                  const isSelected = selectedSet.has(photo.id);
                  return <div key={photo.id} className={`group relative overflow-hidden rounded-xl border ${isSelected ? "border-[#76933C] ring-2 ring-[#D8E9B2]" : "border-[#11251E]/10"}`}>
                    <div role="button" tabIndex={0} aria-pressed={isSelected} onClick={() => toggleSelected(photo.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleSelected(photo.id); } }} className="relative aspect-[4/3] cursor-pointer bg-[#F1F0E9] outline-none focus-visible:ring-2 focus-visible:ring-[#668D3A]">
                      <img src={photo.preview} className={`h-full w-full object-cover transition ${isSelected ? "brightness-[.78]" : "group-hover:scale-[1.03]"}`} alt={`${t.number} ${index + 1}`} />
                      <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#11251E]/80 text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span>
                      {isSelected && <span className="absolute inset-0 grid place-items-center"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#D8E9B2] text-[#355B18] shadow-lg"><Check size={19} /></span></span>}
                      {isSelected && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[#11251E]/85 px-1.5 py-1 text-[10px] font-bold text-white">{rank + 1}</span>}
                      <button type="button" onClick={event => { event.stopPropagation(); removePhoto(photo.id); }} aria-label={`${t.remove} ${index + 1}`} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#11251E]/80 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"><X size={13} /></button>
                    </div>
                  </div>;
                })}
              </div>
            </>}

            <div className="mt-7 rounded-2xl border border-[#11251E]/8 bg-[#F8F8F3] p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.1em] text-[#6E8249]">{t.sequenceTitle}</p><p className="mt-1 text-xs leading-5 text-[#758178]">{t.sequenceBody}</p></div><span className="shrink-0 rounded-full bg-[#D8E9B2] px-2.5 py-1 text-[10px] font-bold text-[#416221]">{selectedIds.length}/{REQUIRED_SELECTED}</span></div>
              {selectedPhotos.length === 0 ? <p className="mt-4 rounded-xl bg-white px-3 py-4 text-center text-xs font-semibold text-[#89948B]">{t.emptySequence}</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {selectedPhotos.map((photo, index) => <div key={photo.id} className="flex items-center gap-2 rounded-xl bg-white p-2"><img src={photo.preview} alt={`${t.number} ${index + 1}`} className="h-12 w-16 shrink-0 rounded-lg object-cover" /><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#D8E9B2] text-[10px] font-bold text-[#4A6B2A]">{index + 1}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#446052]">{photo.file.name}</span><div className="flex shrink-0 gap-1"><button type="button" disabled={index === 0} onClick={() => moveSelected(index, -1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#11251E]/10 text-[#557060] disabled:opacity-25" aria-label={`${t.order} ${index + 1} up`}><ArrowUp size={13} /></button><button type="button" disabled={index === selectedPhotos.length - 1} onClick={() => moveSelected(index, 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#11251E]/10 text-[#557060] disabled:opacity-25" aria-label={`${t.order} ${index + 1} down`}><ArrowDown size={13} /></button></div></div>)}
              </div>}
            </div>

            <div className="mt-7 grid gap-5">
              <p className="text-xs font-bold uppercase tracking-[.1em] text-[#6E8249]">{t.details}</p>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.propertyTitle}<input value={title} onChange={event => setTitle(event.target.value)} placeholder={t.propertyTitlePlace} className="h-11 rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] px-3 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" /></label>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.location}<span className="relative"><MapPin size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-[#6D806E]" /><input value={location} onChange={event => setLocationValue(event.target.value)} placeholder={t.locationPlace} className="h-11 w-full rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] pe-3 ps-9 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" /></span></label>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.description}<textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t.descriptionPlace} rows={2} className="rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] px-3 py-2.5 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" /></label>
            </div>

            {error && <p className="mt-4 flex gap-2 rounded-xl bg-[#FFF1E5] px-3 py-2.5 text-xs font-medium text-[#94572C]"><AlertCircle size={15} className="shrink-0" />{error}</p>}
            {uploadProgress !== null && <div className="mt-5 rounded-xl bg-[#EFF4E6] p-3.5"><div className="flex items-center justify-between text-xs font-bold text-[#496A38]"><span>{t.uploading}</span><span>{uploadProgress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#D8E6CC]"><div className="h-full rounded-full bg-[#668D3A] transition-all duration-200" style={{ width: `${uploadProgress}%` }} /></div></div>}
            <button disabled={isBusy} onClick={submit} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#11251E] text-sm font-bold text-white transition hover:bg-[#244035] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-70">{isBusy && <Loader2 size={16} className="animate-spin" />}{isBusy ? t.processing : t.create}</button>
          </div>
        </div>
      </main>
    </AppSidebar>
  );
}
