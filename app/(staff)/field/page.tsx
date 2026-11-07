"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, Eye, Maximize2, MonitorUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { Avatar, Badge, Button, Card, ConfirmButton, Denied, Field, Icon, Input, Modal, Notice, PageHeader, PromptDialog, StatusBadge, cn } from "@/components/ui";
import { ChoiceGroup } from "@/components/choices";
import * as Fl from "@/lib/services/flight";
import * as Cd from "@/lib/services/caddie";
import * as Ct from "@/lib/services/cart";
import { bestCart } from "@/lib/services/tasks";
import { fmt12, fmtDate, minsBetween, toMin } from "@/lib/time";
import type { Booking, IncidentType } from "@/lib/types";

type Board = "starter" | "caddie" | "cart";
const BIG = "h-14 w-full text-base font-semibold";
const names = (b: Booking) => b.players.map((p) => p.name.split(" ")[0]).join(", ");

/* ------------------------------ starter board ------------------------------ */
const INCIDENTS: { v: IncidentType; l: string; i: string }[] = [{ v: "slow_play", l: "Slow play", i: "Turtle" }, { v: "obstruction", l: "Obstruction", i: "OctagonAlert" }, { v: "weather", l: "Weather", i: "CloudLightning" }, { v: "safety", l: "Safety", i: "Siren" }, { v: "course_condition", l: "Course", i: "Trees" }];
function Chip({ ok, label, detail }: { ok: boolean; label: string; detail: string }) { return <span title={detail} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold", ok ? "bg-emerald-50 text-emerald-700" : "bg-[#FBEAE7] text-[#9C3326]")}>{ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{label}<span className="font-normal opacity-80">{detail}</span></span>; }

function StarterBoard() {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10); const nowM = toMin(db.meta.now.slice(11, 16)); const ok = can("starter.manage");
  const [waive, setWaive] = useState<string | null>(null); const [inc, setInc] = useState<{ id: string; t: IncidentType } | null>(null); const [delay, setDelay] = useState<string | null>(null);
  const flights = db.bookings.filter((b) => b.date === today); const tee = flights.filter((b) => ["arrived", "ready"].includes(b.status)).sort((a, b) => a.time.localeCompare(b.time)); const course = flights.filter((b) => b.status === "started").sort((a, b) => a.time.localeCompare(b.time));
  const coming = flights.filter((b) => b.status === "confirmed" && toMin(b.time) - nowM <= 60 && toMin(b.time) - nowM >= -20).sort((a, b) => a.time.localeCompare(b.time));
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section aria-label="At the tee" className="space-y-4"><h2 className="font-sans text-xs font-bold uppercase tracking-[.16em] text-charcoal-500">At the tee · {tee.length}</h2>
        {tee.length === 0 && <Card className="p-8 text-center text-charcoal-500">No flights waiting at the tee.</Card>}
        {tee.map((b) => { const reqs = Fl.flightRequirements(db, b); const miss = reqs.filter((r) => r.blocking && !r.ok); const late = Fl.paceOf(db, b).status === "delayed"; const r = Fl.roundOf(db, b.id); return (
          <Card key={b.id} className={cn("p-4", late && "border-[#E7B7AE]")}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-display text-3xl font-semibold text-forest">{fmt12(b.time)} <span className="text-base font-sans font-medium text-charcoal-500">· Flight {b.flightNo ?? "—"}</span></p><p className="text-lg font-medium">{names(b)}</p></div><div className="flex flex-wrap gap-1.5"><StatusBadge status={b.status} />{late && <Badge tone="red">late</Badge>}{r?.delay && <Badge tone="amber">{r.delay.reason}</Badge>}</div></div>
            <div className="mt-3 flex flex-wrap gap-2">{reqs.map((q) => <Chip key={q.key} ok={q.ok} label={q.label.replace(" checked in", "").replace(" assigned", "").replace(" cleared", "").replace(" & dispatched", "")} detail={q.ok ? "" : ` · ${q.detail}`} />)}</div>
            <div className="mt-4 grid grid-cols-3 gap-2">{b.status === "arrived" ? <Button className={cn(BIG, "col-span-2")} disabled={!ok} onClick={() => (miss.length ? setWaive(b.id) : act((d, c) => Fl.markReady(d, c, b.id), "Flight marked ready"))}>{miss.length ? "READY — missing items…" : "MARK READY"}</Button> : <Button variant="gold" className={cn(BIG, "col-span-2 h-16 text-lg")} disabled={!ok} onClick={() => act((d, c) => Fl.startRound(d, c, b.id), "Flight released — start time recorded")}>RELEASE FLIGHT</Button>}
              <Button variant="outline" className={BIG} disabled={!ok} onClick={() => setDelay(b.id)}>Delay</Button></div></Card>); })}
        {coming.length > 0 && <><h2 className="pt-2 font-sans text-xs font-bold uppercase tracking-[.16em] text-charcoal-500">Arriving within the hour · {coming.length}</h2>{coming.map((b) => <Card key={b.id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-xl font-semibold">{fmt12(b.time)} <span className="text-base font-medium text-charcoal-600">{names(b)}</span></p></div><Link href={`/check-in?booking=${b.id}`}><Button variant="outline" className="h-12 text-base">Check in</Button></Link></Card>)}</>}
      </section>
      <section aria-label="On the course" className="space-y-4"><h2 className="font-sans text-xs font-bold uppercase tracking-[.16em] text-charcoal-500">On the course · {course.length}</h2>
        {course.length === 0 && <Card className="p-8 text-center text-charcoal-500">No flights on the course.</Card>}
        {course.map((b) => { const p = Fl.paceOf(db, b); const r = Fl.roundOf(db, b.id)!; const done = new Set(r.checkpoints.map((c) => c.hole)); return (
          <Card key={b.id} className={cn("p-4", p.status === "behind" && "border-[#E7B7AE]")}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-display text-2xl font-semibold text-forest">{fmt12(b.time)} <span className="text-base font-sans font-medium text-charcoal-500">· {b.holes}H</span></p><p className="text-lg font-medium">{names(b)}</p></div><div className="flex flex-wrap items-center gap-1.5">{p.status === "behind" ? <Badge tone="red">{p.behindMin} min behind</Badge> : <Badge tone="green">on pace</Badge>}<Badge>{Math.floor((p.elapsed ?? 0) / 60)}h {(p.elapsed ?? 0) % 60}m</Badge>{r.suspended && <Badge tone="red">suspended</Badge>}</div></div>
            <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Tap a hole to record a pace checkpoint</p>
            <div className="flex flex-wrap gap-1.5">{Array.from({ length: b.holes }, (_, i) => i + 1).map((h) => <button key={h} disabled={!ok || done.has(h)} onClick={() => act((d, c) => Fl.recordCheckpoint(d, c, b.id, h), `Hole ${h} checkpoint recorded`)} className={cn("grid h-12 w-12 place-items-center rounded-xl border text-base font-bold transition-colors", done.has(h) ? "border-emerald bg-emerald text-white" : "border-charcoal-200 bg-white text-charcoal-600 active:bg-forest-50")}>{h}</button>)}</div>
            <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Report</p><div className="flex flex-wrap gap-2">{INCIDENTS.map((i) => <button key={i.v} disabled={!ok} onClick={() => setInc({ id: b.id, t: i.v })} className="inline-flex h-12 items-center gap-2 rounded-xl border border-charcoal-200 bg-white px-3 text-sm font-medium text-charcoal-600 active:bg-ivory-100"><Icon name={i.i} className="h-4 w-4" />{i.l}</button>)}</div>
            <div className="mt-4"><ConfirmButton variant="danger" size="md" className={BIG} disabled={!ok} title="Complete this round?" message="Records the finish, returns carts, moves caddies to 'returned' and posts caddie service charges." confirmLabel="Complete round" onConfirm={() => act((d, c) => Fl.completeRound(d, c, b.id), "Round completed — caddies and carts returned")}>COMPLETE ROUND</ConfirmButton></div></Card>); })}
      </section>
      <PromptDialog open={!!waive} onClose={() => setWaive(null)} tone="gold" title="Requirements incomplete" label="Waiver reason" minLen={5} submitLabel="Waive & mark ready" description="This is recorded in the audit log." onSubmit={(v) => act((d, c) => Fl.markReady(d, c, waive!, v), "Marked ready with waiver (audited)")} />
      <PromptDialog open={!!delay} onClose={() => setDelay(null)} title="Flag delay" label="Delay reason" onSubmit={(v) => act((d, c) => Fl.flagDelay(d, c, delay!, v), "Delay flagged")} />
      <PromptDialog open={!!inc} onClose={() => setInc(null)} title={`Report: ${inc ? INCIDENTS.find((i) => i.v === inc.t)?.l : ""}`} label="What happened?" minLen={5} onSubmit={(v) => act((d, c) => Fl.recordIncident(d, c, inc!.id, inc!.t, v), "Incident recorded")} />
    </div>
  );
}

/* ------------------------------ caddie board ------------------------------ */
function CaddieBoard() {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10); const ok = can("caddie.manage"); const ovr = can("caddie.override");
  const queue = Cd.rotationQueue(db); const [pick, setPick] = useState<{ bookingId: string } | null>(null); const [chosen, setChosen] = useState<string | null>(null); const [mode, setMode] = useState<"preferred" | "override">("preferred"); const [reason, setReason] = useState(""); const [q, setQ] = useState("");
  const needing = db.bookings.filter((b) => b.date === today && ["confirmed", "arrived", "ready"].includes(b.status) && Cd.bookingAssignments(db, b.id).length < Cd.requiredCaddies(db, b.id)).sort((a, b) => a.time.localeCompare(b.time));
  const off = db.caddies.filter((c) => ["off", "absent", "day_off", "unavailable"].includes(c.status) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const tile = (c: (typeof db.caddies)[number], extra?: React.ReactNode, onClick?: () => void, hi = false) => <button key={c.id} onClick={onClick} disabled={!onClick} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors", hi ? "border-gold bg-gold-50" : "border-line bg-white", onClick && "active:bg-forest-50")}><Avatar name={c.name} seed={c.colorSeed} size={44} /><span className="min-w-0 flex-1"><span className="block truncate text-base font-semibold">{c.name}</span><span className="block text-xs text-charcoal-500">{c.id} · cat {c.category} · {c.classification} · {Cd.roundsToday(db, c.id)} round(s)</span></span>{extra}</button>;
  const doAssign = () => { if (!pick || !chosen) return; const isNext = queue[0]?.id === chosen; const r = act((d, c) => Cd.assignCaddie(d, c, { bookingId: pick.bookingId, caddieId: chosen, preferred: !isNext && mode === "preferred", reason: isNext ? undefined : reason }), isNext ? "Caddie assigned" : "Exception recorded — caddie assigned"); if (r.ok) { setPick(null); setChosen(null); setReason(""); } };
  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <section className="space-y-4 xl:col-span-3"><h2 className="font-sans text-xs font-bold uppercase tracking-[.16em] text-charcoal-500">Flights needing caddies · {needing.length}</h2>
        {needing.length === 0 && <Card className="p-8 text-center text-charcoal-500"><CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald" />Every flight has its caddies.</Card>}
        {needing.map((b) => { const need = Cd.requiredCaddies(db, b.id), have = Cd.bookingAssignments(db, b.id).length; return (
          <Card key={b.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-display text-3xl font-semibold text-forest">{fmt12(b.time)}</p><p className="text-lg font-medium">{names(b)}</p>{b.notes && <p className="text-xs text-charcoal-500">Note: {b.notes}</p>}</div><div className="flex gap-1.5"><StatusBadge status={b.status} /><Badge tone="amber">{have}/{need} caddies</Badge></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2"><Button className={cn(BIG, "col-span-2")} disabled={!ok || !queue.length} onClick={() => act((d, c) => Cd.assignCaddie(d, c, { bookingId: b.id }), "Next caddie in rotation assigned")}>{queue.length ? `ASSIGN ${queue[0].name.split(" ")[0].toUpperCase()}` : "NO CADDIE AVAILABLE"}</Button><Button variant="outline" className={BIG} disabled={!ok} onClick={() => { setPick({ bookingId: b.id }); setChosen(null); }}>Choose…</Button></div></Card>); })}
        {db.caddies.some((c) => c.status === "returned") && <><h2 className="pt-2 font-sans text-xs font-bold uppercase tracking-[.16em] text-charcoal-500">Returned — tap to release to the queue</h2><div className="grid gap-2 sm:grid-cols-2">{db.caddies.filter((c) => c.status === "returned").map((c) => tile(c, <Badge tone="amber">release</Badge>, ok ? () => act((d, x) => Cd.releaseToQueue(d, x, c.id), `${c.name} released to queue`) : undefined))}</div></>}
      </section>
      <section className="space-y-4 xl:col-span-2"><h2 className="font-sans text-xs font-bold uppercase tracking-[.16em] text-charcoal-500">Rotation queue · {queue.length} available</h2>
        <div className="grid gap-2">{queue.slice(0, 8).map((c, i) => tile(c, <span className={cn("grid h-9 w-9 place-items-center rounded-full text-sm font-bold", i === 0 ? "bg-gold text-white" : "bg-charcoal-100 text-charcoal-600")}>{i + 1}</span>, undefined, i === 0))}{queue.length === 0 && <Card className="p-6 text-center text-charcoal-500">Queue is empty — time caddies in below.</Card>}</div>
        <h2 className="pt-2 font-sans text-xs font-bold uppercase tracking-[.16em] text-charcoal-500">Time-in · tap a caddie</h2><Input placeholder="Search caddie…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-1">{off.slice(0, 18).map((c) => tile(c, <Badge>{c.status.replace("_", " ")}</Badge>, ok ? () => act((d, x) => Cd.caddieCheckIn(d, x, c.id), `${c.name} timed in — added to queue`) : undefined))}</div></section>
      <Modal open={!!pick} onClose={() => setPick(null)} size="lg" title="Choose a caddie" footer={<><Button variant="outline" className="h-12" onClick={() => setPick(null)}>Cancel</Button><Button className="h-12 px-8" disabled={!chosen || (chosen !== queue[0]?.id && reason.trim().length < 3)} onClick={doAssign}>Assign</Button></>}>
        <div className="grid gap-2 sm:grid-cols-2">{queue.slice(0, 14).map((c, i) => <button key={c.id} onClick={() => setChosen(c.id)} className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left", chosen === c.id ? "border-forest bg-forest-50 ring-2 ring-emerald/25" : "border-line bg-white")}><Avatar name={c.name} seed={c.colorSeed} size={42} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.name}</span><span className="text-xs text-charcoal-500">cat {c.category} · {Cd.roundsToday(db, c.id)} round(s)</span></span>{i === 0 && <Badge tone="gold">next</Badge>}</button>)}</div>
        {chosen && chosen !== queue[0]?.id && <div className="mt-4 space-y-3 rounded-2xl bg-ivory-100 p-4"><p className="text-sm font-medium">This skips the rotation — it is recorded as an exception.</p><ChoiceGroup variant="segment" label="Exception type" value={mode} onChange={setMode} options={[{ value: "preferred", label: "Preferred request", icon: "Heart" }, { value: "override", label: "Override", icon: "ShieldAlert", disabled: !ovr }]} /><Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. requested by golfer" /></Field></div>}
      </Modal>
    </div>
  );
}

/* ------------------------------- cart board ------------------------------- */
const TILE: Record<string, string> = { available: "border-emerald-200 bg-emerald-50 text-emerald-700", reserved: "border-[#CFE1EE] bg-[#E8F1F8] text-[#2C5F85]", dispatched: "border-gold-300 bg-gold-50 text-gold-700", in_use: "border-forest bg-forest text-white", returned: "border-[#F5DFAE] bg-[#FFF3DC] text-[#8A5A00]", inspection: "border-[#F5DFAE] bg-[#FFF3DC] text-[#8A5A00]", maintenance: "border-[#E7B7AE] bg-[#FBEAE7] text-[#9C3326]" };
function CartBoard() {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10); const ok = can("cart.manage"); const [sel, setSel] = useState<string | null>(null); const [issue, setIssue] = useState<string | null>(null); const cart = db.carts.find((c) => c.id === sel);
  const needing = db.bookings.filter((b) => b.date === today && ["confirmed", "arrived", "ready"].includes(b.status) && Ct.cartsFor(db, b.id).length < Ct.requiredCarts(db, b.id)).sort((a, b) => a.time.localeCompare(b.time));
  const book = cart?.bookingId ? db.bookings.find((b) => b.id === cart.bookingId) : undefined; const close = () => setSel(null);
  const A = (label: string, fn: (d: typeof db, c: import("@/lib/services/core").Ctx) => unknown, msg: string, variant: "primary" | "gold" | "outline" | "danger" = "primary") => <Button key={label} variant={variant} className={BIG} disabled={!ok} onClick={() => { if (act(fn as never, msg).ok) close(); }}>{label}</Button>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 text-xs">{Object.entries(TILE).filter(([k]) => k !== "inspection").map(([k, c]) => <span key={k} className={cn("rounded-full border px-3 py-1 font-semibold capitalize", c)}>{k.replace("_", " ")} · {db.carts.filter((x) => x.status === k || (k === "returned" && x.status === "inspection")).length}</span>)}</div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">{db.carts.map((c) => <button key={c.id} onClick={() => setSel(c.id)} className={cn("rounded-2xl border p-3 text-center transition-transform active:scale-95", TILE[c.status])}><Icon name="Car" className="mx-auto h-6 w-6" /><div className="font-display text-2xl font-semibold leading-tight">#{c.no}</div><div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{c.status.replace("_", " ")}</div><div className="mt-0.5 text-[11px] opacity-70">{c.fuel === "electric" ? `${c.battery}%` : "gas"}</div></button>)}</div>
      {needing.length > 0 && <Notice tone="warn"><AlertTriangle className="h-4 w-4 shrink-0" />{needing.length} flight(s) still need carts — open an available cart and choose the flight.</Notice>}
      <Modal open={!!cart} onClose={close} size="sm" title={cart ? <span className="flex items-center gap-2">Cart #{cart.no} <StatusBadge status={cart.status} /></span> : ""}>
        {cart && <div className="space-y-3">
          <p className="text-sm text-charcoal-600">{cart.type} · {cart.fuel === "electric" ? `battery ${cart.battery}%` : "gas"} · {cart.condition}{book ? ` · ${book.contactName} (${fmt12(book.time)})` : ""}</p>{cart.damage && <Notice tone="error" className="text-sm">{cart.damage}</Notice>}
          {cart.status === "available" && <>{needing.length === 0 ? <p className="rounded-xl bg-ivory-100 p-3 text-sm text-charcoal-600">No flights need a cart right now.</p> : needing.map((b) => A(`Assign to ${fmt12(b.time)} · ${names(b)}`, (d, c) => Ct.assignCart(d, c, b.id, cart.id), `Cart #${cart.no} reserved`, "primary"))}</>}
          {cart.status === "reserved" && <>{A("DISPATCH TO TEE", (d, c) => Ct.dispatchCart(d, c, cart.id), `Cart #${cart.no} dispatched`, "gold")}{A("Release from flight", (d, c) => Ct.unassignCart(d, c, cart.id), "Cart released", "outline")}</>}
          {["dispatched", "in_use"].includes(cart.status) && A("CHECK RETURN", (d, c) => Ct.returnCart(d, c, cart.id), "Cart return checked in")}
          {cart.status === "returned" && A("Start inspection", (d, c) => Ct.startInspection(d, c, cart.id), "Inspection started", "outline")}
          {["returned", "inspection"].includes(cart.status) && A("PASS → AVAILABLE", (d, c) => Ct.passInspection(d, c, cart.id), `Cart #${cart.no} available`)}
          {cart.status === "maintenance" && <p className="rounded-xl bg-[#FBEAE7] p-3 text-sm text-[#9C3326]">Under maintenance — cannot be assigned or dispatched. The mechanic and supervisor complete this in Carts.</p>}
          {cart.status !== "maintenance" && <Button variant="danger" className={BIG} disabled={!ok} onClick={() => setIssue(cart.id)}>Report issue / pull from service</Button>}
        </div>}
      </Modal>
      <PromptDialog open={!!issue} onClose={() => setIssue(null)} tone="danger" title="Report cart issue" label="Describe the issue" submitLabel="Mark unavailable" onSubmit={(v) => { if (act((d, c) => Ct.reportCartIssue(d, c, issue!, v), (x) => `Cart marked unavailable — ${x.workOrder.code} created`).ok) close(); }} />
    </div>
  );
}
void bestCart;

/* ---------------------------------- page ---------------------------------- */
export default function FieldPage() {
  const { db, can, session, toast } = useStore(); const avail: Board[] = ([can("view.checkin") && "starter", can("view.caddies") && "caddie", can("view.carts") && "cart"].filter(Boolean)) as Board[];
  const dflt: Board = session.role === "caddie_master" ? "caddie" : session.role === "cart_supervisor" ? "cart" : "starter"; const [board, setBoard] = useState<Board>(dflt);
  useEffect(() => { setBoard(avail.includes(dflt) ? dflt : avail[0] ?? "starter"); }, [session.role]); // eslint-disable-line react-hooks/exhaustive-deps
  const [awake, setAwake] = useState(false); const lock = useRef<{ release: () => Promise<void> } | null>(null); const canWake = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const toggleAwake = async () => { if (awake) { await lock.current?.release(); lock.current = null; setAwake(false); return; } try { lock.current = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen"); setAwake(true); } catch { toast("Your browser did not allow keeping the screen on.", "error"); } };
  useEffect(() => () => { lock.current?.release().catch(() => undefined); }, []);
  const fullscreen = () => { const d = document as Document & { webkitFullscreenElement?: Element }; if (d.fullscreenElement || d.webkitFullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => toast("Fullscreen is not available in this browser.", "error")); };
  const boards = useMemo(() => [{ id: "starter" as Board, label: "Starter", icon: "Flag" }, { id: "caddie" as Board, label: "Caddie Master", icon: "Users" }, { id: "cart" as Board, label: "Cart Supervisor", icon: "Car" }].filter((b) => avail.includes(b.id)), [avail.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!avail.length) return <><PageHeader icon="Tablet" title="Field Console" /><Denied what="The Field Console" /></>;
  return (
    <>
      <PageHeader icon="Tablet" title="Field Console" sub={<span>{fmtDate(db.meta.now.slice(0, 10))} · <b className="text-forest">{fmt12(db.meta.now.slice(11, 16))}</b> demo clock · built for tablets — big buttons, no menus</span>}
        actions={<>{canWake && <Button variant={awake ? "soft" : "outline"} onClick={toggleAwake}><Eye className="h-4 w-4" />{awake ? "Screen stays on" : "Keep screen on"}</Button>}<Button variant="outline" onClick={fullscreen}><Maximize2 className="h-4 w-4" />Fullscreen</Button><Link href="/"><Button variant="ghost"><MonitorUp className="h-4 w-4" />Back to dashboard</Button></Link></>} />
      {boards.length > 1 && <ChoiceGroup variant="tile" label="Console" className="mb-6 max-w-xl" columns={boards.length} value={board} onChange={setBoard} options={boards.map((b) => ({ value: b.id, label: b.label, icon: b.icon }))} />}
      {board === "starter" && <StarterBoard />}{board === "caddie" && <CaddieBoard />}{board === "cart" && <CartBoard />}
    </>
  );
}
