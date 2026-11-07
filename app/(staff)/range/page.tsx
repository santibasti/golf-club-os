"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, DataTable, Empty, Field, Input, Kpi, Notice, PageHeader, Select, cn } from "@/components/ui";
import { PersonPicker, type Person } from "@/components/pickers";
import * as Pos from "@/lib/services/pos";
import { fmt12 } from "@/lib/time";
import { peso } from "@/lib/format";

export default function RangePage() {
  const { db, act, can } = useStore(); const today = db.meta.now.slice(0, 10); const items = Pos.RANGE_ITEMS(db); const occ = Pos.bayOccupancy(db);
  const [qty, setQty] = useState<Record<string, number>>({}); const [member, setMember] = useState<Person | null>(null); const [name, setName] = useState(""); const [bay, setBay] = useState(0); const [method, setMethod] = useState<Pos.PayMethod>("cash");
  const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([code, q]) => ({ code, qty: q })); const gross = lines.reduce((a, l) => a + items.find((i) => i.code === l.code)!.price * l.qty, 0);
  const mem = member?.memberId ? db.members.find((m) => m.id === member.memberId) : undefined; const pct = mem?.status === "active" ? db.plans.find((p) => p.id === mem.planId)?.rangeDiscountPct ?? 0 : 0;
  const sales = db.rangeSales.filter((s) => s.date === today).sort((a, b) => b.at.localeCompare(a.at)); const balls = db.inventory.find((i) => i.sku === "RNG-BALL"); const needBay = (qty["SES-30"] ?? 0) > 0;
  return (
    <>
      <PageHeader icon="Target" title="Driving Range" sub={`${Pos.RANGE_BAYS} bays · member discounts per plan · sales post to Finance as range revenue`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label="Sales today" value={peso(sales.reduce((a, s) => a + s.amount, 0))} icon="Banknote" sub={`${sales.length} transactions`} /><Kpi label="Bays occupied" value={`${Object.keys(occ).length}/${Pos.RANGE_BAYS}`} icon="LayoutGrid" /><Kpi label="Utilization now" value={`${Math.round((Object.keys(occ).length / Pos.RANGE_BAYS) * 100)}%`} icon="Gauge" /><Kpi label="Range balls" value={balls?.qty.toLocaleString() ?? "—"} icon="CircleDot" tone={balls && balls.qty <= balls.reorder ? "red" : "neutral"} sub="inventory pieces" /></div>
      <div className="grid gap-4 lg:grid-cols-5"><Card className="lg:col-span-2"><CardHeader title="Range check-in & sale" /><div className="space-y-3 p-4">
        <Field label="Member (optional)"><PersonPicker kind="member" value={member} onChange={(p) => setMember(p)} /></Field>{mem && <Badge tone={mem.status === "active" ? "green" : "red"}>{mem.id} {mem.status}{mem.status === "active" ? ` — ${pct}% range discount` : " — no privileges"}</Badge>}{!mem && <Field label="Customer name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in" /></Field>}
        {items.map((i) => <div key={i.code} className="flex items-center gap-2 text-sm"><span className="flex-1">{i.name}<span className="ml-2 text-xs text-charcoal-400">{peso(i.price)}</span></span><Input type="number" min={0} className="w-20" value={qty[i.code] ?? 0} onChange={(e) => setQty({ ...qty, [i.code]: Math.max(0, Number(e.target.value)) })} aria-label={i.name} /></div>)}
        {needBay && <Field label="Bay"><Select value={bay} onChange={(e) => setBay(Number(e.target.value))}><option value={0}>Select bay…</option>{Array.from({ length: Pos.RANGE_BAYS }, (_, i) => i + 1).map((b) => <option key={b} value={b} disabled={!!occ[b]}>Bay {b}{occ[b] ? " (occupied)" : ""}</option>)}</Select></Field>}
        <Field label="Payment"><Select value={method} onChange={(e) => setMethod(e.target.value as Pos.PayMethod)}><option value="cash">Cash</option><option value="gcash">GCash (simulated)</option><option value="card">Card (simulated)</option><option value="member_account">Charge to member account</option></Select></Field>
        <div className="rounded-lg bg-forest-50 p-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{peso(gross)}</span></div>{pct > 0 && <div className="flex justify-between"><span>Member discount {pct}%</span><span>-{peso(gross * pct / 100)}</span></div>}<div className="flex justify-between font-bold text-forest"><span>Total</span><span>{peso(gross - gross * pct / 100)}</span></div></div>
        <Button className="w-full" disabled={!can("range.sell") || lines.length === 0} onClick={() => { const r = act((d, c) => Pos.sellRange(d, c, { items: lines, name, memberId: mem?.id, bay: needBay ? bay : undefined, method }), (s) => `Range sale recorded — ${peso(s.amount)}`); if (r.ok) { setQty({}); setBay(0); } }}>Complete sale</Button></div></Card>
        <div className="space-y-4 lg:col-span-3"><Card><CardHeader title="Bay availability" sub="Occupied bays free up automatically when the session time ends (demo clock)" /><div className="grid grid-cols-5 gap-2 p-4 sm:grid-cols-10">{Array.from({ length: Pos.RANGE_BAYS }, (_, i) => i + 1).map((b) => <div key={b} title={occ[b] ? `${occ[b].name} until ${occ[b].endsAt?.slice(11)}` : "Free"} className={cn("rounded-lg border p-2 text-center text-xs", occ[b] ? "border-forest bg-forest text-white" : "border-emerald-200 bg-emerald-50 text-emerald-700")}><b className="text-sm">{b}</b><div>{occ[b] ? fmt12(occ[b].endsAt!.slice(11)) : "free"}</div></div>)}</div>
          {Object.values(occ).length > 0 && <div className="border-t p-3">{Object.values(occ).map((s) => <Button key={s.id} size="sm" variant="ghost" onClick={() => act((d, c) => Pos.endRangeSession(d, c, s.id), `Bay ${s.bay} released`)}>End bay {s.bay}</Button>)}</div>}</Card>
          <Card><CardHeader title="Sales today" /><DataTable dense rows={sales} rowKey={(s) => s.id} maxRows={10} empty={<Empty title="No range sales yet" />} columns={[{ key: "t", header: "Time", render: (s) => fmt12(s.at.slice(11)) }, { key: "n", header: "Customer", render: (s) => s.name }, { key: "i", header: "Items", render: (s) => <span className="text-xs">{s.items.map((i) => `${i.qty}× ${i.name.split(" (")[0]}`).join(", ")}</span> }, { key: "b", header: "Bay", render: (s) => s.bay ?? "—" }, { key: "a", header: "Net", align: "right", render: (s) => peso(s.amount) }, { key: "m", header: "Via", render: (s) => <span className="text-xs">{s.method.replace("_", " ")}</span> }]} /></Card></div></div>
      <Notice tone="info" className="mt-4">Equipment rental (club sets) is sold here and its stock is tracked in Inventory. Range ball inventory is deducted per bucket.</Notice>
    </>
  );
}
