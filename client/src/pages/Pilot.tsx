import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, ImagePlus, Share2, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Footer, PublicNav } from "@/components/AppChrome";
import { useLocale } from "@/lib/locale";

const REQUIRED_PHOTOS = 10;

const PILOT_COPY = {
  en: {
    eyebrow: "Private Bahrain pilot",
    title: "Prepare one property for a cinematic reel.",
    body: "Choose exactly 10 listing photos in the order you want them reviewed. This pilot page runs in your browser and does not require an account.",
    step: "Step 1 of 2",
    choose: "Choose 10 property photos",
    chooseBody: "Use JPG, PNG, or WEBP images. The order you select them becomes the first storyboard order.",
    selected: "selected",
    browse: "Choose photos",
    replace: "Replace photos",
    clear: "Clear all",
    back: "Back to home",
    continue: "Prepare pilot request",
    need: "Select exactly 10 images to continue.",
    tooMany: "Please select no more than 10 images.",
    invalid: "Only image files are accepted.",
    details: "Step 2 of 2",
    detailsTitle: "Where should we send the finished reel?",
    detailsBody: "This information stays in your browser during this preview. Share the selected photos directly with the agent after preparing the request.",
    name: "Your name",
    phone: "WhatsApp number",
    property: "Property area or reference",
    optional: "optional",
    finish: "Prepare request",
    successEyebrow: "Pilot request ready",
    successTitle: "Your 10 photos are ordered and ready to share.",
    successBody: "The website has not uploaded your photos to a server. Use the share button below to send the selected files to the agent through your device’s share sheet, or send them manually on WhatsApp.",
    share: "Share 10 photos",
    shareFallback: "Share sheet unavailable — send the 10 selected files manually on WhatsApp.",
    code: "Pilot reference",
    startOver: "Start over",
    privacy: "Your photos remain on this device until you share them. Do not select images you do not have permission to use.",
  },
  ar: {
    eyebrow: "تجربة خاصة في البحرين",
    title: "جهّز عقارك لفيديو سينمائي.",
    body: "اختر 10 صور للعقار بالترتيب الذي تريد مراجعته. تعمل هذه الصفحة من المتصفح ولا تتطلب إنشاء حساب.",
    step: "الخطوة 1 من 2",
    choose: "اختر 10 صور للعقار",
    chooseBody: "استخدم صور JPG أو PNG أو WEBP. يصبح ترتيب الاختيار هو ترتيب لوحة القصة الأولي.",
    selected: "مختارة",
    browse: "اختر الصور",
    replace: "استبدال الصور",
    clear: "مسح الكل",
    back: "العودة للرئيسية",
    continue: "تجهيز طلب التجربة",
    need: "اختر 10 صور بالضبط للمتابعة.",
    tooMany: "اختر 10 صور كحد أقصى.",
    invalid: "يُسمح بملفات الصور فقط.",
    details: "الخطوة 2 من 2",
    detailsTitle: "أين نرسل الفيديو النهائي؟",
    detailsBody: "تبقى هذه المعلومات في متصفحك أثناء المعاينة. شارك الصور المختارة مباشرة مع المنفذ بعد تجهيز الطلب.",
    name: "الاسم",
    phone: "رقم واتساب",
    property: "منطقة العقار أو مرجعه",
    optional: "اختياري",
    finish: "تجهيز الطلب",
    successEyebrow: "طلب التجربة جاهز",
    successTitle: "تم ترتيب الصور العشر وأصبحت جاهزة للمشاركة.",
    successBody: "لم يرفع الموقع الصور إلى خادم. استخدم زر المشاركة لإرسال الملفات المختارة عبر جهازك، أو أرسلها يدوياً عبر واتساب.",
    share: "مشاركة الصور العشر",
    shareFallback: "المشاركة غير متاحة — أرسل الملفات العشرة المختارة يدوياً عبر واتساب.",
    code: "مرجع التجربة",
    startOver: "البدء من جديد",
    privacy: "تبقى الصور على هذا الجهاز حتى تشاركها. لا تختر صوراً لا تملك حق استخدامها.",
  },
} as const;

type PilotLocale = keyof typeof PILOT_COPY;

