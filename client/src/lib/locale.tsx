import { createContext, ReactNode, useContext, useLayoutEffect, useMemo, useState } from "react";

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

  useLayoutEffect(() => {
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
    nav: { product: "Product", pricing: "Pricing", contact: "Contact", signIn: "Sign in", dashboard: "Open dashboard", language: "العربية" },
    auth: {
      headline: "Your listings, ready for their close-up.",
      body: "Sign in to upload your property photos, review the cinematic direction, and receive the finished reel in one workspace.",
      checklist: ["Your original photo order is preserved.", "Cinematic direction is created before rendering.", "The final MP4 stays available in your project."],
      signInTab: "Sign in", signUpTab: "Create account",
      welcomeBack: "Welcome back.", welcomeBackBody: "Continue creating refined listing films.",
      createWorkspace: "Create your workspace.", createWorkspaceBody: "Use your email to save projects and upload property photos for your next reel.",
      emailLabel: "Email", emailPlaceholder: "you@agency.com",
      passwordLabel: "Password", passwordPlaceholder: "At least 6 characters",
      submitSignIn: "Sign in", submitSignUp: "Create account",
      agreementPrefix: "By continuing, you agree to the", agreementAnd: "and", agreementSuffix: ".",
      signUpConfirm: "Account created. Check your email to confirm your address, then sign in.",
      repeatSignup: "An account already exists for this email. Try signing in, or reset your password if you don't remember it.",
      errorFallback: "Unable to authenticate right now.",
      notConfigured: "Supabase Auth is not configured for this deployment.",
      forgotPasswordLink: "Forgot password?",
      resetRequestTitle: "Reset your password.",
      resetRequestBody: "Enter your email and we'll send you a link to reset your password.",
      resetRequestSubmit: "Send reset link",
      resetRequestSent: "If an account exists for this email, a reset link is on its way.",
      backToSignIn: "Back to sign in",
      newPasswordTitle: "Choose a new password.",
      newPasswordBody: "Enter a new password for your account.",
      newPasswordLabel: "New password",
      confirmPasswordLabel: "Confirm new password",
      passwordMismatch: "Passwords don't match.",
      updatePasswordSubmit: "Update password",
      passwordUpdated: "Your password has been updated.",
      invalidResetLink: "This reset link is invalid or has expired.",
      requestNewLink: "Request a new link",
      checkingResetLink: "Checking your reset link…",
    },
    home: {
      title: "Make every listing worth a closer look.",
      body: "reel-listing.com turns property photos into considered, cinematic films that help buyers feel the space before they visit. Review the direction before anything is rendered.",
      start: "Create your first film", watch: "Explore the workflow",
      featureEyebrow: "A better way to present property",
      featureTitle: "Built for the moments that make a space memorable.",
      featureBody: "Choose the strongest frames, shape the sequence, and review the visual direction before production. Your listing stays in view at every step.",
      features: [
        ["Stay in control", "Review the selected images and AI direction before rendering begins."],
        ["Create a stronger first impression", "Turn residences, villas, apartments, and developments into polished listing films."],
        ["Ready for modern property marketing", "Receive a vertical, share-ready film designed for the channels buyers use."],
      ],
      showcaseEyebrow: "The full listing", showcaseTitle: "Every room, transformed.", showcaseBody: "An actual property rendered with reel-listing.com — every room below is a real render, room by room, from the same listing. Your finished film combines a shot like this for every room you upload.",
      showcaseBefore: "Before — the original photo", showcaseAfter: "After — with Reel Listing",
      flowEyebrow: "From selection to delivery", flowTitle: "A clear path from property photos to a finished film.", steps: ["Choose your property photos", "Add the listing details", "Review the visual direction", "Download your film"],
      newmuxEyebrow: "Powered by", newmuxTitle: "Built by NewMux.", newmuxBody: "reel-listing.com is built and operated by NewMux For Software Development & Digital Innovation, based in Manama, Bahrain.", newmuxLink: "Visit newmux.com",
      ctaTitle: "Let the property speak for itself.", ctaBody: "A considered way to create elevated property video while keeping your team moving.", ctaButton: "Start a project",
    },
    pricing: { eyebrow: "Clear by design", title: "Plans for the way you work.", body: "You buy credits. One credit is five seconds of finished video, so a ten-photo reel of ten-second shots costs twenty, and the shorter social style costs half that. Nothing expires mid-month on you.", monthly: "Monthly", choose: "Talk to us", compare: "Compare every detail", perMonth: "/ month", mostPopular: "Most popular", supportValues: ["Email", "Priority", "Dedicated"], swipeHint: "Swipe to compare →", creditNote: "1 credit = 5 seconds of video. A ten-photo listing reel uses 20.", plans: [
      ["Solo", "$99", "For focused launches", "60 credits each month", "About 3 full listing reels", "Branded delivery", "Email support"],
      ["Pro", "$249", "For agents with regular volume", "160 credits each month", "About 8 full listing reels", "Priority generation", "Priority support"],
      ["Agency", "$599", "For growing property teams", "400 credits each month", "About 20 full listing reels", "Team workspace", "Extra credits at $2 each", "Dedicated success support"],
    ], comparison: ["Credits / month", "Full listing reels", "Team members", "Priority support"] },
    legal: { termsTitle: "Terms of Service", privacyTitle: "Privacy Policy", updated: "Last updated: August 2026", termsIntro: "These terms describe the agreement for using reel-listing.com. By creating an account or submitting property media, you agree to use the platform lawfully and to provide content that you have the right to use.", privacyIntro: "This policy explains how reel-listing.com handles account information, project details, and media submitted through the platform. We use this information to provide the service, protect the workspace, and improve the product." },
    contact: { eyebrow: "Get in touch", title: "Contact us", body: "Have a question about a listing, pricing, or how the studio works? Reach our team directly — we usually reply the same day.", formTitle: "Send us a message", nameLabel: "Name", namePlaceholder: "Your full name", messageLabel: "Message", messagePlaceholder: "Tell us about your listing or question…", send: "Send message", sending: "Sending…", sentTitle: "Message sent", sentBody: "Thanks for reaching out — our team will get back to you shortly.", addressLabel: "Address", emailLabel: "Email", phoneLabel: "Phone", whatsapp: "Contact via WhatsApp" },
    dashboard: { greeting: "Good to see you", title: "Your projects", body: "Create, review, and deliver listing films from one calm workspace.", newProject: "New project", emptyTitle: "Your next listing deserves a closer look.", emptyBody: "Upload your property photos, review the cinematic direction, and approve production.", emptyAction: "Start a project", statuses: "Project stages", view: "View project", recent: "Recently updated", project: "project", projects: "projects" },
    upload: { eyebrow: "New project", title: "Set the scene.", body: "Add property imagery and the short brief your project needs.", media: "Property photos", mediaHint: "Upload 1 to 10 property photos. JPG, PNG, or WEBP. Up to 25 MB combined.", photoCount: "photos selected", photoCountReady: "Ready for review", photoCountRemaining: "more to go", drop: "Drop your media here", browse: "or browse files", titleField: "Property title", titlePlace: "e.g. Seafront penthouse in Palm Jumeirah", description: "Listing description", descriptionPlace: "A few details to anchor the story…", location: "Location", locationPlace: "Dubai Marina, Dubai", continue: "Create project", processing: "Preparing your project…", remove: "Remove", mixedOrientation: "Keep all photos the same orientation (all landscape or all vertical) so your film stitches together cleanly.", tooSmall: "One of these photos is too small to render (minimum 300×300 pixels). Please use a larger version of the image." },
    review: { eyebrow: "Review project", title: "Shape the story before it moves.", body: "Review the selected property photos and the cinematic direction. Approve production when the sequence feels right, or leave a note for a change.", approve: "Approve and render the reel", request: "Request changes", note: "What would you like changed?", notePlace: "For example: lead with the terrace, then follow with the main living space.", send: "Send request", media: "Property photos", storyboard: "Cinematic direction", storyboardBody: "Each photo becomes one 10-second cinematic segment. After approval, our engine studies each image and writes a scene-specific motion prompt before rendering. The order below is preserved in the final reel.", changeSent: "Change request saved", clipsLabel: "clips", eachLabel: "each", finalReelLabel: "final reel", orderNote: "Your photos stay in this order. Approve once and reel-listing.com creates the cinematic segments and stitches them into one final reel.", photosLabel: "photos", photoAlt: "Property photo", shotFallback: "Property shot", analyzing: "Analyzing…", preparing: "Preparing cinematic production…", viewProduction: "View production", moveUp: "Move up", moveDown: "Move down", cameraMovePlaceholder: "Describe the camera movement for this shot…", resetToAi: "Reset to AI suggestion", customBadge: "Custom", staging: { styles: { modern: "Modern", bohemian: "Bohemian", traditional: "Traditional", scandinavian: "Scandinavian", minimalist: "Minimalist", "contemporary-gulf": "Contemporary Gulf" }, stage: "Stage", creditsLabel: "staging credits left", staged: "Staged" } },
    project: { back: "All projects", delivery: "Project delivery", overview: "Generation overview", estimate: "Estimated completion", reviewEstimate: "Awaiting your approval", processingEstimate: "Generating your film", doneEstimate: "Ready for delivery", uploadingEstimate: "Securing your media", download: "Download video", share: "Share", unavailable: "Delivery is available as soon as your film is complete.", requestNotes: "Latest change request", reelReady: "Your cinematic reel is ready to share.", assembleError: "The final reel could not be assembled.", shareError: "Could not share this project", linkCopied: "Project link copied. Ready to share.", notReadyYet: "The final video is not ready yet", opening: "Your final video is opening now.", startingProduction: "Starting cinematic production…", generationStopped: "Generation stopped", renderStoppedBody: "The render stopped before all clips were completed.", assemblingReel: "Assembling your reel", generatingClips: "Generating your clips", productionProgress: "Production progress", finalStitch: "One final stitch", buildingFilm: "Building your film", clipsLabel: "clips", shotLabel: "Shot", tryAgain: "Try assembly again", falIncomplete: "Production could not complete one or more clips.", finalAssembly: "Final assembly", falProduction: "AI production", assemblyBody: "Your completed clips are being stitched in their original upload order and saved as one final reel.", falProductionBody: "We're generating one cinematic motion clip from each property photo. You can leave this page and return later.", reelReadyBanner: "Your final reel is ready.", privateLink: "Private project link", framesLabel: "frames", shareLinkCopied: "Public link copied. Anyone with it can watch the reel.", shareRevoked: "Public link turned off.", unshare: "Turn off link", downloadStarted: "Your download is starting.", keepTabOpen: "Keep this tab open until the reel finishes assembling.", assemblyInterrupted: "Assembly was interrupted. Pick it back up whenever you like -- your clips are saved." },
    share: { eyebrow: "Shared listing film", unavailableTitle: "This link is no longer available.", unavailableBody: "The reel may still be rendering, or the person who shared it has turned the link off." },
    billing: { creditsLabel: "Credits", creditsUnit: "credits", emptyHint: "Contact us to add credits before rendering.", needCredits: "This reel needs {needed} credits and you have {have}. Contact us to top up before approving.", costNote: "Approving spends {needed} credits. One credit is five seconds of video." },
    shot: { movementLabel: "Camera movement", howItMoves: "How it moves", roomLabel: "This room is", advanced: "Describe it myself", advancedHint: "Plain English. Crane, drone, orbit and tilt moves are not supported — they come back warped.", freeEditsNote: "Change anything you like — edits are free. You are only charged when you approve.", rooms: { unknown: "Let the AI decide", "outdoor-view": "Outdoor or view", "living-room": "Living room", "kitchen-dining": "Kitchen or dining", bedroom: "Bedroom", bathroom: "Bathroom", detail: "Detail shot" }, moves: { "push-in": "Move in closer", "pull-back": "Show the whole room", "glide-across": "Glide across", "curve-around": "Curve around", "toward-the-light": "Head for the light", "over-the-detail": "Ease over the detail" } },
    reel: { styleLabel: "Pace of the reel", styleHint: "One choice, applied to every shot.", lengthLabel: "Finished length", styles: { calm: ["Calm and luxurious", "Long, unhurried shots that let each room breathe."], balanced: ["Balanced", "The everyday choice. Full-length shots, clean transitions."], quick: ["Bright and quick", "Short shots cut tight, made for social feeds."] } },
    common: { loading: "Loading…", back: "Back", signInTitle: "Sign in to your workspace", signInBody: "Sign in securely to access your projects and delivery library.", continue: "Continue to sign in", terms: "Terms", privacy: "Privacy", errorTitle: "We can't reach your workspace", errorBody: "You're signed in, but we couldn't load your account just now. This is on our side, not yours.", retry: "Try again", status: { Uploading: "Uploading", Processing: "Processing", Review: "Review", Done: "Done" }, notFoundCode: "404", notFoundTitle: "Page Not Found", notFoundBody: "Sorry, the page you are looking for doesn't exist. It may have been moved or deleted.", notFoundHome: "Go Home", switchLanguage: "Switch language", openNavigation: "Open navigation", signOut: "Sign out", memberFallback: "reel-listing member", projectNotFound: "Project not found.", poweredBy: "Powered by" },
  },
  ar: {
    nav: { product: "المنتج", pricing: "الأسعار", contact: "تواصل معنا", signIn: "تسجيل الدخول", dashboard: "لوحة التحكم", language: "English" },
    auth: {
      headline: "عروضك العقارية جاهزة لتألق أمام الكاميرا.",
      body: "سجّل الدخول لرفع صور عقارك، ومراجعة الاتجاه السينمائي، واستلام الفيلم النهائي، كل ذلك من مساحة عمل واحدة.",
      checklist: ["يبقى ترتيب صورك الأصلي كما هو.", "يُصاغ الاتجاه السينمائي قبل بدء التصيير.", "يبقى ملف MP4 النهائي متاحاً في مشروعك."],
      signInTab: "تسجيل الدخول", signUpTab: "إنشاء حساب",
      welcomeBack: "أهلاً بعودتك.", welcomeBackBody: "تابع إنشاء أفلام عروض عقارية متقنة.",
      createWorkspace: "أنشئ مساحة عملك.", createWorkspaceBody: "استخدم بريدك الإلكتروني لحفظ مشاريعك ورفع صور عقارك لإنشاء فيلمك القادم.",
      emailLabel: "البريد الإلكتروني", emailPlaceholder: "you@agency.com",
      passwordLabel: "كلمة المرور", passwordPlaceholder: "6 أحرف على الأقل",
      submitSignIn: "تسجيل الدخول", submitSignUp: "إنشاء حساب",
      agreementPrefix: "بالمتابعة، أنت توافق على", agreementAnd: "و", agreementSuffix: ".",
      signUpConfirm: "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد عنوانك، ثم سجّل الدخول.",
      repeatSignup: "يوجد حساب بالفعل بهذا البريد الإلكتروني. جرّب تسجيل الدخول، أو أعد تعيين كلمة المرور إذا كنت لا تتذكرها.",
      errorFallback: "تعذّرت المصادقة في الوقت الحالي.",
      notConfigured: "خدمة Supabase Auth غير مُهيأة لهذا النشر.",
      forgotPasswordLink: "نسيت كلمة المرور؟",
      resetRequestTitle: "أعد تعيين كلمة المرور.",
      resetRequestBody: "أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.",
      resetRequestSubmit: "إرسال رابط إعادة التعيين",
      resetRequestSent: "إذا كان هناك حساب بهذا البريد الإلكتروني، فسيصلك رابط إعادة التعيين قريباً.",
      backToSignIn: "العودة لتسجيل الدخول",
      newPasswordTitle: "اختر كلمة مرور جديدة.",
      newPasswordBody: "أدخل كلمة مرور جديدة لحسابك.",
      newPasswordLabel: "كلمة المرور الجديدة",
      confirmPasswordLabel: "تأكيد كلمة المرور الجديدة",
      passwordMismatch: "كلمتا المرور غير متطابقتين.",
      updatePasswordSubmit: "تحديث كلمة المرور",
      passwordUpdated: "تم تحديث كلمة المرور بنجاح.",
      invalidResetLink: "رابط إعادة التعيين غير صالح أو منتهي الصلاحية.",
      requestNewLink: "اطلب رابطاً جديداً",
      checkingResetLink: "جارٍ التحقق من رابط إعادة التعيين…",
    },
    home: {
      title: "امنح كل عرض نظرة تليق به.",
      body: "يحوّل reel-listing.com صور العقار إلى أفلام سينمائية مدروسة تساعد المشترين على استشعار المكان قبل زيارته. راجع الاتجاه قبل بدء التوليد.",
      start: "أنشئ فيلمك الأول", watch: "استكشف طريقة العمل",
      featureEyebrow: "طريقة أفضل لتقديم العقار",
      featureTitle: "مصمم للحظات التي تجعل المكان عالقاً في الذاكرة.",
      featureBody: "اختر أقوى اللقطات، وشكّل التسلسل، وراجع الاتجاه البصري قبل بدء الإنتاج. يبقى عرضك حاضراً في كل خطوة.",
      features: [
        ["تحكم في كل خطوة", "راجع الصور المختارة والاتجاه الذي أنشأه الذكاء الاصطناعي قبل بدء التصيير."],
        ["اصنع انطباعاً أولاً أقوى", "حوّل المساكن والفلل والشقق والمشاريع إلى أفلام عروض راقية."],
        ["جاهز للتسويق العقاري الحديث", "استلم فيلماً عمودياً جاهزاً للمشاركة في القنوات التي يستخدمها المشترون."],
      ],
      showcaseEyebrow: "العرض الكامل", showcaseTitle: "كل غرفة، تتحوّل.", showcaseBody: "عقار فعلي تمت معالجته مع reel-listing.com — كل غرفة أدناه هي تصيير حقيقي، غرفة بغرفة، من العقار نفسه. يجمع فيلمك النهائي لقطة كهذه لكل غرفة ترفعها.",
      showcaseBefore: "قبل — الصورة الأصلية", showcaseAfter: "بعد — مع Reel Listing",
      flowEyebrow: "من الاختيار إلى التسليم", flowTitle: "طريق واضح من صور العقار إلى فيلم مكتمل.", steps: ["اختر صور العقار", "أضف تفاصيل العرض", "راجع الاتجاه البصري", "حمّل فيلمك"],
      newmuxEyebrow: "بدعم من", newmuxTitle: "بُني بواسطة NewMux.", newmuxBody: "يتم بناء وتشغيل reel-listing.com بواسطة NewMux لتطوير البرمجيات والابتكار الرقمي، ومقرها المنامة، البحرين.", newmuxLink: "زيارة newmux.com",
      ctaTitle: "دع العقار يتحدث عن نفسه.", ctaBody: "طريقة مدروسة لإنتاج فيديو عقاري متميز مع الحفاظ على سرعة فريقك.", ctaButton: "ابدأ مشروعاً",
    },
    pricing: { eyebrow: "وضوح في كل التفاصيل", title: "خطط تناسب طريقة عملك.", body: "أنت تشتري أرصدة. الرصيد الواحد يعادل خمس ثوانٍ من الفيديو النهائي، لذا يكلّف الفيلم المكوّن من عشر صور بلقطات من عشر ثوانٍ عشرين رصيداً، بينما يكلّف النمط السريع نصف ذلك.", monthly: "شهري", choose: "تواصل معنا", compare: "قارن كل التفاصيل", perMonth: "/ شهرياً", mostPopular: "الأكثر اختياراً", supportValues: ["البريد الإلكتروني", "بأولوية", "مخصص"], swipeHint: "← مرر لمقارنة الخطط", creditNote: "رصيد واحد = 5 ثوانٍ من الفيديو. الفيلم الكامل المكوّن من عشر صور يستهلك 20 رصيداً.", plans: [["Solo", "$99", "لإطلاقات مركزة", "60 رصيداً شهرياً", "نحو 3 أفلام عقارية كاملة", "تسليم بعلامتك", "دعم عبر البريد"], ["Pro", "$249", "للوكلاء ذوي الإنتاج المنتظم", "160 رصيداً شهرياً", "نحو 8 أفلام عقارية كاملة", "توليد بأولوية", "دعم بأولوية"], ["Agency", "$599", "لفرق العقارات المتنامية", "400 رصيد شهرياً", "نحو 20 فيلماً عقارياً كاملاً", "مساحة عمل للفريق", "أرصدة إضافية بـ$2 للرصيد", "دعم نجاح مخصص"]], comparison: ["الأرصدة / شهر", "الأفلام العقارية الكاملة", "أعضاء الفريق", "دعم بأولوية"] },
    legal: { termsTitle: "شروط الخدمة", privacyTitle: "سياسة الخصوصية", updated: "آخر تحديث: أغسطس 2026", termsIntro: "تصف هذه الشروط الاتفاقية الخاصة باستخدام reel-listing.com. بإنشاء حساب أو إرسال وسائط عقارية، فإنك توافق على استخدام المنصة بشكل قانوني وتقديم محتوى تملك حق استخدامه.", privacyIntro: "تشرح هذه السياسة كيفية تعامل reel-listing.com مع معلومات الحساب وتفاصيل المشروع والوسائط المرسلة عبر المنصة. نستخدم هذه المعلومات لتقديم الخدمة وحماية مساحة العمل وتحسين المنتج." },
    contact: { eyebrow: "تواصل معنا", title: "اتصل بنا", body: "هل لديك سؤال حول أحد العقارات، أو الأسعار، أو طريقة عمل الاستوديو؟ تواصل مع فريقنا مباشرة — عادةً ما نرد في نفس اليوم.", formTitle: "أرسل لنا رسالة", nameLabel: "الاسم", namePlaceholder: "اسمك الكامل", messageLabel: "الرسالة", messagePlaceholder: "أخبرنا عن عقارك أو استفسارك…", send: "إرسال الرسالة", sending: "جارٍ الإرسال…", sentTitle: "تم إرسال الرسالة", sentBody: "شكراً لتواصلك — سيرد عليك فريقنا قريباً.", addressLabel: "العنوان", emailLabel: "البريد الإلكتروني", phoneLabel: "الهاتف", whatsapp: "تواصل عبر واتساب" },
    dashboard: { greeting: "سعداء برؤيتك", title: "مشاريعك", body: "أنشئ أفلام العقارات وراجعها وسلّمها من مساحة عمل واحدة هادئة.", newProject: "مشروع جديد", emptyTitle: "عقارك التالي يستحق نظرة أقرب.", emptyBody: "ارفع صور عقارك، وراجع الاتجاه السينمائي، ثم وافق على الإنتاج.", emptyAction: "ابدأ مشروعاً", statuses: "مراحل المشروع", view: "عرض المشروع", recent: "آخر التحديثات", project: "مشروع", projects: "مشاريع" },
    upload: { eyebrow: "مشروع جديد", title: "ابدأ المشهد.", body: "أضف صور العقار وموجز العرض القصير الذي يحتاجه مشروعك.", media: "صور العقار", mediaHint: "ارفع من صورة واحدة إلى 10 صور للعقار. JPG أو PNG أو WEBP. حتى 25 ميغابايت إجمالاً.", photoCount: "صور محددة", photoCountReady: "جاهزة للمراجعة", photoCountRemaining: "صور متبقية", drop: "أفلت الصور هنا", browse: "أو تصفح الملفات", titleField: "عنوان العقار", titlePlace: "مثال: بنتهاوس بحري في نخلة جميرا", description: "وصف العرض", descriptionPlace: "بعض التفاصيل لتثبيت القصة…", location: "الموقع", locationPlace: "دبي مارينا، دبي", continue: "إنشاء المشروع", processing: "جارٍ إعداد مشروعك…", remove: "إزالة", mixedOrientation: "حافظ على اتجاه واحد لجميع الصور (أفقي بالكامل أو عمودي بالكامل) ليتم دمج فيلمك بسلاسة.", tooSmall: "إحدى هذه الصور صغيرة جداً على التصيير (الحد الأدنى 300×300 بكسل). يرجى استخدام نسخة أكبر من الصورة." },
    review: { eyebrow: "مراجعة المشروع", title: "شكّل القصة قبل أن تتحرك.", body: "راجع صور العقار المختارة والاتجاه السينمائي. وافق على الإنتاج عندما يصبح التسلسل مناسباً، أو اترك ملاحظة للتغيير.", approve: "وافق وابدأ التصيير", request: "اطلب تعديلات", note: "ما الذي ترغب بتغييره؟", notePlace: "مثال: ابدأ بالشرفة، ثم انتقل إلى مساحة المعيشة الرئيسية.", send: "أرسل الطلب", media: "صور العقار", storyboard: "الاتجاه السينمائي", storyboardBody: "ستتحول كل صورة إلى مقطع سينمائي مدته 10 ثوانٍ. بعد الموافقة، يدرس نظامنا كل صورة ويكتب موجهاً حركياً خاصاً بالمشهد قبل التصيير، مع الحفاظ على الترتيب في الفيلم النهائي.", changeSent: "تم حفظ طلب التعديل", clipsLabel: "مقاطع", eachLabel: "لكل منها", finalReelLabel: "الفيلم النهائي", orderNote: "ستبقى صورك بهذا الترتيب. وافق مرة واحدة وسيُنشئ reel-listing.com المقاطع السينمائية ويجمعها في فيلم نهائي واحد.", photosLabel: "صور", photoAlt: "صورة العقار", shotFallback: "لقطة العقار", analyzing: "جارٍ التحليل…", preparing: "جارٍ إعداد الإنتاج السينمائي…", viewProduction: "عرض الإنتاج", moveUp: "تحريك لأعلى", moveDown: "تحريك لأسفل", cameraMovePlaceholder: "صف حركة الكاميرا لهذا المشهد…", resetToAi: "إعادة الضبط لاقتراح الذكاء الاصطناعي", customBadge: "مخصص", staging: { styles: { modern: "عصري", bohemian: "بوهيمي", traditional: "تقليدي", scandinavian: "إسكندنافي", minimalist: "بسيط", "contemporary-gulf": "خليجي معاصر" }, stage: "تجهيز", creditsLabel: "رصيد تجهيز متبقٍ", staged: "تم التجهيز" } },
    project: { back: "كل المشاريع", delivery: "تسليم المشروع", overview: "نظرة عامة على التوليد", estimate: "الوقت المتوقع للإكمال", reviewEstimate: "بانتظار موافقتك", processingEstimate: "جارٍ توليد فيلمك", doneEstimate: "جاهز للتسليم", uploadingEstimate: "جارٍ تأمين وسائطك", download: "تحميل الفيديو", share: "مشاركة", unavailable: "سيصبح التسليم متاحاً بمجرد اكتمال فيلمك.", requestNotes: "أحدث طلب تعديل", reelReady: "فيلمك السينمائي جاهز للمشاركة.", assembleError: "تعذّر جمع الفيلم النهائي.", shareError: "تعذرت مشاركة المشروع", linkCopied: "تم نسخ رابط المشروع. وهو جاهز للمشاركة.", notReadyYet: "الفيديو النهائي غير جاهز بعد", opening: "جارٍ فتح الفيديو النهائي الآن.", startingProduction: "جارٍ بدء الإنتاج السينمائي…", generationStopped: "توقف التوليد", renderStoppedBody: "توقف التوليد قبل اكتمال جميع المقاطع.", assemblingReel: "جارٍ جمع فيلمك", generatingClips: "جارٍ توليد المقاطع", productionProgress: "تقدم الإنتاج", finalStitch: "اللمسة النهائية", buildingFilm: "جارٍ بناء فيلمك", clipsLabel: "مقاطع", shotLabel: "لقطة", tryAgain: "حاول الجمع مرة أخرى", falIncomplete: "تعذّر إكمال مقطع واحد أو أكثر.", finalAssembly: "الجمع النهائي", falProduction: "إنتاج بالذكاء الاصطناعي", assemblyBody: "يتم جمع المقاطع المكتملة حسب ترتيب رفعها وحفظها كفيلم نهائي واحد.", falProductionBody: "نقوم بتوليد مقطع سينمائي متحرك من كل صورة للعقار. يمكنك مغادرة الصفحة والعودة لاحقاً.", reelReadyBanner: "فيلمك النهائي جاهز.", privateLink: "رابط مشروع خاص", framesLabel: "إطارات", shareLinkCopied: "تم نسخ الرابط العام. يمكن لأي شخص لديه الرابط مشاهدة الفيلم.", shareRevoked: "تم إيقاف الرابط العام.", unshare: "إيقاف الرابط", downloadStarted: "جارٍ بدء التنزيل.", keepTabOpen: "أبقِ هذه الصفحة مفتوحة حتى ينتهي تجميع الفيلم.", assemblyInterrupted: "توقف التجميع. يمكنك استئنافه متى شئت — مقاطعك محفوظة." },
    share: { eyebrow: "فيلم عقاري مُشارَك", unavailableTitle: "لم يعد هذا الرابط متاحاً.", unavailableBody: "قد يكون الفيلم قيد التوليد، أو أن من شاركه قد أوقف الرابط." },
    billing: { creditsLabel: "الأرصدة", creditsUnit: "رصيد", emptyHint: "تواصل معنا لإضافة أرصدة قبل التوليد.", needCredits: "يحتاج هذا الفيلم إلى {needed} رصيد ولديك {have}. تواصل معنا لإضافة رصيد قبل الموافقة.", costNote: "الموافقة تستهلك {needed} رصيد. الرصيد الواحد يعادل خمس ثوانٍ من الفيديو." },
    shot: { movementLabel: "حركة الكاميرا", howItMoves: "كيف تتحرك", roomLabel: "هذه الغرفة هي", advanced: "سأصفها بنفسي", advancedHint: "بلغة بسيطة. حركات الرافعة والطائرة والدوران والإمالة غير مدعومة — تأتي النتيجة مشوّهة.", freeEditsNote: "غيّر ما تشاء — التعديلات مجانية. لا تُحتسب التكلفة إلا عند الموافقة.", rooms: { unknown: "دع الذكاء الاصطناعي يقرر", "outdoor-view": "خارجي أو إطلالة", "living-room": "غرفة المعيشة", "kitchen-dining": "مطبخ أو طعام", bedroom: "غرفة نوم", bathroom: "حمّام", detail: "لقطة تفصيلية" }, moves: { "push-in": "اقترب أكثر", "pull-back": "أظهر الغرفة كاملة", "glide-across": "انزلق عبر الغرفة", "curve-around": "در حول العنصر", "toward-the-light": "اتجه نحو الضوء", "over-the-detail": "مرّ فوق التفصيل" } },
    reel: { styleLabel: "إيقاع الفيلم", styleHint: "اختيار واحد يُطبَّق على كل اللقطات.", lengthLabel: "المدة النهائية", styles: { calm: ["هادئ وفاخر", "لقطات طويلة ومتأنية تمنح كل غرفة مساحتها."], balanced: ["متوازن", "الخيار اليومي. لقطات كاملة وانتقالات نظيفة."], quick: ["سريع ومشرق", "لقطات قصيرة ومتلاحقة، مصمّمة لمنصات التواصل."] } },
    common: { loading: "جارٍ التحميل…", back: "عودة", signInTitle: "سجّل دخولك إلى مساحة عملك", signInBody: "سجّل الدخول بأمان للوصول إلى مشاريعك ومكتبة التسليم.", continue: "المتابعة لتسجيل الدخول", terms: "الشروط", privacy: "الخصوصية", errorTitle: "تعذّر الوصول إلى مساحة عملك", errorBody: "أنت مسجّل الدخول، لكن تعذّر تحميل حسابك الآن. المشكلة لدينا وليست لديك.", retry: "حاول مرة أخرى", status: { Uploading: "جارٍ الرفع", Processing: "قيد المعالجة", Review: "قيد المراجعة", Done: "مكتمل" }, notFoundCode: "404", notFoundTitle: "الصفحة غير موجودة", notFoundBody: "عذراً، الصفحة التي تبحث عنها غير موجودة. ربما تم نقلها أو حذفها.", notFoundHome: "العودة للرئيسية", switchLanguage: "تبديل اللغة", openNavigation: "فتح القائمة", signOut: "تسجيل الخروج", memberFallback: "عضو في reel-listing", projectNotFound: "المشروع غير موجود.", poweredBy: "بدعم من" },
  },
} as const;
