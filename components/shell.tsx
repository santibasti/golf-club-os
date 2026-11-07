"use client";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, Clock, CloudSun, FlaskConical, Menu, RotateCcw, Search, ShieldAlert, X, Building2, Smartphone } from "lucide-react";
import { useStore } from "@/lib/store";
import { NAV, ROLES, roleLabel } from "@/lib/permissions";
import type { RoleId } from "@/lib/types";
import { Avatar, Button, Denied, Icon, Modal, cn } from "./ui";
import { computeAlerts } from "@/lib/services/alerts";
import { fmt12, fmtDate, timeOf, dateOf } from "@/lib/time";

function useOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb(); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [ref, cb]);
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can, db } = useStore(); const path = usePathname();
  const items = NAV.filter((n) => can(n.perm));
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-forest-950/50 lg:hidden" onClick={onClose} />}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-forest-900 text-ivory transition-transform lg:static lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold text-forest-950"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21V3l9 4-9 4" /><circle cx="8" cy="21" r="1.2" fill="currentColor" /><path d="M14 20c1.5.3 3 .6 5 .6" /></svg></span>
          <div className="min-w-0"><p className="font-display text-lg font-semibold leading-tight tracking-wide">GOLF CLUB OS</p><p className="truncate text-[11px] text-gold-300">{db.settings.club.shortName}</p></div>
          <button className="ml-auto lg:hidden" onClick={onClose} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          {items.map((n) => { const active = n.href === "/" ? path === "/" : path.startsWith(n.href); return (
            <Link key={n.href} href={n.href} onClick={onClose} aria-current={active ? "page" : undefined} className={cn("mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors", active ? "bg-white/10 font-medium text-white shadow-inner" : "text-ivory/75 hover:bg-white/5 hover:text-white")}>
              <Icon name={n.icon} className={cn("h-[18px] w-[18px]", active && "text-gold-300")} />{n.label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />}
            </Link>); })}
          <div className="mt-4 border-t border-white/10 pt-4">
            <Link href="/portal" onClick={onClose} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ivory/75 hover:bg-white/5 hover:text-white"><Smartphone className="h-[18px] w-[18px]" />Golfer / Member Portal</Link>
          </div>
        </nav>
        <div className="border-t border-white/10 p-4 text-[11px] leading-snug text-ivory/60"><FlaskConical className="mr-1 inline h-3 w-3 text-gold-300" />Demonstration build. Fictional data stored in this browser only — not a production system.</div>
      </aside>
    </>
  );
}

function GlobalSearch() {
  const { db } = useStore(); const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); const router = useRouter();
  useOutside(ref, () => setOpen(false));
  const results = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    const out: { label: string; sub: string; href: string; kind: string }[] = [];
    for (const m of db.members) { const c = db.customers.find((x) => x.id === m.customerId); if (c && (c.name.toLowerCase().includes(s) || m.id.toLowerCase() === s || c.phone.includes(s))) out.push({ kind: "Member", label: c.name, sub: `${m.id} · ${m.status.replace("_", " ")}`, href: `/membership?member=${m.id}` }); }
    for (const b of db.bookings) if (b.ref.toLowerCase().includes(s) || b.contactName.toLowerCase().includes(s)) out.push({ kind: "Booking", label: `${b.ref} · ${b.contactName}`, sub: `${b.date} ${fmt12(b.time)} · ${b.status.replace("_", " ")}`, href: `/reservations?date=${b.date}&booking=${b.id}` });
    for (const c of db.caddies) if (c.name.toLowerCase().includes(s) || c.id.toLowerCase() === s) out.push({ kind: "Caddie", label: c.name, sub: `${c.id} · ${c.status.replace("_", " ")}`, href: `/caddies?caddie=${c.id}` });
    for (const c of db.customers) if (!c.memberId && c.name.toLowerCase().includes(s)) out.push({ kind: "Customer", label: c.name, sub: `${c.id} · public golfer`, href: `/membership?tab=customers&q=${encodeURIComponent(c.name)}` });
    return out.slice(0, 9);
  }, [q, db]);
  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
      <input aria-label="Search members, bookings, caddies" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search members, bookings, caddies…" className="h-10 w-full rounded-lg border border-charcoal-200 bg-white pl-9 pr-3 text-sm focus:border-emerald focus:outline-none focus:ring-2 focus:ring-emerald/20" />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-charcoal-100 bg-white shadow-xl">
          {results.length === 0 ? <p className="p-4 text-sm text-charcoal-500">No matches for “{q}”.</p> : results.map((r, i) => (
            <button key={i} onClick={() => { setOpen(false); setQ(""); router.push(r.href); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ivory-50">
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gold-600">{r.kind}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{r.label}</span><span className="block truncate text-xs text-charcoal-500">{r.sub}</span></span>
            </button>))}
        </div>)}
    </div>
  );
}

