"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarPlus, ClipboardCheck, Coffee, Users, Wallet, Wrench, AlertTriangle, Flag } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, DemoBadge, Empty, Kpi, PageHeader, StatusBadge, DataTable } from "@/components/ui";
import { Chart } from "@/components/charts";
import { computeAlerts } from "@/lib/services/alerts";
import { DEPTS, caddieCounts, caddieUtilization, cartCounts, dailyRevenueSeries, financeTotals, maintenanceStats, memberReceivables, monthlyComparison, playerMix, revenueByDept, roundsBooked, roundsStarted, totalRevenue, utilization, utilizationByHour } from "@/lib/services/metrics";
import { addDays, dateRange, fmt12, fmtDate, fmtMonth, fmtShort } from "@/lib/time";
import { peso, pct } from "@/lib/format";
import { ROLES } from "@/lib/permissions";
import { paceOf } from "@/lib/services/flight";
import { memberBalance } from "@/lib/services/finance";
import type { Booking, RoleId } from "@/lib/types";

const EXEC: RoleId[] = ["system_admin", "owner", "gm", "golf_ops"];

export default function DashboardPage() {
  const { session } = useStore();
  return EXEC.includes(session.role) ? <ExecDashboard /> : <RoleWorkspace />;
}

function QuickActions({ items }: { items: { href: string; label: string; icon: React.ReactNode }[] }) {
  return <div className="mb-6 flex flex-wrap gap-2">{items.map((q) => <Link key={q.href + q.label} href={q.href}><Button variant="outline" size="sm" className="bg-white">{q.icon}{q.label}</Button></Link>)}</div>;
}
const QA_ICON = "h-4 w-4 text-gold-300";
const QA = [
  { href: "/reservations?new=1", label: "New tee time", icon: <CalendarPlus className={QA_ICON} /> },
  { href: "/check-in", label: "Check-in", icon: <ClipboardCheck className={QA_ICON} /> },
  { href: "/caddies", label: "Caddie rotation", icon: <Users className={QA_ICON} /> },
  { href: "/finance", label: "Record payment", icon: <Wallet className={QA_ICON} /> },
  { href: "/pos", label: "Café POS", icon: <Coffee className={QA_ICON} /> },
  { href: "/maintenance", label: "Work order", icon: <Wrench className={QA_ICON} /> },
];

export function FlightsToday({ date, limit = 12 }: { date: string; limit?: number }) {
  const { db } = useStore();
  const rows = db.bookings.filter((b) => b.date === date && !["cancelled", "no_show"].includes(b.status)).sort((a, b) => a.time.localeCompare(b.time));
  const upcoming = rows.filter((b) => ["started", "ready", "arrived"].includes(b.status) || b.time >= db.meta.now.slice(11, 16)).slice(0, limit);
  return (
    <Card>
      <CardHeader title="Flights on the course & next up" sub="Live from the tee sheet" action={<Link href="/reservations" className="text-xs font-medium text-emerald hover:underline">Open tee sheet →</Link>} />
      <DataTable rows={upcoming} rowKey={(b: Booking) => b.id} empty={<Empty icon="Flag" title="No flights" text="No active or upcoming flights today." />} dense columns={[
        { key: "t", header: "Tee", render: (b) => <b>{fmt12(b.time)}</b> },
        { key: "n", header: "Booking", render: (b) => <span>{b.contactName}<span className="ml-2 text-xs text-charcoal-400">{b.ref}</span></span> },
        { key: "p", header: "Players", render: (b) => `${b.players.length} · ${b.players.filter((p) => p.type === "member").length}M/${b.players.filter((p) => p.type === "guest").length}G/${b.players.filter((p) => p.type === "public").length}P`, className: "text-xs" },
        { key: "s", header: "Status", render: (b) => <StatusBadge status={b.status} /> },
        { key: "pc", header: "Pace", render: (b) => { const p = paceOf(db, b); return p.status === "not_started" ? <span className="text-xs text-charcoal-400">—</span> : <StatusBadge status={p.status === "delayed" ? "delayed" : p.status} label={p.status === "behind" ? `+${p.behindMin}m behind` : p.status === "delayed" ? `Late ${p.lateStartMin}m` : undefined} />; } },
      ]} />
    </Card>
  );
}


