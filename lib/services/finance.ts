import type { Charge, ChargeStatus, DB, Dept, Payment, PaymentMethod, Shift } from "../types";
import { Ctx, SYSTEM, audit, fail, needPerm, nextId, note, req, requirePositive, requireText, today } from "./core";
import { addDays, dateOf } from "../time";
import { r2 } from "../format";

/** Net amount due on a charge after discount. */
export const chargeNet = (c: Charge) => r2(c.amount - c.discount);
export const isLive = (c: Charge) => c.status !== "voided";
/** Outstanding receivable on a charge. Voided, written-off and refunded charges have none. */
export function outstanding(c: Charge): number {
  if (["voided", "written_off", "refunded"].includes(c.status)) return 0;
  return Math.max(0, r2(chargeNet(c) - c.paid));
}
/** Club revenue recognised from a charge: net of discount and refunds, excluding third-party (caddie) payables. */
export function recognisedRevenue(c: Charge): number {
  if (c.status === "voided") return 0;
  if (c.status === "written_off") return 0;
  const net = chargeNet(c);
  if (net <= 0) return 0;
  const keep = Math.max(0, net - c.payable);
  // refunds reduce the club portion first, proportional to how much of the charge is club revenue
  const refundShare = net > 0 ? c.refunded * (keep / net) : 0;
  return r2(keep - refundShare);
}

export function openShift(db: DB): Shift | undefined {
  return db.shifts.find((s) => s.status === "open");
}

export interface NewCharge {
  dept: Dept; description: string; amount: number; discount?: number; discountReason?: string; customerId?: string; memberId?: string; name: string;
  bookingId?: string; refType?: string; refId?: string; payable?: number; payableToCaddieId?: string; billTo?: "counter" | "member_account"; billingKey?: string;
}
export function createCharge(db: DB, ctx: Ctx, n: NewCharge): Charge {
  if (n.billingKey && db.charges.some((c) => c.billingKey === n.billingKey && c.status !== "voided")) fail("This charge has already been posted (duplicate billing key).", "duplicate");
  if (n.amount < 0) fail("Charge amount cannot be negative.", "validation");
  const discount = n.discount ?? 0;
  if (discount < 0 || discount > n.amount) fail("Discount must be between zero and the charge amount.", "validation");
  const c: Charge = {
    id: nextId(db, "charge", "CHG-", 6), no: nextId(db, "chargeNo", "INV-DEMO-", 6), date: today(db), createdAt: db.meta.now, dept: n.dept, description: n.description,
    customerId: n.customerId, memberId: n.memberId, name: n.name, bookingId: n.bookingId, refType: n.refType, refId: n.refId,
    amount: r2(n.amount), discount: r2(discount), discountReason: n.discountReason, paid: 0, refunded: 0, payable: r2(n.payable ?? 0), payableToCaddieId: n.payableToCaddieId,
    status: "unpaid", billTo: n.billTo ?? (n.memberId ? "member_account" : "counter"), history: [], billingKey: n.billingKey,
  };
  if (chargeNet(c) === 0) c.status = "paid";
  note(c.history, db, ctx, `Charge posted ${c.amount.toFixed(2)}${discount ? ` (discount ${discount.toFixed(2)}${n.discountReason ? ": " + n.discountReason : ""})` : ""}`);
  db.charges.push(c);
  return c;
}

function refreshStatus(c: Charge) {
  if (["voided", "written_off"].includes(c.status)) return;
  const net = chargeNet(c);
  if (c.refunded > 0 && c.refunded >= c.paid && c.paid > 0 && c.refunded >= net) c.status = "refunded";
  else if (c.paid >= net) c.status = "paid";
  else if (c.paid > 0) c.status = "partial";
  else c.status = "unpaid";
}

