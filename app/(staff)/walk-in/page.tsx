"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleDashed, CircleX, Footprints, Minus } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, Denied, Field, Input, Notice, PageHeader, Select, cn } from "@/components/ui";
import { ChoiceGroup, HolesChoice } from "@/components/choices";
import { PersonPicker, type Person } from "@/components/pickers";
import * as Bk from "@/lib/services/booking";
import * as Cd from "@/lib/services/caddie";
import * as Ct from "@/lib/services/cart";
import { walkIn, walkInEstimate, type WalkInResult } from "@/lib/services/walkin";
import { fmt12, minsBetween, mkTs } from "@/lib/time";
import { peso } from "@/lib/format";
import type { PaymentMethod, PlayerType } from "@/lib/types";

interface Row { type: PlayerType; person: Person | null; sponsorId: string; typed: string }
const blank = (): Row => ({ type: "public", person: null, sponsorId: "", typed: "" });
const STEPS = ["Golfers", "Tee time", "Caddies & carts", "Review & pay"];

export default function WalkInPage() {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10); const nowT = db.meta.now.slice(11, 16); const ts = db.settings.teeSheet;
  const [step, setStep] = useState(0); const [holes, setHoles] = useState<9 | 18>(18); const [contact, setContact] = useState<Person | null>(null); const [cName, setCName] = useState(""); const [cPhone, setCPhone] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]); const [time, setTime] = useState(""); const [wantCaddies, setWantCaddies] = useState(true); const [wantCarts, setWantCarts] = useState(true); const [pay, setPay] = useState<PaymentMethod | "later">("cash");
  const [err, setErr] = useState<string>(); const [result, setResult] = useState<WalkInResult | null>(null);
  const allowed = can("booking.create") && can("checkin.manage");

  const slots = useMemo(() => Bk.buildSlots(db, today).filter((s) => !s.blocked && minsBetween(db.meta.now, mkTs(today, s.time)) >= -15 && (ts.allowSharedSlots ? s.remaining >= rows.length : s.bookings.length === 0)).slice(0, 12), [db, today, ts.allowSharedSlots, rows.length]);
  const chosen = time || slots[0]?.time || ""; const queue = Cd.rotationQueue(db); const availCarts = db.carts.filter((c) => c.status === "available").length; const needC = wantCaddies && db.settings.rates.caddieRequired ? Math.ceil(rows.length / db.settings.rates.playersPerCaddie) : 0; const needK = wantCarts ? Math.ceil(rows.length / db.settings.rates.playersPerCart) : 0;
  const nameOf = (r: Row) => (r.person?.name || r.typed).trim(); const memberRows = rows.filter((r) => r.type === "member" && r.person?.memberId);
  const priced = rows.map((r) => { try { return Bk.priceFor(db, today, holes, { type: r.type, memberId: r.person?.memberId, sponsorId: r.sponsorId || undefined }); } catch { return { rate: 0, label: "—" }; } });
  const green = priced.reduce((a, p) => a + p.rate, 0); const est = walkInEstimate(db, rows.length, holes, wantCaddies, wantCarts);
  const contactMember = contact?.memberId ? db.members.find((m) => m.id === contact.memberId) : undefined; const acct = (id?: string) => { const m = id ? db.members.find((x) => x.id === id) : undefined; const pl = m && db.plans.find((p) => p.id === m.planId); return !!(m && m.status === "active" && pl?.accountCharging && m.billingPref === "account"); };
  const onAccount = rows.reduce((a, r, i) => a + ((r.type === "member" && acct(r.person?.memberId)) || (r.type === "guest" && db.settings.billing.guestFeeBillTo === "sponsor" && acct(r.sponsorId)) ? priced[i].rate : 0), 0) + (acct(contactMember?.id) ? est.cartFee : 0);
  const dueNow = Math.max(0, green + est.cartFee - onAccount);

  const upd = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const setSize = (n: number) => setRows((rs) => (n > rs.length ? [...rs, ...Array.from({ length: n - rs.length }, blank)] : rs.slice(0, n)));
  const pickContact = (p: Person | null, typed?: string) => { setContact(p?.customerId ? p : null); if (p) { setCName(p.name); if (p.phone) setCPhone(p.phone); } else if (typed !== undefined) setCName(typed);
    if (p?.customerId && !rows[0].person?.name && !rows[0].typed) { const m = p.memberId ? db.members.find((x) => x.id === p.memberId) : undefined; upd(0, { type: m && m.status === "active" ? "member" : "public", person: p, typed: p.name }); } };
  const v1 = (): string | null => { if (!cName.trim()) return "Enter the contact name."; for (const [i, r] of rows.entries()) { if (!nameOf(r)) return `Golfer ${i + 1}: enter a name.`; if (r.type === "member" && !r.person?.memberId) return `Golfer ${i + 1}: pick the member from the search list.`; if (r.type === "guest" && !r.sponsorId) return `Golfer ${i + 1}: choose the sponsoring member.`; } return null; };
  const next = () => { setErr(undefined); if (step === 0) { const e = v1(); if (e) return setErr(e); } if (step === 1 && !chosen) return setErr("No tee time is available right now."); setStep((s) => s + 1); };
  const reset = () => { setStep(0); setRows([blank()]); setContact(null); setCName(""); setCPhone(""); setTime(""); setResult(null); setErr(undefined); setWantCaddies(true); setWantCarts(true); setPay("cash"); setHoles(18); };
  const run = () => {
    setErr(undefined);
    const players = rows.map((r) => ({ name: nameOf(r), type: r.type, customerId: r.person?.customerId, memberId: r.type === "member" ? r.person?.memberId : undefined, sponsorId: r.type === "guest" ? r.sponsorId : undefined }));
    const res = act((d, c) => walkIn(d, c, { time: chosen, holes, players, contactName: cName, contactPhone: cPhone, contactCustomerId: contact?.customerId, contactMemberId: contactMember?.status === "active" ? contactMember.id : undefined, wantCaddies, wantCarts, payMethod: pay === "later" ? null : pay }), (r) => (r.ready ? `Walk-in ready for the starter — ${r.booking.ref}` : `Walk-in checked in — ${r.booking.ref} (see what's left)`));
    if (!res.ok) { setErr(res.error); return; } setResult(res.value);
  };

  if (!allowed) return <><PageHeader icon="Footprints" title="Walk-in Wizard" /><Denied perm="booking.create + checkin.manage" what="The walk-in wizard" /></>;

  if (result) {
    const b = result.booking; const icon = { done: <CheckCircle2 className="h-5 w-5 text-emerald" />, skipped: <Minus className="h-5 w-5 text-charcoal-400" />, failed: <CircleX className="h-5 w-5 text-[#B4473A]" /> };
    return (<><PageHeader icon="Footprints" title="Walk-in Wizard" sub="Done — here is exactly what happened" />
      <div className="mx-auto max-w-3xl space-y-4">
        <Card className={cn("overflow-hidden", result.ready ? "border-emerald-200" : "border-[#F1DDAA]")}>
          <div className={cn("flex items-center gap-4 p-6", result.ready ? "bg-emerald-50" : "bg-[#FFF9EA]")}><span className={cn("grid h-14 w-14 place-items-center rounded-2xl text-white", result.ready ? "bg-emerald" : "bg-[#D98E04]")}>{result.ready ? <Check className="h-8 w-8" /> : <AlertTriangle className="h-7 w-7" />}</span>
            <div><h2 className="font-display text-2xl font-semibold text-forest">{result.ready ? "Ready for the starter" : "Checked in — a few things are still open"}</h2><p className="text-sm text-charcoal-600">{b.ref} · {b.contactName} · {b.players.length} golfer(s) · tee {fmt12(b.time)} · {b.holes} holes</p></div></div>
          <ul className="divide-y divide-line/60">{result.steps.map((s) => <li key={s.key} className="flex items-start gap-3 px-6 py-3">{icon[s.status]}<div className="min-w-0 flex-1"><p className={cn("text-sm font-medium", s.status === "skipped" && "text-charcoal-500")}>{s.label}</p>{s.detail && <p className={cn("text-xs", s.status === "failed" ? "text-[#9C3326]" : "text-charcoal-500")}>{s.detail}</p>}</div><Badge tone={s.status === "done" ? "green" : s.status === "failed" ? "red" : "neutral"}>{s.status}</Badge></li>)}</ul>
          <div className="flex flex-wrap items-center gap-4 border-t border-line bg-ivory-50 px-6 py-3 text-sm"><span>Collected now <b className="text-forest">{peso(result.collected, 2)}</b></span><span>Still due at counter <b className={result.due > 0 ? "text-[#9C3326]" : "text-forest"}>{peso(result.due, 2)}</b></span><span className="text-xs text-charcoal-500">Caddie fees are billed after the round.</span></div>
        </Card>
        <div className="flex flex-wrap gap-2"><Link href="/check-in?tab=starter"><Button>Open starter dashboard <ArrowRight className="h-4 w-4" /></Button></Link><Link href={`/check-in?booking=${b.id}`}><Button variant="outline">Check-in record</Button></Link><Button variant="soft" onClick={reset}><Footprints className="h-4 w-4" />Next walk-in</Button></div>
      </div></>);
  }

  return (
    <>
      <PageHeader icon="Footprints" title="Walk-in Wizard" sub="Book, check in, assign caddie & cart, collect payment and hand off to the starter — in one guided flow" />
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Progress">{STEPS.map((s, i) => <li key={s} className={cn("rounded-xl border px-3 py-2.5 text-center text-xs font-medium sm:text-sm", i === step ? "border-forest bg-forest text-white shadow-sm" : i < step ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line bg-white text-charcoal-400")}><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[11px] font-bold">{i < step ? "✓" : i + 1}</span><span className="hidden sm:inline">{s}</span></li>)}</ol>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title={`Step ${step + 1} · ${STEPS[step]}`} />
          <div className="space-y-4 p-5">
            {step === 0 && <>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Contact / party leader" required><PersonPicker value={contact} onChange={pickContact} placeholder="Search a customer or type a name…" /></Field><Field label="Mobile (optional)"><Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="09xx xxx xxxx" /></Field></div>
              <div className="flex flex-wrap items-end gap-6"><Field label="How many golfers?"><ChoiceGroup label="Party size" variant="segment" value={rows.length} onChange={setSize} options={Array.from({ length: ts.maxPlayers }, (_, i) => ({ value: i + 1, label: String(i + 1), icon: "User" }))} /></Field><Field label="Holes"><HolesChoice value={holes} onChange={setHoles} /></Field></div>
              <div className="space-y-2">{rows.map((r, i) => <div key={i} className="rounded-xl border border-line bg-ivory-50/70 p-3"><div className="flex flex-wrap items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-forest text-xs font-bold text-white">{i + 1}</span>
                <ChoiceGroup variant="segment" label="Player type" value={r.type} onChange={(v) => upd(i, { type: v, person: null, typed: "", sponsorId: "" })} options={[{ value: "public", label: "Public", icon: "User" }, { value: "member", label: "Member", icon: "IdCard" }, { value: "guest", label: "Guest", icon: "UserPlus" }]} />
                <div className="min-w-[12rem] flex-1"><PersonPicker key={i + r.type} value={r.person} kind={r.type === "member" ? "member" : "any"} onChange={(p, typed) => upd(i, { person: p, typed: typed ?? p?.name ?? "" })} placeholder={r.type === "member" ? "Search member…" : "Golfer name"} /></div></div>
                {r.type === "guest" && <Field label="Sponsoring member" className="mt-2"><Select value={r.sponsorId} onChange={(e) => upd(i, { sponsorId: e.target.value })}><option value="">Select a member in this party…</option>{memberRows.map((m) => <option key={m.person!.memberId} value={m.person!.memberId}>{m.person!.name} ({m.person!.memberId})</option>)}</Select></Field>}
                <p className="mt-1.5 text-xs text-charcoal-500">{priced[i].label} · <b className="text-forest">{peso(priced[i].rate)}</b></p></div>)}</div></>}
            {step === 1 && <>
              <p className="text-sm text-charcoal-600">The next open tee times for {rows.length} golfer(s). The earliest is pre-selected.</p>
              {slots.length === 0 ? <Notice tone="warn"><AlertTriangle className="h-4 w-4 shrink-0" />No tee times are open for the rest of today. Use the Reservations screen to book another day.</Notice> :
                <div role="radiogroup" aria-label="Tee time" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{slots.map((s) => { const on = chosen === s.time; const mins = minsBetween(db.meta.now, mkTs(today, s.time)); return <button key={s.key} type="button" role="radio" aria-checked={on} onClick={() => setTime(s.time)} className={cn("rounded-xl border p-3 text-left transition-all", on ? "border-forest bg-forest text-white shadow-sm" : "border-charcoal-200 bg-white hover:border-emerald hover:bg-emerald-50/50")}><div className="font-display text-xl font-semibold">{fmt12(s.time)}</div><div className={cn("text-xs", on ? "text-white/75" : "text-charcoal-500")}>{mins <= 0 ? "now" : `in ${mins} min`}</div>{s.restricted.length > 0 && <div className={cn("mt-1 text-[11px] font-medium", on ? "text-gold-300" : "text-[#8A5A00]")}>Holes {s.restricted[0].holes.join(", ")} restricted</div>}</button>; })}</div>}</>}
            {step === 2 && <div className="grid gap-5 md:grid-cols-2">
              <div><h4 className="mb-2 text-sm font-semibold text-forest">Caddies</h4><ChoiceGroup label="Caddies" columns={2} value={wantCaddies ? "yes" : "no"} onChange={(v) => setWantCaddies(v === "yes")} options={[{ value: "yes", label: "Next in rotation", icon: "Users" }, { value: "no", label: "No caddie", icon: "UserX" }]} />
                <p className="mt-2 text-xs text-charcoal-600">{needC === 0 ? "No caddie for this flight." : `${needC} needed · ${queue.length} available${queue.length ? ` · next up: ${queue.slice(0, needC).map((c) => c.name.split(" ")[0]).join(", ")}` : ""}`}</p>{needC > queue.length && <Notice tone="warn" className="mt-2 py-1.5 text-xs">Not enough caddies in the queue — some will have to be assigned later.</Notice>}</div>
              <div><h4 className="mb-2 text-sm font-semibold text-forest">Golf carts</h4><ChoiceGroup label="Carts" columns={2} value={wantCarts ? "yes" : "no"} onChange={(v) => setWantCarts(v === "yes")} options={[{ value: "yes", label: "Assign automatically", icon: "Car" }, { value: "no", label: "No cart", icon: "Footprints" }]} />
                <p className="mt-2 text-xs text-charcoal-600">{needK === 0 ? "Walking — no cart." : `${needK} needed · ${availCarts} available (best battery first)`}</p>{needK > availCarts && <Notice tone="warn" className="mt-2 py-1.5 text-xs">Not enough carts available right now.</Notice>}</div></div>}
            {step === 3 && <>
              <div className="overflow-hidden rounded-xl border border-line"><table className="w-full text-sm"><tbody>
                {rows.map((r, i) => <tr key={i} className="border-b border-line/60"><td className="px-4 py-2">{nameOf(r)} <span className="text-xs text-charcoal-400">{priced[i].label}</span></td><td className="px-4 py-2 text-right tabular-nums">{peso(priced[i].rate)}</td></tr>)}
                {needK > 0 && <tr className="border-b border-line/60"><td className="px-4 py-2">Cart rental × {needK}</td><td className="px-4 py-2 text-right tabular-nums">≈ {peso(est.cartFee)}</td></tr>}
                {needC > 0 && <tr className="border-b border-line/60 text-charcoal-500"><td className="px-4 py-2">Caddie service × {needC} <span className="text-xs">(billed after the round)</span></td><td className="px-4 py-2 text-right tabular-nums">≈ {peso(est.caddieFee)}</td></tr>}
                {onAccount > 0 && <tr className="border-b border-line/60 text-charcoal-500"><td className="px-4 py-2">Posted to member account</td><td className="px-4 py-2 text-right tabular-nums">− {peso(onAccount)}</td></tr>}
                <tr className="bg-forest-50"><td className="px-4 py-3 font-semibold text-forest">Collect now (estimate)</td><td className="px-4 py-3 text-right text-lg font-semibold tabular-nums text-forest">{peso(dueNow)}</td></tr></tbody></table></div>
              <Field label="Payment"><ChoiceGroup label="Payment" columns={5} value={pay} onChange={setPay} options={[{ value: "cash", label: "Cash", icon: "Banknote" }, { value: "gcash", label: "GCash", icon: "Smartphone", hint: "Simulated" }, { value: "card", label: "Card", icon: "CreditCard", hint: "Simulated" }, { value: "bank_transfer", label: "Bank", icon: "Landmark" }, { value: "later", label: "Pay later", icon: "Clock", tone: "amber", hint: "The starter can't release until it's paid" }]} /></Field>
              {pay === "later" && dueNow > 0 && <Notice tone="warn"><AlertTriangle className="h-4 w-4 shrink-0" />The flight will be checked in but <b>not ready</b> until the cashier collects {peso(dueNow)}.</Notice>}
              <p className="text-xs text-charcoal-500">Simulated payment — not an official receipt. Rates, caddie and cart fees follow Administration settings; final amounts are posted by the system.</p></>}
            {err && <Notice tone="error"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</Notice>}
          </div>
          <div className="flex items-center justify-between border-t border-line bg-ivory-50 px-5 py-3 sm:rounded-b-2xl"><Button variant="outline" disabled={step === 0} onClick={() => { setErr(undefined); setStep((s) => s - 1); }}><ArrowLeft className="h-4 w-4" />Back</Button>
            {step < 3 ? <Button onClick={next}>Continue <ArrowRight className="h-4 w-4" /></Button> : <Button variant="gold" size="lg" onClick={run}><Check className="h-5 w-5" />Check in & send to starter</Button>}</div>
        </Card>
        <Card className="h-fit lg:sticky lg:top-28"><CardHeader title="Summary" sub={`${rows.length} golfer(s) · ${holes} holes`} />
          <div className="space-y-2 p-5 text-sm"><div className="flex justify-between"><span className="text-charcoal-500">Contact</span><b className="truncate pl-3">{cName || "—"}</b></div><div className="flex justify-between"><span className="text-charcoal-500">Tee time</span><b>{chosen ? fmt12(chosen) : "—"}</b></div>
            <div className="flex justify-between"><span className="text-charcoal-500">Green fees</span><b className="tabular-nums">{peso(green)}</b></div><div className="flex justify-between"><span className="text-charcoal-500">Caddies / carts</span><b>{needC} / {needK}</b></div><div className="flex justify-between border-t border-line pt-2 text-base"><span className="font-medium">Collect now</span><b className="tabular-nums text-forest">{peso(dueNow)}</b></div>
            <p className="flex items-start gap-1.5 pt-1 text-xs text-charcoal-500"><CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0" />At the end the system books, checks in, assigns caddies & carts, takes payment, dispatches carts and marks the flight ready — and tells you honestly if any step could not be done.</p></div></Card>
      </div>
    </>
  );
}
