"use client";
import { useEffect, useMemo, useState } from "react";
import { ChoiceGroup, PaymentChoice, HolesChoice, StarRating, BayPicker, CartPicker, DiscountChips } from "@/components/choices";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Circle, Search, TimerOff, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, ConfirmButton, DataTable, Empty, Field, Input, KV, Kpi, Modal, Notice, PageHeader, PromptDialog, Select, StatusBadge, Tabs, Textarea, cn } from "@/components/ui";
import { PayChargeDialog } from "@/components/pay-dialog";
import { BookingFormDialog } from "@/components/booking-dialogs";
import { fail } from "@/lib/services/core";
import * as Fl from "@/lib/services/flight";
import * as Bk from "@/lib/services/booking";
import * as Cd from "@/lib/services/caddie";
import * as Ct from "@/lib/services/cart";
import { outstanding, chargeNet } from "@/lib/services/finance";
import { fmt12, fmtTs, minsBetween } from "@/lib/time";
import { peso } from "@/lib/format";
import type { Booking, IncidentType } from "@/lib/types";

const FLOW = ["booked", "confirmed", "arrived", "ready", "started", "completed"] as const;
function Timeline({ b }: { b: Booking }) {
  const idx = FLOW.indexOf(b.status as (typeof FLOW)[number]);
  if (["cancelled", "no_show"].includes(b.status)) return <StatusBadge status={b.status} />;
  return <ol className="flex flex-wrap items-center gap-1 text-[11px]">{FLOW.map((s, i) => <li key={s} className={cn("flex items-center gap-1 rounded-full px-2 py-0.5", i < idx ? "bg-emerald-50 text-emerald-700" : i === idx ? "bg-forest text-white" : "bg-charcoal-100 text-charcoal-400")}>{i < idx ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}{s}</li>)}</ol>;
}

function CheckInDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, act, can } = useStore(); const b = db.bookings.find((x) => x.id === id)!; const [sel, setSel] = useState<string[]>(b?.players.map((p) => p.id) ?? []); const [pay, setPay] = useState<string | null>(null); const [edit, setEdit] = useState(false); const [rec, setRec] = useState(false); const [err, setErr] = useState<string>();
  if (!b) return null;
  const charges = db.charges.filter((c) => c.bookingId === b.id && c.status !== "voided"); const reqs = Fl.flightRequirements(db, b); const pre = ["booked", "confirmed"].includes(b.status);
  const needC = Cd.requiredCaddies(db, b.id); const carts = Ct.cartsFor(db, b.id); const ass = Cd.bookingAssignments(db, b.id);
  const checkMember = (p: Booking["players"][number]) => { if (p.type === "member") { const m = db.members.find((x) => x.id === p.memberId); return m ? Bk.memberEligibility(db, m, b.date) : "Member record missing"; } if (p.type === "guest") { const m = db.members.find((x) => x.id === p.sponsorId); return m ? Bk.memberEligibility(db, m, b.date) : "Sponsor missing"; } return null; };
  const memberOf = (id?: string) => (id ? db.members.find((m) => m.id === id) : undefined); const planOf = (id?: string) => db.plans.find((p) => p.id === memberOf(id)?.planId);
  const bal = (id?: string) => db.charges.filter((c) => c.memberId === id).reduce((a, c) => a + outstanding(c), 0);
  return (
    <Modal open onClose={onClose} size="xl" title={<span className="flex items-center gap-2">Check-in · {b.ref} <StatusBadge status={b.status} /></span>}
      footer={<>
        {pre && can("checkin.manage") && <ConfirmButton variant="outline" title="Mark no-show?" message="Releases the slot and forfeits any deposit per policy." onConfirm={() => { if (act((d, c) => Bk.markNoShow(d, c, b.id), "Marked no-show").ok) onClose(); }}>Mark no-show</ConfirmButton>}
        {pre && can("booking.edit") && <Button variant="outline" onClick={() => setEdit(true)}>Modify flight list</Button>}
        {!pre && <Button variant="outline" onClick={() => setRec(true)}><Printer className="h-4 w-4" />Digital check-in record</Button>}
        {b.status === "booked" && <span className="text-sm text-[#8C3025]">Confirm the reservation first (Reservations).</span>}
        {b.status === "confirmed" && <Button disabled={!can("checkin.manage") || sel.length === 0} onClick={() => { const r = act((d, c) => Fl.arriveBooking(d, c, b.id, sel), (r) => `Checked in — flight #${r.flightNo}; green fees posted to charges`); if (!r.ok) setErr(r.error); }}>Confirm arrival ({sel.length})</Button>}
      </>}>
      <Timeline b={b} />
      {err && <Notice tone="error" className="mt-3"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</Notice>}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Players — validate arrival & membership</h4>
          {b.players.map((p) => { const issue = checkMember(p); const m = memberOf(p.memberId ?? p.sponsorId); const plan = planOf(p.memberId ?? p.sponsorId); return (
            <div key={p.id} className="mb-2 rounded-lg border border-charcoal-100 p-3">
              <div className="flex items-start gap-2">
                {pre ? <input type="checkbox" className="mt-1" checked={sel.includes(p.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} aria-label={`${p.name} arrived`} /> : p.checkedIn ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald" /> : null}
                <div className="min-w-0 flex-1"><p className="font-medium">{p.name} <Badge tone={p.type === "member" ? "green" : p.type === "guest" ? "gold" : "neutral"}>{p.type}</Badge></p>
                  <p className="text-xs text-charcoal-500">{p.rateLabel} · {peso(p.rate)}{p.type === "guest" && m ? ` · sponsor ${m.id}` : ""}</p>
                  {p.type !== "public" && m && plan && <p className="mt-1 text-xs text-charcoal-500">Benefits: {plan.name} · guests {plan.guestsPerRound}/round · cart −{plan.cartDiscountPct}% · {plan.accountCharging ? `account charging (balance ${peso(bal(m.id))} / limit ${peso(plan.creditLimit)})` : "no account charging"}</p>}
                  {issue && <Notice tone="error" className="mt-1.5 py-1 text-xs"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{issue}</Notice>}</div>
              </div>
            </div>); })}
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Fees & payment status</h4>
          {charges.length === 0 ? <p className="rounded-lg bg-ivory-100 p-3 text-sm text-charcoal-600">Charges are raised on arrival. Estimated green fees {peso(b.greenFeeTotal)}.{b.deposit?.status === "held" && ` Deposit ${peso(b.deposit.amount)} will be applied.`}</p> :
            charges.map((c) => <div key={c.id} className="mb-2 flex items-center gap-2 rounded-lg border border-charcoal-100 p-2.5 text-sm"><div className="min-w-0 flex-1"><p className="truncate">{c.description}</p><p className="text-xs text-charcoal-500">{c.name} · {c.billTo === "member_account" ? "member account" : "pay at counter"}</p></div><div className="text-right"><b className="tabular-nums">{peso(chargeNet(c))}</b><div><StatusBadge status={c.status} /></div></div>{outstanding(c) > 0 && c.billTo === "counter" && can("finance.payment") && <Button size="sm" onClick={() => setPay(c.id)}>Pay</Button>}</div>)}
          {!pre && <><h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Requirements</h4>
            <ul className="space-y-1.5">{reqs.map((r) => <li key={r.key} className="flex items-start gap-2 text-sm">{r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4", r.blocking ? "text-[#A63D2F]" : "text-[#D98E04]")} />}<span><b className="font-medium">{r.label}</b> <span className="text-charcoal-500">— {r.detail}</span></span></li>)}</ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {Cd.bookingAssignments(db, b.id).length < needC && can("caddie.manage") && <Button size="sm" variant="soft" onClick={() => act((d, c) => Cd.assignCaddie(d, c, { bookingId: b.id }), "Next caddie in rotation assigned")}>Assign next caddie ({ass.length}/{needC})</Button>}
              {carts.length < Ct.requiredCarts(db, b.id) && can("cart.manage") && <Button size="sm" variant="soft" onClick={() => { const c = db.carts.find((x) => x.status === "available" && x.no !== 12) ?? db.carts.find((x) => x.status === "available"); if (!c) return void act(() => fail("No carts are available.")); act((d, ctx) => Ct.assignCart(d, ctx, b.id, c.id), `Cart #${c.no} reserved`); }}>Assign cart ({carts.length}/{Ct.requiredCarts(db, b.id)})</Button>}
              <Link href="/caddies"><Button size="sm" variant="ghost">Caddie console →</Button></Link><Link href="/carts"><Button size="sm" variant="ghost">Cart dispatch →</Button></Link></div>
            <p className="mt-2 text-xs text-charcoal-500">Assigned: {ass.map((a) => db.caddies.find((c) => c.id === a.caddieId)?.name).join(", ") || "no caddies"} · carts {carts.map((c) => "#" + c.no).join(", ") || "none"}</p></>}
        </div>
      </div>
      <PayChargeDialog chargeId={pay} onClose={() => setPay(null)} />
      <BookingFormDialog open={edit} onClose={() => setEdit(false)} edit={b} />
      {rec && <Modal open onClose={() => setRec(false)} title="Digital check-in record" size="md" footer={<Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>}>
        {(() => { const r = Fl.roundOf(db, b.id); return <div className="text-sm"><p className="mb-2 font-display text-lg text-forest">{db.settings.club.shortName} — Check-in record</p><KV k="Record" v={r?.id ?? "—"} /><KV k="Reservation" v={b.ref} /><KV k="Flight" v={`#${b.flightNo ?? "—"} · ${b.date} ${fmt12(b.time)}`} /><KV k="Arrived at" v={fmtTs(r?.arrivedAt)} /><KV k="Players" v={b.players.map((p) => p.name).join(", ")} /><KV k="Charges" v={peso(charges.reduce((a, c) => a + chargeNet(c), 0))} /><KV k="Checked in by" v={b.history.find((h) => h.text.startsWith("Checked in"))?.by ?? "—"} /><p className="mt-3 text-xs text-charcoal-500">Demo record — not an official receipt or BIR-compliant document.</p></div>; })()}</Modal>}
    </Modal>
  );
}

/* ------------------------------ starter ------------------------------ */
const INCIDENTS: { v: IncidentType; l: string }[] = [{ v: "slow_play", l: "Slow play" }, { v: "obstruction", l: "Course obstruction" }, { v: "weather", l: "Weather interruption" }, { v: "safety", l: "Safety incident" }, { v: "course_condition", l: "Course condition concern" }];
function FlightCard({ b }: { b: Booking }) {
  const { db, act, can } = useStore(); const r = Fl.roundOf(db, b.id); const pace = Fl.paceOf(db, b); const reqs = Fl.flightRequirements(db, b); const ok = reqs.filter((x) => x.blocking).every((x) => x.ok);
  const [dlg, setDlg] = useState<"delay" | "cp" | "inc" | "waive" | "suspend" | "complete" | null>(null); const [hole, setHole] = useState(9); const [incType, setIncType] = useState<IncidentType>("slow_play"); const [incText, setIncText] = useState(""); const [tips, setTips] = useState<Record<string, number>>({});
  const can_ = can("starter.manage"); const cads = db.caddieAssignments.filter((a) => a.bookingId === b.id && ["assigned", "on_course", "reserved"].includes(a.status));
  return (
    <Card className={cn(pace.status === "behind" || pace.status === "delayed" ? "border-[#E7B7AE]" : "")}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-charcoal-100 px-4 py-3">
        <div><p className="font-display text-lg font-semibold text-forest">{fmt12(b.time)} <span className="text-sm text-charcoal-500">· Flight {b.flightNo ? "#" + b.flightNo : "—"} · {b.holes}H</span></p><p className="text-sm">{b.players.map((p) => p.name).join(", ")}</p></div>
        <div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={b.status} />{r?.suspended && <Badge tone="red">suspended</Badge>}{pace.status === "behind" && <Badge tone="red">{pace.behindMin}m behind</Badge>}{pace.status === "delayed" && <Badge tone="red"><TimerOff className="h-3 w-3" />late {pace.lateStartMin}m</Badge>}{r?.delay && <Badge tone="amber">delay: {r.delay.reason}</Badge>}</div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-1.5 text-sm">{reqs.map((x) => <div key={x.key} className="flex items-start gap-2">{x.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald" /> : <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", x.blocking ? "text-[#A63D2F]" : "text-[#D98E04]")} />}<span><b className="font-medium">{x.label}</b><span className="block text-xs text-charcoal-500">{x.detail}</span></span></div>)}
          <p className="pt-1 text-xs text-charcoal-500">Caddies: {cads.map((a) => db.caddies.find((c) => c.id === a.caddieId)?.name.split(" ")[0]).join(", ") || "—"} · Carts: {Ct.cartsFor(db, b.id).map((c) => `#${c.no} (${c.status.replace("_", " ")})`).join(", ") || "—"}</p></div>
        <div className="rounded-lg bg-ivory-100 p-3 text-sm"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Pace of play</p>
          <KV k="Scheduled start" v={fmt12(b.time)} /><KV k="Actual tee-off" v={pace.actualStart ? fmtTs(pace.actualStart) : "—"} /><KV k="Expected finish" v={pace.expectedFinish ? fmtTs(pace.expectedFinish) : "—"} /><KV k="Actual finish" v={pace.actualFinish ? fmtTs(pace.actualFinish) : "—"} /><KV k="Elapsed" v={pace.elapsed !== undefined ? `${Math.floor(pace.elapsed / 60)}h ${pace.elapsed % 60}m / ${Math.floor(pace.expectedElapsed / 60)}h ${pace.expectedElapsed % 60}m` : "—"} />
          {r && r.checkpoints.length > 0 && <p className="mt-1 text-xs text-charcoal-500">Checkpoints: {r.checkpoints.map((c) => `H${c.hole} ${fmt12(c.at.slice(11))} (${minsBetween(c.expectedAt, c.at) > 0 ? "+" : ""}${minsBetween(c.expectedAt, c.at)}m)`).join(" · ")}</p>}
          {r && r.incidents.length > 0 && <p className="mt-1 text-xs text-[#8C3025]">Incidents: {r.incidents.map((i) => i.type.replace("_", " ")).join(", ")}</p>}</div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-charcoal-100 bg-ivory-50 px-4 py-3">
        {b.status === "arrived" && <Button size="sm" disabled={!can_} onClick={() => (ok ? act((d, c) => Fl.markReady(d, c, b.id), "Flight marked ready") : setDlg("waive"))}>Mark ready{!ok && " (requirements incomplete)"}</Button>}
        {b.status === "ready" && <Button size="sm" variant="gold" disabled={!can_} onClick={() => act((d, c) => Fl.startRound(d, c, b.id), "Flight released — actual tee-off time recorded")}>Release flight / record start</Button>}
        {["arrived", "ready", "started"].includes(b.status) && <Button size="sm" variant="outline" disabled={!can_} onClick={() => setDlg("delay")}>Flag delay</Button>}
        {r?.delay && <Button size="sm" variant="ghost" onClick={() => act((d, c) => Fl.clearDelay(d, c, b.id), "Delay flag cleared")}>Clear delay</Button>}
        {b.status === "started" && <><Button size="sm" variant="outline" disabled={!can_} onClick={() => setDlg("cp")}>Pace checkpoint</Button><Button size="sm" variant="outline" disabled={!can_} onClick={() => setDlg("inc")}>Report incident</Button>
          {r?.suspended ? <Button size="sm" variant="outline" onClick={() => act((d, c) => Fl.resumeFlight(d, c, b.id), "Play resumed")}>Resume play</Button> : <Button size="sm" variant="outline" disabled={!can_} onClick={() => setDlg("suspend")}>Suspend play</Button>}
          <Button size="sm" variant="danger" disabled={!can_} onClick={() => setDlg("complete")}>Complete round</Button></>}
      </div>
      <PromptDialog open={dlg === "delay"} onClose={() => setDlg(null)} title="Flag delay" label="Delay reason" onSubmit={(v) => act((d, c) => Fl.flagDelay(d, c, b.id, v), "Delay flagged")} />
      <PromptDialog open={dlg === "suspend"} onClose={() => setDlg(null)} title="Suspend play" label="Reason (e.g. lightning)" onSubmit={(v) => act((d, c) => Fl.suspendFlight(d, c, b.id, v), "Play suspended")} />
      <PromptDialog open={dlg === "waive"} onClose={() => setDlg(null)} title="Requirements incomplete" label="Waiver reason" tone="gold" submitLabel="Waive & mark ready" description={<>{reqs.filter((x) => x.blocking && !x.ok).map((x) => <p key={x.key}>• {x.label}: {x.detail}</p>)}<p className="mt-2">A waiver is recorded in the audit log.</p></>} minLen={5} onSubmit={(v) => act((d, c) => Fl.markReady(d, c, b.id, v), "Marked ready with waiver (audited)")} />
      <Modal open={dlg === "cp"} onClose={() => setDlg(null)} title="Record pace checkpoint" size="sm" footer={<><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button onClick={() => { if (act((d, c) => Fl.recordCheckpoint(d, c, b.id, hole), `Checkpoint hole ${hole} recorded`).ok) setDlg(null); }}>Record at current time</Button></>}><Field label={`Hole completed (1–${b.holes})`}><Input type="number" min={1} max={b.holes} value={hole} onChange={(e) => setHole(Number(e.target.value))} /></Field></Modal>
      <Modal open={dlg === "inc"} onClose={() => setDlg(null)} title="Report incident / concern" size="sm" footer={<><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button onClick={() => { if (act((d, c) => Fl.recordIncident(d, c, b.id, incType, incText), "Incident recorded").ok) { setDlg(null); setIncText(""); } }}>Record</Button></>}><Field label="Type"><ChoiceGroup label="Incident type" value={incType} onChange={setIncType} columns={3} options={[{ value: "slow_play", label: "Slow play", icon: "Turtle" }, { value: "obstruction", label: "Obstruction", icon: "OctagonAlert" }, { value: "weather", label: "Weather", icon: "CloudLightning" }, { value: "safety", label: "Safety", icon: "Siren", tone: "red" }, { value: "course_condition", label: "Course condition", icon: "Trees" }]} /></Field><Field label="Details" className="mt-3" required><Textarea value={incText} onChange={(e) => setIncText(e.target.value)} /></Field></Modal>
      <Modal open={dlg === "complete"} onClose={() => setDlg(null)} title="Complete round" size="sm" footer={<><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button variant="danger" onClick={() => { const extras = Object.fromEntries(Object.entries(tips).map(([k, v]) => [k, { tip: v }])); if (act((d, c) => Fl.completeRound(d, c, b.id, extras), "Round completed — caddies returned, carts returned, fees posted").ok) setDlg(null); }}>Complete round</Button></>}>
        <p className="mb-3 text-sm">Completing records the finish time, returns carts, moves caddies to <i>returned</i> and posts caddie service charges (and payables for contractor caddies).</p>
        {cads.map((a) => <Field key={a.id} label={`Tip recorded for ${db.caddies.find((c) => c.id === a.caddieId)?.name} (optional)`} className="mb-2"><Input type="number" min={0} value={tips[a.id] ?? a.tip ?? 0} onChange={(e) => setTips({ ...tips, [a.id]: Number(e.target.value) })} /></Field>)}</Modal>
    </Card>
  );
}

export default function CheckInPage() {
  const { db } = useStore(); const sp = useSearchParams(); const [tab, setTab] = useState<"front" | "starter">(sp.get("tab") === "starter" ? "starter" : "front"); const [q, setQ] = useState(""); const [open, setOpen] = useState<string | null>(sp.get("booking"));
  useEffect(() => { if (sp.get("tab") === "starter") setTab("starter"); if (sp.get("booking")) setOpen(sp.get("booking")); }, [sp]);
  const today = db.meta.now.slice(0, 10); const nowT = db.meta.now.slice(11, 16);
  const flights = useMemo(() => db.bookings.filter((b) => b.date === today).sort((a, b) => a.time.localeCompare(b.time)), [db, today]);
  const matches = flights.filter((b) => { const s = q.trim().toLowerCase(); if (!s) return !["completed", "cancelled", "no_show"].includes(b.status); return b.ref.toLowerCase().includes(s) || b.contactName.toLowerCase().includes(s) || b.players.some((p) => p.name.toLowerCase().includes(s) || (p.memberId ?? "").toLowerCase() === s); });
  const starter = flights.filter((b) => ["arrived", "ready", "started"].includes(b.status));
  const upcoming = flights.filter((b) => b.status === "confirmed" && b.time <= String(Number(nowT.slice(0, 2)) + 1).padStart(2, "0") + nowT.slice(2));
  const done = flights.filter((b) => b.status === "completed");
  return (
    <>
      <PageHeader icon="ClipboardCheck" title="Check-In & Starter" sub="Booked → Confirmed → Arrived → Ready → Started → Completed. Payment never completes a round." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="Awaiting arrival" value={flights.filter((b) => b.status === "confirmed").length} icon="UserRoundCheck" /><Kpi label="Arrived" value={flights.filter((b) => b.status === "arrived").length} icon="ClipboardCheck" /><Kpi label="Ready" value={flights.filter((b) => b.status === "ready").length} icon="CircleCheck" /><Kpi label="On course" value={flights.filter((b) => b.status === "started").length} icon="Flag" /><Kpi label="Completed" value={done.length} icon="CheckCheck" /></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "front", label: "Front desk check-in" }, { id: "starter", label: "Starter dashboard", count: starter.length }]} />
      {tab === "front" && <Card>
        <div className="border-b border-charcoal-100 p-4"><div className="relative max-w-xl"><Search className="absolute left-3 top-3 h-4 w-4 text-charcoal-400" /><Input className="pl-9" placeholder="Search by name, member ID (M-0001) or reservation no. (RSV-…)" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        <DataTable rows={matches} rowKey={(b) => b.id} onRowClick={(b) => setOpen(b.id)} empty={<Empty icon="SearchX" title="No matching bookings today" text="Search by name, member ID or reservation number." />} columns={[
          { key: "t", header: "Tee", render: (b) => <b>{fmt12(b.time)}</b> }, { key: "r", header: "Reservation", render: (b) => <span>{b.contactName}<span className="block text-xs text-charcoal-400">{b.ref} · {b.players.length} golfers</span></span> },
          { key: "m", header: "Mix", render: (b) => <span className="text-xs">{b.players.filter((p) => p.type === "member").length}M · {b.players.filter((p) => p.type === "guest").length}G · {b.players.filter((p) => p.type === "public").length}P</span> },
          { key: "f", header: "Fees due", render: (b) => { const due = db.charges.filter((c) => c.bookingId === b.id && c.billTo === "counter").reduce((a, c) => a + outstanding(c), 0); return due > 0 ? <Badge tone="amber">{peso(due)} due</Badge> : <span className="text-xs text-charcoal-400">—</span>; } },
          { key: "s", header: "Status", render: (b) => <StatusBadge status={b.status} /> }, { key: "a", header: "", render: (b) => <Button size="sm" variant={b.status === "confirmed" ? "primary" : "outline"}>{b.status === "confirmed" ? "Check in" : "Open"}</Button> }]} /></Card>}
      {tab === "starter" && <div className="space-y-4">
        {starter.length === 0 && <Card><Empty icon="Flag" title="No checked-in flights" text="Flights appear here once golfers arrive at the front desk." /></Card>}
        {starter.map((b) => <FlightCard key={b.id} b={b} />)}
        {upcoming.length > 0 && <Card><CardHeader title="Upcoming within the hour (not yet arrived)" /><DataTable dense rows={upcoming} rowKey={(b) => b.id} columns={[{ key: "t", header: "Tee", render: (b) => fmt12(b.time) }, { key: "n", header: "Booking", render: (b) => `${b.ref} · ${b.contactName} · ${b.players.length}p` }, { key: "p", header: "Pace", render: (b) => <StatusBadge status={Fl.paceOf(db, b).status} /> }, { key: "a", header: "", render: (b) => <Button size="sm" variant="outline" onClick={() => { setOpen(b.id); }}>Check in</Button> }]} /></Card>}
        {done.length > 0 && <Card><CardHeader title="Completed today" /><DataTable dense rows={done} rowKey={(b) => b.id} columns={[{ key: "t", header: "Tee", render: (b) => fmt12(b.time) }, { key: "n", header: "Booking", render: (b) => `${b.ref} · ${b.contactName}` }, { key: "e", header: "Elapsed", render: (b) => { const p = Fl.paceOf(db, b); return p.elapsed ? `${Math.floor(p.elapsed / 60)}h ${p.elapsed % 60}m` : "—"; } }, { key: "s", header: "Pace", render: (b) => (Fl.paceOf(db, b).behindMin > db.settings.pace.toleranceMin ? <Badge tone="red">+{Fl.paceOf(db, b).behindMin}m</Badge> : <Badge tone="green">on pace</Badge>) }]} /></Card>}
      </div>}
      {open && <CheckInDialog id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
void ConfirmButton;