export function recordPayment(db: DB, ctx: Ctx, input: { chargeId: string; amount: number; method: PaymentMethod; ref?: string }): Payment {
  needPerm(db, ctx, "finance.payment");
  return applyPayment(db, ctx, input);
}
/** Internal payment application (used by POS/range/deposits where the seller already holds finance rights). */
export function applyPayment(db: DB, ctx: Ctx, input: { chargeId: string; amount: number; method: PaymentMethod; ref?: string }): Payment {
  const c = req(db.charges.find((x) => x.id === input.chargeId), "Charge not found.");
  if (!isLive(c) || c.status === "written_off" || c.status === "refunded") fail(`Charge ${c.no} is ${c.status.replace("_", " ")} and cannot accept payment.`);
  requirePositive(input.amount, "Payment amount");
  const due = outstanding(c);
  if (input.amount - due > 0.005) fail(`Payment ${input.amount.toFixed(2)} exceeds the outstanding balance ${due.toFixed(2)} on ${c.no}. Overpayments are not allowed.`, "validation");
  const shift = openShift(db);
  if (!shift) fail("No open cashier shift. Open a shift before recording payments.", "no_shift");
  const p: Payment = {
    id: nextId(db, "payment", "PAY-", 6), no: nextId(db, "paymentNo", "OR-DEMO-", 6), date: today(db), at: db.meta.now, chargeId: c.id,
    customerId: c.customerId, memberId: c.memberId, name: c.name, amount: r2(input.amount), method: input.method, ref: input.ref, shiftId: shift!.id, receivedBy: ctx.actor, kind: "payment", bookingId: c.bookingId,
  };
  db.payments.push(p);
  c.paid = r2(c.paid + p.amount);
  refreshStatus(c);
  note(c.history, db, ctx, `Payment ${p.amount.toFixed(2)} via ${p.method} (${p.no})`);
  audit(db, ctx, "payment.record", "payment", p.id, `${p.amount.toFixed(2)} ${p.method} applied to ${c.no} (${c.name})`);
  return p;
}

