"use client";
import React, { useEffect, useState } from "react";
import { ChoiceGroup, PaymentChoice, HolesChoice, StarRating, BayPicker, CartPicker, DiscountChips } from "./choices";
import { useStore } from "@/lib/store";
import { Button, Field, Input, Modal, Notice, Select } from "./ui";
import { outstanding, recordPayment } from "@/lib/services/finance";
import { peso } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

/** Records a payment against one charge. Over-payments are rejected by the service. */
export function PayChargeDialog({ chargeId, onClose }: { chargeId: string | null; onClose: () => void }) {
  const { db, act } = useStore(); const c = db.charges.find((x) => x.id === chargeId);
  const [amount, setAmount] = useState(0); const [method, setMethod] = useState<PaymentMethod>("cash"); const [ref, setRef] = useState(""); const [err, setErr] = useState<string>(); const [tender, setTender] = useState(0);
  useEffect(() => { if (c) { setAmount(outstanding(c)); setErr(undefined); setRef(""); setTender(0); } }, [chargeId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return null; const due = outstanding(c);
  return (
    <Modal open onClose={onClose} title={`Record payment — ${c.no}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { const r = act((d, ctx) => recordPayment(d, ctx, { chargeId: c.id, amount, method, ref: ref || undefined }), (p) => `Payment recorded — receipt ${p.no} (demo, not an official receipt)`); if (!r.ok) setErr(r.error); else onClose(); }}>Record {peso(amount, 2)}</Button></>}>
      <p className="text-sm">{c.name} · {c.description}</p>
      <div className="my-3 rounded-lg bg-forest-50 p-3 text-sm"><div className="flex justify-between"><span>Net amount</span><b>{peso(c.amount - c.discount, 2)}</b></div><div className="flex justify-between"><span>Already paid</span><span>{peso(c.paid, 2)}</span></div><div className="flex justify-between border-t border-forest-100 pt-1"><span>Outstanding</span><b className="text-forest">{peso(due, 2)}</b></div></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Amount"><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="Method" className="col-span-2"><PaymentChoice value={method} onChange={(v) => setMethod(v as PaymentMethod)} /></Field>
        {method === "cash" && <Field label="Cash tendered" hint={tender > amount ? `Change ${peso(tender - amount, 2)}` : undefined}><Input type="number" value={tender || ""} onChange={(e) => setTender(Number(e.target.value))} /></Field>}
        {method !== "cash" && <Field label="Reference no."><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Simulated reference" /></Field>}</div>
      <p className="mt-2 text-xs text-charcoal-500">No real payment is processed. Payments are applied to this charge only — never counted twice as revenue.</p>
      {err && <Notice tone="error" className="mt-3">{err}</Notice>}
    </Modal>
  );
}
