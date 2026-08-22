import { ArrowUpRight, ChevronDown, Clapperboard, Globe2, LayoutDashboard, LogOut, Menu, Plus, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { copy, useLocale } from "@/lib/locale";

export function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className={`flex items-center gap-2.5 font-semibold tracking-[-.03em] ${light ? "text-[#f7f5ef]" : "text-[#11251E]"}`}><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#C7D87A] text-[#11251E]"><Clapperboard size={16} strokeWidth={2.3} /></span><span className="text-[17px]">reel-listing<span className="font-normal opacity-60">.com</span></span></Link>;
}

export function LocaleButton({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();
  const label = copy[locale].nav.language;
  return <button onClick={() => setLocale(locale === "en" ? "ar" : "en")} className={`inline-flex items-center justify-center gap-2 rounded-full border border-[#11251E]/10 bg-white/55 text-sm font-semibold text-[#244035] hover:bg-white ${compact ? "h-9 w-9" : "h-10 px-3.5"}`} aria-label="Switch language"><Globe2 size={16} /><span className={compact ? "sr-only" : ""}>{label}</span></button>;
}

export function PublicNav() {
  const { locale } = useLocale();
  const t = copy[locale];
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const dashboardPath = "/dashboard";

  return <header className="relative z-30 mx-auto flex max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8"><Brand /><nav className="hide-mobile absolute left-1/2 flex -translate-x-1/2 items-center gap-7 text-sm font-medium text-[#385347]"><a href="/#product" className="hover:text-[#11251E]">{t.nav.product}</a><Link href="/pricing" className="hover:text-[#11251E]">{t.nav.pricing}</Link></nav><div className="hide-mobile flex items-center gap-2.5"><LocaleButton />{user ? <button onClick={() => setLocation(dashboardPath)} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#11251E] px-4 text-sm font-semibold text-[#F7F5EF] hover:bg-[#244035]"><LayoutDashboard size={15}/>{t.nav.dashboard}</button> : <><button onClick={() => startLogin()} className="h-10 px-3 text-sm font-semibold text-[#244035] hover:text-[#11251E]">{t.nav.signIn}</button><button onClick={() => startLogin()} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#11251E] px-4 text-sm font-semibold text-[#F7F5EF] hover:bg-[#244035]">{t.home.start}<ArrowUpRight size={15}/></button></>}</div><div className="flex items-center gap-2 sm:hidden"><LocaleButton compact /><button className="grid h-9 w-9 place-items-center rounded-full border border-[#11251E]/10 bg-white/55" onClick={() => setOpen(!open)} aria-label="Open navigation">{open ? <X size={18}/> : <Menu size={18}/>}</button></div>{open && <div className="absolute left-5 right-5 top-[68px] rounded-2xl border border-[#11251E]/10 bg-[#F7F5EF] p-3 shadow-xl sm:hidden"><a className="block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white" onClick={() => setOpen(false)} href="/#product">{t.nav.product}</a><Link href="/pricing" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white">{t.nav.pricing}</Link><button onClick={() => user ? setLocation(dashboardPath) : startLogin()} className="mt-2 flex w-full items-center justify-between rounded-xl bg-[#11251E] px-3 py-3 text-sm font-semibold text-[#F7F5EF]">{user ? t.nav.dashboard : t.home.start}<ArrowUpRight size={15}/></button></div>}</header>;
}

export function Footer() {
  const { locale } = useLocale(); const t = copy[locale];
  return <footer className="border-t border-[#11251E]/10 bg-[#f0ede3]"><div className="mx-auto flex max-w-[1280px] flex-col gap-7 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-8"><Brand /><div className="flex items-center gap-5 text-sm text-[#51645a]"><Link href="/terms" className="hover:text-[#11251E]">{t.common.terms}</Link><Link href="/privacy" className="hover:text-[#11251E]">{t.common.privacy}</Link></div><p className="text-xs text-[#748178]">© 2026 reel-listing.com</p></div></footer>;
}

export function AppSidebar({ children }: { children: ReactNode }) {
  const { locale } = useLocale(); const t = copy[locale]; const { user, loading, logout } = useAuth(); const [location, setLocation] = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#F7F5EF]"><div className="h-9 w-9 animate-spin rounded-full border-2 border-[#11251E]/15 border-t-[#11251E]" /></div>;
  if (!user) return <div className="grid min-h-screen place-items-center bg-[#F7F5EF] p-5"><div className="w-full max-w-md rounded-[28px] border border-[#11251E]/10 bg-white p-8 text-center shadow-[0_24px_60px_rgba(17,37,30,.11)]"><div className="mx-auto mb-6 w-fit"><Brand /></div><h1 className="serif text-3xl text-[#11251E]">{t.common.signInTitle}</h1><p className="mt-3 text-sm leading-6 text-[#68766e]">{t.common.signInBody}</p><button onClick={() => startLogin()} className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#11251E] text-sm font-bold text-white">{t.common.continue}<ArrowUpRight size={16}/></button></div></div>;
  return <div className="min-h-screen bg-[#F7F5EF] lg:grid lg:grid-cols-[248px_1fr]"><aside className="hidden border-e border-[#11251E]/10 bg-[#f0ede3] lg:flex lg:min-h-screen lg:flex-col lg:p-5"><Brand /><nav className="mt-12 space-y-1"><button onClick={() => setLocation("/dashboard")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${location === "/dashboard" ? "bg-[#11251E] text-white" : "text-[#536359] hover:bg-white/70"}`}><LayoutDashboard size={17}/>{t.nav.dashboard}</button><button onClick={() => setLocation("/projects/new")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${location === "/projects/new" ? "bg-[#11251E] text-white" : "text-[#536359] hover:bg-white/70"}`}><Plus size={17}/>{t.dashboard.newProject}</button></nav><div className="mt-auto rounded-2xl border border-[#11251E]/8 bg-white/60 p-3"><p className="truncate text-sm font-semibold text-[#1b3428]">{user.name || "reel-listing member"}</p><p className="mt-1 truncate text-xs text-[#6d7d73]">{user.email}</p><div className="mt-3 flex items-center justify-between"><LocaleButton compact/><button onClick={logout} className="grid h-9 w-9 place-items-center rounded-full text-[#6d7d73] hover:bg-white hover:text-[#11251E]" aria-label="Sign out"><LogOut size={16}/></button></div></div></aside><div className="min-w-0"><header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#11251E]/8 bg-[#F7F5EF]/88 px-5 py-4 backdrop-blur-md lg:hidden"><Brand/><div className="flex items-center gap-2"><LocaleButton compact/><button onClick={logout} className="grid h-9 w-9 place-items-center rounded-full border border-[#11251E]/10"><LogOut size={16}/></button></div></header>{children}</div></div>;
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = { Uploading: "bg-[#FFF0D0] text-[#8B5A08]", Processing: "bg-[#DCEDE7] text-[#1B6651]", Review: "bg-[#E9E0FA] text-[#6743A3]", Done: "bg-[#D8E9B2] text-[#436215]" };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[.02em] ${styles[status] || "bg-slate-100 text-slate-600"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}

export function Chevron() { return <ChevronDown size={15} className="opacity-55"/>; }
