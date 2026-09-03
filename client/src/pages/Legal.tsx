import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";

const sections = {
  en: [
    ["Using the service", "Reel Listing provides tools for creating real estate video projects. You are responsible for ensuring that you have the necessary rights, permissions, and consents for all property media, listing information, and brand materials you submit."],
    ["AI-generated media", "Generated video is intended to support property marketing. Any virtual staging or AI-produced visual treatment must be used responsibly and clearly disclosed where required by applicable laws, platform policies, or professional standards."],
    ["Your account", "Keep your access credentials secure and provide accurate account information. We may suspend access where we reasonably believe the service is being used unlawfully, fraudulently, or in a way that compromises the platform."],
    ["Information we collect", "We collect account details supplied through secure authentication, the property media and project metadata you submit, and limited technical information needed to keep the service reliable and secure."],
    ["How we use information", "We use project information to operate and improve the service, create and deliver requested video projects, protect against abuse, and communicate important service updates. We do not sell your property media."],
    ["Retention and contact", "We retain information only for as long as is reasonably necessary to provide the service and meet legal obligations. To ask a privacy question or request account assistance, contact our support team from your account workspace."],
  ],
  ar: [
    ["استخدام الخدمة", "توفّر Reel Listing أدوات لإنشاء مشاريع فيديو عقارية. أنت مسؤول عن ضمان امتلاكك الحقوق والأذونات والموافقات اللازمة لكل وسائط العقار ومعلومات العرض والمواد التجارية التي ترفعها."],
    ["الوسائط المولّدة بالذكاء الاصطناعي", "الفيديو المولَّد مخصص لدعم التسويق العقاري. يجب استخدام أي تجهيز افتراضي أو معالجة بصرية بالذكاء الاصطناعي بمسؤولية والإفصاح عنها بوضوح متى ما تطلبت ذلك القوانين المعمول بها أو سياسات المنصة أو المعايير المهنية."],
    ["حسابك", "حافظ على أمان بيانات الدخول الخاصة بك وقدّم معلومات حساب دقيقة. يجوز لنا تعليق الوصول إذا اعتقدنا بشكل معقول أن الخدمة تُستخدم بشكل غير قانوني أو احتيالي أو بطريقة تُعرّض المنصة للخطر."],
    ["المعلومات التي نجمعها", "نجمع تفاصيل الحساب المقدَّمة عبر المصادقة الآمنة، ووسائط العقار وبيانات المشروع التي ترفعها، ومعلومات تقنية محدودة لازمة للحفاظ على موثوقية الخدمة وأمانها."],
    ["كيف نستخدم المعلومات", "نستخدم معلومات المشروع لتشغيل الخدمة وتحسينها، وإنشاء وتسليم مشاريع الفيديو المطلوبة، والحماية من إساءة الاستخدام، وإرسال تحديثات مهمة عن الخدمة. نحن لا نبيع وسائط عقارك."],
    ["الاحتفاظ بالبيانات والتواصل", "نحتفظ بالمعلومات فقط للمدة اللازمة بشكل معقول لتقديم الخدمة والوفاء بالالتزامات القانونية. لطرح سؤال يتعلق بالخصوصية أو طلب مساعدة بخصوص الحساب، تواصل مع فريق الدعم من مساحة عمل حسابك."],
  ],
} as const;

export default function Legal({ type }: { type: "terms" | "privacy" }) {
  const { locale } = useLocale(); const t = copy[locale].legal; const title = type === "terms" ? t.termsTitle : t.privacyTitle; const intro = type === "terms" ? t.termsIntro : t.privacyIntro; const localeSections = sections[locale]; const relevant = type === "terms" ? localeSections.slice(0, 3) : localeSections.slice(3);
  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]"><PublicNav/><main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#83604C]">Reel Listing</p><h1 className="serif mt-4 text-5xl tracking-[-.05em] sm:text-6xl">{title}</h1><p className="mt-4 text-sm text-[#807671]">{t.updated}</p><p className="mt-10 border-s-2 border-[#CF9777] ps-5 text-lg leading-8 text-[#544740]">{intro}</p><div className="mt-14 space-y-10">{relevant.map(([heading, body]) => <section key={heading}><h2 className="text-lg font-bold text-[#38281E]">{heading}</h2><p className="mt-3 text-sm leading-7 text-[#716660]">{body}</p></section>)}</div></main><Footer/></div>;
}
