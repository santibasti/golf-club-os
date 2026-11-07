"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, Kpi, PageHeader, StatusBadge, cn } from "@/components/ui";
import { FlightsToday } from "../page";
import { caddieCounts, cartCounts, roundsBooked, roundsStarted, utilization } from "@/lib/services/metrics";
import { holePlayability } from "@/lib/services/maintenance";
import { computeAlerts } from "@/lib/services/alerts";
import { fmt12 } from "@/lib/time";
import { pct } from "@/lib/format";

export default function GolfOpsPage() {
  const { db } = useStore(); const today = db.meta.now.slice(0, 10); const cc = caddieCounts(db); const carts = cartCounts(db); const u = utilization(db, today); const alerts = computeAlerts(db).filter((a) => ["Delayed flight", "Course restriction", "Booking conflict", "Unavailable carts", "Urgent maintenance"].includes(a.type));
  const flights = db.bookings.filter((b) => b.date === today); const st = (s: string) => flights.filter((b) => b.status === s).length;
  return (
    <>
      <PageHeader icon="Flag" title="Golf Operations" sub="Live command centre across reservations, starter, caddies, carts and the course" />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8"><Kpi label="Booked rounds" value={roundsBooked(db, { from: today, to: today })} icon="CalendarCheck" /><Kpi label="Started" value={roundsStarted(db, { from: today, to: today })} icon="Flag" /><Kpi label="Utilization" value={pct(u.pct)} icon="Gauge" /><Kpi label="Arrived / ready" value={st("arrived") + st("ready")} icon="ClipboardCheck" /><Kpi label="On course" value={st("started")} icon="Route" /><Kpi label="Completed" value={st("completed")} icon="CheckCheck" /><Kpi label="Caddies free" value={`${cc.available}/${cc.present}`} icon="Users" href="/caddies" /><Kpi label="Carts free" value={`${carts.available}/30`} icon="Car" href="/carts" /></div>
      <div className="mb-5 grid gap-4 lg:grid-cols-3"><div className="lg:col-span-2"><FlightsToday date={today} limit={14} /></div>
        <Card><CardHeader title="Course status" sub="Derived from active restrictions" /><div className="grid grid-cols-6 gap-1.5 p-4">{db.holes.map((h) => { const p = holePlayability(db, h.no); return <Link key={h.no} href="/maintenance" title={`Hole ${h.no}: ${p.label}${p.reason ? " — " + p.reason : ""}`} className={cn("grid h-11 place-items-center rounded-lg border text-sm font-semibold", p.label === "Playable" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : p.label === "Closed" ? "border-[#E7B7AE] bg-[#FBEAE7] text-[#9C3326]" : "border-gold-300 bg-gold-50 text-gold-700")}>{h.no}</Link>; })}</div>
          <div className="border-t p-4 text-xs text-charcoal-500">{db.closures.filter((c) => c.active && c.date >= today).map((c) => <p key={c.id} className="mb-1"><Badge tone={c.type === "partial" ? "amber" : "red"}>{c.type}</Badge> {c.date} {fmt12(c.from)}–{fmt12(c.to)} · {c.reason}</p>)}{db.closures.every((c) => !c.active || c.date < today) && "No active restrictions."}</div></Card></div>
      <Card><CardHeader title="Operational exceptions" />{alerts.length === 0 ? <p className="p-5 text-sm text-charcoal-500">No exceptions.</p> : alerts.map((a) => <Link key={a.id} href={a.href} className="flex items-center gap-3 border-b border-charcoal-100/70 px-5 py-2.5 last:border-0 hover:bg-ivory-50"><StatusBadge status={a.level === "critical" ? "urgent" : a.level === "warning" ? "high" : "normal"} label={a.type} /><span className="text-sm">{a.title} <span className="text-charcoal-400">— {a.detail}</span></span></Link>)}</Card>
      <div className="mt-5 flex flex-wrap gap-2">{[["/reservations", "Tee sheet"], ["/check-in", "Check-in & starter"], ["/caddies", "Caddie rotation"], ["/carts", "Cart dispatch"], ["/maintenance", "Course maintenance"]].map(([h, l]) => <Link key={h} href={h}><Button variant="outline" size="sm">{l} →</Button></Link>)}</div>
    </>
  );
}
