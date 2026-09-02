import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";

const sections = [
  ["Using the service", "Reel Listing provides tools for creating real estate video projects. You are responsible for ensuring that you have the necessary rights, permissions, and consents for all property media, listing information, and brand materials you submit."],
  ["AI-generated media", "Generated video is intended to support property marketing. Any virtual staging or AI-produced visual treatment must be used responsibly and clearly disclosed where required by applicable laws, platform policies, or professional standards."],
  ["Your account", "Keep your access credentials secure and provide accurate account information. We may suspend access where we reasonably believe the service is being used unlawfully, fraudulently, or in a way that compromises the platform."],
  ["Information we collect", "We collect account details supplied through secure authentication, the property media and project metadata you submit, and limited technical information needed to keep the service reliable and secure."],
  ["How we use information", "We use project information to operate and improve the service, create and deliver requested video projects, protect against abuse, and communicate important service updates. We do not sell your property media."],
  ["Retention and contact", "We retain information only for as long as is reasonably necessary to provide the service and meet legal obligations. To ask a privacy question or request account assistance, contact our support team from your account workspace."],
];

export default function Legal({ type }: { type: "terms" | "privacy" }) {
  const { locale } = useLocale(); const t = copy[locale].legal; const title = type === "terms" ? t.termsTitle : t.privacyTitle; const intro = type === "terms" ? t.termsIntro : t.privacyIntro; const relevant = type === "terms" ? sections.slice(0, 3) : sections.slice(3);
  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]"><PublicNav/><main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#83604C]">Reel Listing</p><h1 className="serif mt-4 text-5xl tracking-[-.05em] sm:text-6xl">{title}</h1><p className="mt-4 text-sm text-[#807671]">{t.updated}</p><p className="mt-10 border-s-2 border-[#CF9777] ps-5 text-lg leading-8 text-[#544740]">{intro}</p><div className="mt-14 space-y-10">{relevant.map(([heading, body]) => <section key={heading}><h2 className="text-lg font-bold text-[#38281E]">{heading}</h2><p className="mt-3 text-sm leading-7 text-[#716660]">{body}</p></section>)}</div></main><Footer/></div>;
}
