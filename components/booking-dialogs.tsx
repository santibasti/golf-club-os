"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ChoiceGroup, PaymentChoice, HolesChoice, StarRating, BayPicker, CartPicker, DiscountChips } from "./choices";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Field, Input, Modal, Notice, Select, Textarea, cn } from "./ui";
import { PersonPicker, type Person } from "./pickers";
import * as Bk from "@/lib/services/booking";
import type { Booking, Channel, PlayerType, Tee } from "@/lib/types";
import { peso } from "@/lib/format";
import { addDays, fmt12, fmtDate } from "@/lib/time";

interface PRow { key: number; type: PlayerType; person: Person | null; sponsorId: string; typed: string }
let k = 1;

export function BookingFormDialog({ open, onClose, initial, edit, onSaved }: { open: boolean; onClose: () => void; initial?: { date: string; time: string; tee?: Tee }; edit?: Booking; onSaved?: (b: Booking) => void }) {
  const { db, act, can } = useStore(); const ts = db.settings.teeSheet; const today = db.meta.now.slice(0, 10);
  const [date, setDate] = useState(initial?.date ?? today); const [time, setTime] = useState(initial?.time ?? ""); const [tee, setTee] = useState<Tee>(initial?.tee ?? "1");
  const [holes, setHoles] = useState<9 | 18>(18); const [channel, setChannel] = useState<Channel>("phone");
  const [contact, setContact] = useState<Person | null>(null); const [cName, setCName] = useState(""); const [cPhone, setCPhone] = useState("");
  const [rows, setRows] = useState<PRow[]>([]); const [notes, setNotes] = useState(""); const [noCaddie, setNoCaddie] = useState(false);
  const [deposit, setDeposit] = useState(0); const [depMethod, setDepMethod] = useState<"cash" | "gcash" | "card" | "bank_transfer">("cash"); const [override, setOverride] = useState(false); const [err, setErr] = useState<string>();

  useEffect(() => {
    if (!open) return; setErr(undefined);
    if (edit) {
      setDate(edit.date); setTime(edit.time); setTee(edit.tee); setHoles(edit.holes); setChannel(edit.channel); setCName(edit.contactName); setCPhone(edit.contactPhone); setNotes(edit.notes); setNoCaddie(!!edit.noCaddie); setDeposit(0);
      setRows(edit.players.map((p) => ({ key: k++, type: p.type, person: { name: p.name, customerId: p.customerId, memberId: p.memberId }, sponsorId: p.sponsorId ?? "", typed: p.name })));
    } else { setDate(initial?.date ?? today); setTime(initial?.time ?? ""); setTee(initial?.tee ?? "1"); setHoles(18); setChannel(initial?.time && initial.date === today && initial.time < (db.meta.now.slice(11, 16).replace(/^(\d\d):(\d\d)$/, (_, h, m) => { const t = Number(h) * 60 + Number(m) + ts.minNoticeMinutes; return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); })) ? "walk_in" : "phone"); setContact(null); setCName(""); setCPhone(""); setRows([{ key: k++, type: "public", person: null, sponsorId: "", typed: "" }]); setNotes(""); setNoCaddie(false); setDeposit(0); setOverride(false); }
  }, [open, edit, initial?.date, initial?.time, initial?.tee, today]);

  const slots = useMemo(() => Bk.buildSlots(db, date).filter((s) => !s.blocked && (s.bookings.length === 0 || (ts.allowSharedSlots && s.remaining > 0) || (edit && s.bookings.some((b) => b.id === edit.id)))), [db, date, ts.allowSharedSlots, edit]);
  const memberRows = rows.filter((r) => r.type === "member" && r.person?.memberId);
  const priced = rows.map((r) => {
    const name = r.person?.name || r.typed; try { return { ...Bk.priceFor(db, date, holes, { type: r.type, memberId: r.person?.memberId, sponsorId: r.sponsorId || undefined }), name }; } catch { return { rate: 0, label: "—", name }; }
  });
  const total = priced.reduce((a, p) => a + p.rate, 0); const anc = Bk.estimateAncillary(db, rows.length, holes);
  const warn = rows.map((r) => { const m = r.person?.memberId ? db.members.find((x) => x.id === r.person!.memberId) : undefined; return r.type === "member" && m ? Bk.memberEligibility(db, m, date) : null; });
  const upd = (key: number, p: Partial<PRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const pickContact = (p: Person | null, typed?: string) => { setContact(p?.customerId ? p : null); if (p) { setCName(p.name); if (p.phone) setCPhone(p.phone); } else if (typed !== undefined) setCName(typed);
    if (p?.customerId && !edit && rows.length === 1 && !rows[0].person?.name && !rows[0].typed) { const m = p.memberId ? db.members.find((x) => x.id === p.memberId) : undefined; const isM = m && !Bk.memberEligibility(db, m, date); setRows([{ key: rows[0].key, type: isM ? "member" : "public", person: p, sponsorId: "", typed: p.name }]); } };

  const save = () => {
    setErr(undefined);
    if (!time) return setErr("Select a tee time.");
    if (!cName.trim()) return setErr("Enter the booking contact name.");
    const players = rows.map((r, i) => { const name = (r.person?.name || r.typed).trim(); return { name, type: r.type, customerId: r.person?.customerId, memberId: r.type === "member" ? r.person?.memberId : undefined, sponsorId: r.type === "guest" ? r.sponsorId : undefined, _i: i }; });
    for (const p of players) { if (!p.name) return setErr(`Golfer ${p._i + 1}: enter a name.`); if (p.type === "member" && !p.memberId) return setErr(`Golfer ${p._i + 1} (${p.name}): select the member from the search list.`); if (p.type === "guest" && !p.sponsorId) return setErr(`Guest ${p.name}: choose a sponsoring member.`); }
    const clean = players.map(({ _i, ...rest }) => { void _i; return rest; });
    const contactMemberId = contact?.memberId && db.members.find((m) => m.id === contact.memberId)?.status === "active" ? contact.memberId : undefined;
    const res = edit
      ? act((d, c) => { Bk.editBooking(d, c, edit.id, { players: clean, holes, notes, contactName: cName, contactPhone: cPhone, noCaddie }); return d.bookings.find((b) => b.id === edit.id)!; }, "Reservation updated")
      : act((d, c) => Bk.createBooking(d, c, { date, time, tee, holes, channel, players: clean, contactName: cName, contactPhone: cPhone, contactCustomerId: contact?.customerId, contactMemberId, notes, noCaddie, depositAmount: deposit > 0 ? deposit : undefined, depositMethod: depMethod, override }), (b) => `Reservation ${b.ref} saved — simulated SMS confirmation logged`, undefined, (b) => (b.date === db.meta.now.slice(0, 10) ? { label: "Check in when they arrive", href: `/check-in?booking=${b.id}` } : { label: "View the tee sheet", href: `/reservations?date=${b.date}` }));
    if (!res.ok) return setErr(res.error);
    onSaved?.(res.value); onClose();
  };
  const maxP = ts.maxPlayers;
  return (
    <Modal open={open} onClose={onClose} size="xl" title={edit ? `Edit ${edit.ref}` : "New tee-time reservation"}
      footer={<><span className="mr-auto text-sm text-charcoal-500">Est. green fees <b className="text-forest">{peso(total)}</b> · cart ≈ {peso(anc.cartFee)} · caddies ≈ {peso(anc.caddieFee)} <span className="text-xs">(cart/caddie billed at assignment)</span></span><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save}>{edit ? "Save changes" : "Confirm reservation"}</Button></>}>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required><Input type="date" value={date} min={today} disabled={!!edit} onChange={(e) => { setDate(e.target.value); setTime(""); }} /></Field>
            <Field label="Tee time" required><Select value={time} disabled={!!edit} onChange={(e) => setTime(e.target.value)}><option value="">Select…</option>{slots.map((s) => <option key={s.key} value={s.time} disabled={s.past && !override}>{fmt12(s.time)}{ts.startingTees.length > 1 ? ` (tee ${s.tee})` : ""}{s.past ? " — passed" : ""}</option>)}</Select></Field>
            {ts.startingTees.length > 1 && <Field label="Starting tee"><Select value={tee} disabled={!!edit} onChange={(e) => setTee(e.target.value as Tee)}>{ts.startingTees.map((t) => <option key={t}>{t}</option>)}</Select></Field>}
            <Field label="Holes" className="col-span-2"><HolesChoice value={holes} onChange={setHoles} /></Field>
            {!edit && <Field label="Booking channel" className="col-span-2"><ChoiceGroup label="Booking channel" value={channel} onChange={setChannel} columns={5} options={[{ value: "phone", label: "Phone", icon: "Phone" }, { value: "walk_in", label: "Walk-in", icon: "Footprints" }, { value: "member", label: "Member", icon: "IdCard" }, { value: "online", label: "Online", icon: "Globe", hint: "Public / online request" }, { value: "staff", label: "Group", icon: "Users", hint: "Staff / group booking" }]} /></Field>}
          </div>
          <p className="text-xs text-charcoal-500">{fmtDate(date)} · {Bk.dayType(db, date)} rates · public window {ts.advanceDaysPublic} d, member window {ts.advanceDaysMember} d.</p>
          <Field label="Booking contact" required><PersonPicker value={contact} onChange={pickContact} placeholder="Search a customer or type a new name…" /></Field>
          <Field label="Contact phone" required={channel !== "walk_in"}><Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="09xx xxx xxxx" /></Field>
          {!edit && <div className="grid grid-cols-2 gap-3"><Field label={`Deposit (optional)`} hint={`Suggested ${peso(ts.depositPerPlayer * rows.length)}`}><Input type="number" min={0} value={deposit || ""} onChange={(e) => setDeposit(Number(e.target.value))} /></Field><Field label="Deposit method" className="col-span-2"><PaymentChoice value={depMethod} onChange={(v) => setDepMethod(v as typeof depMethod)} /></Field></div>}
          <Field label="Booking notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests, preferred caddie, occasion…" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noCaddie} onChange={(e) => setNoCaddie(e.target.checked)} />Caddie not required for this flight</label>
          {can("booking.override") && !edit && <label className="flex items-center gap-2 text-sm text-gold-700"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />Override booking window / notice rules (audited)</label>}
        </div>
        <div className="lg:col-span-3">
          <div className="mb-2 flex items-center justify-between"><h3 className="font-medium text-forest">Golfers ({rows.length}/{maxP})</h3><Button size="sm" variant="soft" disabled={rows.length >= maxP} onClick={() => setRows((r) => [...r, { key: k++, type: "public", person: null, sponsorId: "", typed: "" }])}><Plus className="h-4 w-4" />Add golfer</Button></div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="rounded-lg border border-charcoal-100 bg-ivory-50/60 p-3">
                <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
                  <ChoiceGroup variant="segment" label="Player type" value={r.type} onChange={(v) => upd(r.key, { type: v, person: null, typed: "", sponsorId: "" })} options={[{ value: "public", label: "Public", icon: "User" }, { value: "member", label: "Member", icon: "IdCard" }, { value: "guest", label: "Guest", icon: "UserPlus", hint: "Sponsored by a member in this flight" }]} />
                  <PersonPicker key={r.key + r.type} value={r.person} kind={r.type === "member" ? "member" : r.type === "guest" || r.type === "public" ? "any" : "any"} onChange={(p, typed) => upd(r.key, { person: p, typed: typed ?? p?.name ?? "" })} placeholder={r.type === "member" ? "Search member name / ID…" : "Golfer name"} />
                  <Button variant="ghost" size="icon" aria-label="Remove golfer" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {r.type === "guest" && <Field label="Sponsoring member" className="mt-2"><Select value={r.sponsorId} onChange={(e) => upd(r.key, { sponsorId: e.target.value })}><option value="">Select a member in this flight…</option>{memberRows.map((m) => <option key={m.key} value={m.person!.memberId}>{m.person!.name} ({m.person!.memberId}) — up to {Bk.guestAllowance(db, m.person!.memberId!)} guest(s)</option>)}</Select></Field>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="text-charcoal-500">Golfer {i + 1}</span><Badge tone={r.type === "member" ? "green" : r.type === "guest" ? "gold" : "neutral"}>{priced[i].label}</Badge><b className="ml-auto tabular-nums text-forest">{peso(priced[i].rate)}</b></div>
                {warn[i] && <Notice tone="error" className="mt-2"><AlertTriangle className="h-4 w-4 shrink-0" />{warn[i]} Switch to Public rate or resolve the membership.</Notice>}
              </div>))}
          </div>
          <div className="mt-3 rounded-lg bg-forest-50 p-3 text-sm"><div className="flex justify-between"><span>Estimated green fees ({holes}H)</span><b>{peso(total)}</b></div><p className="mt-1 text-xs text-charcoal-500">Member status & plan decide the rate; guest rates come from the sponsor&apos;s plan. Final charges are raised at check-in. Assumption: rate tables are configurable in Administration.</p></div>
        </div>
      </div>
      {err && <Notice tone="error" className="mt-4"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</Notice>}
    </Modal>
  );
}

