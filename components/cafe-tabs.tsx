"use client";
import { useEffect, useState } from "react";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, KV, Modal, Notice, Select, cn } from "./ui";
import { PersonPicker, type Person } from "./pickers";
import * as Pos from "@/lib/services/pos";
import { fmt12, minsBetween } from "@/lib/time";
import { peso } from "@/lib/format";
import type { PosOrder } from "@/lib/types";
import { CombinedBillDialog, type VisitResult } from "./combined-bill";

const CATS = [{ id: "beverage", label: "Beverages" }, { id: "coffee", label: "Coffee" }, { id: "meal", label: "Meals" }, { id: "snack", label: "Snacks" }, { id: "refreshment", label: "Course refreshments" }];

/** Running café tabs: orders accumulate on a table/golfer tab; ONE charge + payment at bill-out. */
/** Compact menu used to add items to a café tab from another screen (e.g. the driving range). */
export function CafeMenuGrid({ tabId }: { tabId: string }) {
  const { db, act, can } = useStore(); const [cat, setCat] = useState("coffee");
  return <div><div className="mb-2 flex flex-wrap gap-1.5">{CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={cn("rounded-full px-3 py-1 text-xs font-medium", cat === c.id ? "bg-forest text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200")}>{c.label}</button>)}</div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{db.inventory.filter((i) => i.price != null && i.category === cat).map((i) => <button key={i.id} disabled={!can("pos.sell") || i.qty === 0} onClick={() => act((d, c) => Pos.addCafeLine(d, c, tabId, i.id, 1), `Added ${i.name}`)} className="rounded-lg border border-charcoal-100 bg-white p-2.5 text-left hover:border-gold disabled:opacity-40"><span className="block text-sm font-medium leading-snug">{i.name}</span><span className="text-sm text-forest">{peso(i.price!)}</span><span className={cn("block text-[11px]", i.qty <= i.reorder ? "font-semibold text-[#9C3326]" : "text-charcoal-400")}>{i.qty} left</span></button>)}</div></div>;
}

