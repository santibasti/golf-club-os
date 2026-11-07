"use client";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, ChevronsLeft, ChevronsRight, Clock, CloudSun, CornerDownLeft, FlaskConical, Menu, RotateCcw, Search, ShieldAlert, X, Smartphone, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { NAV, ROLES, roleLabel } from "@/lib/permissions";
import type { RoleId } from "@/lib/types";
import { Avatar, Button, Denied, Icon, Modal, Skeleton, cn } from "./ui";
import { computeAlerts } from "@/lib/services/alerts";
import { fmt12, fmtDate, timeOf, dateOf, fmtShort } from "@/lib/time";

function useOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb(); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [ref, cb]);
}

const GROUPS: { label: string; hrefs: string[] }[] = [
  { label: "Overview", hrefs: ["/", "/golf-operations"] },
  { label: "Play & course", hrefs: ["/reservations", "/check-in", "/caddies", "/carts", "/course-map", "/maintenance"] },
  { label: "Revenue centres", hrefs: ["/membership", "/range", "/pos", "/events"] },
  { label: "Back office", hrefs: ["/finance", "/inventory", "/reports", "/admin"] },
];

function Sidebar({ open, onClose, collapsed, onToggle }: { open: boolean; onClose: () => void; collapsed: boolean; onToggle: () => void }) {
  const { can, db, session } = useStore(); const path = usePathname(); const role = ROLES.find((r) => r.id === session.role)!;
  const items = NAV.filter((n) => can(n.perm)); const slim = collapsed && !open;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 animate-fade bg-forest-950/55 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-40 flex flex-col bg-gradient-to-b from-forest-900 to-forest-950 text-ivory shadow-pop transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-screen lg:shadow-none", slim ? "lg:w-[76px]" : "lg:w-72", "w-72", open ? "translate-x-0" : "-translate-x-full lg:translate-x-0")}>
        <div className={cn("flex items-center gap-3 border-b border-white/10 py-5", slim ? "justify-center px-3" : "px-5")}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-forest-950 shadow-[0_4px_14px_rgba(184,151,90,.4)]"><svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21V3l9 4-9 4" /><circle cx="8" cy="21" r="1.2" fill="currentColor" /><path d="M14 20c1.5.3 3 .6 5 .6" /></svg></span>
          {!slim && <div className="min-w-0"><p className="font-display text-[17px] font-semibold leading-tight tracking-[.12em]">GOLF CLUB OS</p><p className="truncate text-[11px] text-gold-300/90">{db.settings.club.shortName}</p></div>}
          <button className="ml-auto rounded-lg p-1.5 hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
          {GROUPS.map((g) => { const its = items.filter((n) => g.hrefs.includes(n.href)); if (!its.length) return null; return (
            <div key={g.label} className="mb-4">
              {!slim ? <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-ivory/40">{g.label}</p> : <div className="mx-3 mb-2 border-t border-white/10" />}
              {its.map((n) => { const active = n.href === "/" ? path === "/" : path.startsWith(n.href); return (
                <Link key={n.href} href={n.href} onClick={onClose} title={slim ? n.label : undefined} aria-current={active ? "page" : undefined} className={cn("group relative mb-0.5 flex items-center gap-3 rounded-xl py-2.5 text-[13.5px] transition-all", slim ? "justify-center px-0" : "px-3", active ? "bg-white/[.09] font-medium text-white" : "text-ivory/70 hover:bg-white/[.05] hover:text-white")}>
                  {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gold" />}
                  <Icon name={n.icon} className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-gold-300" : "text-ivory/60 group-hover:text-gold-300")} />{!slim && <span className="truncate">{n.label}</span>}
                </Link>); })}
            </div>); })}
          <div className="border-t border-white/10 pt-3"><Link href="/portal" onClick={onClose} title={slim ? "Golfer / Member Portal" : undefined} className={cn("flex items-center gap-3 rounded-xl py-2.5 text-[13.5px] text-ivory/70 hover:bg-white/[.05] hover:text-white", slim ? "justify-center" : "px-3")}><Smartphone className="h-[18px] w-[18px] shrink-0 text-ivory/60" />{!slim && "Golfer / Member Portal"}</Link></div>
        </nav>
        <div className="border-t border-white/10 p-3">
          {!slim ? <div className="flex items-center gap-3 rounded-xl bg-white/[.06] p-2.5"><Avatar name={role.user} seed={ROLES.indexOf(role)} size={34} /><div className="min-w-0 flex-1 leading-tight"><p className="truncate text-[13px] font-medium">{role.user}</p><p className="truncate text-[11px] text-ivory/50">{role.short}</p></div></div> : <div className="flex justify-center"><Avatar name={role.user} seed={ROLES.indexOf(role)} size={34} /></div>}
          <button onClick={onToggle} className="mt-2 hidden w-full items-center justify-center gap-2 rounded-lg py-1.5 text-[11px] text-ivory/45 hover:bg-white/[.06] hover:text-ivory lg:flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />Collapse</>}</button>
          {!slim && <p className="mt-2 px-1 text-[10.5px] leading-snug text-ivory/40"><FlaskConical className="mr-1 inline h-3 w-3 text-gold-300/80" />Demo build · fictional data stored in this browser only.</p>}
        </div>
      </aside>
    </>
  );
}

/* ----------------------------- command palette ----------------------------- */
type Hit = { kind: string; label: string; sub?: string; href: string; icon?: string };
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, can } = useStore(); const router = useRouter(); const [q, setQ] = useState(""); const [idx, setIdx] = useState(0); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase(); const out: Hit[] = [];
    const pages = NAV.filter((n) => can(n.perm) && (!s || n.label.toLowerCase().includes(s)));
    const actions: Hit[] = [
      { kind: "Action", label: "New tee-time reservation", href: "/reservations?new=1", icon: "CalendarPlus" }, { kind: "Action", label: "Open check-in & starter", href: "/check-in", icon: "ClipboardCheck" },
      { kind: "Action", label: "Start a driving-range tab", href: "/range", icon: "Target" }, { kind: "Action", label: "Open a café tab", href: "/pos", icon: "Coffee" }, { kind: "Action", label: "Record a payment", href: "/finance", icon: "Wallet" },
    ].filter((a) => (!s || a.label.toLowerCase().includes(s)) && NAV.some((n) => a.href.startsWith(n.href) && n.href !== "/" && can(n.perm)));
    if (!s) { out.push(...actions.slice(0, 4)); out.push(...pages.map((n) => ({ kind: "Go to", label: n.label, href: n.href, icon: n.icon }))); return out; }
    out.push(...actions, ...pages.map((n) => ({ kind: "Go to", label: n.label, href: n.href, icon: n.icon })));
    if (s.length >= 2) {
      for (const m of db.members) { const c = db.customers.find((x) => x.id === m.customerId); if (c && (c.name.toLowerCase().includes(s) || m.id.toLowerCase() === s || c.phone.includes(s))) out.push({ kind: "Member", label: c.name, sub: `${m.id} · ${m.status.replace("_", " ")}`, href: `/membership?member=${m.id}`, icon: "IdCard" }); }
      for (const b of db.bookings) if (b.ref.toLowerCase().includes(s) || b.contactName.toLowerCase().includes(s)) out.push({ kind: "Booking", label: `${b.ref} · ${b.contactName}`, sub: `${fmtShort(b.date)} ${fmt12(b.time)} · ${b.status.replace("_", " ")}`, href: `/reservations?date=${b.date}&booking=${b.id}`, icon: "CalendarDays" });
      for (const c of db.caddies) if (c.name.toLowerCase().includes(s) || c.id.toLowerCase() === s) out.push({ kind: "Caddie", label: c.name, sub: `${c.id} · ${c.status.replace("_", " ")}`, href: `/caddies?caddie=${c.id}`, icon: "Users" });
      for (const c of db.customers) if (!c.memberId && c.name.toLowerCase().includes(s)) out.push({ kind: "Golfer", label: c.name, sub: `${c.id} · public golfer`, href: `/membership?tab=customers&q=${encodeURIComponent(c.name)}`, icon: "User" });
    }
    return out.slice(0, 12);
  }, [q, db, can]);
  useEffect(() => setIdx(0), [q]);
  const go = (h?: Hit) => { if (!h) return; onClose(); router.push(h.href); };
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); } else if (e.key === "Enter") go(hits[idx]); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex animate-fade items-start justify-center bg-forest-950/55 p-3 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Command palette" className="w-full max-w-xl animate-sheet overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4"><Search className="h-4 w-4 text-charcoal-400" /><input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members, bookings, caddies — or jump to a page…" className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-charcoal-300" aria-label="Search" /><kbd className="rounded-md border border-line bg-ivory-100 px-1.5 py-0.5 text-[10px] font-medium text-charcoal-500">ESC</kbd></div>
        <div className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
          {hits.length === 0 ? <p className="p-6 text-center text-sm text-charcoal-500">No matches for “{q}”.</p> : hits.map((h, i) => (
            <button key={h.kind + h.href + i} onMouseEnter={() => setIdx(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", i === idx ? "bg-forest-50" : "hover:bg-ivory-50")}>
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", i === idx ? "bg-forest text-gold-300" : "bg-charcoal-100/70 text-charcoal-500")}><Icon name={h.icon ?? "Circle"} className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-charcoal">{h.label}</span>{h.sub && <span className="block truncate text-xs text-charcoal-500">{h.sub}</span>}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-charcoal-400">{h.kind}</span>{i === idx && <CornerDownLeft className="h-3.5 w-3.5 text-charcoal-400" />}
            </button>))}
        </div>
        <div className="flex items-center gap-4 border-t border-line bg-ivory-50 px-4 py-2 text-[11px] text-charcoal-500"><span>↑↓ navigate</span><span>↵ open</span><span className="ml-auto">⌘K / Ctrl K anywhere</span></div>
      </div>
    </div>
  );
}