export function RescheduleDialog({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10);
  const [date, setDate] = useState(booking?.date ?? today); const [time, setTime] = useState(""); const [err, setErr] = useState<string>();
  useEffect(() => { if (booking) { setDate(booking.date); setTime(""); setErr(undefined); } }, [booking]);
  if (!booking) return null;
  const slots = Bk.buildSlots(db, date).filter((s) => !s.blocked && !s.past && s.key !== `${booking.date}|${booking.time}|${booking.tee}` && (db.settings.teeSheet.allowSharedSlots ? s.remaining >= booking.players.length : s.bookings.length === 0));
  return (
    <Modal open onClose={onClose} title={`Reschedule ${booking.ref}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { if (!time) return setErr("Choose a new tee time."); const r = act((d, c) => Bk.rescheduleBooking(d, c, booking.id, { date, time, override: can("booking.override") && date !== booking.date ? false : false }), "Reservation rescheduled — simulated SMS sent"); if (!r.ok) setErr(r.error); else onClose(); }}>Move reservation</Button></>}>
      <p className="mb-3 text-sm text-charcoal-600">{booking.contactName} · {booking.players.length} golfer(s) · currently {booking.date} at {fmt12(booking.time)}</p>
      <div className="grid grid-cols-2 gap-3"><Field label="New date"><Input type="date" min={today} max={addDays(today, 30)} value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} /></Field>
        <Field label="Available times"><Select value={time} onChange={(e) => setTime(e.target.value)}><option value="">Select…</option>{slots.map((s) => <option key={s.key} value={s.time}>{fmt12(s.time)}</option>)}</Select></Field></div>
      {slots.length === 0 && <Notice tone="warn" className="mt-3">No open slots on this date.</Notice>}
      {err && <Notice tone="error" className="mt-3">{err}</Notice>}
    </Modal>
  );
}

export function ClosureDialog({ open, onClose, defaultDate, defaultHole, workOrderId, reason: defReason }: { open: boolean; onClose: () => void; defaultDate?: string; defaultHole?: number; workOrderId?: string; reason?: string }) {
  const { db, act } = useStore(); const today = db.meta.now.slice(0, 10);
  const [date, setDate] = useState(defaultDate ?? today); const [from, setFrom] = useState("06:00"); const [to, setTo] = useState("12:00"); const [type, setType] = useState<"full" | "partial" | "tee">(defaultHole ? "partial" : "full");
  const [holes, setHoles] = useState<number[]>(defaultHole ? [defaultHole] : []); const [category, setCategory] = useState<"maintenance" | "tournament" | "weather" | "other">("maintenance"); const [reason, setReason] = useState(defReason ?? ""); const [err, setErr] = useState<string>();
  useEffect(() => { if (open) { setDate(defaultDate ?? today); setReason(defReason ?? ""); setErr(undefined); setHoles(defaultHole ? [defaultHole] : []); setType(defaultHole ? "partial" : "full"); } }, [open, defaultDate, defaultHole, defReason, today]);
  const preview = db.bookings.filter((b) => b.date === date && ["booked", "confirmed", "arrived", "ready"].includes(b.status) && b.time >= from && b.time < to);
  return (
    <Modal open={open} onClose={onClose} title="Create course restriction" size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => { const r = act((d, c) => Bk.createClosure(d, c, { date, from, to, type, tee: "all", holes: type === "partial" ? holes : [], category, reason, workOrderId }), (v) => `Restriction created — ${v.impact.length} reservation(s) affected`); if (!r.ok) setErr(r.error); else onClose(); }}>Apply restriction</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Type" className="col-span-2"><ChoiceGroup label="Restriction type" value={type} onChange={setType} columns={3} options={[{ value: "full", label: "Full course closed", icon: "OctagonX", tone: "red", hint: "Blocks tee times" }, { value: "tee", label: "Tee-time block", icon: "CalendarOff", tone: "amber", hint: "Blocks tee times" }, { value: "partial", label: "Holes restricted", icon: "TriangleAlert", tone: "amber", hint: "Advisory — slots stay bookable" }]} /></Field>
        <Field label="From"><Input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="To"><Input type="time" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Category" className="col-span-2"><ChoiceGroup label="Category" value={category} onChange={setCategory} variant="segment" options={[{ value: "maintenance", label: "Maintenance", icon: "Wrench" }, { value: "tournament", label: "Tournament", icon: "Trophy" }, { value: "weather", label: "Weather", icon: "CloudLightning" }, { value: "other", label: "Other", icon: "Ellipsis" }]} /></Field>
      </div>
      {type === "partial" && <Field label="Restricted holes" className="mt-3"><div className="flex flex-wrap gap-1.5">{db.holes.map((h) => <button type="button" key={h.no} onClick={() => setHoles((hs) => (hs.includes(h.no) ? hs.filter((x) => x !== h.no) : [...hs, h.no]))} className={cn("h-8 w-8 rounded-md border text-xs font-medium", holes.includes(h.no) ? "border-forest bg-forest text-white" : "border-charcoal-200 bg-white")}>{h.no}</button>)}</div></Field>}
      <Field label="Reason" required className="mt-3"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Irrigation repair on holes 12–14" /></Field>
      <Notice tone={preview.length ? "warn" : "info"} className="mt-3">{preview.length ? `${preview.length} existing reservation(s) fall in this window: ${preview.slice(0, 4).map((b) => fmt12(b.time)).join(", ")}${preview.length > 4 ? "…" : ""}. They will be flagged for rescheduling.` : "No existing reservations fall in this window."} Only the selected times are affected — the rest of the course stays bookable.</Notice>
      {err && <Notice tone="error" className="mt-3">{err}</Notice>}
    </Modal>
  );
}