export default function Pilot() {
  const { locale } = useLocale();
  const t = PILOT_COPY[locale as PilotLocale] ?? PILOT_COPY.en;
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<(File | null)[]>(Array(REQUIRED_PHOTOS).fill(null));
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [property, setProperty] = useState("");
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const [reference] = useState(() => `RL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);

  const selectedCount = useMemo(() => files.filter(Boolean).length, [files]);
  const selectedFiles = useMemo(() => files.filter((file): file is File => Boolean(file)), [files]);
  const ready = selectedCount === REQUIRED_PHOTOS;

  const chooseFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const incomingFiles = Array.from(incoming);
    if (incomingFiles.length > REQUIRED_PHOTOS) {
      setMessage(t.tooMany);
      return;
    }
    if (incomingFiles.some((file) => !file.type.startsWith("image/"))) {
      setMessage(t.invalid);
      return;
    }
    setFiles([...incomingFiles, ...Array(REQUIRED_PHOTOS - incomingFiles.length).fill(null)]);
    setMessage("");
  };

  const shareFiles = async () => {
    setMessage("");
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: selectedFiles }))) {
        await navigator.share({
          title: "reel-listing.com pilot",
          text: `Bahrain property reel pilot ${reference}`,
          files: selectedFiles,
        });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
    setMessage(t.shareFallback);
  };

  const clearAll = () => {
    setFiles(Array(REQUIRED_PHOTOS).fill(null));
    setStep(1);
    setComplete(false);
    setMessage("");
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#F7F5EF] text-[#11251E]">
      <PublicNav />
      <main className="mx-auto max-w-[1120px] px-5 pb-20 pt-8 sm:px-8 sm:pt-14">
        <div className="mb-8 flex items-center justify-between gap-4">
          <button onClick={() => setLocation("/")} className="inline-flex items-center gap-2 text-sm font-semibold text-[#52655a] hover:text-[#11251E]"><ArrowLeft size={16}/>{t.back}</button>
          <span className="rounded-full border border-[#11251E]/10 bg-white/65 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-[#687B49]">{t.eyebrow}</span>
        </div>

        <section className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#687B49]">{step === 1 ? t.step : t.details}</p>
            <h1 className="serif mt-4 max-w-[520px] text-5xl leading-[.98] tracking-[-.05em] sm:text-6xl">{complete ? t.successTitle : step === 1 ? t.title : t.detailsTitle}</h1>
            <p className="mt-6 max-w-[500px] text-base leading-7 text-[#5C6C63]">{complete ? t.successBody : step === 1 ? t.body : t.detailsBody}</p>
            <div className="mt-8 rounded-2xl border border-[#11251E]/10 bg-white/65 p-4 text-sm leading-6 text-[#68766e]">{t.privacy}</div>
          </div>

          <div className="rounded-[28px] border border-[#11251E]/10 bg-white/82 p-5 shadow-[0_22px_60px_rgba(17,37,30,.08)] sm:p-7">
            {complete ? (
              <div className="text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#D8E9B2] text-[#365716]"><Check size={30}/></div>
                <p className="mt-7 text-xs font-bold uppercase tracking-[.15em] text-[#687B49]">{t.successEyebrow}</p>
                <p className="mt-3 text-sm text-[#68766e]">{t.code}: <strong className="text-[#11251E]">{reference}</strong></p>
                <button onClick={shareFiles} className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#11251E] px-5 text-sm font-bold text-white hover:bg-[#244035]"><Share2 size={17}/>{t.share}</button>
                {message && <p className="mt-4 rounded-xl bg-[#FFF0D0] px-4 py-3 text-sm leading-6 text-[#8B5A08]">{message}</p>}
                <button onClick={clearAll} className="mt-5 text-sm font-semibold text-[#52655a] underline underline-offset-4">{t.startOver}</button>
              </div>
            ) : step === 1 ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div><h2 className="text-xl font-bold">{t.choose}</h2><p className="mt-2 text-sm leading-6 text-[#718078]">{t.chooseBody}</p></div>
                  <span className="shrink-0 rounded-full bg-[#D8E9B2] px-3 py-1.5 text-xs font-bold text-[#365716]">{selectedCount}/{REQUIRED_PHOTOS} {t.selected}</span>
                </div>
                <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#7D9364]/45 bg-[#F8F9F2] px-5 py-8 text-center transition hover:bg-[#F0F5E5]">
                  <ImagePlus size={24} className="text-[#58782B]" />
                  <span className="mt-3 text-sm font-bold text-[#355041]">{selectedCount ? t.replace : t.browse}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => chooseFiles(event.target.files)} />
                </label>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {files.map((file, index) => <div key={index} className={`relative aspect-[4/3] overflow-hidden rounded-xl border ${file ? "border-[#B6CE74] bg-[#EFF5E1]" : "border-[#11251E]/8 bg-[#F7F5EF]"}`}>
                    {file ? <><img src={URL.createObjectURL(file)} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" /><span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-[#11251E]/80 text-[11px] font-bold text-white">{index + 1}</span></> : <span className="grid h-full place-items-center text-xs font-bold text-[#A6B0A8]">{index + 1}</span>}
                  </div>)}
                </div>
                {message && <p className="mt-4 rounded-xl bg-[#FFF0D0] px-4 py-3 text-sm leading-6 text-[#8B5A08]">{message}</p>}
                <div className="mt-6 flex items-center justify-between gap-3"><button onClick={clearAll} className="inline-flex items-center gap-2 text-sm font-semibold text-[#52655a] hover:text-[#11251E]"><Trash2 size={15}/>{t.clear}</button><button onClick={() => ready ? setStep(2) : setMessage(t.need)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#11251E] px-4 text-sm font-bold text-white hover:bg-[#244035] disabled:opacity-40">{t.continue}<ArrowUpRight size={15}/></button></div>
              </>
            ) : (
              <>
                <div className="mb-6 flex items-center gap-2 text-sm font-bold text-[#355041]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#D8E9B2] text-[#365716]">{selectedCount}</span>{t.choose}</div>
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-[#355041]">{t.name}<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#11251E]/10 bg-[#F8F9F2] px-3 text-sm outline-none focus:border-[#7D9364]" /></label>
                  <label className="block text-sm font-semibold text-[#355041]">{t.phone} <span className="font-normal text-[#91A096]">({t.optional})</span><input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#11251E]/10 bg-[#F8F9F2] px-3 text-sm outline-none focus:border-[#7D9364]" /></label>
                  <label className="block text-sm font-semibold text-[#355041]">{t.property} <span className="font-normal text-[#91A096]">({t.optional})</span><input value={property} onChange={(event) => setProperty(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#11251E]/10 bg-[#F8F9F2] px-3 text-sm outline-none focus:border-[#7D9364]" /></label>
                </div>
                <div className="mt-7 flex items-center justify-between gap-3"><button onClick={() => setStep(1)} className="text-sm font-semibold text-[#52655a]">{t.back}</button><button onClick={() => setComplete(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#11251E] px-4 text-sm font-bold text-white hover:bg-[#244035]">{t.finish}<ArrowUpRight size={15}/></button></div>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
