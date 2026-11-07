"use client";
import { useEffect, useState } from "react";
import { Plus, Receipt, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, DataTable, Empty, Field, Input, KV, Kpi, Modal, Notice, PageHeader, Select, cn } from "@/components/ui";
import { PersonPicker, type Person } from "@/components/pickers";
import { CafeMenuGrid } from "@/components/cafe-tabs";
import { CombinedBillDialog, VisitReceipt, type VisitResult } from "@/components/combined-bill";
import * as Pos from "@/lib/services/pos";
import { fmt12, fmtTs, minsBetween } from "@/lib/time";
import { peso } from "@/lib/format";

export default function RangePage() {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10); const items = Pos.RANGE_ITEMS(db); const occ = Pos.bayOccupancy(db);
  const openTabs = db.rangeTabs.filter((t) => t.status === "open").sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const [sel, setSel] = useState<string | null>(null); const tab = openTabs.find((t) => t.id === sel) ?? null;
  useEffect(() => { if (sel && !openTabs.some((t) => t.id === sel)) setSel(null); }, [sel, openTabs]);
  const [member, setMember] = useState<Person | null>(null); const [name, setName] = useState(""); const [bay, setBay] = useState(0); const [pickerKey, setPickerKey] = useState(0);
  const [qty, setQty] = useState<Record<string, number>>({}); const [sessBay, setSessBay] = useState(0); const [bill, setBill] = useState(false); const [combo, setCombo] = useState(false); const [food, setFood] = useState(false); const [visit, setVisit] = useState<VisitResult | null>(null); const [method, setMethod] = useState<Pos.PayMethod>("cash"); const [tender, setTender] = useState(0); const [done, setDone] = useState<{ name: string; total: number; method: string } | null>(null);
  const mem = member?.memberId ? db.members.find((m) => m.id === member.memberId) : undefined; const sell = can("range.sell");
  const tot = tab ? Pos.tabTotals(db, tab) : null; const cafe = tab?.cafeTabId ? db.cafeTabs.find((x) => x.id === tab.cafeTabId && x.status === "open") : undefined; const vt = tab ? Pos.visitTotals(db, tab, cafe) : null; const tabMember = tab?.memberId ? db.members.find((m) => m.id === tab.memberId) : undefined;
  const billed = db.rangeSales.filter((s) => s.date === today).sort((a, b) => b.at.localeCompare(a.at)); const balls = db.inventory.find((i) => i.sku === "RNG-BALL");
  const unbilled = openTabs.reduce((a, t) => a + Pos.tabTotals(db, t).total, 0); const free = Array.from({ length: Pos.RANGE_BAYS }, (_, i) => i + 1);

  const startTab = () => { const r = act((d, c) => Pos.openRangeTab(d, c, { name, memberId: mem?.id, bay: bay || undefined }), (t) => `Tab ${t.no} opened for ${t.name} — nothing is charged until bill-out`); if (r.ok) { setSel(r.value.id); setMember(null); setName(""); setBay(0); setPickerKey((k) => k + 1); } };
  const add = (code: string) => { if (!tab) return; const q = qty[code] || 1; const r = act((d, c) => Pos.addRangeLine(d, c, tab.id, code, q, sessBay || undefined), `Added ${q}× to the tab`); if (r.ok) { setQty({ ...qty, [code]: 0 }); setSessBay(0); } };
  const doBill = () => { if (!tab) return; const nm = tab.name; const r = act((d, c) => Pos.billOutRangeTab(d, c, tab.id, method), (s) => `Billed out ${peso(s.amount)} — ${method === "member_account" ? "charged to member account" : "paid via " + method.replace("_", " ")}`); if (r.ok) { setBill(false); setDone({ name: nm, total: r.value.amount, method }); setSel(null); setTender(0); } };

  return (
    <>
      <PageHeader icon="Target" title="Driving Range" sub={`${Pos.RANGE_BAYS} bays · running tabs: items accumulate while the golfer plays, one bill is paid at bill-out`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="Open tabs" value={openTabs.length} icon="ReceiptText" sub="players still practising" /><Kpi label="Running (unbilled)" value={peso(unbilled)} icon="Hourglass" tone="gold" sub="not yet charged or paid" /><Kpi label="Billed today" value={peso(billed.reduce((a, s) => a + s.amount, 0))} icon="Banknote" sub={`${billed.length} bill-outs`} /><Kpi label="Bays occupied" value={`${Object.keys(occ).length}/${Pos.RANGE_BAYS}`} icon="LayoutGrid" /><Kpi label="Range balls" value={balls?.qty.toLocaleString() ?? "—"} icon="CircleDot" tone={balls && balls.qty <= balls.reorder ? "red" : "neutral"} sub="inventory pieces" /></div>
      {done && <Notice tone="ok" className="mb-4 items-center justify-between"><span><b>{done.name}</b> billed out {peso(done.total)} ({done.method.replace("_", " ")}). Bay released.</span><button aria-label="Dismiss" onClick={() => setDone(null)}><X className="h-4 w-4" /></button></Notice>}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Start a new tab" sub="Check the golfer in — no charge is created yet" /><div className="space-y-3 p-4">
            <Field label="Member (optional)"><PersonPicker key={pickerKey} kind="member" value={member} onChange={(p) => setMember(p)} /></Field>
            {mem && <Badge tone={mem.status === "active" ? "green" : "red"}>{mem.id} {mem.status}{mem.status === "active" ? ` — ${db.plans.find((p) => p.id === mem.planId)?.rangeDiscountPct}% range discount` : " — no privileges"}</Badge>}
            {!mem && <Field label="Golfer name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in golfer" /></Field>}
            <Field label="Bay (optional now — required for bay sessions)"><Select value={bay} onChange={(e) => setBay(Number(e.target.value))}><option value={0}>No bay yet</option>{free.map((b) => <option key={b} value={b} disabled={!!occ[b]}>Bay {b}{occ[b] ? ` — ${occ[b].name}` : ""}</option>)}</Select></Field>
            <Button className="w-full" disabled={!sell} onClick={startTab}><Plus className="h-4 w-4" />Open tab</Button></div></Card>
          <Card><CardHeader title="Open tabs" sub="Select one to add items or bill out" />
            {openTabs.length === 0 ? <Empty icon="ReceiptText" title="No open tabs" text="Start a tab when a golfer arrives at the range." /> : <ul className="divide-y divide-charcoal-100/70">{openTabs.map((t) => { const x = Pos.tabTotals(db, t); return (
              <li key={t.id}><button onClick={() => setSel(t.id)} className={cn("flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ivory-50", sel === t.id && "bg-gold-50")}><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.name}{t.memberId && <Badge tone="green" className="ml-2">{t.memberId}</Badge>}{t.cafeTabId && <Badge tone="gold" className="ml-2">+ café</Badge>}</span><span className="block text-xs text-charcoal-500">{t.no} · since {fmt12(t.openedAt.slice(11))} ({minsBetween(t.openedAt, db.meta.now)} min){t.bay ? ` · bay ${t.bay}` : ""} · {t.lines.length} item(s)</span></span><b className="tabular-nums text-forest">{peso(Pos.visitTotals(db, t, t.cafeTabId ? db.cafeTabs.find((c) => c.id === t.cafeTabId) : undefined).grand)}</b></button></li>); })}</ul>}</Card>
        </div>

        <div className="space-y-4 lg:col-span-3">
          {!tab ? <Card><Empty icon="MousePointerClick" title="Select or open a tab" text="Items you add stay on the tab and are totalled automatically. Nothing is paid until you bill out." /></Card> : tot && (
            <Card><CardHeader title={<span className="flex flex-wrap items-center gap-2">{tab.name}{tabMember && <Badge tone={tabMember.status === "active" ? "green" : "red"}>{tabMember.id}</Badge>}<Badge tone="amber">tab open</Badge></span>} sub={`${tab.no} · opened ${fmtTs(tab.openedAt)}${tab.bay ? ` · bay ${tab.bay}` : " · no bay"}`}
              action={tab.lines.length === 0 && sell ? <Button size="sm" variant="ghost" onClick={() => act((d, c) => Pos.cancelRangeTab(d, c, tab.id), "Tab cancelled")}>Cancel tab</Button> : undefined} />
              <div className="grid gap-5 p-4 md:grid-cols-2">
                <div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Add to tab</h4>
                  <div className="space-y-2">{items.map((i) => <div key={i.code} className="flex items-center gap-2 text-sm"><span className="flex-1">{i.name}<span className="ml-1 text-xs text-charcoal-400">{peso(i.price)}</span></span><Input type="number" min={1} className="h-9 w-16" placeholder="1" value={qty[i.code] || ""} onChange={(e) => setQty({ ...qty, [i.code]: Math.max(0, Number(e.target.value)) })} aria-label={`${i.name} quantity`} /><Button size="sm" variant="soft" disabled={!sell} onClick={() => add(i.code)}>Add</Button></div>)}</div>
                  {!tab.bay && <Field label="Bay for a practice session" className="mt-3" hint="Pick a bay only if adding a bay session"><Select value={sessBay} onChange={(e) => setSessBay(Number(e.target.value))}><option value={0}>Select bay…</option>{free.map((b) => <option key={b} value={b} disabled={!!occ[b]}>Bay {b}{occ[b] ? " (occupied)" : ""}</option>)}</Select></Field>}</div>
                <div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Running bill</h4>
                  {tab.lines.length === 0 ? <p className="rounded-lg bg-ivory-100 p-3 text-sm text-charcoal-500">No items yet.</p> : <ul className="mb-3 divide-y divide-charcoal-100/70 rounded-lg border border-charcoal-100">{tab.lines.map((l) => <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="flex-1">{l.qty}× {l.name}<span className="block text-xs text-charcoal-400">{fmt12(l.at.slice(11))}</span></span><b className="tabular-nums">{peso(l.qty * l.price)}</b><button aria-label={`Remove ${l.name}`} className="rounded p-1 text-charcoal-400 hover:bg-charcoal-100 hover:text-[#A63D2F]" disabled={!sell} onClick={() => act((d, c) => Pos.removeRangeLine(d, c, tab.id, l.id), "Item removed from tab")}><Trash2 className="h-4 w-4" /></button></li>)}</ul>}
                  <div className="rounded-lg bg-forest-50 p-3 text-sm"><KV k="Subtotal" v={peso(tot.gross, 2)} />{tot.pct > 0 && <KV k={`Member discount ${tot.pct}%`} v={`-${peso(tot.discount, 2)}`} />}<div className="flex justify-between border-t border-forest-100 pt-1 text-base"><b>Total so far</b><b className="text-forest">{peso(tot.total, 2)}</b></div></div>
                  {cafe && <div className="mt-2 rounded-lg border border-gold-300 bg-gold-50 p-3 text-sm"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold-700">Café orders on this visit ({cafe.no})</p>{cafe.lines.length === 0 ? <p className="text-xs text-charcoal-500">Nothing ordered yet.</p> : <ul className="mb-1">{cafe.lines.map((l) => <li key={l.id} className="flex justify-between"><span>{l.qty}× {l.name}</span><span>{peso(l.qty * l.price)}</span></li>)}</ul>}<KV k="Range" v={peso(vt!.range.total, 2)} /><KV k="Café" v={peso(vt!.cafe?.total ?? 0, 2)} /><div className="flex justify-between border-t border-gold-300 pt-1 text-base"><b>Combined total</b><b className="text-forest">{peso(vt!.grand, 2)}</b></div></div>}
                  <Button className="mt-3 w-full" variant="soft" disabled={!sell} onClick={() => { const r = act((d, c) => Pos.orderFoodForRangeTab(d, c, tab.id)); if (r.ok) setFood(true); }}>🍴 {cafe ? "Add food & drinks" : "Order food & drinks (links café tab)"}</Button>
                  <p className="mt-2 text-xs text-charcoal-500">Not yet charged — no payment or revenue is recorded until bill-out.</p>
                  <Button className="mt-3 w-full" size="lg" disabled={!sell || (tab.lines.length === 0 && !(cafe && cafe.lines.length))} onClick={() => { if (cafe) { setCombo(true); return; } setMethod(tabMember?.status === "active" ? "member_account" : "cash"); setTender(0); setBill(true); }}><Receipt className="h-4 w-4" />{cafe ? `Bill out range + café · ${peso(vt!.grand)}` : `Bill out · ${peso(tot.total)}`}</Button>{cafe && <button className="mt-2 text-xs text-charcoal-500 underline" onClick={() => act((d, c) => Pos.unlinkTabs(d, c, tab.id), "Tabs unlinked")}>Unlink café tab</button>}</div>
              </div></Card>)}

          <Card><CardHeader title="Bay availability" sub="A bay stays occupied until the golfer's tab is billed out" /><div className="grid grid-cols-5 gap-2 p-4 sm:grid-cols-10">{free.map((b) => <div key={b} title={occ[b] ? `${occ[b].name}${occ[b].endsAt ? " until " + occ[b].endsAt.slice(11) : " (tab open)"}` : "Free"} className={cn("rounded-lg border p-2 text-center text-xs", occ[b] ? "border-forest bg-forest text-white" : "border-emerald-200 bg-emerald-50 text-emerald-700")}><b className="text-sm">{b}</b><div className="truncate">{occ[b] ? occ[b].name.split(" ")[0] : "free"}</div></div>)}</div></Card>
          <Card><CardHeader title="Billed today" /><DataTable dense rows={billed} rowKey={(s) => s.id} maxRows={8} empty={<Empty title="No bill-outs yet" />} columns={[{ key: "t", header: "Time", render: (s) => fmt12(s.at.slice(11)) }, { key: "n", header: "Golfer", render: (s) => s.name }, { key: "i", header: "Items", render: (s) => <span className="block max-w-xs truncate text-xs">{s.items.map((i) => `${i.qty}× ${i.name.split(" (")[0]}`).join(", ")}</span> }, { key: "a", header: "Total", align: "right", render: (s) => peso(s.amount) }, { key: "m", header: "Paid via", render: (s) => <span className="text-xs">{s.method.replace("_", " ")}</span> }]} /></Card>
        </div>
      </div>

      {combo && tab && <CombinedBillDialog rangeTabId={tab.id} onClose={() => setCombo(false)} onDone={(r) => { setDone({ name: r.name, total: r.grand, method: r.method }); setSel(null); setVisit(r); }} />}
      {visit && <VisitReceipt r={visit} onClose={() => setVisit(null)} />}
      <Modal open={food && !!cafe} onClose={() => setFood(false)} size="lg" title={`Food & drinks — ${tab?.name ?? ""}`} footer={<><span className="mr-auto text-sm text-charcoal-500">{cafe?.lines.length ?? 0} item(s) · {peso(vt?.cafe?.total ?? 0)} — added to this golfer's range tab, paid once at bill-out</span><Button onClick={() => setFood(false)}>Done</Button></>}>{cafe && <CafeMenuGrid tabId={cafe.id} />}</Modal>
      <Modal open={bill && !!tab} onClose={() => setBill(false)} size="sm" title={`Bill out — ${tab?.name ?? ""}`} footer={<><Button variant="outline" onClick={() => setBill(false)}>Back</Button><Button disabled={method === "cash" && tender > 0 && tender < (tot?.total ?? 0)} onClick={doBill}>{method === "member_account" ? "Charge to member account" : `Confirm payment ${peso(tot?.total ?? 0, 2)}`}</Button></>}>
        {tab && tot && <><ul className="mb-3 divide-y divide-charcoal-100/70 text-sm">{tab.lines.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.qty}× {l.name}</span><span>{peso(l.qty * l.price, 2)}</span></li>)}</ul>
          <div className="mb-3 rounded-lg bg-forest-50 p-3 text-sm"><KV k="Subtotal" v={peso(tot.gross, 2)} />{tot.pct > 0 && <KV k={`Member discount ${tot.pct}%`} v={`-${peso(tot.discount, 2)}`} />}<div className="flex justify-between border-t border-forest-100 pt-1 text-base"><b>Total due</b><b className="text-forest">{peso(tot.total, 2)}</b></div></div>
          <Field label="Payment method"><Select value={method} onChange={(e) => setMethod(e.target.value as Pos.PayMethod)}><option value="cash">Cash</option><option value="gcash">GCash (simulated)</option><option value="card">Card (simulated)</option><option value="bank_transfer">Bank transfer</option>{tab.memberId && <option value="member_account">Charge to member account</option>}</Select></Field>
          {method === "cash" && <Field label="Cash tendered" className="mt-3" hint={tender >= tot.total && tot.total > 0 ? `Change ${peso(tender - tot.total, 2)}` : undefined}><Input type="number" value={tender || ""} onChange={(e) => setTender(Number(e.target.value))} /></Field>}
          <p className="mt-3 text-xs text-charcoal-500">One charge is posted to Finance as range revenue and the bay is released. Simulated payment only — not an official receipt.</p></>}
      </Modal>
    </>
  );
}