function Notifications() {
  const { db } = useStore(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); useOutside(ref, () => setOpen(false));
  const alerts = useMemo(() => computeAlerts(db), [db]); const crit = alerts.filter((a) => a.level !== "info").length;
  return (
    <div ref={ref} className="relative">
      <button aria-label={`Notifications (${alerts.length})`} onClick={() => setOpen((o) => !o)} className="relative grid h-10 w-10 place-items-center rounded-lg border border-charcoal-200 bg-white hover:bg-ivory-100"><Bell className="h-[18px] w-[18px]" />{alerts.length > 0 && <span className={cn("absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white", crit ? "bg-[#A63D2F]" : "bg-gold")}>{alerts.length}</span>}</button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-charcoal-100 bg-white shadow-xl">
          <div className="border-b border-charcoal-100 px-4 py-3 text-sm font-semibold text-forest">Operational alerts <span className="font-normal text-charcoal-400">· derived live from data</span></div>
          <div className="scroll-thin max-h-96 overflow-y-auto">
            {alerts.length === 0 ? <p className="p-4 text-sm text-charcoal-500">All clear.</p> : alerts.map((a) => (
              <Link key={a.id} href={a.href} onClick={() => setOpen(false)} className="flex gap-3 border-b border-charcoal-100/70 px-4 py-3 last:border-0 hover:bg-ivory-50">
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", a.level === "critical" ? "bg-[#A63D2F]" : a.level === "warning" ? "bg-[#D98E04]" : "bg-[#5B8DB0]")} />
                <span className="min-w-0"><span className="block text-[10px] font-semibold uppercase tracking-wider text-charcoal-400">{a.type}</span><span className="block text-sm font-medium leading-snug">{a.title}</span><span className="block truncate text-xs text-charcoal-500">{a.detail}</span></span>
              </Link>))}
          </div>
        </div>)}
    </div>
  );
}

function RoleSwitcher() {
  const { session, setRole, db } = useStore(); const router = useRouter(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); useOutside(ref, () => setOpen(false));
  const role = ROLES.find((r) => r.id === session.role)!;
  const pick = (r: RoleId) => { setRole(r); setOpen(false); const target = ROLES.find((x) => x.id === r)!.home; router.push(target); };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-lg border border-gold-300 bg-gold-50 pl-1.5 pr-2.5 text-left hover:bg-gold-100" aria-haspopup="listbox" aria-label="Demo role switcher">
        <Avatar name={role.user} seed={ROLES.indexOf(role)} size={28} />
        <span className="hidden leading-tight sm:block"><span className="block text-[10px] font-bold uppercase tracking-wider text-gold-700">Demo role</span><span className="block max-w-[10rem] truncate text-xs font-semibold text-forest">{role.short}</span></span>
        <ChevronDown className="h-4 w-4 text-gold-700" />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 top-12 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-charcoal-100 bg-white shadow-xl">
          <div className="border-b border-charcoal-100 bg-gold-50 px-4 py-2.5 text-xs text-gold-700"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" />Demo role switching — no passwords. Not authentication.</div>
          <div className="scroll-thin max-h-[26rem] overflow-y-auto">
            {ROLES.map((r, i) => (
              <button key={r.id} role="option" aria-selected={r.id === session.role} onClick={() => pick(r.id)} className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-ivory-50", r.id === session.role && "bg-forest-50")}>
                <Avatar name={r.user} seed={i} size={30} /><span className="min-w-0"><span className="block text-sm font-medium">{r.label}</span><span className="block text-xs text-charcoal-500">{r.user} · {db.rolePerms[r.id].length} permissions</span></span>
              </button>))}
          </div>
        </div>)}
    </div>
  );
}

