"use client";
import { useState } from "react";
import { Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button, Field, Input, KV, Modal, Notice, Select } from "./ui";
import * as Pos from "@/lib/services/pos";
import { fmtTs } from "@/lib/time";
import { peso } from "@/lib/format";
import type { PosOrder, RangeSale } from "@/lib/types";

export interface VisitResult { sale: RangeSale | null; order: PosOrder | null; grand: number; method: string; name: string }

/** One bill for a golfer's whole visit: range + café lines, one payment. */
export function CombinedBillDialog({ rangeTabId, onClose, onDone }: { rangeTabId: string; onClose: () => void; onDone: (r: VisitResult) => void }) {
  const { db, act } = useStore(); const r = db.rangeTabs.find((x) => x.id === rangeTabId); const c = r?.cafeTabId ? db.cafeTabs.find((x) => x.id === r.cafeTabId) : undefined;
  const mem = r?.memberId ? db.members.find((m) => m.id === r.memberId) : undefined;
  const [method, setMethod] = useState<Pos.PayMethod>(mem?.status === "active" ? "member_account" : "cash"); const [manual, setManual] = useState(0); const [tender, setTender] = useState(0);
  if (!r) return null; const v = Pos.visitTotals(db, r, c, manual); const unserved = c?.lines.filter((l) => l.fulfil !== "served").length ?? 0;
  const go = () => { const res = act((d, ctx) => Pos.billOutCombined(d, ctx, r.id, { method, manualDiscountPct: manual }), (x) => `Visit billed out ${peso(x.grand)} — one payment (${method.replace("_", " ")}); range and café revenue posted separately`); if (res.ok) { onDone({ ...res.value, method, name: r.name }); onClose(); } };
  return (
    <Modal open onClose={onClose} size="md" title={`Combined bill — ${r.name}`} footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button disabled={method === "cash" && tender > 0 && tender < v.grand} onClick={go}>{method === "member_account" ? `Charge ${peso(v.grand, 2)} to member account` : `Confirm payment ${peso(v.grand, 2)}`}</Button></>}>
      {unserved > 0 && <Notice tone="warn" className="mb-3">{unserved} café item(s) are not marked served yet. Billing out marks everything served.</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Driving range · {r.no}{r.bay ? ` · bay ${r.bay}` : ""}</h4>{r.lines.length === 0 ? <p className="text-sm text-charcoal-400">No range items</p> : <ul className="divide-y divide-charcoal-100/70 text-sm">{r.lines.map((l) => <li key={l.id} className="flex justify-between py-1"><span>{l.qty}× {l.name}</span><span>{peso(l.qty * l.price, 2)}</span></li>)}</ul>}
          <div className="mt-1 text-sm"><KV k="Range subtotal" v={peso(v.range.gross, 2)} />{v.range.pct > 0 && <KV k={`Member discount ${v.range.pct}%`} v={`-${peso(v.range.discount, 2)}`} />}</div></div>
        <div><h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-500">Café · {c?.no ?? "—"}</h4>{!c || c.lines.length === 0 ? <p className="text-sm text-charcoal-400">No café items</p> : <ul className="divide-y divide-charcoal-100/70 text-sm">{c.lines.map((l) => <li key={l.id} className="flex justify-between py-1"><span>{l.qty}× {l.name}</span><span>{peso(l.qty * l.price, 2)}</span></li>)}</ul>}
          {v.cafe && <div className="mt-1 text-sm"><KV k="Café subtotal" v={peso(v.cafe.subtotal, 2)} />{v.cafe.pct > 0 && <KV k={`Discount ${v.cafe.pct}%`} v={`-${peso(v.cafe.discount, 2)}`} />}</div>}</div>
      </div>
      <div className="my-4 rounded-lg bg-forest-50 p-3"><div className="flex justify-between text-lg"><b>Total due (one payment)</b><b className="text-forest">{peso(v.grand, 2)}</b></div></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Authorised café discount %" hint={`Staff limit ${db.settings.authority.posDiscountStaffMaxPct}%`}><Input type="number" min={0} max={100} value={manual} onChange={(e) => setManual(Number(e.target.value))} /></Field>
        <Field label="Payment"><Select value={method} onChange={(e) => setMethod(e.target.value as Pos.PayMethod)}><option value="cash">Cash</option><option value="gcash">GCash (simulated)</option><option value="card">Card (simulated)</option><option value="bank_transfer">Bank transfer</option>{r.memberId && <option value="member_account">Charge to member account</option>}</Select></Field></div>
      {method === "cash" && <Field label="Cash tendered" className="mt-3" hint={tender >= v.grand && v.grand > 0 ? `Change ${peso(tender - v.grand, 2)}` : undefined}><Input type="number" value={tender || ""} onChange={(e) => setTender(Number(e.target.value))} /></Field>}
      <p className="mt-3 text-xs text-charcoal-500">Posts two charges (range, café) so department revenue stays accurate, settled by one payment. Simulated — not an official receipt.</p>
    </Modal>
  );
}

export function VisitReceipt({ r, onClose }: { r: VisitResult; onClose: () => void }) {
  const { db } = useStore();
  return <Modal open onClose={onClose} size="sm" title="Combined receipt preview" footer={<Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>}>
    <div className="rounded-lg border border-dashed border-charcoal-300 bg-white p-4 font-mono text-xs"><p className="text-center font-bold">{db.settings.club.shortName.toUpperCase()}</p><p className="text-center">{fmtTs(db.meta.now)}</p><p className="text-center">Golfer: {r.name}</p><hr className="my-2" />
      {r.sale && <><p className="font-bold">DRIVING RANGE</p>{r.sale.items.map((i) => <div key={i.code} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{(i.qty * i.price).toFixed(2)}</span></div>)}{r.sale.discount > 0 && <div className="flex justify-between"><span>Member discount</span><span>-{r.sale.discount.toFixed(2)}</span></div>}<div className="flex justify-between"><span>Range total</span><span>{r.sale.amount.toFixed(2)}</span></div><hr className="my-2" /></>}
      {r.order && <><p className="font-bold">CAFÉ</p>{r.order.items.map((i) => <div key={i.itemId} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{(i.qty * i.price).toFixed(2)}</span></div>)}{r.order.discount > 0 && <div className="flex justify-between"><span>Discount {r.order.discountPct}%</span><span>-{r.order.discount.toFixed(2)}</span></div>}<div className="flex justify-between"><span>Café total</span><span>{r.order.total.toFixed(2)}</span></div><hr className="my-2" /></>}
      <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{r.grand.toFixed(2)}</span></div><p className="mt-1">Paid via: {r.method.replace("_", " ")}</p><hr className="my-2" /><p className="text-center">DEMO RECEIPT PREVIEW — NOT AN OFFICIAL RECEIPT OR BIR-COMPLIANT INVOICE</p></div></Modal>;
}