function Notifications() {
  const { db } = useStore(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); useOutside(ref, () => setOpen(false));
  const alerts = useMemo(() => computeAlerts(db), [db]); const crit = alerts.filter((a) => a.level !== "info").length;
  return (
    <div ref={ref} className="relative">
      <button aria-label={`Notifications (${alerts.length})`} onClick={() => setOpen((o) => !o)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-charcoal-600 shadow-sm transition-colors hover:bg-ivory-50"><Bell className="h-[18px] w-[18px]" />{alerts.length > 0 && <span className={cn("absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-ivory", crit ? "bg-[#B4473A]" : "bg-gold")}>{alerts.length}</span>}</button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[23rem] max-w-[calc(100vw-1.5rem)] animate-sheet overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><span className="text-sm font-semibold text-forest">Operational alerts</span><span className="text-[11px] text-charcoal-400">derived live from data</span></div>
          <div className="scroll-thin max-h-[26rem] overflow-y-auto">
            {alerts.length === 0 ? <p className="p-5 text-sm text-charcoal-500">All clear.</p> : alerts.map((a) => (
              <Link key={a.id} href={a.href} onClick={() => setOpen(false)} className="flex gap-3 border-b border-line/60 px-4 py-3 last:border-0 hover:bg-ivory-50">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.level === "critical" ? "bg-[#B4473A]" : a.level === "warning" ? "bg-[#D98E04]" : "bg-[#5B8DB0]")} />
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
  const pick = (r: RoleId) => { setRole(r); setOpen(false); router.push(ROLES.find((x) => x.id === r)!.home); };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2 rounded-xl border border-gold-300/70 bg-gradient-to-b from-gold-50 to-white pl-1.5 pr-2.5 text-left shadow-sm transition-colors hover:border-gold-300" aria-haspopup="listbox" aria-label="Demo role switcher">
        <Avatar name={role.user} seed={ROLES.indexOf(role)} size={28} />
        <span className="hidden leading-tight md:block"><span className="block text-[9.5px] font-bold uppercase tracking-[.14em] text-gold-700">Demo role</span><span className="block max-w-[9rem] truncate text-xs font-semibold text-forest">{role.short}</span></span>
        <ChevronDown className="h-4 w-4 text-gold-700" />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 top-12 z-40 w-80 max-w-[calc(100vw-1.5rem)] animate-sheet overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
          <div className="border-b border-gold-300/40 bg-gold-50 px-4 py-2.5 text-xs text-gold-700"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" />Demo role switching — no passwords. Not authentication.</div>
          <div className="scroll-thin max-h-[26rem] overflow-y-auto p-1.5">
            {ROLES.map((r, i) => (
              <button key={r.id} role="option" aria-selected={r.id === session.role} onClick={() => pick(r.id)} className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ivory-50", r.id === session.role && "bg-forest-50")}>
                <Avatar name={r.user} seed={i} size={30} /><span className="min-w-0"><span className="block text-sm font-medium">{r.label}</span><span className="block text-xs text-charcoal-500">{r.user} · {db.rolePerms[r.id].length} permissions</span></span>
              </button>))}
          </div>
        </div>)}
    </div>
  );
}

function ClockPill() {
  const { db, advanceClock } = useStore(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null); useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative hidden md:block">
      <button onClick={() => setOpen((o) => !o)} className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-white px-3 text-left shadow-sm transition-colors hover:bg-ivory-50" aria-label="Demo clock" title="Demo clock — controllable so scenarios are reproducible">
        <Clock className="h-4 w-4 text-forest" /><span className="leading-tight"><span className="block whitespace-nowrap text-xs font-semibold text-forest">{fmtShort(dateOf(db.meta.now))} · {fmt12(timeOf(db.meta.now))}</span><span className="block whitespace-nowrap text-[10px] text-charcoal-400">Demo clock · PHT</span></span>
        <span className="hidden items-center gap-1 border-l border-line pl-2.5 text-xs text-charcoal-500 xl:flex"><CloudSun className="h-4 w-4 text-gold-600" />29°C</span>
      </button>
      {open && <div className="absolute right-0 top-12 z-40 w-64 animate-sheet rounded-2xl border border-line bg-white p-3 shadow-pop"><p className="text-xs font-semibold text-forest">{fmtDate(dateOf(db.meta.now))}</p><p className="mb-3 text-[11px] text-charcoal-500">The demo uses a simulated clock so delays, arrivals and tee times are reproducible. Weather is a placeholder (29°C, partly cloudy).</p>
        <div className="grid grid-cols-3 gap-1.5">{[[10, "+10 min"], [60, "+1 hour"], [180, "+3 hours"]].map(([m, l]) => <button key={String(m)} onClick={() => advanceClock(Number(m))} className="rounded-lg bg-forest-50 py-2 text-xs font-semibold text-forest hover:bg-forest-100">{l}</button>)}</div></div>}
    </div>
  );
}

