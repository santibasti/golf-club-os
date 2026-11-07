"use client";
import { useEffect, useRef, useState } from "react";
import { Phone, Plus, Receipt, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, DataTable, Empty, Field, Input, KV, Kpi, Modal, Notice, PageHeader, cn } from "@/components/ui";
import { PersonPicker, type Person } from "@/components/pickers";
import { CafeMenuGrid } from "@/components/cafe-tabs";
import { CombinedBillDialog, VisitReceipt, type VisitResult } from "@/components/combined-bill";
import { PaymentChoice } from "@/components/choices";
import * as Pos from "@/lib/services/pos";
import { fmt12, fmtTs, minsBetween } from "@/lib/time";
import { peso } from "@/lib/format";

export default function RangePage() {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10); const items = Pos.RANGE_ITEMS(db); const occ = Pos.bayOccupancy(db); const sell = can("range.sell");
  const openTabs = db.rangeTabs.filter((t) => t.status === "open").sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  const [sel, setSel] = useState<string | null>(null); const tab = openTabs.find((t) => t.id === sel) ?? null;
  useEffect(() => { if (sel && !openTabs.some((t) => t.id === sel)) setSel(null); }, [sel, openTabs]);
  const [member, setMember] = useState<Person | null>(null); const [name, setName] = useState(""); const [bay, setBay] = useState(0); const [pickerKey, setPickerKey] = useState(0);
  const [qty, setQty] = useState<Record<string, number>>({}); const [bill, setBill] = useState(false); const [combo, setCombo] = useState(false); const [food, setFood] = useState(false); const [visit, setVisit] = useState<VisitResult | null>(null);
  const [method, setMethod] = useState<Pos.PayMethod>("cash"); const [tender, setTender] = useState(0); const [done, setDone] = useState<{ name: string; total: number; method: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null); const scrollToPanel = () => setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  const mem = member?.memberId ? db.members.find((m) => m.id === member.memberId) : undefined;
  const cafeOf = (t: { cafeTabId?: string }) => (t.cafeTabId ? db.cafeTabs.find((x) => x.id === t.cafeTabId && x.status === "open") : undefined);
  const cafe = tab ? cafeOf(tab) : undefined; const tot = tab ? Pos.tabTotals(db, tab) : null; const vt = tab ? Pos.visitTotals(db, tab, cafe) : null;
  const tabMember = tab?.memberId ? db.members.find((m) => m.id === tab.memberId) : undefined; const tabCust = tab?.customerId ? db.customers.find((c) => c.id === tab.customerId) : undefined; const tabPlan = tabMember ? db.plans.find((p) => p.id === tabMember.planId) : undefined;
  const billed = db.rangeSales.filter((s) => s.date === today).sort((a, b) => b.at.localeCompare(a.at)); const balls = db.inventory.find((i) => i.sku === "RNG-BALL");
  const running = openTabs.reduce((a, t) => a + Pos.visitTotals(db, t, cafeOf(t)).grand, 0); const bays = Array.from({ length: Pos.RANGE_BAYS }, (_, i) => i + 1); const noBay = openTabs.filter((t) => !t.bay);

  const clickBay = (b: number) => { const o = occ[b]; if (o?.tabId) { setSel(o.tabId); scrollToPanel(); } else if (!o) { setSel(null); setBay(b); scrollToPanel(); } };
  const startTab = () => { const r = act((d, c) => Pos.openRangeTab(d, c, { name, memberId: mem?.id, bay: bay || undefined }), (t) => `Tab ${t.no} opened${t.bay ? ` on bay ${t.bay}` : ""} — nothing is charged until bill-out`); if (r.ok) { setSel(r.value.id); setMember(null); setName(""); setBay(0); setPickerKey((k) => k + 1); } };
  const add = (code: string) => { if (!tab) return; const q = qty[code] || 1; const r = act((d, c) => Pos.addRangeLine(d, c, tab.id, code, q), `Added ${q}× to the tab`); if (r.ok) setQty({ ...qty, [code]: 0 }); };

  return (
    <>
      <PageHeader icon="Target" title="Driving Range" sub={`${Pos.RANGE_BAYS} bays · tap a bay to start or view a golfer's running tab — one bill at bill-out`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5"><Kpi label="Open tabs" value={openTabs.length} icon="ReceiptText" sub="players still practising" /><Kpi label="Running (unbilled)" value={peso(running)} icon="Hourglass" tone="gold" sub="not yet charged or paid" /><Kpi label="Billed today" value={peso(billed.reduce((a, s) => a + s.amount, 0))} icon="Banknote" sub={`${billed.length} bill-outs`} /><Kpi label="Bays occupied" value={`${Object.keys(occ).length}/${Pos.RANGE_BAYS}`} icon="LayoutGrid" /><Kpi label="Range balls" value={balls?.qty.toLocaleString() ?? "—"} icon="CircleDot" tone={balls && balls.qty <= balls.reorder ? "red" : "neutral"} sub="inventory pieces" /></div>
      {done && <Notice tone="ok" className="mb-4 items-center justify-between"><span><b>{done.name}</b> billed out {peso(done.total)} ({done.method.replace("_", " ")}). Bay released.</span><button aria-label="Dismiss" onClick={() => setDone(null)}><X className="h-4 w-4" /></button></Notice>}

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <Card><CardHeader title="Bay board" sub="Tap an occupied bay for the golfer and running bill · tap a free bay to start a tab there" action={<Button size="sm" variant="soft" disabled={!sell} onClick={() => { setSel(null); setBay(0); scrollToPanel(); }}><Plus className="h-4 w-4" />Tab without a bay</Button>} />
            <div className="grid grid-cols-4 gap-2.5 p-4 sm:grid-cols-5">
              {bays.map((b) => { const o = occ[b]; const t = o?.tabId ? openTabs.find((x) => x.id === o.tabId) : undefined; const g = t ? Pos.visitTotals(db, t, cafeOf(t)) : null; const isSel = (t && sel === t.id) || (!o && !sel && bay === b);
                return (
                  <button key={b} type="button" onClick={() => clickBay(b)} disabled={!!o && !t} aria-label={t ? `Bay ${b}, ${t.name}, running ${peso(g!.grand)}` : o ? `Bay ${b}, occupied by ${o.name}` : `Bay ${b}, free — start a tab`}
                    className={cn("group relative flex min-h-[5.5rem] flex-col items-start justify-between rounded-xl border p-2.5 text-left transition-all", t ? "border-forest bg-gradient-to-b from-forest-700 to-forest text-white shadow-sm hover:shadow-lift" : o ? "cursor-default border-charcoal-200 bg-charcoal-100/70 text-charcoal-500" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald hover:bg-emerald-100", isSel && "ring-[3px] ring-gold ring-offset-2")}>
                    <span className="flex w-full items-center justify-between"><span className="font-display text-xl font-semibold leading-none">{b}</span>{t?.cafeTabId && <span title="Has café orders" className="text-xs">🍴</span>}</span>
                    {t ? <span className="w-full"><span className="block truncate text-[13px] font-semibold leading-tight">{t.name.split(" ")[0]}</span><span className="flex items-baseline justify-between text-[11px] text-white/80"><span>{minsBetween(t.openedAt, db.meta.now)} min</span><b className="text-sm text-gold-300 tabular-nums">{peso(g!.grand)}</b></span></span>
                      : o ? <span className="w-full truncate text-[12px] font-medium">{o.name.split(" ")[0]}<span className="block text-[10px] opacity-70">until {o.endsAt?.slice(11)}</span></span>
                      : <span className="text-[12px] font-medium opacity-80 group-hover:opacity-100">Free · tap to start</span>}
                  </button>); })}
            </div>
            {noBay.length > 0 && <div className="border-t border-line px-4 py-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">No bay yet · {noBay.length}</p><div className="flex flex-wrap gap-2">{noBay.map((t) => <button key={t.id} onClick={() => { setSel(t.id); scrollToPanel(); }} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium", sel === t.id ? "border-gold bg-gold-50 text-gold-700 ring-2 ring-gold/30" : "border-charcoal-200 bg-white hover:bg-ivory-50")}>{t.name.split(" ")[0]}<b className="tabular-nums text-forest">{peso(Pos.visitTotals(db, t, cafeOf(t)).grand)}</b></button>)}</div></div>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-ivory-50 px-4 py-2 text-[11px] text-charcoal-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-forest" />occupied (open tab)</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-200" />free</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-charcoal-200" />occupied (timed session)</span><span className="ml-auto">Amounts are running totals — not yet charged</span></div>
          </Card>
        </div>

        <div ref={panel} className="scroll-mt-28 space-y-4 xl:col-span-2">
          {!tab || !tot || !vt ? (
            <Card><CardHeader title={bay ? `Start a tab on bay ${bay}` : "Start a new tab"} sub="Check the golfer in — no charge is created yet" action={bay ? <button className="text-xs text-charcoal-500 underline" onClick={() => setBay(0)}>Clear bay</button> : undefined} />
              <div className="space-y-3 p-4">
                <Field label="Member (optional)"><PersonPicker key={pickerKey} kind="member" value={member} onChange={(p) => setMember(p)} /></Field>
                {mem && <Badge tone={mem.status === "active" ? "green" : "red"}>{mem.id} {mem.status}{mem.status === "active" ? ` — ${db.plans.find((p) => p.id === mem.planId)?.rangeDiscountPct}% range discount` : " — no privileges"}</Badge>}
                {!mem && <Field label="Golfer name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in golfer" /></Field>}
                <div className="flex items-center gap-2 rounded-xl bg-ivory-100 px-3 py-2.5 text-sm">{bay ? <><span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 font-display text-base font-semibold text-emerald-700">{bay}</span><span>Bay {bay} selected</span></> : <span className="text-charcoal-500">No bay yet — tap a free bay on the board, or add one later with a bay session.</span>}</div>
                <Button className="w-full" disabled={!sell} onClick={startTab}><Plus className="h-4 w-4" />Open tab{bay ? ` on bay ${bay}` : ""}</Button></div></Card>
          ) : (
            <Card>
              <CardHeader title={<span className="flex flex-wrap items-center gap-2">{tab.name}{tabMember && <Badge tone={tabMember.status === "active" ? "green" : "red"}>{tabMember.id}</Badge>}<Badge tone="amber">tab open</Badge></span>} sub={`${tab.no} · ${tab.bay ? `bay ${tab.bay}` : "no bay"}`}
                action={<div className="flex items-center gap-1">{tab.lines.length === 0 && !cafe?.lines.length && sell && <Button size="sm" variant="ghost" onClick={() => act((d, c) => Pos.cancelRangeTab(d, c, tab.id), "Tab cancelled")}>Cancel tab</Button>}<button aria-label="Close panel" className="rounded-lg p-1.5 text-charcoal-400 hover:bg-charcoal-100" onClick={() => setSel(null)}><X className="h-4 w-4" /></button></div>} />
              <div className="p-4">
                <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-ivory-100 p-3 text-sm sm:grid-cols-3">
                  <div><p className="text-[11px] uppercase tracking-wide text-charcoal-400">Golfer</p><p className="font-medium">{tab.name}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-charcoal-400">Type</p><p className="font-medium">{tabMember ? `${tabPlan?.name ?? "Member"} member` : "Public golfer"}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-charcoal-400">Discount</p><p className="font-medium">{tot.pct > 0 ? `${tot.pct}% range${tabPlan ? ` · ${tabPlan.cafeDiscountPct}% café` : ""}` : "none"}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-charcoal-400">Started</p><p className="font-medium">{fmt12(tab.openedAt.slice(11))} · {minsBetween(tab.openedAt, db.meta.now)} min</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-charcoal-400">Contact</p><p className="flex items-center gap-1 font-medium">{tabCust ? <><Phone className="h-3 w-3 text-charcoal-400" />{tabCust.phone}</> : "—"}</p></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-charcoal-400">Balls used</p><p className="font-medium">{tot.balls || 0}{tot.minutes ? ` · ${tot.minutes} min session` : ""}</p></div>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Add to tab</h4>
                    <div className="space-y-2">{items.map((i) => <div key={i.code} className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 leading-tight">{i.name}<span className="ml-1 text-xs text-charcoal-400">{peso(i.price)}</span></span><Input type="number" min={1} className="h-9 w-14 px-2" placeholder="1" value={qty[i.code] || ""} onChange={(e) => setQty({ ...qty, [i.code]: Math.max(0, Number(e.target.value)) })} aria-label={`${i.name} quantity`} /><Button size="sm" variant="soft" disabled={!sell || (i.code === "SES-30" && !tab.bay)} title={i.code === "SES-30" && !tab.bay ? "Tap a free bay on the board first" : ""} onClick={() => add(i.code)}>Add</Button></div>)}</div>
                    {!tab.bay && <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#FFF9EA] p-2.5 text-xs text-[#6F4B00]">No bay on this tab. To add a bay session, move it to a free bay: <Select2 tabId={tab.id} /></div>}</div>
                  <div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Running bill</h4>
                    {tab.lines.length === 0 ? <p className="rounded-lg bg-ivory-100 p-3 text-sm text-charcoal-500">No items yet.</p> : <ul className="mb-3 divide-y divide-line/60 rounded-xl border border-line">{tab.lines.map((l) => <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="flex-1 leading-tight">{l.qty}× {l.name}<span className="block text-xs text-charcoal-400">{fmt12(l.at.slice(11))}</span></span><b className="tabular-nums">{peso(l.qty * l.price)}</b><button aria-label={`Remove ${l.name}`} className="rounded p-1 text-charcoal-400 hover:bg-charcoal-100 hover:text-[#A63D2F]" disabled={!sell} onClick={() => act((d, c) => Pos.removeRangeLine(d, c, tab.id, l.id), "Item removed from tab")}><Trash2 className="h-4 w-4" /></button></li>)}</ul>}
                    <div className="rounded-xl bg-forest-50 p-3 text-sm"><KV k="Range subtotal" v={peso(tot.gross, 2)} />{tot.pct > 0 && <KV k={`Member discount ${tot.pct}%`} v={`-${peso(tot.discount, 2)}`} />}{!cafe && <div className="flex justify-between border-t border-forest-100 pt-1 text-base"><b>Total so far</b><b className="text-forest">{peso(tot.total, 2)}</b></div>}</div>
                    {cafe && <div className="mt-2 rounded-xl border border-gold-300 bg-gold-50 p-3 text-sm"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gold-700">Café orders on this visit ({cafe.no})</p>{cafe.lines.length === 0 ? <p className="text-xs text-charcoal-500">Nothing ordered yet.</p> : <ul className="mb-1">{cafe.lines.map((l) => <li key={l.id} className="flex justify-between"><span>{l.qty}× {l.name}</span><span>{peso(l.qty * l.price)}</span></li>)}</ul>}<KV k="Range" v={peso(vt.range.total, 2)} /><KV k="Café" v={peso(vt.cafe?.total ?? 0, 2)} /><div className="flex justify-between border-t border-gold-300 pt-1 text-base"><b>Combined total</b><b className="text-forest">{peso(vt.grand, 2)}</b></div></div>}
                    <Button className="mt-3 w-full" variant="soft" disabled={!sell} onClick={() => { const r = act((d, c) => Pos.orderFoodForRangeTab(d, c, tab.id)); if (r.ok) setFood(true); }}>🍴 {cafe ? "Add food & drinks" : "Order food & drinks (links café tab)"}</Button>
                    <p className="mt-2 text-xs text-charcoal-500">Not yet charged — no payment or revenue is recorded until bill-out.</p>
                    <Button className="mt-3 w-full" size="lg" disabled={!sell || (tab.lines.length === 0 && !(cafe && cafe.lines.length))} onClick={() => { if (cafe) { setCombo(true); return; } setMethod(tabMember?.status === "active" ? "member_account" : "cash"); setTender(0); setBill(true); }}><Receipt className="h-4 w-4" />{cafe ? `Bill out range + café · ${peso(vt.grand)}` : `Bill out · ${peso(tot.total)}`}</Button>
                    {cafe && <button className="mt-2 text-xs text-charcoal-500 underline" onClick={() => act((d, c) => Pos.unlinkTabs(d, c, tab.id), "Tabs unlinked")}>Unlink café tab</button>}</div>
                </div>
              </div></Card>)}
        </div>
      </div>

      <Card className="mt-4"><CardHeader title="Billed today" /><DataTable dense rows={billed} rowKey={(s) => s.id} maxRows={8} empty={<Empty title="No bill-outs yet" />} columns={[{ key: "t", header: "Time", render: (s) => fmt12(s.at.slice(11)) }, { key: "n", header: "Golfer", render: (s) => s.name }, { key: "i", header: "Items", render: (s) => <span className="block max-w-md truncate text-xs">{s.items.map((i) => `${i.qty}× ${i.name.split(" (")[0]}`).join(", ")}</span> }, { key: "a", header: "Total", align: "right", render: (s) => peso(s.amount) }, { key: "m", header: "Paid via", render: (s) => <span className="text-xs">{s.method.replace("_", " ")}</span> }]} /></Card>

      {combo && tab && <CombinedBillDialog rangeTabId={tab.id} onClose={() => setCombo(false)} onDone={(r) => { setDone({ name: r.name, total: r.grand, method: r.method }); setSel(null); setVisit(r); }} />}
      {visit && <VisitReceipt r={visit} onClose={() => setVisit(null)} />}
      <Modal open={food && !!cafe} onClose={() => setFood(false)} size="lg" title={`Food & drinks — ${tab?.name ?? ""}`} footer={<><span className="mr-auto text-sm text-charcoal-500">{cafe?.lines.length ?? 0} item(s) · {peso(vt?.cafe?.total ?? 0)} — added to this golfer&apos;s range tab, paid once at bill-out</span><Button onClick={() => setFood(false)}>Done</Button></>}>{cafe && <CafeMenuGrid tabId={cafe.id} />}</Modal>
      <Modal open={bill && !!tab} onClose={() => setBill(false)} size="sm" title={`Bill out — ${tab?.name ?? ""}`} footer={<><Button variant="outline" onClick={() => setBill(false)}>Back</Button><Button disabled={method === "cash" && tender > 0 && tender < (tot?.total ?? 0)} onClick={() => { if (!tab) return; const nm = tab.name; const r = act((d, c) => Pos.billOutRangeTab(d, c, tab.id, method), (s) => `Billed out ${peso(s.amount)} — ${method === "member_account" ? "charged to member account" : "paid via " + method.replace("_", " ")}`); if (r.ok) { setBill(false); setDone({ name: nm, total: r.value.amount, method }); setSel(null); setTender(0); } }}>{method === "member_account" ? "Charge to member account" : `Confirm payment ${peso(tot?.total ?? 0, 2)}`}</Button></>}>
        {tab && tot && <><ul className="mb-3 divide-y divide-line/60 text-sm">{tab.lines.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.qty}× {l.name}</span><span>{peso(l.qty * l.price, 2)}</span></li>)}</ul>
          <div className="mb-3 rounded-xl bg-forest-50 p-3 text-sm"><KV k="Subtotal" v={peso(tot.gross, 2)} />{tot.pct > 0 && <KV k={`Member discount ${tot.pct}%`} v={`-${peso(tot.discount, 2)}`} />}<div className="flex justify-between border-t border-forest-100 pt-1 text-base"><b>Total due</b><b className="text-forest">{peso(tot.total, 2)}</b></div></div>
          <Field label="Payment method"><PaymentChoice value={method} onChange={setMethod} memberAccount={!!tab.memberId} /></Field>
          {method === "cash" && <Field label="Cash tendered" className="mt-3" hint={tender >= tot.total && tot.total > 0 ? `Change ${peso(tender - tot.total, 2)}` : undefined}><Input type="number" value={tender || ""} onChange={(e) => setTender(Number(e.target.value))} /></Field>}
          <p className="mt-3 text-xs text-charcoal-500">One charge is posted to Finance as range revenue and the bay is released. Simulated payment only — not an official receipt.</p></>}
      </Modal>
    </>
  );
  void fmtTs;
}

/** Move a bay-less tab onto a free bay (needed before a bay session can be added). */
function Select2({ tabId }: { tabId: string }) {
  const { db, act } = useStore(); const occ = Pos.bayOccupancy(db); const free = Array.from({ length: Pos.RANGE_BAYS }, (_, i) => i + 1).filter((b) => !occ[b]);
  return <span className="inline-flex flex-wrap gap-1">{free.slice(0, 6).map((b) => <button key={b} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100" onClick={() => act((d, c) => Pos.assignTabBay(d, c, tabId, b), `Tab moved to bay ${b}`)}>{b}</button>)}{free.length === 0 && "no free bays"}</span>;
}
