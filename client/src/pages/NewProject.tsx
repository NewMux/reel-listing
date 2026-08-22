import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, ImagePlus, Loader2, MapPin, X } from "lucide-react";
import { useLocation } from "wouter";
import { AppSidebar } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";

const REQUIRED_PHOTOS = 10;
const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type LocalFile = { file: File; preview: string };
type UploadedMedia = { name: string; type: string; key: string; url: string };

function readChunkBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("Unable to read file chunk."));
      resolve(reader.result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Unable to read file chunk."));
    reader.readAsDataURL(blob);
  });
}

export default function NewProject() {
  const { locale } = useLocale();
  const t = copy[locale];
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocationValue] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startUpload = trpc.media.createUploadSession.useMutation();
  const appendChunk = trpc.media.appendUploadChunk.useMutation();
  const finalizeUpload = trpc.media.finalizeUploadSession.useMutation();
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

  const addFiles = (next: File[]) => {
    setError("");
    const accepted = next.filter(file => ACCEPTED_TYPES.includes(file.type));
    if (accepted.length !== next.length) return setError("Use JPG, PNG, or WEBP image files.");

    const merged = [
      ...files,
      ...accepted.map(file => ({ file, preview: URL.createObjectURL(file) })),
    ];
    if (merged.length > REQUIRED_PHOTOS) return setError(`You can upload a maximum of ${REQUIRED_PHOTOS} photos.`);
    if (merged.reduce((sum, item) => sum + item.file.size, 0) > MAX_BYTES) {
      return setError("Keep the combined upload size under 25 MB.");
    }
    setFiles(merged);
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

  const removeFile = (index: number) => {
    URL.revokeObjectURL(files[index]?.preview || "");
    setFiles(current => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const submit = async () => {
    setError("");
    if (!title.trim() || !location.trim()) return setError("Add a property title and location to continue.");
    if (files.length !== REQUIRED_PHOTOS) return setError(`Upload exactly ${REQUIRED_PHOTOS} property photos to continue.`);

    try {
      setUploadProgress(0);
      const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0);
      let completeBytes = 0;
      const uploads: UploadedMedia[] = [];

      for (const item of files) {
        const session = await startUpload.mutateAsync({
          name: item.file.name,
          type: item.file.type,
          totalBytes: item.file.size,
        });
        for (let offset = 0; offset < item.file.size; offset += session.chunkSize) {
          const chunk = await readChunkBase64(item.file.slice(offset, Math.min(offset + session.chunkSize, item.file.size)));
          const progress = await appendChunk.mutateAsync({ uploadId: session.id, chunk });
          setUploadProgress(Math.min(88, Math.round(((completeBytes + progress.receivedBytes) / totalBytes) * 88)));
        }
        uploads.push(await finalizeUpload.mutateAsync({ uploadId: session.id }));
        completeBytes += item.file.size;
      }

      setUploadProgress(92);
      create.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim(),
        files: uploads,
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "We could not secure this media. Please try again.");
      setUploadProgress(null);
    }
  };

  const isBusy = create.isPending || startUpload.isPending || appendChunk.isPending || finalizeUpload.isPending;
  const isReady = files.length === REQUIRED_PHOTOS;
  const remaining = REQUIRED_PHOTOS - files.length;

  return (
    <AppSidebar>
      <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <button onClick={() => setLocation("/dashboard")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#63756A] transition hover:text-[#11251E]">
          <ArrowLeft size={16} />
          {t.common.back}
        </button>

        <div className="mt-8 grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#6E8249]">{t.upload.eyebrow}</p>
            <h1 className="serif mt-3 max-w-[420px] text-5xl leading-[.98] tracking-[-.05em]">{t.upload.title}</h1>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#64756B]">{t.upload.body}</p>

            <div className="mt-9 rounded-[22px] border border-[#C6D4A9] bg-[#EAF0DC] p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#D8E9B2] text-[#436515]"><ImagePlus size={17} /></span>
                <div>
                  <p className="text-sm font-bold text-[#31503B]">{locale === "en" ? "Ten frames, one clear story" : "عشر لقطات، قصة واضحة واحدة"}</p>
                  <p className="mt-2 text-sm leading-6 text-[#6B7C70]">{locale === "en" ? "We turn each photo into a cinematic 10-second clip, then stitch the sequence into one polished reel." : "نحوّل كل صورة إلى مقطع سينمائي مدته 10 ثوانٍ، ثم نرتّب اللقطات في فيلم واحد راقٍ."}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 text-xs font-bold text-[#52712F]">
                <Check size={15} />
                {locale === "en" ? "Your order is preserved in the final edit" : "سيتم الحفاظ على ترتيبك في المونتاج النهائي"}
              </div>
            </div>
          </div>

          <div className="rounded-[27px] border border-[#11251E]/10 bg-white p-5 shadow-[0_16px_40px_rgba(17,37,30,.05)] sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label className="text-sm font-bold text-[#254034]">{t.upload.media}</label>
                <p className="mt-1 text-xs leading-5 text-[#758178]">{t.upload.mediaHint}</p>
              </div>
              <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${isReady ? "bg-[#D8E9B2] text-[#416221]" : "bg-[#F3F0E7] text-[#796B4E]"}`}>
                {files.length}/{REQUIRED_PHOTOS} {isReady ? t.upload.photoCountReady : `${remaining} ${t.upload.photoCountRemaining}`}
              </div>
            </div>

            <div
              onDragOver={event => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
              onClick={() => inputRef.current?.click()}
              className={`mt-5 grid min-h-36 cursor-pointer place-items-center rounded-2xl border border-dashed p-5 text-center transition ${dragging ? "border-[#5E8535] bg-[#EAF2D7]" : "border-[#A7B4AA] bg-[#F8F7F2] hover:border-[#668647] hover:bg-[#F2F5E7]"}`}
            >
              <input ref={inputRef} onChange={browse} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" />
              <div>
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#D8E9B2] text-[#456A26]"><ImagePlus size={19} /></span>
                <p className="mt-3 text-sm font-bold text-[#2A4437]">{t.upload.drop}</p>
                <p className="mt-1 text-xs text-[#758178]">{t.upload.browse} · {locale === "en" ? "10 photos required" : "مطلوب 10 صور"}</p>
              </div>
            </div>

            {files.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {files.map((item, index) => (
                  <div key={`${item.file.name}-${index}`} className="group relative overflow-hidden rounded-xl border border-[#11251E]/10 bg-[#F1F0E9]">
                    <div className="relative aspect-[4/3]">
                      <img src={item.preview} className="h-full w-full object-cover" alt={`Property photo ${index + 1}`} />
                      <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#11251E]/75 text-[10px] font-bold text-white">{String(index + 1).padStart(2, "0")}</span>
                      <button onClick={event => { event.stopPropagation(); removeFile(index); }} className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[#11251E]/75 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100" aria-label={`${t.upload.remove} ${index + 1}`}>
                        <X size={13} />
                      </button>
                    </div>
                    <p className="truncate px-2 py-2 text-[10px] font-semibold text-[#56665D]">{item.file.name}</p>
                  </div>
                ))}
              </div>
            )}

            {uploadProgress !== null && (
              <div className="mt-5 rounded-xl bg-[#EFF4E6] p-3.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#496A38]"><span>{t.upload.processing}</span><span>{uploadProgress}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#D8E6CC]"><div className="h-full rounded-full bg-[#668D3A] transition-all duration-200" style={{ width: `${uploadProgress}%` }} /></div>
              </div>
            )}

            <div className="mt-7 grid gap-5">
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.upload.titleField}
                <input value={title} onChange={event => setTitle(event.target.value)} placeholder={t.upload.titlePlace} className="h-11 rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] px-3 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" />
              </label>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.upload.description}
                <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t.upload.descriptionPlace} rows={3} className="rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] px-3 py-2.5 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" />
              </label>
              <label className="grid gap-2 text-sm font-bold text-[#254034]">{t.upload.location}
                <span className="relative"><MapPin size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-[#6D806E]" /><input value={location} onChange={event => setLocationValue(event.target.value)} placeholder={t.upload.locationPlace} className="h-11 w-full rounded-xl border border-[#11251E]/12 bg-[#FCFCFA] pe-3 ps-9 text-sm font-normal outline-none transition focus:border-[#5E8535] focus:ring-2 focus:ring-[#D8E9B2]" /></span>
              </label>
            </div>

            {error && <p className="mt-4 flex gap-2 rounded-xl bg-[#FFF1E5] px-3 py-2.5 text-xs font-medium text-[#94572C]"><AlertCircle size={15} className="shrink-0" />{error}</p>}
            <button disabled={isBusy || uploadProgress !== null} onClick={submit} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#11251E] text-sm font-bold text-white transition hover:bg-[#244035] active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-70">
              {isBusy && <Loader2 size={16} className="animate-spin" />}
              {isBusy ? t.upload.processing : t.upload.continue}
            </button>
          </div>
        </div>
      </main>
    </AppSidebar>
  );
}