export function CafeTabs({ onBilled, onVisit }: { onBilled: (o: PosOrder) => void; onVisit?: (r: VisitResult) => void }) {
  const { db, act, can } = useStore(); const sell = can("pos.sell");
  const open = db.cafeTabs.filter((t) => t.status === "open").sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const [sel, setSel] = useState<string | null>(null); const tab = open.find((t) => t.id === sel) ?? null; useEffect(() => { if (sel && !open.some((t) => t.id === sel)) setSel(null); }, [sel, open]);
  const [member, setMember] = useState<Person | null>(null); const [label, setLabel] = useState(""); const [pk, setPk] = useState(0); const [cat, setCat] = useState("coffee");
  const [bill, setBill] = useState(false); const [combo, setCombo] = useState<string | null>(null); const [linkRange, setLinkRange] = useState(""); const [method, setMethod] = useState<Pos.PayMethod>("cash"); const [manual, setManual] = useState(0); const [tender, setTender] = useState(0);
  const mem = member?.memberId ? db.members.find((m) => m.id === member.memberId) : undefined; const tm = tab?.memberId ? db.members.find((m) => m.id === tab.memberId) : undefined;
  const linkedRange = tab?.rangeTabId ? db.rangeTabs.find((x) => x.id === tab.rangeTabId && x.status === "open") : undefined;
  const tot = tab ? Pos.cafeTabTotals(db, tab, bill ? manual : 0) : null; const running = open.reduce((a, t) => a + Pos.cafeTabTotals(db, t).total, 0);
  const start = () => { const r = act((d, c) => { const rt = linkRange ? d.rangeTabs.find((x) => x.id === linkRange) : undefined; const t = Pos.openCafeTab(d, c, { label: rt ? rt.name : label, memberId: rt ? rt.memberId : mem?.id }); if (rt) Pos.linkTabs(d, c, rt.id, t.id); return t; }, (t) => `Tab ${t.no} opened${linkRange ? " and linked to the range tab — one combined bill" : ""} — nothing is charged until bill-out`); if (r.ok) { setSel(r.value.id); setMember(null); setLabel(""); setLinkRange(""); setPk((k) => k + 1); } };
  const go = () => { if (!tab) return; const r = act((d, c) => Pos.billOutCafeTab(d, c, tab.id, { method, manualDiscountPct: manual }), (o) => `Billed out ${peso(o.total)} — ${method === "member_account" ? "charged to member account" : "paid via " + method.replace("_", " ")}`); if (r.ok) { setBill(false); setSel(null); setManual(0); setTender(0); onBilled(r.value); } };
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Card><CardHeader title="Start a tab" sub="For a table or a golfer — no charge until bill-out" /><div className="space-y-3 p-4">
          <Field label="Member (optional)"><PersonPicker key={pk} kind="member" value={member} onChange={(p) => setMember(p)} /></Field>
          {mem && !linkRange && <Badge tone={mem.status === "active" ? "green" : "red"}>{mem.id} {mem.status}{mem.status === "active" ? ` — ${db.plans.find((p) => p.id === mem.planId)?.cafeDiscountPct}% café discount` : " — no privileges"}</Badge>}
          {db.rangeTabs.some((t) => t.status === "open" && !t.cafeTabId) && <Field label="Link to a golfer at the driving range (optional)" hint="Combines range and café into one bill"><Select value={linkRange} onChange={(e) => setLinkRange(e.target.value)}><option value="">Not linked</option>{db.rangeTabs.filter((t) => t.status === "open" && !t.cafeTabId).map((t) => <option key={t.id} value={t.id}>{t.name}{t.bay ? ` — bay ${t.bay}` : ""} ({t.no})</option>)}</Select></Field>}
          {!mem && !linkRange && <Field label="Table / golfer name"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Table 4, Mr. Cruz" /></Field>}
          <Button className="w-full" disabled={!sell} onClick={start}><Plus className="h-4 w-4" />Open tab</Button></div></Card>
        <Card><CardHeader title="Open tabs" sub={`${open.length} open · ${peso(running)} running (unbilled)`} />
          {open.length === 0 ? <Empty icon="Coffee" title="No open tabs" text="Open a tab when a table or golfer sits down." /> : <ul className="divide-y divide-charcoal-100/70">{open.map((t) => { const x = Pos.cafeTabTotals(db, t); return (
            <li key={t.id}><button onClick={() => setSel(t.id)} className={cn("flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ivory-50", sel === t.id && "bg-gold-50")}><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.label}{t.memberId && <Badge tone="green" className="ml-2">{t.memberId}</Badge>}{t.rangeTabId && <Badge tone="gold" className="ml-2">⛳ range</Badge>}</span><span className="block text-xs text-charcoal-500">{t.no} · {minsBetween(t.openedAt, db.meta.now)} min · {x.items} item(s){x.unserved ? ` · ${x.unserved} not served` : ""}</span></span><b className="tabular-nums text-forest">{peso(x.total)}</b></button></li>); })}</ul>}</Card>
      </div>
      <div className="lg:col-span-3">
        {!tab || !tot ? <Card><Empty icon="MousePointerClick" title="Select or open a tab" text="Tap menu items to add them to the tab. Everything is totalled automatically and paid once at bill-out." /></Card> : (
          <Card><CardHeader title={<span className="flex flex-wrap items-center gap-2">{tab.label}{tm && <Badge tone="green">{tm.id}</Badge>}<Badge tone="amber">tab open</Badge>{linkedRange && <Badge tone="gold">⛳ linked to range{linkedRange.bay ? ` · bay ${linkedRange.bay}` : ""}</Badge>}</span>} sub={`${tab.no} · opened ${fmt12(tab.openedAt.slice(11))}`} action={tab.lines.length === 0 && sell ? <Button size="sm" variant="ghost" onClick={() => act((d, c) => Pos.cancelCafeTab(d, c, tab.id), "Tab cancelled")}>Cancel tab</Button> : undefined} />
            <div className="grid gap-5 p-4 md:grid-cols-2">
              <div><div className="mb-2 flex flex-wrap gap-1.5">{CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={cn("rounded-full px-3 py-1 text-xs font-medium", cat === c.id ? "bg-forest text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200")}>{c.label}</button>)}</div>
                <div className="grid grid-cols-2 gap-2">{db.inventory.filter((i) => i.price != null && i.category === cat).map((i) => <button key={i.id} disabled={!sell || i.qty === 0} onClick={() => act((d, c) => Pos.addCafeLine(d, c, tab.id, i.id, 1))} className="rounded-lg border border-charcoal-100 bg-white p-2.5 text-left hover:border-gold disabled:opacity-40"><span className="block text-sm font-medium leading-snug">{i.name}</span><span className="text-sm text-forest">{peso(i.price!)}</span><span className={cn("block text-[11px]", i.qty <= i.reorder ? "font-semibold text-[#9C3326]" : "text-charcoal-400")}>{i.qty} left</span></button>)}</div></div>
              <div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Running bill</h4>
                {tab.lines.length === 0 ? <p className="rounded-lg bg-ivory-100 p-3 text-sm text-charcoal-500">No items yet.</p> : <ul className="mb-3 divide-y divide-charcoal-100/70 rounded-lg border border-charcoal-100">{tab.lines.map((l) => <li key={l.id} className="px-3 py-2 text-sm"><div className="flex items-start gap-2"><span className="min-w-0 flex-1 leading-snug">{l.qty}× {l.name}</span><b className="tabular-nums">{peso(l.qty * l.price)}</b><button aria-label={`Remove ${l.name}`} className="rounded p-1 text-charcoal-400 hover:bg-charcoal-100 hover:text-[#A63D2F]" disabled={!sell} onClick={() => act((d, c) => Pos.removeCafeLine(d, c, tab.id, l.id, "Removed from tab by staff"), "Item removed from tab")}><Trash2 className="h-4 w-4" /></button></div>
                  <div className="mt-1 flex items-center gap-2"><span className="text-xs text-charcoal-400">{fmt12(l.at.slice(11))}</span><Select aria-label="Order status" value={l.fulfil} className="h-7 w-28 py-0 text-xs" disabled={!sell} onChange={(e) => act((d, c) => Pos.setCafeLineStatus(d, c, tab.id, l.id, e.target.value as "new" | "preparing" | "served"))}><option value="new">New</option><option value="preparing">Preparing</option><option value="served">Served</option></Select></div></li>)}</ul>}
                <div className="rounded-lg bg-forest-50 p-3 text-sm"><KV k="Subtotal" v={peso(tot.subtotal, 2)} />{tot.memberPct > 0 && <KV k={`Member discount ${tot.memberPct}%`} v={`-${peso(tot.subtotal * tot.memberPct / 100, 2)}`} />}<div className="flex justify-between border-t border-forest-100 pt-1 text-base"><b>Total so far</b><b className="text-forest">{peso(Pos.cafeTabTotals(db, tab).total, 2)}</b></div></div>
                <p className="mt-2 text-xs text-charcoal-500">Not yet charged — no payment or revenue is recorded until bill-out.</p>
                <Button className="mt-3 w-full" size="lg" disabled={!sell || tab.lines.length === 0} onClick={() => { if (linkedRange) { setCombo(linkedRange.id); return; } setMethod(tm?.status === "active" ? "member_account" : "cash"); setManual(0); setTender(0); setBill(true); }}><Receipt className="h-4 w-4" />{linkedRange ? `Bill out with range · ${peso(Pos.visitTotals(db, linkedRange, tab).grand)}` : `Bill out · ${peso(Pos.cafeTabTotals(db, tab).total)}`}</Button>{linkedRange && <p className="mt-2 text-xs text-charcoal-500">Linked to {linkedRange.name}'s range tab ({peso(Pos.tabTotals(db, linkedRange).total)} so far) — they pay once for everything. <button className="underline" onClick={() => act((d, c) => Pos.unlinkTabs(d, c, tab.id), "Tabs unlinked")}>Unlink</button></p>}</div>
            </div></Card>)}
      </div>
      {combo && <CombinedBillDialog rangeTabId={combo} onClose={() => setCombo(null)} onDone={(r) => { setSel(null); onVisit?.(r); }} />}
      <Modal open={bill && !!tab} onClose={() => setBill(false)} size="sm" title={`Bill out — ${tab?.label ?? ""}`} footer={<><Button variant="outline" onClick={() => setBill(false)}>Back</Button><Button disabled={method === "cash" && tender > 0 && tender < (tot?.total ?? 0)} onClick={go}>{method === "member_account" ? "Charge to member account" : `Confirm payment ${peso(tot?.total ?? 0, 2)}`}</Button></>}>
        {tab && tot && <>
          {tab.lines.some((l) => l.fulfil !== "served") && <Notice tone="warn" className="mb-3">{tot.unserved} item(s) are not marked served yet. Billing out marks everything served.</Notice>}
          <ul className="mb-3 divide-y divide-charcoal-100/70 text-sm">{tab.lines.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.qty}× {l.name}</span><span>{peso(l.qty * l.price, 2)}</span></li>)}</ul>
          <div className="mb-3 rounded-lg bg-forest-50 p-3 text-sm"><KV k="Subtotal" v={peso(tot.subtotal, 2)} />{tot.pct > 0 && <KV k={`Discount ${tot.pct}%`} v={`-${peso(tot.discount, 2)}`} />}<div className="flex justify-between border-t border-forest-100 pt-1 text-base"><b>Total due</b><b className="text-forest">{peso(tot.total, 2)}</b></div></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Authorised discount %" hint={`Staff limit ${db.settings.authority.posDiscountStaffMaxPct}%`}><Input type="number" min={0} max={100} value={manual} onChange={(e) => setManual(Number(e.target.value))} /></Field>
            <Field label="Payment"><Select value={method} onChange={(e) => setMethod(e.target.value as Pos.PayMethod)}><option value="cash">Cash</option><option value="gcash">GCash (simulated)</option><option value="card">Card (simulated)</option><option value="bank_transfer">Bank transfer</option>{tab.memberId && <option value="member_account">Charge to member account</option>}</Select></Field></div>
          {method === "cash" && <Field label="Cash tendered" className="mt-3" hint={tender >= tot.total && tot.total > 0 ? `Change ${peso(tender - tot.total, 2)}` : undefined}><Input type="number" value={tender || ""} onChange={(e) => setTender(Number(e.target.value))} /></Field>}
          <p className="mt-3 text-xs text-charcoal-500">One charge posts to Finance as café revenue. Simulated payment — not an official receipt or BIR invoice.</p></>}
      </Modal>
    </div>
  );
}