function ResetButton() {
  const { resetDemo, persistError } = useStore(); const [confirm, setConfirm] = useState(false);
  return (<>
    <button aria-label="Reset demo data" title="Reset demo data" onClick={() => setConfirm(true)} className="hidden h-10 w-10 place-items-center rounded-xl border border-line bg-white text-charcoal-600 shadow-sm transition-colors hover:bg-ivory-50 sm:grid"><RotateCcw className="h-4 w-4" /></button>
    <Modal open={confirm} onClose={() => setConfirm(false)} title="Reset demo data?" size="sm" footer={<><Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" onClick={() => { resetDemo(); setConfirm(false); }}>Reset to original demo</Button></>}>
      <p className="text-sm leading-relaxed text-charcoal-600">All changes you made in this browser (bookings, payments, assignments, settings…) will be discarded and the original seeded demonstration data restored, with the clock reset to 9:00 AM today.</p>
      {persistError && <p className="mt-2 text-sm text-[#8C3025]">{persistError}</p>}
    </Modal>
  </>);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { can, session, db, persistError } = useStore(); const path = usePathname(); const [menu, setMenu] = useState(false); const [cmd, setCmd] = useState(false); const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("gcos.sidebar") === "1"); } catch { /* ignore */ } }, []);
  const toggle = useCallback(() => setCollapsed((c) => { try { localStorage.setItem("gcos.sidebar", c ? "0" : "1"); } catch { /* ignore */ } return !c; }), []);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((o) => !o); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const nav = NAV.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  const allowed = session.role !== "member" && (!nav || can(nav.perm));
  return (
    <div className="flex min-h-screen">
      <Sidebar open={menu} onClose={() => setMenu(false)} collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 border-b border-line/80 bg-ivory/85 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-6">
            <button className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-white shadow-sm lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <div className="hidden min-w-0 shrink-0 lg:block"><p className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-charcoal-400">{db.settings.club.shortName}</p><p className="truncate text-sm font-semibold text-forest">{nav?.label ?? "Golf Club OS"}</p></div>
            <button onClick={() => setCmd(true)} className="group ml-0 flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 text-left shadow-sm transition-colors hover:border-charcoal-300 lg:ml-6 lg:max-w-md" aria-label="Search or jump to…">
              <Search className="h-4 w-4 shrink-0 text-charcoal-400" /><span className="truncate text-sm text-charcoal-400">Search or jump to…</span><kbd className="ml-auto hidden shrink-0 rounded-md border border-line bg-ivory-100 px-1.5 py-0.5 text-[10px] font-medium text-charcoal-500 sm:block">⌘K</kbd>
            </button>
            <div className="ml-auto flex shrink-0 items-center gap-2"><ClockPill /><Notifications /><ResetButton /><RoleSwitcher /></div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-gold-300/30 bg-gradient-to-r from-gold-50 via-gold-50/60 to-transparent px-4 py-1 text-[11px] text-gold-700 sm:px-6"><span className="flex items-center gap-1.5 truncate"><FlaskConical className="h-3.5 w-3.5 shrink-0" /><b className="tracking-wider">DEMO DATA</b><span className="truncate text-gold-700/80">fictional club & golfers · {roleLabel(session.role)} view</span></span>{persistError && <span className="shrink-0 rounded bg-[#B4473A] px-2 py-0.5 text-white">{persistError}</span>}</div>
        </header>
        <main className="flex-1 px-3 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1500px]">
            {session.role === "member" ? <MemberRedirect /> : allowed ? <Suspense fallback={<PageSkeleton />}>{children}</Suspense> : <Denied perm={nav?.perm} what={nav?.label} />}
          </div>
        </main>
      </div>
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
    </div>
  );
}
function PageSkeleton() { return <div className="space-y-4"><Skeleton className="h-12 w-72" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-72" /></div>; }
function MemberRedirect() {
  const router = useRouter(); useEffect(() => { router.replace("/portal"); }, [router]);
  return <div className="p-10 text-center text-charcoal-500">Opening the Member / Golfer Portal…</div>;
}
void Plus;
