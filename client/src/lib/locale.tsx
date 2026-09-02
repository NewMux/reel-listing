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
    const saved = localStorage.getItem("reel-listing-locale");
    return saved === "ar" || saved === "en" ? saved : navigator.language.startsWith("ar") ? "ar" : "en";
  });

  useEffect(() => {
    const isRtl = locale === "ar";
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    localStorage.setItem("reel-listing-locale", locale);
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
      eyebrow: "Cinematic films for property listings",
      title: "Make every listing worth a closer look.",
      body: "reel-listing.com turns property photos into considered, cinematic films that help buyers feel the space before they visit. Review the direction before anything is rendered.",
      start: "Create your first film", watch: "Explore the workflow", trusted: "Designed for ambitious property teams across the Gulf.",
      featureEyebrow: "A better way to present property",
      featureTitle: "Built for the moments that make a space memorable.",
      featureBody: "Choose the strongest frames, shape the sequence, and review the visual direction before production. Your listing stays in view at every step.",
      features: [
        ["Stay in control", "Review the selected images and AI direction before rendering begins."],
        ["Create a stronger first impression", "Turn residences, villas, apartments, and developments into polished listing films."],
        ["Ready for modern property marketing", "Receive a vertical, share-ready film designed for the channels buyers use."],
      ],
      showcaseEyebrow: "A real result", showcaseTitle: "One photo. One cinematic shot.", showcaseBody: "This is an actual render from reel-listing.com — a single property photo turned into a ten-second directed shot. Your finished film combines a shot like this for every room you upload.",
      showcaseBefore: "Before — the original photo", showcaseAfter: "After — the AI-directed shot",
      flowEyebrow: "From selection to delivery", flowTitle: "A clear path from property photos to a finished film.", steps: ["Choose your property photos", "Add the listing details", "Review the visual direction", "Download your film"],
      ctaTitle: "Let the property speak for itself.", ctaBody: "A considered way to create elevated property video while keeping your team moving.", ctaButton: "Start a project",
    },
    pricing: { eyebrow: "Clear by design", title: "Plans for the way you work.", body: "Choose a starting point for your listing portfolio. Scale when your production volume grows.", monthly: "Monthly", annually: "Annual", save: "Save 17%", choose: "Choose plan", compare: "Compare every detail", perMonth: "/ month", plans: [
      ["Starter", "$89", "For focused launches", "3 video projects each month", "Standard generation", "Branded delivery", "Email support"],
      ["Pro", "$229", "For agents with regular volume", "8 video projects each month", "Priority generation", "Priority support"],
      ["Agency", "$499", "For growing property teams", "20 video projects each month", "Team workspace", "Extra projects at $29", "Dedicated success support"],
    ], comparison: ["Video projects / month", "Team members", "Priority support"] },
    legal: { termsTitle: "Terms of Service", privacyTitle: "Privacy Policy", updated: "Last updated: August 2026", termsIntro: "These terms describe the agreement for using reel-listing.com. By creating an account or submitting property media, you agree to use the platform lawfully and to provide content that you have the right to use.", privacyIntro: "This policy explains how reel-listing.com handles account information, project details, and media submitted through the platform. We use this information to provide the service, protect the workspace, and improve the product." },
    dashboard: { greeting: "Good to see you", title: "Your projects", body: "Create, review, and deliver listing films from one calm workspace.", newProject: "New project", emptyTitle: "Your next listing deserves a closer look.", emptyBody: "Start with the owner-provided pilot gallery. Choose the strongest images, review the direction, and approve production.", emptyAction: "Start a project", statuses: "Project stages", view: "View project", recent: "Recently updated" },
    upload: { eyebrow: "New project", title: "Set the scene.", body: "Add property imagery and the short brief your project needs.", media: "Property photos", mediaHint: "Upload 1 to 10 property photos. JPG, PNG, or WEBP. Up to 25 MB combined.", photoCount: "photos selected", photoCountReady: "Ready for review", photoCountRemaining: "more to go", drop: "Drop your media here", browse: "or browse files", titleField: "Property title", titlePlace: "e.g. Seafront penthouse in Palm Jumeirah", description: "Listing description", descriptionPlace: "A few details to anchor the story…", location: "Location", locationPlace: "Dubai Marina, Dubai", continue: "Create project", processing: "Preparing your project…", remove: "Remove" },
    review: { eyebrow: "Review project", title: "Shape the story before it moves.", body: "Review the selected property photos and the cinematic direction. Approve production when the sequence feels right, or leave a note for a change.", approve: "Approve and render the reel", request: "Request changes", note: "What would you like changed?", notePlace: "For example: lead with the terrace, then follow with the main living space.", send: "Send request", media: "Property photos", storyboard: "Cinematic direction", storyboardBody: "Each photo becomes one 10-second cinematic segment. After approval, fal.ai studies each image and writes a scene-specific motion prompt before rendering. The order below is preserved in the final reel.", changeSent: "Change request saved" },
    project: { back: "All projects", delivery: "Project delivery", overview: "Generation overview", estimate: "Estimated completion", reviewEstimate: "Awaiting your approval", processingEstimate: "Generating with fal.ai", doneEstimate: "Ready for delivery", uploadingEstimate: "Securing your media", download: "Download video", share: "Share", unavailable: "Delivery is available as soon as your film is complete.", requestNotes: "Latest change request" },
    common: { loading: "Loading…", back: "Back", signInTitle: "Sign in to your workspace", signInBody: "Sign in securely to access your projects and delivery library.", continue: "Continue to sign in", terms: "Terms", privacy: "Privacy", errorTitle: "We can't reach your workspace", errorBody: "You're signed in, but we couldn't load your account just now. This is on our side, not yours.", retry: "Try again" },
  },
  ar: {
    nav: { product: "المنتج", pricing: "الأسعار", signIn: "تسجيل الدخول", dashboard: "لوحة التحكم", language: "English" },
    home: {
      eyebrow: "أفلام سينمائية للعروض العقارية",
      title: "امنح كل عرض نظرة تليق به.",
      body: "يحوّل reel-listing.com صور العقار إلى أفلام سينمائية مدروسة تساعد المشترين على استشعار المكان قبل زيارته. راجع الاتجاه قبل بدء التوليد.",
      start: "أنشئ فيلمك الأول", watch: "استكشف طريقة العمل", trusted: "مصمم لفرق العقارات الطموحة في الخليج.",
      featureEyebrow: "طريقة أفضل لتقديم العقار",
      featureTitle: "مصمم للحظات التي تجعل المكان عالقاً في الذاكرة.",
      featureBody: "اختر أقوى اللقطات، وشكّل التسلسل، وراجع الاتجاه البصري قبل بدء الإنتاج. يبقى عرضك حاضراً في كل خطوة.",
      features: [
        ["تحكم في كل خطوة", "راجع الصور المختارة والاتجاه الذي أنشأه الذكاء الاصطناعي قبل بدء التصيير."],
        ["اصنع انطباعاً أولاً أقوى", "حوّل المساكن والفلل والشقق والمشاريع إلى أفلام عروض راقية."],
        ["جاهز للتسويق العقاري الحديث", "استلم فيلماً عمودياً جاهزاً للمشاركة في القنوات التي يستخدمها المشترون."],
      ],
      showcaseEyebrow: "نتيجة حقيقية", showcaseTitle: "صورة واحدة. لقطة سينمائية واحدة.", showcaseBody: "هذا تصيير فعلي من reel-listing.com — صورة عقار واحدة تحوّلت إلى لقطة موجهة مدتها عشر ثوانٍ. يجمع فيلمك النهائي لقطة كهذه لكل غرفة ترفعها.",
      showcaseBefore: "قبل — الصورة الأصلية", showcaseAfter: "بعد — اللقطة الموجهة بالذكاء الاصطناعي",
      flowEyebrow: "من الاختيار إلى التسليم", flowTitle: "طريق واضح من صور العقار إلى فيلم مكتمل.", steps: ["اختر صور العقار", "أضف تفاصيل العرض", "راجع الاتجاه البصري", "حمّل فيلمك"],
      ctaTitle: "دع العقار يتحدث عن نفسه.", ctaBody: "طريقة مدروسة لإنتاج فيديو عقاري متميز مع الحفاظ على سرعة فريقك.", ctaButton: "ابدأ مشروعاً",
    },
    pricing: { eyebrow: "وضوح في كل التفاصيل", title: "خطط تناسب طريقة عملك.", body: "اختر نقطة البداية المناسبة لمحفظتك العقارية، ثم ارتقِ عندما يتوسع حجم الإنتاج.", monthly: "شهري", annually: "سنوي", save: "وفّر 17%", choose: "اختر الخطة", compare: "قارن كل التفاصيل", perMonth: "/ شهرياً", plans: [["Starter", "$89", "لإطلاقات مركزة", "3 مشاريع فيديو شهرياً", "توليد أساسي", "تسليم بعلامتك", "دعم عبر البريد"], ["Pro", "$229", "للوكلاء ذوي الإنتاج المنتظم", "8 مشاريع فيديو شهرياً", "توليد بأولوية", "دعم بأولوية"], ["Agency", "$499", "لفرق العقارات المتنامية", "20 مشروع فيديو شهرياً", "مساحة عمل للفريق", "المشاريع الإضافية بـ$29", "دعم نجاح مخصص"]], comparison: ["مشاريع الفيديو / شهر", "أعضاء الفريق", "دعم بأولوية"] },
    legal: { termsTitle: "شروط الخدمة", privacyTitle: "سياسة الخصوصية", updated: "آخر تحديث: أغسطس 2026", termsIntro: "تصف هذه الشروط الاتفاقية الخاصة باستخدام reel-listing.com. بإنشاء حساب أو إرسال وسائط عقارية، فإنك توافق على استخدام المنصة بشكل قانوني وتقديم محتوى تملك حق استخدامه.", privacyIntro: "تشرح هذه السياسة كيفية تعامل reel-listing.com مع معلومات الحساب وتفاصيل المشروع والوسائط المرسلة عبر المنصة. نستخدم هذه المعلومات لتقديم الخدمة وحماية مساحة العمل وتحسين المنتج." },
    dashboard: { greeting: "سعداء برؤيتك", title: "مشاريعك", body: "أنشئ أفلام العقارات وراجعها وسلّمها من مساحة عمل واحدة هادئة.", newProject: "مشروع جديد", emptyTitle: "عقارك التالي يستحق نظرة أقرب.", emptyBody: "ابدأ من معرض التجربة الذي أضافه المالك. اختر أقوى الصور، وراجع الاتجاه، ثم وافق على الإنتاج.", emptyAction: "ابدأ مشروعاً", statuses: "مراحل المشروع", view: "عرض المشروع", recent: "آخر التحديثات" },
    upload: { eyebrow: "مشروع جديد", title: "ابدأ المشهد.", body: "أضف صور العقار وموجز العرض القصير الذي يحتاجه مشروعك.", media: "صور العقار", mediaHint: "ارفع من صورة واحدة إلى 10 صور للعقار. JPG أو PNG أو WEBP. حتى 25 ميغابايت إجمالاً.", photoCount: "صور محددة", photoCountReady: "جاهزة للمراجعة", photoCountRemaining: "صور متبقية", drop: "أفلت الصور هنا", browse: "أو تصفح الملفات", titleField: "عنوان العقار", titlePlace: "مثال: بنتهاوس بحري في نخلة جميرا", description: "وصف العرض", descriptionPlace: "بعض التفاصيل لتثبيت القصة…", location: "الموقع", locationPlace: "دبي مارينا، دبي", continue: "إنشاء المشروع", processing: "جارٍ إعداد مشروعك…", remove: "إزالة" },
    review: { eyebrow: "مراجعة المشروع", title: "شكّل القصة قبل أن تتحرك.", body: "راجع صور العقار المختارة والاتجاه السينمائي. وافق على الإنتاج عندما يصبح التسلسل مناسباً، أو اترك ملاحظة للتغيير.", approve: "وافق وابدأ التصيير", request: "اطلب تعديلات", note: "ما الذي ترغب بتغييره؟", notePlace: "مثال: ابدأ بالشرفة، ثم انتقل إلى مساحة المعيشة الرئيسية.", send: "أرسل الطلب", media: "صور العقار", storyboard: "الاتجاه السينمائي", storyboardBody: "ستتحول كل صورة إلى مقطع سينمائي مدته 10 ثوانٍ. بعد الموافقة، يدرس fal.ai كل صورة ويكتب موجهاً حركياً خاصاً بالمشهد قبل التصيير، مع الحفاظ على الترتيب في الفيلم النهائي.", changeSent: "تم حفظ طلب التعديل" },
    project: { back: "كل المشاريع", delivery: "تسليم المشروع", overview: "نظرة عامة على التوليد", estimate: "الوقت المتوقع للإكمال", reviewEstimate: "بانتظار موافقتك", processingEstimate: "جارٍ التوليد عبر fal.ai", doneEstimate: "جاهز للتسليم", uploadingEstimate: "جارٍ تأمين وسائطك", download: "تحميل الفيديو", share: "مشاركة", unavailable: "سيصبح التسليم متاحاً بمجرد اكتمال فيلمك.", requestNotes: "أحدث طلب تعديل" },
    common: { loading: "جارٍ التحميل…", back: "عودة", signInTitle: "سجّل دخولك إلى مساحة عملك", signInBody: "سجّل الدخول بأمان للوصول إلى مشاريعك ومكتبة التسليم.", continue: "المتابعة لتسجيل الدخول", terms: "الشروط", privacy: "الخصوصية", errorTitle: "تعذّر الوصول إلى مساحة عملك", errorBody: "أنت مسجّل الدخول، لكن تعذّر تحميل حسابك الآن. المشكلة لدينا وليست لديك.", retry: "حاول مرة أخرى" },
  },
} as const;
