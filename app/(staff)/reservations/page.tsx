"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, Ban, Lock, MessageSquare } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, ConfirmButton, DataTable, Empty, Field, Input, KV, Kpi, Modal, Notice, PageHeader, PromptDialog, Select, StatusBadge, Tabs, Textarea, cn } from "@/components/ui";
import { BookingFormDialog, ClosureDialog, RescheduleDialog } from "@/components/booking-dialogs";
import * as Bk from "@/lib/services/booking";
import { addDays, fmt12, fmtDate, fmtTs, toMin } from "@/lib/time";
import { peso, pct } from "@/lib/format";
import { utilization } from "@/lib/services/metrics";
import type { Booking } from "@/lib/types";
import { ROUND_MINUTES } from "@/lib/services/booking";

const STATUS_FILTERS = ["all", "booked", "confirmed", "arrived", "ready", "started", "completed", "cancelled", "no_show"] as const;

export function BookingDetail({ id, onClose, onReschedule, onEdit }: { id: string; onClose: () => void; onReschedule: (b: Booking) => void; onEdit: (b: Booking) => void }) {
  const { db, act, can } = useStore(); const [cancelOpen, setCancelOpen] = useState(false); const b = db.bookings.find((x) => x.id === id);
  if (!b) return null;
  const pre = ["booked", "confirmed"].includes(b.status); const late = Bk.isLateCancel(db, b); const closure = Bk.blockingClosure(db, b.date, b.time, b.tee);
  const steps = ["booked", "confirmed", "arrived", "ready", "started", "completed"]; const idx = steps.indexOf(b.status);
  return (
    <Modal open onClose={onClose} size="lg" title={<span className="flex items-center gap-2">{b.ref} <StatusBadge status={b.status} /></span>}
      footer={<>
        {b.status === "booked" && can("booking.edit") && <Button variant="gold" onClick={() => act((d, c) => Bk.confirmBooking(d, c, b.id), "Reservation confirmed — SMS simulated")}>Confirm reservation</Button>}
        {pre && can("booking.edit") && <><Button variant="outline" onClick={() => onEdit(b)}>Edit</Button><Button variant="outline" onClick={() => onReschedule(b)}>Reschedule</Button></>}
        {["booked", "confirmed", "arrived", "ready"].includes(b.status) && can("booking.edit") && <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel booking</Button>}
        {["booked", "confirmed"].includes(b.status) && can("checkin.manage") && <ConfirmButton title="Mark as no-show?" message="The slot is released and any deposit is forfeited per the cancellation policy. This counts toward the customer's no-show record." onConfirm={() => act((d, c) => Bk.markNoShow(d, c, b.id), "Marked as no-show")}>No-show</ConfirmButton>}
        {b.status === "confirmed" && b.date === db.meta.now.slice(0, 10) && <Link href={`/check-in?booking=${b.id}`}><Button>Go to check-in</Button></Link>}
      </>}>
      {closure && pre && <Notice tone="error" className="mb-3"><AlertTriangle className="h-4 w-4 shrink-0" />This tee time is affected by a restriction: {closure.reason}. Reschedule the golfers.</Notice>}
      {!["cancelled", "no_show"].includes(b.status) && <ol className="mb-4 flex items-center gap-1 overflow-x-auto text-xs">{steps.map((s, i) => <li key={s} className={cn("flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1", i <= idx ? "bg-forest text-white" : "bg-charcoal-100 text-charcoal-500")}>{s.replace("_", " ")}{i < steps.length - 1 && <ChevronRight className="h-3 w-3 opacity-50" />}</li>)}</ol>}
      <div className="grid gap-5 md:grid-cols-2">
        <div><KV k="Date & time" v={`${fmtDate(b.date)} · ${fmt12(b.time)} (tee ${b.tee})`} /><KV k="Holes" v={`${b.holes} · ~${Math.round(ROUND_MINUTES(db, b.holes) / 60 * 10) / 10} h`} /><KV k="Contact" v={`${b.contactName} · ${b.contactPhone || "—"}`} /><KV k="Channel" v={b.channel.replace("_", " ")} /><KV k="Est. green fees" v={peso(b.greenFeeTotal)} />
          {b.deposit && <KV k="Deposit" v={<>{peso(b.deposit.amount)} <Badge tone={b.deposit.status === "held" ? "gold" : b.deposit.status === "forfeited" ? "red" : "neutral"}>{b.deposit.status}</Badge></>} />}{b.notes && <KV k="Notes" v={b.notes} />}{b.rescheduledFrom && <KV k="Rescheduled from" v={b.rescheduledFrom} />}{b.cancelReason && <KV k="Cancelled" v={`${b.cancelReason}${b.lateCancel ? " (late)" : ""}`} />}</div>
        <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Golfers</h4>{b.players.map((p) => <div key={p.id} className="flex items-center justify-between border-b border-charcoal-100/70 py-1.5 text-sm last:border-0"><span>{p.name}{p.memberId && <span className="ml-1 text-xs text-charcoal-400">{p.memberId}</span>}{p.checkedIn && <Badge tone="green" className="ml-2">in</Badge>}</span><span className="text-right"><span className="text-xs text-charcoal-500">{p.rateLabel}</span> <b className="tabular-nums">{peso(p.rate)}</b></span></div>)}</div>
      </div>
      <h4 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Booking history</h4>
      <ul className="space-y-1 text-sm">{[...b.history].reverse().map((h, i) => <li key={i} className="flex gap-3"><span className="w-28 shrink-0 text-xs text-charcoal-400">{fmtTs(h.at)}</span><span>{h.text}</span></li>)}</ul>
      <PromptDialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel ${b.ref}`} label="Cancellation reason" submitLabel="Cancel booking" tone="danger"
        description={<>{late ? <Notice tone="warn"><AlertTriangle className="h-4 w-4 shrink-0" />Inside the {db.settings.teeSheet.cancelHours}-hour cancellation window.{b.deposit?.status === "held" && db.settings.teeSheet.forfeitDepositOnLateCancel ? " The deposit will be forfeited." : ""}</Notice> : <p>Within policy — slot capacity is released{b.deposit?.status === "held" ? " and the deposit refunded" : ""}.</p>}</>}
        onSubmit={(reason) => { if (act((d, c) => Bk.cancelBooking(d, c, b.id, reason), "Reservation cancelled — slot released").ok) onClose(); }} />
    </Modal>
  );
}

export default function ReservationsPage() {
  const { db, can, act } = useStore(); const sp = useSearchParams(); const router = useRouter(); const today = db.meta.now.slice(0, 10);
  const [date, setDate] = useState(sp.get("date") ?? today); const [tab, setTab] = useState<"sheet" | "waitlist" | "restrictions" | "messages" | "noshow">("sheet");
  const [statusF, setStatusF] = useState<(typeof STATUS_FILTERS)[number]>("all"); const [form, setForm] = useState<{ time?: string; tee?: "1" | "10"; edit?: Booking } | null>(sp.get("new") ? {} : null);
  const [detail, setDetail] = useState<string | null>(sp.get("booking")); const [resched, setResched] = useState<Booking | null>(null); const [closureOpen, setClosureOpen] = useState(false);
  const [wl, setWl] = useState({ name: "", phone: "", date: addDays(today, 1), from: "07:00", to: "09:00", players: 2 }); const [wlErr, setWlErr] = useState<string>();
  useEffect(() => { const d = sp.get("date"); if (d) setDate(d); const b = sp.get("booking"); if (b) setDetail(b); }, [sp]);

  const slots = useMemo(() => Bk.buildSlots(db, date), [db, date]);
  const dayBookings = db.bookings.filter((b) => b.date === date);
  const live = dayBookings.filter((b) => !["cancelled", "no_show"].includes(b.status)); const u = utilization(db, date);
  const conflicts = Bk.bookingConflicts(db).filter((c) => c.booking.date === date);
  const [showPast, setShowPast] = useState(false); const hiddenPast = slots.filter((s) => s.past && s.bookings.length === 0 && !s.blocked).length;
  const shown = slots.filter((s) => (statusF === "all" || s.bookings.some((b) => b.status === statusF)) && (showPast || statusF !== "all" || !(s.past && s.bookings.length === 0 && !s.blocked)));
  const canBook = can("booking.create");
  const cancelledToday = dayBookings.filter((b) => ["cancelled", "no_show"].includes(b.status));
  const go = (d: string) => { setDate(d); router.replace(`/reservations?date=${d}`); };

  return (
    <>
      <PageHeader icon="CalendarDays" title="Reservations / Tee Sheet" sub="Prevents double-booking · honours closures · rates follow member status" actions={canBook && <Button onClick={() => setForm({})}><Plus className="h-4 w-4" />New reservation</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Reservations" value={live.length} sub={`${live.reduce((a, b) => a + b.players.length, 0)} players`} icon="CalendarCheck" />
        <Kpi label="Utilization" value={pct(u.pct)} sub={`${u.used}/${u.slots} slots`} icon="Gauge" />
        <Kpi label="Open slots" value={slots.filter((s) => !s.blocked && !s.past && s.bookings.length === 0).length} sub="still bookable" icon="CircleDashed" />
        <Kpi label="Cancelled / no-show" value={cancelledToday.length} icon="CalendarX" />
        <Kpi label="Closure conflicts" value={conflicts.length} icon="OctagonAlert" tone={conflicts.length ? "red" : "neutral"} sub={conflicts.length ? "reschedule needed" : "none"} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "sheet", label: "Tee sheet" }, { id: "waitlist", label: "Waitlist", count: db.waitlist.filter((w) => w.status === "waiting").length }, { id: "restrictions", label: "Restrictions & impact", count: db.closures.filter((c) => c.active && c.date >= today).length }, { id: "noshow", label: "No-show tracking" }, { id: "messages", label: "Confirmations (simulated)" }]} />

      {tab === "sheet" && <>
        <Card className="mb-4 p-3"><div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => go(addDays(date, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="w-44" aria-label="Date" />
          <Button variant="outline" size="icon" aria-label="Next day" onClick={() => go(addDays(date, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="soft" size="sm" onClick={() => go(today)}>Today</Button>
          <span className="text-sm font-medium text-forest">{fmtDate(date)}</span><Badge tone={Bk.dayType(db, date) === "weekday" ? "neutral" : "gold"}>{Bk.dayType(db, date)}</Badge>
          {hiddenPast > 0 && statusF === "all" && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setShowPast((v) => !v)}>{showPast ? "Hide" : "Show"} {hiddenPast} passed open slots</Button>}
          <Select value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)} className={hiddenPast > 0 && statusF === "all" ? "w-44" : "ml-auto w-44"} aria-label="Status filter">{STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_", " ")}</option>)}</Select>
        </div></Card>
        {conflicts.length > 0 && <Notice tone="error" className="mb-4"><AlertTriangle className="h-4 w-4 shrink-0" /><span><b>{conflicts.length} reservation(s)</b> are inside a blocked period ({conflicts[0].closure.reason}). Open each to reschedule, or see the Restrictions tab.</span></Notice>}
        <Card>
          <div className="divide-y divide-charcoal-100/70">
            {shown.length === 0 && <Empty title="No tee times match" text="Adjust the status filter." />}
            {shown.map((s) => (
              <div key={s.key} className={cn("flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center", s.blocked && "hatch bg-charcoal-100/40")}>
                <div className="flex w-28 shrink-0 items-center gap-2"><span className={cn("font-display text-base font-semibold tabular-nums", s.past ? "text-charcoal-400" : "text-forest")}>{fmt12(s.time)}</span>{db.settings.teeSheet.startingTees.length > 1 && <Badge>T{s.tee}</Badge>}</div>
                <div className="min-w-0 flex-1">
                  {s.blocked ? <div className="flex items-center gap-2 text-sm text-charcoal-600"><Lock className="h-4 w-4" />Unavailable — {s.blocked.reason}<Badge tone="red">{s.blocked.category}</Badge></div>
                    : s.bookings.length === 0 ? (s.past ? <span className="text-sm text-charcoal-300">Open (passed)</span> : <div className="flex items-center gap-2"><span className="text-sm text-emerald">Available · {s.remaining} spots</span>{s.restricted.length > 0 && <Badge tone="amber">Holes {s.restricted[0].holes.join(", ")} restricted</Badge>}</div>)
                      : s.bookings.map((b) => (
                        <button key={b.id} onClick={() => setDetail(b.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-charcoal-100 bg-white px-3 py-2 text-left shadow-sm hover:border-gold">
                          <StatusBadge status={b.status} /><span className="font-medium">{b.contactName}</span><span className="text-xs text-charcoal-500">{b.ref}</span>
                          <span className="text-xs text-charcoal-500">{b.players.length}p · {b.holes}H</span>
                          <span className="flex gap-1">{b.players.map((p) => <span key={p.id} title={`${p.name} — ${p.rateLabel}`} className={cn("h-2.5 w-2.5 rounded-full", p.type === "member" ? "bg-forest" : p.type === "guest" ? "bg-gold" : "bg-charcoal-300")} />)}</span>
                          {b.deposit?.status === "held" && <Badge tone="gold">deposit</Badge>}{s.restricted.length > 0 && <Badge tone="amber">restricted</Badge>}{b.channel === "online" && <Badge>online</Badge>}
                        </button>))}
                </div>
                {!s.blocked && !s.past && canBook && (s.bookings.length === 0 || (db.settings.teeSheet.allowSharedSlots && s.remaining > 0)) && <Button size="sm" variant="soft" onClick={() => setForm({ time: s.time, tee: s.tee })}><Plus className="h-3.5 w-3.5" />Book</Button>}
              </div>))}
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-charcoal-100 px-4 py-2.5 text-xs text-charcoal-500"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-forest" />Member</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-gold" />Guest</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-charcoal-300" />Public</span><span className="ml-auto">Max {db.settings.teeSheet.maxPlayers} golfers / flight · {db.settings.teeSheet.interval}-min intervals (configurable)</span></div>
        </Card>
        {cancelledToday.length > 0 && <Card className="mt-4"><CardHeader title="Cancelled & no-show" sub="Capacity released" /><DataTable dense rows={cancelledToday} rowKey={(b) => b.id} columns={[{ key: "t", header: "Tee", render: (b) => fmt12(b.time) }, { key: "n", header: "Booking", render: (b) => `${b.ref} · ${b.contactName}` }, { key: "s", header: "Status", render: (b) => <StatusBadge status={b.status} /> }, { key: "r", header: "Reason", render: (b) => <span className="text-xs">{b.cancelReason ?? "—"}{b.lateCancel ? " (late)" : ""}</span> }]} onRowClick={(b) => setDetail(b.id)} /></Card>}
      </>}

      {tab === "waitlist" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2"><CardHeader title="Waitlist" sub="Entries are matched to open slots automatically (derived from the tee sheet)" />
            <DataTable rows={db.waitlist.filter((w) => w.status === "waiting")} rowKey={(w) => w.id} empty={<Empty icon="ListOrdered" title="No one is waiting" />} columns={[
              { key: "n", header: "Golfer", render: (w) => <span>{w.name}<span className="block text-xs text-charcoal-400">{w.phone}</span></span> }, { key: "d", header: "Wants", render: (w) => `${w.date} · ${fmt12(w.from)}–${fmt12(w.to)} · ${w.players}p` },
              { key: "m", header: "Matching open slots", render: (w) => { const m = Bk.waitlistMatches(db, w); return m.length ? <div className="flex flex-wrap gap-1">{m.slice(0, 4).map((s) => <Button key={s.key} size="sm" variant="gold" disabled={!canBook} onClick={() => { const c = db.customers.find((x) => x.id === w.customerId); const r = act((d, ctx) => Bk.createBooking(d, ctx, { date: w.date, time: s.time, holes: 18, channel: "phone", players: Array.from({ length: w.players }, (_, i) => ({ name: i === 0 ? w.name : `${w.name} guest ${i}`, type: "public" as const, customerId: i === 0 ? c?.id : undefined })), contactName: w.name, contactPhone: w.phone, contactCustomerId: c?.id, waitlistId: w.id }), (b) => `Booked ${b.ref} from waitlist`); void r; }}>Book {fmt12(s.time)}</Button>)}</div> : <span className="text-xs text-charcoal-400">No match yet</span>; } },
              { key: "x", header: "", render: (w) => canBook && <Button size="sm" variant="ghost" onClick={() => act((d, c) => Bk.removeWaitlist(d, c, w.id), "Removed from waitlist")}><Ban className="h-4 w-4" /></Button> },
            ]} /></Card>
          <Card><CardHeader title="Add to waitlist" /><div className="space-y-3 p-4">
            <Field label="Name" required><Input value={wl.name} onChange={(e) => setWl({ ...wl, name: e.target.value })} /></Field><Field label="Phone" required><Input value={wl.phone} onChange={(e) => setWl({ ...wl, phone: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" min={today} value={wl.date} onChange={(e) => setWl({ ...wl, date: e.target.value })} /></Field>
            <div className="grid grid-cols-3 gap-2"><Field label="From"><Input type="time" value={wl.from} onChange={(e) => setWl({ ...wl, from: e.target.value })} /></Field><Field label="To"><Input type="time" value={wl.to} onChange={(e) => setWl({ ...wl, to: e.target.value })} /></Field><Field label="Players"><Input type="number" min={1} max={db.settings.teeSheet.maxPlayers} value={wl.players} onChange={(e) => setWl({ ...wl, players: Number(e.target.value) })} /></Field></div>
            {wlErr && <p className="text-xs text-[#A63D2F]">{wlErr}</p>}
            <Button disabled={!canBook} onClick={() => { const r = act((d, c) => Bk.addWaitlist(d, c, { ...wl }), "Added to waitlist"); if (!r.ok) setWlErr(r.error); else { setWlErr(undefined); setWl({ ...wl, name: "", phone: "" }); } }}>Add to waitlist</Button></div></Card>
        </div>)}

      {tab === "restrictions" && (
        <div className="space-y-4">
          <div className="flex justify-end">{can("course.closure") ? <Button variant="danger" onClick={() => setClosureOpen(true)}><Lock className="h-4 w-4" />New restriction / tee block</Button> : <Badge>Creating restrictions requires Superintendent / GM / Golf Ops</Badge>}</div>
          {db.closures.filter((c) => c.date >= today).length === 0 && <Card><Empty icon="ShieldCheck" title="No active restrictions" text="The course is fully bookable." /></Card>}
          {db.closures.filter((c) => c.date >= today || c.active).sort((a, b) => a.date.localeCompare(b.date)).map((c) => { const imp = Bk.closureImpact(db, c); return (
            <Card key={c.id}><CardHeader title={<span className="flex flex-wrap items-center gap-2">{c.reason} <Badge tone={c.active ? "red" : "neutral"}>{c.active ? c.type === "partial" ? "restricted holes" : "blocked" : "lifted"}</Badge><Badge>{c.category}</Badge></span>} sub={`${fmtDate(c.date)} · ${fmt12(c.from)}–${fmt12(c.to)}${c.holes.length ? ` · holes ${c.holes.join(", ")}` : ""} · by ${c.createdBy}${c.liftedBy ? ` · lifted by ${c.liftedBy} ${fmtTs(c.liftedAt)}` : ""}`}
              action={c.active && can("course.closure") && <ConfirmButton variant="outline" title="Lift restriction?" message="Blocked tee times become bookable again. The change is recorded in the audit log." onConfirm={() => act((d, ctx) => Bk.liftClosure(d, ctx, c.id), "Restriction lifted")}>Lift restriction</ConfirmButton>} />
              {c.active && <div className="p-4">{imp.length === 0 ? <p className="text-sm text-charcoal-500">No existing reservations affected.</p> : <><p className="mb-2 text-sm font-medium text-[#8C3025]">{imp.length} affected reservation(s){c.type === "partial" ? " (advisory — play to temporary greens)" : " — reschedule required"}</p>
                <DataTable dense rows={imp} rowKey={(b) => b.id} columns={[{ key: "t", header: "Tee", render: (b) => fmt12(b.time) }, { key: "n", header: "Booking", render: (b) => `${b.ref} · ${b.contactName} (${b.players.length}p)` }, { key: "s", header: "Status", render: (b) => <StatusBadge status={b.status} /> }, { key: "a", header: "", render: (b) => can("booking.edit") && ["booked", "confirmed"].includes(b.status) && c.type !== "partial" && <Button size="sm" variant="gold" onClick={() => setResched(b)}>Reschedule</Button> }]} /></>}</div>}
            </Card>); })}
        </div>)}

      {tab === "noshow" && <Card><CardHeader title="No-show tracking" sub={`After ${db.settings.teeSheet.noShowStrikeLimit} no-shows a deposit is required for new bookings`} />
        <DataTable rows={Object.entries(db.bookings.filter((b) => b.status === "no_show").reduce<Record<string, Booking[]>>((a, b) => { (a[b.contactName] ??= []).push(b); return a; }, {})).sort((a, b) => b[1].length - a[1].length)} rowKey={(r) => r[0]} empty={<Empty title="No no-shows recorded" />}
          columns={[{ key: "n", header: "Contact", render: (r) => r[0] }, { key: "c", header: "No-shows", render: (r) => <Badge tone={r[1].length >= db.settings.teeSheet.noShowStrikeLimit ? "red" : "amber"}>{r[1].length}</Badge> }, { key: "d", header: "Dates", render: (r) => r[1].map((b) => b.date).join(", ") }, { key: "p", header: "Policy", render: (r) => (r[1].length >= db.settings.teeSheet.noShowStrikeLimit ? "Deposit required" : "—") }]} /></Card>}

      {tab === "messages" && <Card><CardHeader title="Simulated confirmations" sub="No real SMS or email is sent in the demo" action={<Badge tone="gold"><MessageSquare className="h-3 w-3" />Simulated</Badge>} />
        <DataTable rows={[...db.messages].reverse()} maxRows={30} rowKey={(m) => m.id} columns={[{ key: "a", header: "When", render: (m) => fmtTs(m.at) }, { key: "t", header: "To", render: (m) => m.to }, { key: "m", header: "Message", render: (m) => <span className="text-xs">{m.text}</span> }]} /></Card>}

      <BookingFormDialog open={!!form} onClose={() => setForm(null)} initial={form?.time ? { date, time: form.time, tee: form.tee } : { date, time: "" }} edit={form?.edit} onSaved={(b) => { setDate(b.date); setDetail(b.id); }} />
      {detail && <BookingDetail id={detail} onClose={() => { setDetail(null); }} onReschedule={(b) => { setDetail(null); setResched(b); }} onEdit={(b) => { setDetail(null); setForm({ edit: b }); }} />}
      <RescheduleDialog booking={resched} onClose={() => setResched(null)} />
      <ClosureDialog open={closureOpen} onClose={() => setClosureOpen(false)} defaultDate={date} />
    </>
  );
}
void toMin; void Textarea;
