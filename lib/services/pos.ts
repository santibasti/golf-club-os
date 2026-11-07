import type { DB, PaymentMethod, PosOrder, RangeSale } from "../types";
import { Ctx, audit, fail, hasPerm, needPerm, nextId, note, req, requireText, today } from "./core";
import { applyPayment, createCharge, memberBalance, openShift, outstanding, refundCharge, voidCharge } from "./finance";
import { adjustStock } from "./inventory";
import { r2 } from "../format";
import { addMinTs } from "../time";

export type PayMethod = PaymentMethod | "member_account";
export const RANGE_BAYS = 20;

function memberForCharging(db: DB, memberId: string, total: number) {
  const m = req(db.members.find((x) => x.id === memberId), "Member not found."); const plan = req(db.plans.find((p) => p.id === m.planId), "Plan missing.");
  if (m.status !== "active") fail(`Member ${m.id} is ${m.status.replace("_", " ")} — account charging is not allowed.`, "eligibility");
  if (!plan.accountCharging) fail(`The ${plan.name} plan does not allow charging to the member account.`, "eligibility");
  const bal = memberBalance(db, m.id);
  if (bal + total > plan.creditLimit) fail(`Credit limit exceeded: balance ₱${bal.toLocaleString()} + ₱${total.toLocaleString()} > limit ₱${plan.creditLimit.toLocaleString()}.`, "credit");
  return { m, plan };
}

export function posTotals(db: DB, lines: { itemId: string; qty: number }[], manualPct: number, memberId?: string) {
  let subtotal = 0; for (const l of lines) { const it = db.inventory.find((i) => i.id === l.itemId); subtotal += (it?.price ?? 0) * l.qty; }
  const m = memberId ? db.members.find((x) => x.id === memberId && x.status === "active") : undefined; const memberPct = m ? (db.plans.find((p) => p.id === m.planId)?.cafeDiscountPct ?? 0) : 0;
  const pct = Math.max(memberPct, manualPct); const discount = r2((subtotal * pct) / 100);
  return { subtotal: r2(subtotal), pct, memberPct, discount, total: r2(subtotal - discount) };
}