/** Apply a member payment across the oldest outstanding charges (FIFO). Never creates unapplied cash or double counts. */
export function payMemberBalance(db: DB, ctx: Ctx, memberId: string, amount: number, method: PaymentMethod, ref?: string): Payment[] {
  needPerm(db, ctx, "finance.payment");
  requirePositive(amount, "Payment amount");
  const open = db.charges.filter((c) => c.memberId === memberId && outstanding(c) > 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const total = r2(open.reduce((a, c) => a + outstanding(c), 0));
  if (open.length === 0) fail("This member has no outstanding charges.");
  if (amount - total > 0.005) fail(`Payment exceeds the member's outstanding balance of ${total.toFixed(2)}.`, "validation");
  let left = r2(amount); const out: Payment[] = [];
  for (const c of open) { if (left <= 0) break; const x = Math.min(left, outstanding(c)); out.push(applyPayment(db, ctx, { chargeId: c.id, amount: x, method, ref })); left = r2(left - x); }
  return out;
}

export function recordDeposit(db: DB, ctx: Ctx, input: { amount: number; method: PaymentMethod; name: string; bookingId: string; customerId?: string; memberId?: string }): Payment {
  requirePositive(input.amount, "Deposit");
  const shift = openShift(db);
  if (!shift) return fail("No open cashier shift. A shift must be open to take a deposit.", "no_shift");
  const p: Payment = {
    id: nextId(db, "payment", "PAY-", 6), no: nextId(db, "paymentNo", "OR-DEMO-", 6), date: today(db), at: db.meta.now, customerId: input.customerId, memberId: input.memberId, name: input.name,
    amount: r2(input.amount), method: input.method, shiftId: shift.id, receivedBy: ctx.actor, kind: "deposit", bookingId: input.bookingId,
  };
  db.payments.push(p);
  audit(db, ctx, "deposit.record", "payment", p.id, `Deposit ${p.amount.toFixed(2)} for ${input.bookingId}`);
  return p;
}

/** Convert a held deposit into payment against a charge (no new cash is recorded: the cash was already received). */
export function applyDepositToCharge(db: DB, ctx: Ctx, paymentId: string, chargeId: string, maxAmount?: number): number {
  const dep = req(db.payments.find((p) => p.id === paymentId), "Deposit not found.");
  const c = req(db.charges.find((x) => x.id === chargeId), "Charge not found.");
  const use = Math.min(dep.amount, outstanding(c), maxAmount ?? Infinity);
  if (use <= 0) return 0;
  if (use >= dep.amount - 0.005) { dep.chargeId = c.id; dep.kind = "payment"; }
  else { // split the deposit payment record
    dep.amount = r2(dep.amount - use);
    db.payments.push({ ...dep, id: nextId(db, "payment", "PAY-", 6), no: nextId(db, "paymentNo", "OR-DEMO-", 6), chargeId: c.id, amount: r2(use), kind: "payment" });
  }
  c.paid = r2(c.paid + use); refreshStatus(c);
  note(c.history, db, ctx, `Deposit ${use.toFixed(2)} applied`);
  return use;
}

export function refundCharge(db: DB, ctx: Ctx, chargeId: string, amount: number, method: PaymentMethod, reason: string) {
  needPerm(db, ctx, "finance.refund");
  const c = req(db.charges.find((x) => x.id === chargeId), "Charge not found.");
  requireText(reason, "Refund reason", 3);
  requirePositive(amount, "Refund amount");
  if (c.status === "voided" || c.status === "written_off") fail("This charge is not refundable.");
  const refundable = r2(c.paid - c.refunded);
  if (amount - refundable > 0.005) fail(`Only ${refundable.toFixed(2)} has been paid and can be refunded on ${c.no}. Unpaid charges should be voided or adjusted, not refunded.`, "validation");
  const shift = openShift(db);
  if (!shift) fail("No open cashier shift. Open a shift to issue a refund.", "no_shift");
  db.refunds.push({ id: nextId(db, "refund", "RFD-", 5), date: today(db), at: db.meta.now, chargeId: c.id, amount: r2(amount), method, reason: reason.trim(), approvedBy: ctx.actor, shiftId: shift!.id });
  c.refunded = r2(c.refunded + amount);
  if (c.refunded >= chargeNet(c) - 0.005) c.status = "refunded";
  note(c.history, db, ctx, `Refund ${amount.toFixed(2)} (${reason.trim()})`);
  audit(db, ctx, "refund.issue", "charge", c.id, `Refund ${amount.toFixed(2)} on ${c.no}: ${reason.trim()}`);
}

export function voidCharge(db: DB, ctx: Ctx, chargeId: string, reason: string) {
  const c = req(db.charges.find((x) => x.id === chargeId), "Charge not found.");
  if (c.paid > 0) fail("A paid charge cannot be voided; issue a refund instead.");
  requireText(reason, "Void reason", 3);
  c.status = "voided"; c.reason = reason; note(c.history, db, ctx, `Voided: ${reason}`);
  audit(db, ctx, "charge.void", "charge", c.id, `${c.no} voided: ${reason}`);
}

export function adjustDiscount(db: DB, ctx: Ctx, chargeId: string, discount: number, reason: string) {
  needPerm(db, ctx, "finance.payment");
  const c = req(db.charges.find((x) => x.id === chargeId), "Charge not found.");
  requireText(reason, "Adjustment reason", 3);
  if (discount < 0 || discount > c.amount) fail("Discount must be between zero and the charge amount.", "validation");
  if (c.status === "voided" || c.status === "written_off") fail("This charge can no longer be adjusted.");
  if (c.amount - discount < c.paid - c.refunded - 0.005) fail("Discount would make the net amount lower than what has already been paid. Refund first.");
  const old = c.discount; c.discount = r2(discount); refreshStatus(c);
  note(c.history, db, ctx, `Discount adjusted ${old.toFixed(2)} → ${discount.toFixed(2)}: ${reason}`);
  audit(db, ctx, "charge.discount", "charge", c.id, `${c.no} discount ${old.toFixed(2)} → ${discount.toFixed(2)}: ${reason}`);
}

export function writeOff(db: DB, ctx: Ctx, chargeId: string, reason: string) {
  needPerm(db, ctx, "finance.writeoff");
  const c = req(db.charges.find((x) => x.id === chargeId), "Charge not found.");
  requireText(reason, "Write-off reason", 5);
  if (outstanding(c) <= 0) fail("There is no outstanding balance to write off.");
  c.status = "written_off"; c.reason = reason;
  note(c.history, db, ctx, `Written off ${outstanding({ ...c, status: "unpaid" }).toFixed(2)}: ${reason}`);
  audit(db, ctx, "charge.writeoff", "charge", c.id, `${c.no} written off (${reason}) authorised by ${ctx.actor}`);
}

export function manualCharge(db: DB, ctx: Ctx, input: { memberId?: string; customerId?: string; name: string; dept: Dept; description: string; amount: number; discount?: number; discountReason?: string }) {
  needPerm(db, ctx, "finance.payment");
  requireText(input.description, "Description", 3); requireText(input.name, "Account name"); requirePositive(input.amount, "Amount");
  const c = createCharge(db, ctx, { ...input, refType: "manual" });
  audit(db, ctx, "charge.create", "charge", c.id, `${c.no} ${input.description} ${input.amount}`);
  return c;
}

export function openShiftFor(db: DB, ctx: Ctx, openingFloat: number): Shift {
  needPerm(db, ctx, "finance.shift");
  if (openShift(db)) fail("A cashier shift is already open. Close it before opening another.");
  if (openingFloat < 0) fail("Opening float cannot be negative.");
  const s: Shift = { id: nextId(db, "shift", "SH-", 4), date: today(db), cashier: ctx.actor, openedAt: db.meta.now, openingFloat, status: "open" };
  db.shifts.push(s); audit(db, ctx, "shift.open", "shift", s.id, `Opening float ${openingFloat}`); return s;
}
export function shiftCash(db: DB, shiftId: string) {
  const s = req(db.shifts.find((x) => x.id === shiftId), "Shift not found.");
  const cashIn = db.payments.filter((p) => p.shiftId === shiftId && p.method === "cash").reduce((a, p) => a + p.amount, 0);
  const cashOut = db.refunds.filter((r) => r.shiftId === shiftId && r.method === "cash").reduce((a, r) => a + r.amount, 0);
  const nonCash = db.payments.filter((p) => p.shiftId === shiftId && p.method !== "cash").reduce((a, p) => a + p.amount, 0);
  return { float: s.openingFloat, cashIn: r2(cashIn), cashOut: r2(cashOut), nonCash: r2(nonCash), expected: r2(s.openingFloat + cashIn - cashOut) };
}
export function closeShift(db: DB, ctx: Ctx, shiftId: string, countedCash: number, notes?: string) {
  needPerm(db, ctx, "finance.shift");
  const s = req(db.shifts.find((x) => x.id === shiftId), "Shift not found.");
  if (s.status === "closed") fail("This shift is already closed.");
  if (!Number.isFinite(countedCash) || countedCash < 0) fail("Enter the counted cash amount.", "validation");
  const sc = shiftCash(db, shiftId);
  s.expectedCash = sc.expected; s.countedCash = r2(countedCash); s.variance = r2(countedCash - sc.expected); s.status = "closed"; s.closedAt = db.meta.now; s.notes = notes;
  audit(db, ctx, "shift.close", "shift", s.id, `Expected ${sc.expected}, counted ${countedCash}, variance ${s.variance}`);
}

export function memberBalance(db: DB, memberId: string) {
  return r2(db.charges.filter((c) => c.memberId === memberId).reduce((a, c) => a + outstanding(c), 0));
}

export function agingBucket(db: DB, c: Charge): "current" | "31-60" | "61-90" | "90+" {
  const age = Math.round((new Date(today(db)).getTime() - new Date(c.date).getTime()) / 86400000);
  return age <= 30 ? "current" : age <= 60 ? "31-60" : age <= 90 ? "61-90" : "90+";
}
export { SYSTEM, addDays, dateOf };
export type { ChargeStatus };