function ClockBox() {
  const { db, advanceClock, can } = useStore();
  return (
    <div className="hidden items-center gap-2 rounded-lg border border-charcoal-200 bg-white px-3 py-1.5 text-xs md:flex" title="The demo uses a controllable simulated clock so scenarios (delays, tee times) are reproducible.">
      <Clock className="h-4 w-4 text-forest" />
      <div className="whitespace-nowrap leading-tight"><div className="font-semibold text-forest">{fmtDate(dateOf(db.meta.now))}</div><div className="text-charcoal-500">Demo clock {fmt12(timeOf(db.meta.now))} · PHT</div></div>
      {can("view.admin") || true ? <div className="ml-1 flex gap-1"><button onClick={() => advanceClock(10)} className="rounded bg-forest-50 px-1.5 py-0.5 font-medium text-forest hover:bg-forest-100">+10m</button><button onClick={() => advanceClock(60)} className="rounded bg-forest-50 px-1.5 py-0.5 font-medium text-forest hover:bg-forest-100">+1h</button></div> : null}
    </div>
  );
}

function ProfileMenu() {
  const { resetDemo, persistError } = useStore(); const [confirm, setConfirm] = useState(false);
  return (<>
    <Button variant="outline" size="icon" aria-label="Reset demo data" title="Reset demo data" className="h-10 w-10" onClick={() => setConfirm(true)}><RotateCcw className="h-4 w-4" /></Button>
    <Modal open={confirm} onClose={() => setConfirm(false)} title="Reset demo data?" size="sm" footer={<><Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={() => { resetDemo(); setConfirm(false); }}>Reset to original demo</Button></>}>
      <p className="text-sm text-charcoal-600">All changes you made in this browser (bookings, payments, assignments, settings…) will be discarded and the original seeded demonstration data restored, with the clock reset to 9:00 AM today.</p>
      {persistError && <p className="mt-2 text-sm text-[#8C3025]">{persistError}</p>}
    </Modal>
  </>);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { can, session, db, persistError } = useStore(); const path = usePathname(); const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  const nav = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  const allowed = session.role !== "member" && (!nav || can(nav.perm));
  return (
    <div className="flex min-h-screen">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 border-b border-charcoal-100 bg-ivory/95 backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6">
            <button className="grid h-10 w-10 place-items-center rounded-lg border border-charcoal-200 bg-white lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg border border-charcoal-200 bg-white px-3 py-1.5 text-xs xl:flex" title="Weather integration is a placeholder — no live data."><CloudSun className="h-4 w-4 text-gold-600" /><div className="whitespace-nowrap leading-tight"><div className="font-semibold text-forest">29°C · Partly cloudy</div><div className="text-charcoal-400">Weather placeholder</div></div></div>
              <ClockBox />
              <button className="hidden h-10 items-center gap-2 rounded-lg border border-charcoal-200 bg-white px-3 text-xs lg:flex" disabled title="Multi-club selection is a future SaaS feature (tenant-isolated)."><Building2 className="h-4 w-4 text-forest" /><span className="max-w-[9rem] truncate font-medium">{db.settings.club.shortName}</span><span className="rounded bg-charcoal-100 px-1 text-[10px] text-charcoal-500">1 club</span></button>
              <Notifications /><ProfileMenu /><RoleSwitcher />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 bg-gold px-4 py-1 text-[11px] font-medium text-white sm:px-6"><span className="flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" /><b className="tracking-wider">DEMO DATA</b> — fictional club, fictional golfers. {roleLabel(session.role)} view.</span>{persistError && <span className="rounded bg-[#A63D2F] px-2 py-0.5">{persistError}</span>}</div>
        </header>
        <main className="flex-1 px-3 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1500px]">
            {session.role === "member" ? <MemberRedirect /> : allowed ? <Suspense fallback={<div className="p-10 text-center text-charcoal-500">Loading…</div>}>{children}</Suspense> : <Denied perm={nav?.perm} what={nav?.label} />}
          </div>
        </main>
      </div>
    </div>
  );
}
function MemberRedirect() {
  const router = useRouter(); useEffect(() => { router.replace("/portal"); }, [router]);
  return <div className="p-10 text-center text-charcoal-500">Opening the Member / Golfer Portal…</div>;
}
