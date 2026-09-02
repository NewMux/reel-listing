import { CheckCircle2, MapPin } from "lucide-react";
import { FormEvent, useState } from "react";
import { Footer, PublicNav } from "@/components/AppChrome";
import { copy, useLocale } from "@/lib/locale";
import { trpc } from "@/lib/trpc";

const COMPANY = "NewMux For Software Development & Digital Innovation";
const ADDRESS = "Manama, Bahrain";
const EMAIL = "info@newmux.com";
const PHONE = "+973 6635 6999";
const WHATSAPP_URL = "https://wa.me/97366356999";

export default function Contact() {
  const { locale } = useLocale(); const t = copy[locale].contact;
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [message, setMessage] = useState("");
  const submit = trpc.contact.submit.useMutation({
    onSuccess: () => { setName(""); setEmail(""); setMessage(""); },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate({ name, email, message });
  };

  return <div className="min-h-screen bg-[#F7F2EF] text-[#251811]"><PublicNav/><main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#83604C]">{t.eyebrow}</p><h1 className="serif mt-4 text-5xl tracking-[-.05em] sm:text-6xl">{t.title}</h1><p className="mt-10 border-s-2 border-[#CF9777] ps-5 text-lg leading-8 text-[#544740]">{t.body}</p><div className="mt-14 rounded-[28px] border border-[#251811]/10 bg-white p-8 shadow-[0_24px_60px_rgba(17,37,30,.08)]">{submit.isSuccess ? <div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#E9C6B2] text-[#572E16]"><CheckCircle2 size={18}/></div><div><p className="text-base font-bold text-[#251811]">{t.sentTitle}</p><p className="mt-1 text-sm text-[#716660]">{t.sentBody}</p></div></div> : <form onSubmit={onSubmit}><h2 className="text-lg font-bold text-[#251811]">{t.formTitle}</h2><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#7B5B49]">{t.nameLabel}</span><input required value={name} onChange={event => setName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#251811]/12 bg-[#FCFAF9] px-4 text-sm outline-none focus:border-[#936245]" placeholder={t.namePlaceholder} /></label><label className="block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#7B5B49]">{t.emailLabel}</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#251811]/12 bg-[#FCFAF9] px-4 text-sm outline-none focus:border-[#936245]" placeholder="you@agency.com" /></label></div><label className="mt-5 block"><span className="text-xs font-bold uppercase tracking-[.12em] text-[#7B5B49]">{t.messageLabel}</span><textarea required rows={5} value={message} onChange={event => setMessage(event.target.value)} className="mt-2 w-full rounded-xl border border-[#251811]/12 bg-[#FCFAF9] px-4 py-3 text-sm outline-none focus:border-[#936245]" placeholder={t.messagePlaceholder} /></label>{submit.isError && <p className="mt-4 rounded-xl bg-[#FFEFE5] px-4 py-3 text-xs leading-5 text-[#94522C]">{submit.error.message}</p>}<button type="submit" disabled={submit.isPending} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#251811] px-5 text-sm font-bold text-[#F8F3F0] hover:bg-[#402E24] disabled:opacity-60">{submit.isPending ? t.sending : t.send}</button></form>}</div><div className="mt-10 rounded-[28px] border border-[#251811]/10 bg-white p-8 shadow-[0_24px_60px_rgba(17,37,30,.08)]"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F0E3DA] text-[#7B5B49]"><MapPin size={17}/></div><div><p className="text-base font-bold text-[#251811]">{COMPANY}</p><p className="mt-1 text-sm text-[#716660]">{ADDRESS}</p></div></div><div className="mt-8 grid gap-6 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#837B77]">{t.emailLabel}</p><a href={`mailto:${EMAIL}`} className="mt-2 block text-base font-semibold text-[#251811] hover:text-[#AE653A]">{EMAIL}</a></div><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#837B77]">{t.phoneLabel}</p><a href={`tel:${PHONE.replace(/\s+/g, "")}`} className="mt-2 block text-base font-semibold text-[#251811] hover:text-[#AE653A]">{PHONE}</a></div></div><a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[#251811] px-5 text-sm font-bold text-[#F8F3F0] hover:bg-[#402E24]">{t.whatsapp}</a></div></main><Footer/></div>;
}
