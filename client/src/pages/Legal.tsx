import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";

// Split explicitly per page rather than by slice index. The previous shape relied on
// slice(0,3)/slice(3), so adding a section silently moved a clause from Terms to Privacy.
const sections = {
  en: {
    terms: [
      ["Using the service", "Reel Listing provides tools for creating real estate video projects. You are responsible for ensuring that you have the necessary rights, permissions, and consents for all property media, listing information, and brand materials you submit."],
      ["AI-generated media", "Generated video is intended to support property marketing. Any virtual staging or AI-produced visual treatment must be used responsibly and clearly disclosed where required by applicable laws, platform policies, or professional standards."],
      ["Your account", "Keep your access credentials secure and provide accurate account information. We may suspend access where we reasonably believe the service is being used unlawfully, fraudulently, or in a way that compromises the platform."],
      ["Payments and pricing", "Payments are processed by Paddle.com Market Ltd, which acts as the merchant of record for every purchase and is responsible for collecting applicable taxes and issuing your invoice. All prices are charged in US dollars. Where a Bahraini dinar figure is shown alongside a price, it is a reference conversion at the Central Bank of Bahrain's fixed rate and is not the amount billed to your card."],
      ["Plan credits and renewal", "A subscription includes a set number of listing videos each billing period. That allowance resets at the start of each period and does not carry over. One-time credit packs are separate: they are added to your balance, never expire, and are not affected by a renewal. Credits from your plan allowance are used before purchased pack credits. A credit is spent when you approve a project for rendering."],
      ["Changing or cancelling", "You can change or cancel your plan at any time from the billing page. Cancelling takes effect at the end of the period you have already paid for, and credits issued for that period remain usable until it ends. A downgrade takes effect at your next renewal. If a payment fails, your remaining credits stay available while the payment is retried, but no new allowance is issued until it succeeds."],
      ["Refunds", "If a payment is refunded or reversed, any unspent credits issued for it are removed from your balance. Because each video is produced at a real, immediate cost to us, credits that have already been spent on a completed or in-progress render cannot be refunded. Contact us if something has gone wrong with an order and we will look at it."],
    ],
    privacy: [
      ["Information we collect", "We collect account details supplied through secure authentication, the property media and project metadata you submit, and limited technical information needed to keep the service reliable and secure."],
      ["How we use information", "We use project information to operate and improve the service, create and deliver requested video projects, protect against abuse, and communicate important service updates. We do not sell your property media."],
      ["Payment information", "We never see or store your card details. Payments are handled by Paddle, which acts as merchant of record and collects the billing information needed to process your purchase and meet its tax obligations. We store only a customer reference issued by Paddle and a record of each purchase and credit change, so we can show your correct balance and answer billing questions."],
      ["Retention and contact", "We retain information only for as long as is reasonably necessary to provide the service and meet legal obligations. To ask a privacy question or request account assistance, contact our support team from your account workspace."],
    ],
  },
  ar: {
    terms: [
      ["استخدام الخدمة", "توفّر Reel Listing أدوات لإنشاء مشاريع فيديو عقارية. أنت مسؤول عن ضمان امتلاكك الحقوق والأذونات والموافقات اللازمة لكل وسائط العقار ومعلومات العرض والمواد التجارية التي ترفعها."],
      ["الوسائط المولّدة بالذكاء الاصطناعي", "الفيديو المولَّد مخصص لدعم التسويق العقاري. يجب استخدام أي تجهيز افتراضي أو معالجة بصرية بالذكاء الاصطناعي بمسؤولية والإفصاح عنها بوضوح متى ما تطلبت ذلك القوانين المعمول بها أو سياسات المنصة أو المعايير المهنية."],
      ["حسابك", "حافظ على أمان بيانات الدخول الخاصة بك وقدّم معلومات حساب دقيقة. يجوز لنا تعليق الوصول إذا اعتقدنا بشكل معقول أن الخدمة تُستخدم بشكل غير قانوني أو احتيالي أو بطريقة تُعرّض المنصة للخطر."],
      ["المدفوعات والأسعار", "تتم معالجة المدفوعات عبر Paddle.com Market Ltd، التي تعمل كتاجر مسجَّل لكل عملية شراء وتتولى تحصيل الضرائب المطبّقة وإصدار فاتورتك. تُحتسب جميع الأسعار بالدولار الأمريكي. وعند عرض مبلغ بالدينار البحريني بجانب السعر، فهو تحويل استرشادي وفق سعر الصرف الثابت لمصرف البحرين المركزي وليس المبلغ الذي تتم فوترته على بطاقتك."],
      ["أرصدة الخطة والتجديد", "يشمل الاشتراك عدداً محدداً من فيديوهات العقارات في كل فترة فوترة. تتجدد هذه الحصة في بداية كل فترة ولا تُرحَّل إلى الفترة التالية. أما باقات الأرصدة التي تُشترى مرة واحدة فهي منفصلة: تُضاف إلى رصيدك، ولا تنتهي صلاحيتها أبداً، ولا يؤثر عليها التجديد. تُستخدم أرصدة حصة خطتك قبل الأرصدة المشتراة. ويُخصم الرصيد عند اعتمادك للمشروع لبدء الإنتاج."],
      ["التعديل أو الإلغاء", "يمكنك تغيير خطتك أو إلغاؤها في أي وقت من صفحة الفوترة. يسري الإلغاء في نهاية الفترة التي دفعت مقابلها بالفعل، وتظل الأرصدة الصادرة لتلك الفترة قابلة للاستخدام حتى نهايتها. ويسري الانتقال إلى خطة أقل عند التجديد التالي. وإذا تعذّرت عملية دفع، تبقى أرصدتك المتبقية متاحة أثناء إعادة محاولة الدفع، دون إصدار حصة جديدة حتى نجاحها."],
      ["الاسترداد", "في حال استرداد مبلغ أو عكس عملية دفع، تُزال أي أرصدة غير مستخدمة صادرة عنها من رصيدك. ولأن إنتاج كل فيديو يترتب عليه تكلفة فعلية وفورية علينا، لا يمكن استرداد الأرصدة التي أُنفقت بالفعل على إنتاج مكتمل أو قيد التنفيذ. تواصل معنا إذا حدث خطأ في طلبك وسننظر فيه."],
    ],
    privacy: [
      ["المعلومات التي نجمعها", "نجمع تفاصيل الحساب المقدَّمة عبر المصادقة الآمنة، ووسائط العقار وبيانات المشروع التي ترفعها، ومعلومات تقنية محدودة لازمة للحفاظ على موثوقية الخدمة وأمانها."],
      ["كيف نستخدم المعلومات", "نستخدم معلومات المشروع لتشغيل الخدمة وتحسينها، وإنشاء وتسليم مشاريع الفيديو المطلوبة، والحماية من إساءة الاستخدام، وإرسال تحديثات مهمة عن الخدمة. نحن لا نبيع وسائط عقارك."],
      ["معلومات الدفع", "لا نطّلع على بيانات بطاقتك ولا نخزّنها إطلاقاً. تتولى Paddle معالجة المدفوعات بصفتها التاجر المسجَّل، وتجمع معلومات الفوترة اللازمة لإتمام عملية الشراء والوفاء بالتزاماتها الضريبية. نحن نخزّن فقط معرّف عميل صادراً عن Paddle وسجلاً بكل عملية شراء وتغيير في الرصيد، لنتمكن من عرض رصيدك الصحيح والإجابة عن أسئلة الفوترة."],
      ["الاحتفاظ بالبيانات والتواصل", "نحتفظ بالمعلومات فقط للمدة اللازمة بشكل معقول لتقديم الخدمة والوفاء بالالتزامات القانونية. لطرح سؤال يتعلق بالخصوصية أو طلب مساعدة بخصوص الحساب، تواصل مع فريق الدعم من مساحة عمل حسابك."],
    ],
  },
} as const;

export default function Legal({ type }: { type: "terms" | "privacy" }) {
  const { locale } = useLocale(); const t = copy[locale].legal; const title = type === "terms" ? t.termsTitle : t.privacyTitle; const intro = type === "terms" ? t.termsIntro : t.privacyIntro; const relevant = sections[locale][type];
  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]"><PublicNav/><main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#83604C]">Reel Listing</p><h1 className="serif mt-4 text-5xl tracking-[-.05em] sm:text-6xl">{title}</h1><p className="mt-4 text-sm text-[#807671]">{t.updated}</p><p className="mt-10 border-s-2 border-[#CF9777] ps-5 text-lg leading-8 text-[#544740]">{intro}</p><div className="mt-14 space-y-10">{relevant.map(([heading, body]) => <section key={heading}><h2 className="text-lg font-bold text-[#38281E]">{heading}</h2><p className="mt-3 text-sm leading-7 text-[#716660]">{body}</p></section>)}</div></main><Footer/></div>;
}