function Hero({ today, fin, booked, started, util, alerts }: { today: string; fin: { netRevenue: number; cashCollected: number }; booked: number; started: number; util: { used: number; slots: number; pct: number; closed: number }; alerts: { level: string }[] }) {
  const { db, session } = useStore(); const role = ROLES.find((r) => r.id === session.role)!; const h = Number(db.meta.now.slice(11, 13)); const hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const crit = alerts.filter((a) => a.level === "critical").length; const warn = alerts.filter((a) => a.level === "warning").length;
  const stats = [
    { label: "Today's revenue", value: peso(fin.netRevenue), sub: `Cash collected ${peso(fin.cashCollected)}`, href: "/finance" },
    { label: "Rounds booked", value: String(booked), sub: `${started} started · ${booked ? pct(started / booked) : "0%"} of booked`, href: "/reservations" },
    { label: "Tee-sheet utilization", value: pct(util.pct), sub: `${util.used}/${util.slots} slots · ${util.closed} blocked`, href: "/reservations" },
    { label: "Needs attention", value: String(alerts.length), sub: `${crit} critical · ${warn} warning`, href: "/golf-operations" },
  ];
  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-forest-800 via-forest-900 to-forest-950 p-6 text-white shadow-lift sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-gold/15 blur-3xl" /><div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-emerald/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-gold-300">{fmtDate(today)}</p><h1 className="mt-1.5 text-[1.7rem] font-semibold leading-tight sm:text-[2.1rem]">{hello}, {role.user.replace(/^(Atty\.|Engr\.)\s*/, "").split(" ")[0]}</h1><p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">Executive dashboard · live from shared transactions <DemoBadge /></p></div>
        <div className="hidden flex-wrap gap-2 md:flex">{QA.map((q) => <Link key={q.href + q.label} href={q.href} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/10 px-3 text-[13px] font-medium text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/20">{q.icon}{q.label}</Link>)}</div>
      </div>
      <div className="relative mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/10 lg:grid-cols-4">
        {stats.map((x) => <Link key={x.label} href={x.href} className="group bg-forest-950/40 p-4 transition-colors hover:bg-forest-950/20 sm:p-5"><p className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-white/55">{x.label}</p><p className="mt-1.5 font-display text-[1.7rem] font-semibold leading-none tabular-nums sm:text-[2.1rem]">{x.value}</p><p className="mt-1.5 text-xs text-white/60 group-hover:text-white/80">{x.sub}</p></Link>)}
      </div>
    </section>
  );
}

function ExecDashboard() {
  const { db } = useStore(); const t = db.meta.today; const today = db.meta.now.slice(0, 10); void t;
  const d = useMemo(() => {
    const r1 = { from: today, to: today }; const r14 = { from: addDays(today, -13), to: today }; const month = { from: today.slice(0, 8) + "01", to: today };
    const fin = financeTotals(db, r1); const mix = playerMix(db, r1); const cc = caddieCounts(db); const carts = cartCounts(db); const ms = maintenanceStats(db, today); const u = utilization(db, today);
    const memBal = memberReceivables(db); const owing = db.members.filter((m) => memberBalance(db, m.id) > 0).length;
    const deptMonth = revenueByDept(db, month);
    return {
      fin, mix, cc, carts, ms, u, memBal, owing, alerts: computeAlerts(db), booked: roundsBooked(db, r1), started: roundsStarted(db, r1),
      trend: dailyRevenueSeries(db, r14).map((x) => ({ date: fmtShort(x.date), Revenue: x.revenue, "Cash collected": x.cash })), monthly: monthlyComparison(db, today).map((m, i, a) => ({ month: fmtMonth(m.month + "-01") + (i === a.length - 1 ? " (MTD)" : ""), Revenue: m.revenue })),
      mixTrend: dateRange(r14.from, r14.to).map((dd) => { const m = playerMix(db, { from: dd, to: dd }); return { date: fmtShort(dd), Members: m.member, Guests: m.guest, Public: m.public }; }),
      dept: DEPTS.map((x) => ({ name: x.label, value: deptMonth[x.id] })).filter((x) => x.value > 0), deptToday: revenueByDept(db, r1),
      hours: utilizationByHour(db, r1).map((h) => ({ hour: h.hour, Utilization: h.utilization })), caddieUtil: caddieUtilization(db, today).sort((a, b) => b.rounds - a.rounds).slice(0, 14).map((c) => ({ name: c.name.split(" ")[0], Rounds: c.rounds })),
      upcomingEv: db.events.filter((e) => e.date >= today && e.status !== "cancelled" && e.type !== "social").sort((a, b) => a.date.localeCompare(b.date)),
    };
  }, [db, today]);
  const topDept = Object.entries(d.deptToday).sort((a, b) => b[1] - a[1])[0];
  return (
    <>
      <Hero today={today} fin={d.fin} booked={d.booked} started={d.started} util={d.u} alerts={d.alerts} />
      <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[.16em] text-charcoal-500">Operations at a glance</h2>
      <section aria-label="Key indicators" className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <Kpi icon="Users" label="Member vs public" value={`${d.mix.member + d.mix.guest} / ${d.mix.public}`} sub={`${d.mix.member} members · ${d.mix.guest} guests · ${d.mix.public} public`} />
        <Kpi icon="PieChart" label="Top department today" value={topDept ? peso(topDept[1]) : "—"} sub={topDept ? DEPTS.find((x) => x.id === topDept[0])?.label : ""} />
        <Kpi icon="UserCheck" label="Caddies on duty" value={d.cc.present} sub={`${d.cc.available} available`} href="/caddies" />
        <Kpi icon="Route" label="Caddies assigned / on course" value={`${d.cc.assigned} / ${d.cc.onCourse}`} sub="reserved-or-assigned / playing" href="/caddies" />
        <Kpi icon="Car" label="Carts available" value={`${d.carts.available}/30`} sub={`${d.carts.inUse} in use · ${d.carts.maintenance} in maintenance`} href="/carts" tone={d.carts.maintenance > 2 ? "red" : "neutral"} />
        <Kpi icon="Wrench" label="Maintenance completion" value={pct(d.ms.rate)} sub={`${d.ms.open} open · ${d.ms.urgent} urgent`} href="/maintenance" tone={d.ms.urgent ? "red" : "neutral"} />
        <Kpi icon="HandCoins" label="Outstanding member balances" value={peso(d.memBal)} sub={`${d.owing} member accounts`} href="/finance?tab=receivables" tone="gold" />
        <Kpi icon="Trophy" label="Upcoming tournaments" value={d.upcomingEv.length} sub={d.upcomingEv[0] ? `Next: ${d.upcomingEv[0].name.slice(0, 22)} · ${fmtShort(d.upcomingEv[0].date)}` : "None scheduled"} href="/events" />
        <Kpi icon="Receipt" label="Discounts today" value={peso(d.fin.discounts)} sub={`Refunds ${peso(d.fin.refunds)}`} />
        <Kpi icon="Handshake" label="Caddie payables (not revenue)" value={peso(d.fin.payables)} sub="owed to contractor caddies" href="/caddies" />
        <Kpi icon="Hourglass" label="Open range & café tabs" value={db.rangeTabs.filter((t) => t.status === "open").length + db.cafeTabs.filter((t) => t.status === "open").length} sub="unbilled running tabs" href="/range" />
        <Kpi icon="BellRing" label="Operational alerts" value={d.alerts.length} sub={`${d.alerts.filter((a) => a.level === "critical").length} critical · ${d.alerts.filter((a) => a.level === "warning").length} warning`} tone={d.alerts.some((a) => a.level === "critical") ? "red" : "gold"} />
      </section>
      <h2 className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[.16em] text-charcoal-500">Performance</h2>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Daily revenue trend" sub="Net revenue (accrual) vs cash collected · last 14 days" /><div className="p-4"><Chart type="area" data={d.trend} xKey="date" series={[{ key: "Revenue", label: "Net revenue" }, { key: "Cash collected", label: "Cash collected" }]} money /></div></Card>
        <Card><CardHeader title="Revenue by department" sub="Month to date" /><div className="p-4"><Chart type="pie" data={d.dept} xKey="name" series={[{ key: "value", label: "Revenue" }]} money height={270} /></div></Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card><CardHeader title="Monthly revenue comparison" sub="Earlier months are imported summaries; current months are live" /><div className="p-4"><Chart type="bar" data={d.monthly} xKey="month" series={[{ key: "Revenue", label: "Revenue" }]} money /></div></Card>
        <Card><CardHeader title="Member vs public golfer volume" sub="Players per day · last 14 days" /><div className="p-4"><Chart type="bar" stacked data={d.mixTrend} xKey="date" series={[{ key: "Members", label: "Members" }, { key: "Guests", label: "Guests" }, { key: "Public", label: "Public" }]} /></div></Card>
        <Card><CardHeader title="Tee-time utilization by hour" sub="Today · occupied vs open slots" /><div className="p-4"><Chart type="bar" data={d.hours} xKey="hour" series={[{ key: "Utilization", label: "Utilization" }]} percent /></div></Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card><CardHeader title="Caddie utilization" sub="Rounds per caddie today" /><div className="p-4"><Chart type="bar" data={d.caddieUtil} xKey="name" series={[{ key: "Rounds", label: "Rounds" }]} /></div></Card>
        <Card><CardHeader title="Maintenance completion trend" sub="Work orders opened vs completed · 14 days" /><div className="p-4"><Chart type="line" data={d.ms.trend.map((x) => ({ date: fmtShort(x.date), Completed: x.completed, Opened: x.opened }))} xKey="date" series={[{ key: "Completed", label: "Completed" }, { key: "Opened", label: "Opened" }]} /></div></Card>
        <Card>
          <CardHeader title="Operational alerts" sub="Derived live — click to act" action={<Badge tone="gold">{d.alerts.length}</Badge>} />
          <div className="scroll-thin max-h-[300px] overflow-y-auto">
            {d.alerts.length === 0 ? <Empty icon="CheckCircle2" title="All clear" /> : d.alerts.map((a) => (
              <Link key={a.id} href={a.href} className="flex items-start gap-3 border-b border-charcoal-100/70 px-5 py-2.5 last:border-0 hover:bg-ivory-50">
                <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${a.level === "critical" ? "text-[#A63D2F]" : a.level === "warning" ? "text-[#D98E04]" : "text-[#5B8DB0]"}`} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium leading-snug">{a.title}</span><span className="block truncate text-xs text-charcoal-500">{a.type} · {a.detail}</span></span><ArrowRight className="mt-1 h-3.5 w-3.5 text-charcoal-300" />
              </Link>))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><FlightsToday date={today} /></div>
        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming events" action={<Link href="/events" className="text-xs font-medium text-emerald hover:underline">All events →</Link>} />
          {db.events.filter((e) => e.date >= today && e.status !== "cancelled").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5).map((e) => (
            <div key={e.id} className="flex items-center gap-3 border-b border-charcoal-100/70 px-5 py-3 last:border-0">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-forest text-center text-gold-300"><div className="leading-none"><div className="text-[10px] uppercase">{fmtShort(e.date).split(" ")[0]}</div><div className="font-display text-lg font-semibold">{fmtShort(e.date).split(" ")[1]}</div></div></div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{e.name}</p><p className="text-xs text-charcoal-500">{fmt12(e.start)} · {e.registrations.filter((r) => r.status === "registered").length}/{e.expected} registered</p></div><Badge tone={e.type === "tournament" ? "gold" : "neutral"}>{e.type}</Badge>
            </div>))}
        </Card>
      </div>
    </>
  );
}

/* ----------------------------- role workspaces ---------------------------- */
function RoleWorkspace() {
  const { db, session } = useStore(); const role = ROLES.find((r) => r.id === session.role)!; const today = db.meta.now.slice(0, 10);
  const d = useMemo(() => {
    const fin = financeTotals(db, { from: today, to: today }); const cc = caddieCounts(db); const carts = cartCounts(db); const ms = maintenanceStats(db, today);
    const flights = db.bookings.filter((b) => b.date === today);
    return { fin, cc, carts, ms, alerts: computeAlerts(db), flights, queue: db.caddies.filter((c) => c.status === "available").length, pendingApps: db.members.filter((m) => m.status === "pending_approval" || m.status === "applicant").length, renewals: db.members.filter((m) => m.status === "expired" || (m.status === "active" && m.expiryDate && m.expiryDate <= addDays(today, 30))).length, openWO: db.workOrders.filter((w) => w.status !== "completed"), memBal: memberReceivables(db), openShift: db.shifts.find((s) => s.status === "open"), cafe: db.posOrders.filter((o) => o.date === today && o.fulfil !== "void"), range: db.rangeSales.filter((s) => s.date === today) };
  }, [db, today]);
  const st = (s: Booking["status"]) => d.flights.filter((b) => b.status === s).length;
  type K = React.ComponentProps<typeof Kpi>; const cards: Record<string, K[]> = {
    membership: [{ label: "Pending applications", value: d.pendingApps, icon: "FileClock", href: "/membership?tab=applications" }, { label: "Renewals due ≤30d / lapsed", value: d.renewals, icon: "CalendarClock", href: "/membership?tab=renewals" }, { label: "Active members", value: db.members.filter((m) => m.status === "active").length, icon: "IdCard" }, { label: "Member receivables", value: peso(d.memBal), icon: "HandCoins", href: "/finance?tab=receivables" }],
    reservations: [{ label: "Reservations today", value: d.flights.filter((b) => !["cancelled", "no_show"].includes(b.status)).length, icon: "CalendarDays", href: "/reservations" }, { label: "Awaiting confirmation", value: db.bookings.filter((b) => b.status === "booked").length, icon: "Hourglass", href: "/reservations" }, { label: "Waitlist", value: db.waitlist.filter((w) => w.status === "waiting").length, icon: "ListOrdered" }, { label: "Cancellations today", value: d.flights.filter((b) => b.status === "cancelled").length, icon: "CalendarX" }],
    caddie_master: [{ label: "Caddies present", value: d.cc.present, icon: "UserCheck", href: "/caddies" }, { label: "In rotation queue", value: d.queue, icon: "ListOrdered", href: "/caddies" }, { label: "On course", value: d.cc.onCourse, icon: "Flag" }, { label: "Pending settlements", value: db.caddieSettlements.filter((s) => s.status === "pending").length, icon: "Handshake" }],
    starter: [{ label: "Arrived / waiting", value: st("arrived") + st("ready"), icon: "ClipboardCheck", href: "/check-in?tab=starter" }, { label: "On the course", value: st("started"), icon: "Flag" }, { label: "Completed today", value: st("completed"), icon: "CheckCircle2" }, { label: "Delayed flights", value: d.alerts.filter((a) => a.type === "Delayed flight").length, icon: "TimerOff", tone: "red" }],
    cart_supervisor: [{ label: "Carts available", value: d.carts.available, icon: "Car", href: "/carts" }, { label: "In use", value: d.carts.inUse, icon: "Route" }, { label: "Under maintenance", value: d.carts.maintenance, icon: "Wrench", tone: "red" }, { label: "Awaiting return/inspection", value: d.carts.other, icon: "SearchCheck" }],
    superintendent: [{ label: "Open work orders", value: d.openWO.length, icon: "Wrench", href: "/maintenance" }, { label: "Urgent", value: d.ms.urgent, icon: "Siren", tone: "red" }, { label: "For inspection", value: d.openWO.filter((w) => w.status === "for_inspection").length, icon: "SearchCheck" }, { label: "Active restrictions", value: db.closures.filter((c) => c.active && c.date >= today).length, icon: "OctagonAlert" }],
    maintenance: [{ label: "My team's open orders", value: d.openWO.filter((w) => w.status !== "for_inspection").length, icon: "Wrench", href: "/maintenance" }, { label: "In progress", value: d.openWO.filter((w) => w.status === "in_progress").length, icon: "Hammer" }, { label: "Urgent", value: d.ms.urgent, icon: "Siren", tone: "red" }, { label: "Completed (14d)", value: d.ms.trend.reduce((a, x) => a + x.completed, 0), icon: "CheckCircle2" }],
    cashier: [{ label: "Collected today", value: peso(d.fin.cashCollected), icon: "Banknote", href: "/finance" }, { label: "Shift", value: d.openShift ? "Open" : "Closed", sub: d.openShift ? `Opened ${d.openShift.openedAt.slice(11)}` : "Open a shift to take payments", icon: "Landmark" }, { label: "Receivables", value: peso(db.charges.reduce((a, c) => a + (c.status === "unpaid" || c.status === "partial" ? c.amount - c.discount - c.paid : 0), 0)), icon: "Receipt", href: "/finance?tab=receivables" }, { label: "Refunds today", value: peso(d.fin.refunds), icon: "Undo2" }],
    cafe: [{ label: "Café orders today", value: d.cafe.length, icon: "Coffee", href: "/pos" }, { label: "Café sales today", value: peso(d.cafe.reduce((a, o) => a + o.total, 0)), icon: "Banknote" }, { label: "Range sales today", value: peso(d.range.reduce((a, s) => a + s.amount, 0)), icon: "Target", href: "/range" }, { label: "Low stock items", value: db.inventory.filter((i) => i.active && i.qty <= i.reorder).length, icon: "PackageMinus", tone: "red" }],
    tournament: [{ label: "Upcoming events", value: db.events.filter((e) => e.date >= today && e.status !== "cancelled").length, icon: "Trophy", href: "/events" }, { label: "Registrations (next event)", value: db.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]?.registrations.length ?? 0, icon: "UserPlus" }, { label: "Unpaid registrations", value: db.charges.filter((c) => c.refType === "event_reg" && c.status === "unpaid").length, icon: "Receipt" }, { label: "Tee blocks active", value: db.closures.filter((c) => c.active && c.eventId).length, icon: "CalendarOff" }],
  };
  const mine = cards[session.role] ?? [];
  const mineAlerts = d.alerts.slice(0, 6);
  return (
    <>
      <PageHeader icon="LayoutDashboard" title={`${role.label} workspace`} sub={<span className="flex flex-wrap items-center gap-2">{role.user} · {role.blurb} <DemoBadge /></span>} actions={<Link href={role.home === "/" ? "/golf-operations" : role.home}><Button size="sm">Open main module <ArrowRight className="h-4 w-4" /></Button></Link>} />
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{mine.map((k) => <Kpi key={k.label} {...k} />)}</section>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><FlightsToday date={today} limit={10} /></div>
        <Card className="lg:col-span-2"><CardHeader title="Needs attention" sub="Operational alerts" />
          {mineAlerts.length === 0 ? <Empty icon="CheckCircle2" title="All clear" /> : mineAlerts.map((a) => <Link key={a.id} href={a.href} className="flex items-start gap-3 border-b border-charcoal-100/70 px-5 py-2.5 last:border-0 hover:bg-ivory-50"><Flag className="mt-0.5 h-4 w-4 text-gold-600" /><span><span className="block text-sm font-medium">{a.title}</span><span className="block text-xs text-charcoal-500">{a.detail}</span></span></Link>)}
        </Card>
      </div>
    </>
  );
}