export function createPosOrder(db: DB, ctx: Ctx, i: { items: { itemId: string; qty: number }[]; manualDiscountPct?: number; method: PayMethod; memberId?: string; customerName?: string; note?: string }): PosOrder {
  needPerm(db, ctx, "pos.sell");
  if (!i.items.length) fail("The order is empty. Add at least one item.", "validation");
  const manual = i.manualDiscountPct ?? 0; if (manual < 0 || manual > 100) fail("Discount must be between 0 and 100%.", "validation");
  if (manual > db.settings.authority.posDiscountStaffMaxPct) needPerm(db, ctx, "pos.discount");
  for (const l of i.items) { const it = req(db.inventory.find((x) => x.id === l.itemId && x.price != null), "Unknown menu item."); if (!Number.isInteger(l.qty) || l.qty < 1) fail("Quantities must be whole numbers ≥ 1.", "validation"); if (it.qty < l.qty) fail(`Insufficient stock: ${it.name} (only ${it.qty} left).`, "stock"); }
  const t = posTotals(db, i.items, manual, i.memberId);
  if (i.method === "member_account") { if (!i.memberId) fail("Select a member to charge to an account.", "validation"); memberForCharging(db, i.memberId!, t.total); }
  else if (!openShift(db)) fail("No open cashier shift. Open a shift before taking payments.", "no_shift");
  const m = i.memberId ? db.members.find((x) => x.id === i.memberId) : undefined; const cust = m ? db.customers.find((c) => c.id === m.customerId) : undefined;
  const name = cust?.name ?? (i.customerName?.trim() || "Walk-in customer");
  const id = nextId(db, "pos", "PO-", 6); const no = nextId(db, "posNo", "POS-", 5);
  const chg = createCharge(db, ctx, { dept: "cafe", description: `Café order ${no}`, amount: t.subtotal, discount: t.discount, discountReason: t.pct ? (t.memberPct >= manual ? `Member discount ${t.pct}%` : `Authorised discount ${t.pct}%`) : undefined, name, customerId: cust?.id, memberId: m?.id, refType: "pos_order", refId: id, billTo: i.method === "member_account" ? "member_account" : "counter" });
  const order: PosOrder = { id, no, at: db.meta.now, date: today(db), items: i.items.map((l) => { const it = db.inventory.find((x) => x.id === l.itemId)!; return { itemId: l.itemId, name: it.name, qty: l.qty, price: it.price! }; }), subtotal: t.subtotal, discountPct: t.pct, discount: t.discount, total: t.total, method: i.method, fulfil: "new", memberId: m?.id, customerName: name, chargeId: chg.id, cashier: ctx.actor, note: i.note };
  for (const l of order.items) adjustStock(db, ctx, l.itemId, -l.qty, "sale", no, "POS sale");
  if (i.method !== "member_account" && t.total > 0) applyPayment(db, ctx, { chargeId: chg.id, amount: t.total, method: i.method as PaymentMethod });
  db.posOrders.push(order); audit(db, ctx, "pos.sale", "pos", id, `${no} ₱${t.total} via ${i.method}`); return order;
}
export function setFulfilment(db: DB, ctx: Ctx, id: string, st: PosOrder["fulfil"]) {
  needPerm(db, ctx, "pos.sell"); const o = req(db.posOrders.find((x) => x.id === id), "Order not found.");
  if (o.fulfil === "void") fail("Voided orders cannot change status."); if (st === "void") fail("Use Void / refund to void an order."); o.fulfil = st;
}
export function voidPosOrder(db: DB, ctx: Ctx, id: string, reason: string) {
  needPerm(db, ctx, "pos.void"); const o = req(db.posOrders.find((x) => x.id === id), "Order not found."); if (o.fulfil === "void") fail("Order already voided."); requireText(reason, "Void reason", 5);
  const c = req(db.charges.find((x) => x.id === o.chargeId), "Charge missing."); const elevated: Ctx = { ...ctx, bypass: true };
  if (c.paid > 0) { if (!openShift(db)) fail("No open cashier shift — open one to issue the refund.", "no_shift"); refundCharge(db, elevated, c.id, c.paid - c.refunded, (db.payments.find((p) => p.chargeId === c.id)?.method ?? "cash"), `POS void ${o.no}: ${reason}`); }
  else voidCharge(db, ctx, c.id, `POS void ${o.no}: ${reason}`);
  for (const l of o.items) adjustStock(db, ctx, l.itemId, l.qty, "void_return", o.no, "Order voided");
  o.fulfil = "void"; o.voided = { at: db.meta.now, by: ctx.actor, reason }; audit(db, ctx, "pos.void", "pos", id, `${o.no} voided: ${reason}`);
}

/* ------------------------------- range ------------------------------ */
export const RANGE_ITEMS = (db: DB) => { const r = db.settings.rates.range; return [
  { code: "BKT-S", name: "Small bucket (30 balls)", price: r.bucketS, balls: 30 }, { code: "BKT-M", name: "Medium bucket (50 balls)", price: r.bucketM, balls: 50 }, { code: "BKT-L", name: "Large bucket (80 balls)", price: r.bucketL, balls: 80 },
  { code: "SES-30", name: "Bay session (30 min)", price: r.per30min, balls: 0 }, { code: "CLUB", name: "Club rental (half set)", price: r.clubRental, balls: 0 } ]; };
export const bayOccupancy = (db: DB) => { const occ: Record<number, RangeSale> = {}; for (const s of db.rangeSales) if (s.bay && !s.ended && s.endsAt && s.endsAt > db.meta.now) occ[s.bay] = s; return occ; };

