import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "ar";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  isRtl: boolean;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem("vistaflow-locale");
    return saved === "ar" || saved === "en" ? saved : navigator.language.startsWith("ar") ? "ar" : "en";
  });

  useEffect(() => {
    const isRtl = locale === "ar";
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    localStorage.setItem("vistaflow-locale", locale);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, isRtl: locale === "ar" }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}

export const copy = {
  en: {
    nav: { product: "Product", pricing: "Pricing", signIn: "Sign in", dashboard: "Open dashboard", language: "العربية" },
    home: {
      eyebrow: "For listings that deserve a second look",
      title: "Turn property imagery into a film people remember.",
      body: "reel-listing.com crafts refined, ready-to-share walkthroughs from your property media — with the approval and control your brand deserves.",
      start: "Create a project", watch: "See how it works", trusted: "Built for ambitious property teams across the Gulf and beyond.",
      featureEyebrow: "A more considered workflow", featureTitle: "Fast enough for the market. Thoughtful enough for your brand.",
      featureBody: "Upload your imagery, shape the story, and approve the direction before production begins. Every step is clear, calm, and built around your listing.",
      features: [
        ["Edit with confidence", "Review every selected visual before AI generation begins."],
        ["Made for every listing", "A polished format for residences, developments, and portfolio moments."],
        ["Ready wherever buyers are", "A vertical, share-ready video designed for the places attention lives."],
      ],
      flowEyebrow: "From media to momentum", flowTitle: "A simple four-step process.",
      steps: ["Add up to 10 property photos", "Set your listing brief", "Review the direction", "Receive your film"],
      ctaTitle: "Give your next listing the attention it deserves.", ctaBody: "A calmer way to create elevated property video, without slowing down your team.", ctaButton: "Start a project",
    },
    pricing: { eyebrow: "Clear by design", title: "Plans that move at the speed of your portfolio.", body: "Choose a starting point. Move up when the volume calls for it.", monthly: "Monthly", annually: "Annual", save: "Save 17%", choose: "Choose plan", compare: "Compare every detail", perMonth: "/ month", plans: [
      ["Starter", "$39", "For considered launches", "4 video projects each month", "Standard generation", "Branded delivery", "Email support"],
      ["Pro", "$99", "For high-output agents", "12 video projects each month", "Priority generation", "3 virtual staging credits", "Priority support"],
      ["Agency", "$249", "For teams in motion", "20 video projects each month", "Team workspace", "Extra projects at $9", "Dedicated success support"],
    ], comparison: ["Video projects / month", "Virtual staging credits", "Team members", "Priority support"] },
    legal: { termsTitle: "Terms of Service", privacyTitle: "Privacy Policy", updated: "Last updated: August 2026", termsIntro: "These terms describe the agreement for using reel-listing.com. By creating an account or submitting property media, you agree to use the platform lawfully and with the appropriate rights to the content you provide.", privacyIntro: "This policy explains how reel-listing.com handles account information, project metadata, and media submitted through the platform. We use this information to provide the service, maintain security, and improve the product." },
    dashboard: { greeting: "Good to see you", title: "Your projects", body: "Create, review, and deliver listing films from one quiet workspace.", newProject: "New project", emptyTitle: "Your next listing deserves its close-up.", emptyBody: "Start a project with 1–10 property photos. You will have a chance to review the direction before production begins.", emptyAction: "Start a project", statuses: "Project stages", view: "View project", recent: "Recently updated" },
    upload: { eyebrow: "New project", title: "Set the scene.", body: "Add property imagery and the short listing brief your project needs.", media: "Property photos", mediaHint: "Upload 1–10 property photos. JPG, PNG, or WEBP; up to 25 MB combined.", photoCount: "photos selected", photoCountReady: "Ready for review", photoCountRemaining: "more to go", drop: "Drop your media here", browse: "or browse files", titleField: "Property title", titlePlace: "e.g. Seafront penthouse in Palm Jumeirah", description: "Listing description", descriptionPlace: "A few details to anchor the story…", location: "Location", locationPlace: "Dubai Marina, Dubai", continue: "Create project", processing: "Preparing your project…", remove: "Remove" },
    review: { eyebrow: "Review project", title: "Shape the story before it moves.", body: "Review the uploaded property photos. Approve the cinematic direction to begin rendering, or leave a note for a change.", approve: "Approve & render the reel", request: "Request changes", note: "What would you like changed?", notePlace: "For example: lead with the terrace, then follow with the main living space.", send: "Send request", media: "Property photos", storyboard: "Cinematic direction", storyboardBody: "Each photo becomes one 10-second cinematic segment. The order below is preserved in the final reel.", changeSent: "Change request saved" },
    project: { back: "All projects", delivery: "Project delivery", overview: "Generation overview", estimate: "Estimated completion", reviewEstimate: "Awaiting your approval", processingEstimate: "Rendering in your browser", doneEstimate: "Ready for delivery", uploadingEstimate: "Securing your media", download: "Download video", share: "Share", unavailable: "Delivery is available as soon as your film is complete.", requestNotes: "Latest change request" },
    common: { loading: "Loading…", back: "Back", signInTitle: "Sign in to your workspace", signInBody: "Use Manus OAuth to securely access your projects and delivery library.", continue: "Continue with Manus", terms: "Terms", privacy: "Privacy" },
  },
  ar: {
    nav: { product: "المنتج", pricing: "الأسعار", signIn: "تسجيل الدخول", dashboard: "لوحة التحكم", language: "English" },
    home: {
      eyebrow: "لعروض تستحق نظرة ثانية", title: "حوّل صور العقار إلى فيلم يتذكره المشترون.", body: "يُنشئ reel-listing.com جولات عقارية راقية وجاهزة للمشاركة من وسائطك — مع المراجعة والتحكم اللذين تستحقهما علامتك التجارية.", start: "إنشاء مشروع", watch: "اكتشف كيف تعمل", trusted: "مصممة لفرق العقارات الطموحة في الخليج وما بعده.",
      featureEyebrow: "سير عمل أكثر عناية", featureTitle: "سريعة بما يكفي للسوق. مدروسة بما يكفي لعلامتك.", featureBody: "ارفع وسائطك، حدّد القصة، وراجع الاتجاه قبل بدء الإنتاج. كل خطوة واضحة وهادئة ومبنية حول عقارك.", features: [["تحكم بثقة", "راجع كل عنصر بصري محدد قبل بدء التوليد بالذكاء الاصطناعي."], ["لكل نوع من العقارات", "صيغة راقية للمساكن والمشاريع ولحظات المحفظة العقارية."], ["جاهز أينما كان المشترون", "فيديو عمودي وجاهز للمشاركة حيث يعيش الانتباه."]],
      flowEyebrow: "من الوسائط إلى الأثر", flowTitle: "أربع خطوات بسيطة.", steps: ["أضف حتى 10 صور للعقار", "حدّد موجز العرض", "راجع الاتجاه", "استلم فيلمك"], ctaTitle: "امنح عقارك التالي الاهتمام الذي يستحقه.", ctaBody: "طريقة هادئة لإنتاج فيديو عقاري متميز دون إبطاء فريقك.", ctaButton: "ابدأ مشروعاً",
    },
    pricing: { eyebrow: "وضوح في كل التفاصيل", title: "خطط تتحرك بسرعة محفظتك العقارية.", body: "اختر نقطة البداية المناسبة، ثم ارتقِ عندما يتطلب حجم العمل ذلك.", monthly: "شهري", annually: "سنوي", save: "وفّر 17%", choose: "اختر الخطة", compare: "قارن كل التفاصيل", perMonth: "/ شهرياً", plans: [["Starter", "$39", "لإطلاقات مدروسة", "4 مشاريع فيديو شهرياً", "توليد أساسي", "تسليم بعلامتك", "دعم عبر البريد"], ["Pro", "$99", "لوكلاء الإنتاج المكثف", "12 مشروع فيديو شهرياً", "توليد بأولوية", "3 رصيد تجهيز افتراضي", "دعم بأولوية"], ["Agency", "$249", "لفرق تتحرك باستمرار", "20 مشروع فيديو شهرياً", "مساحة عمل للفريق", "المشاريع الإضافية بـ$9", "دعم نجاح مخصص"]], comparison: ["مشاريع الفيديو / شهر", "أرصدة التجهيز الافتراضي", "أعضاء الفريق", "دعم بأولوية"] },
    legal: { termsTitle: "شروط الخدمة", privacyTitle: "سياسة الخصوصية", updated: "آخر تحديث: أغسطس 2026", termsIntro: "تصف هذه الشروط الاتفاقية الخاصة باستخدام reel-listing.com. بإنشاء حساب أو إرسال وسائط عقارية، فإنك توافق على استخدام المنصة بشكل قانوني ومع امتلاك الحقوق المناسبة للمحتوى المقدم.", privacyIntro: "تشرح هذه السياسة كيفية تعامل reel-listing.com مع معلومات الحساب وبيانات المشروع والوسائط المرسلة عبر المنصة. نستخدم هذه المعلومات لتقديم الخدمة وحماية الأمان وتحسين المنتج." },
    dashboard: { greeting: "سعداء برؤيتك", title: "مشاريعك", body: "أنشئ وراجع وسلّم أفلام العقارات من مساحة عمل هادئة واحدة.", newProject: "مشروع جديد", emptyTitle: "عقارك التالي يستحق لقطة قريبة.", emptyBody: "ابدأ مشروعاً باستخدام من صورة واحدة إلى 10 صور للعقار. ستتمكن من مراجعة الاتجاه قبل بدء الإنتاج.", emptyAction: "ابدأ مشروعاً", statuses: "مراحل المشروع", view: "عرض المشروع", recent: "آخر التحديثات" },
    upload: { eyebrow: "مشروع جديد", title: "ابدأ المشهد.", body: "أضف صور العقار وموجز العرض القصير الذي يحتاجه مشروعك.", media: "صور العقار", mediaHint: "ارفع من صورة واحدة إلى 10 صور للعقار. JPG، PNG، أو WEBP؛ حتى 25 ميغابايت إجمالاً.", photoCount: "صور محددة", photoCountReady: "جاهزة للمراجعة", photoCountRemaining: "صور متبقية", drop: "أفلت الصور هنا", browse: "أو تصفح الملفات", titleField: "عنوان العقار", titlePlace: "مثال: بنتهاوس بحري في نخلة جميرا", description: "وصف العرض", descriptionPlace: "بعض التفاصيل لتثبيت القصة…", location: "الموقع", locationPlace: "دبي مارينا، دبي", continue: "إنشاء المشروع", processing: "جارٍ إعداد مشروعك…", remove: "إزالة" },
    review: { eyebrow: "مراجعة المشروع", title: "شكّل القصة قبل أن تتحرك.", body: "راجع صور العقار المرفوعة. وافق على الاتجاه السينمائي لبدء التصيير أو اترك ملاحظة للتغيير.", approve: "وافق وابدأ التصيير", request: "اطلب تعديلات", note: "ما الذي ترغب بتغييره؟", notePlace: "مثال: ابدأ بالشرفة، ثم انتقل إلى مساحة المعيشة الرئيسية.", send: "أرسل الطلب", media: "صور العقار", storyboard: "الاتجاه السينمائي", storyboardBody: "ستتحول كل صورة إلى مقطع سينمائي مدته 10 ثوانٍ. سيتم الحفاظ على الترتيب في الفيلم النهائي.", changeSent: "تم حفظ طلب التعديل" },
    project: { back: "كل المشاريع", delivery: "تسليم المشروع", overview: "نظرة عامة على التوليد", estimate: "الوقت المتوقع للإكمال", reviewEstimate: "بانتظار موافقتك", processingEstimate: "جارٍ التصيير في متصفحك", doneEstimate: "جاهز للتسليم", uploadingEstimate: "جارٍ تأمين وسائطك", download: "تحميل الفيديو", share: "مشاركة", unavailable: "سيصبح التسليم متاحاً بمجرد اكتمال فيلمك.", requestNotes: "أحدث طلب تعديل" },
    common: { loading: "جارٍ التحميل…", back: "عودة", signInTitle: "سجّل دخولك إلى مساحة عملك", signInBody: "استخدم Manus OAuth للوصول بأمان إلى مشاريعك ومكتبة التسليم.", continue: "المتابعة مع Manus", terms: "الشروط", privacy: "الخصوصية" },
  },
} as const;