export function sellRange(db: DB, ctx: Ctx, i: { items: { code: string; qty: number }[]; name?: string; memberId?: string; bay?: number; minutes30?: number; method: PayMethod }): RangeSale {
  needPerm(db, ctx, "range.sell"); if (!i.items.length) fail("Add at least one range item.", "validation");
  const cat = RANGE_ITEMS(db); const lines = i.items.map((l) => { const it = req(cat.find((c) => c.code === l.code), "Unknown range item."); if (!Number.isInteger(l.qty) || l.qty < 1) fail("Quantity must be a whole number ≥ 1.", "validation"); return { ...it, qty: l.qty }; });
  const hasSession = lines.some((l) => l.code === "SES-30"); let minutes: number | undefined;
  if (hasSession) { if (!i.bay || i.bay < 1 || i.bay > RANGE_BAYS) fail("Select a bay for the practice session.", "validation"); if (bayOccupancy(db)[i.bay!]) fail(`Bay ${i.bay} is occupied until ${bayOccupancy(db)[i.bay!].endsAt!.slice(11)}.`, "conflict"); minutes = lines.find((l) => l.code === "SES-30")!.qty * 30; }
  const balls = lines.reduce((a, l) => a + l.balls * l.qty, 0); const ballItem = db.inventory.find((x) => x.sku === "RNG-BALL");
  if (ballItem && balls > ballItem.qty) fail(`Not enough range balls in stock (${ballItem.qty} left).`, "stock");
  const gross = r2(lines.reduce((a, l) => a + l.price * l.qty, 0)); const m = i.memberId ? db.members.find((x) => x.id === i.memberId && x.status === "active") : undefined; if (i.memberId && !m) fail("That member is not active — member discounts and account charging are unavailable.", "eligibility");
  const pct = m ? (db.plans.find((p) => p.id === m.planId)?.rangeDiscountPct ?? 0) : 0; const discount = r2((gross * pct) / 100);
  if (i.method === "member_account") { if (!m) fail("Select a member to charge to an account.", "validation"); memberForCharging(db, m!.id, gross - discount); } else if (!openShift(db)) fail("No open cashier shift. Open a shift before taking payments.", "no_shift");
  const cust = m ? db.customers.find((c) => c.id === m.customerId) : undefined; const name = cust?.name ?? (i.name?.trim() || "Walk-in");
  const id = nextId(db, "range", "RS-", 6);
  const chg = createCharge(db, ctx, { dept: "range", description: `Range: ${lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}`, amount: gross, discount, discountReason: pct ? `Member range discount ${pct}%` : undefined, name, customerId: cust?.id, memberId: m?.id, refType: "range_sale", refId: id, billTo: i.method === "member_account" ? "member_account" : "counter" });
  const sale: RangeSale = { id, at: db.meta.now, date: today(db), customerId: cust?.id, memberId: m?.id, name, items: lines.map((l) => ({ code: l.code, name: l.name, qty: l.qty, price: l.price })), bay: hasSession ? i.bay : undefined, minutes, endsAt: hasSession ? addMinTs(db.meta.now, minutes!) : undefined, amount: r2(gross - discount), discount, chargeId: chg.id, method: i.method };
  if (ballItem && balls) adjustStock(db, ctx, ballItem.id, -balls, "sale", id, "Range balls dispensed");
  if (i.method !== "member_account" && sale.amount > 0) applyPayment(db, ctx, { chargeId: chg.id, amount: sale.amount, method: i.method as PaymentMethod });
  db.rangeSales.push(sale); audit(db, ctx, "range.sale", "range", id, `₱${sale.amount} ${name}`); return sale;
}
export function endRangeSession(db: DB, ctx: Ctx, id: string) { needPerm(db, ctx, "range.sell"); const s = req(db.rangeSales.find((x) => x.id === id), "Sale not found."); if (!s.bay || s.ended) fail("No active session to end."); s.ended = true; }
export { hasPerm, note, outstanding };
