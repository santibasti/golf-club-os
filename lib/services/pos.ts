import type { CafeTab, DB, PaymentMethod, PosOrder, RangeSale, RangeTab } from "../types";
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
export interface BayOcc { name: string; endsAt?: string; tabId?: string; saleId?: string; since?: string }
/** A bay is occupied by an OPEN tab until it is billed out, or by a legacy one-shot session until its time ends. */
export const bayOccupancy = (db: DB) => {
  const occ: Record<number, BayOcc> = {};
  for (const s of db.rangeSales) if (s.bay && !s.ended && s.endsAt && s.endsAt > db.meta.now) occ[s.bay] = { name: s.name, endsAt: s.endsAt, saleId: s.id };
  for (const t of db.rangeTabs) if (t.status === "open" && t.bay) occ[t.bay] = { name: t.name, tabId: t.id, since: t.openedAt };
  return occ;
};

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

/* ------------------------- running range tabs ------------------------ */
export function tabTotals(db: DB, t: RangeTab) {
  const gross = r2(t.lines.reduce((a, l) => a + l.qty * l.price, 0));
  const m = t.memberId ? db.members.find((x) => x.id === t.memberId && x.status === "active") : undefined;
  const pct = m ? (db.plans.find((p) => p.id === m.planId)?.rangeDiscountPct ?? 0) : 0; const discount = r2((gross * pct) / 100);
  return { gross, pct, discount, total: r2(gross - discount), balls: t.lines.reduce((a, l) => a + (l.balls ?? 0), 0), minutes: t.lines.reduce((a, l) => a + (l.minutes ?? 0), 0) };
}
export function openRangeTab(db: DB, ctx: Ctx, i: { name?: string; memberId?: string; bay?: number }): RangeTab {
  needPerm(db, ctx, "range.sell");
  const m = i.memberId ? db.members.find((x) => x.id === i.memberId) : undefined;
  if (i.memberId && !m) fail("Member not found.", "validation");
  if (m && m.status !== "active") fail(`Member ${m.id} is ${m.status.replace("_", " ")} — member discounts and account charging are unavailable. Open the tab as a public golfer instead.`, "eligibility");
  const cust = m ? db.customers.find((c) => c.id === m.customerId) : undefined; const name = cust?.name ?? (i.name ?? "").trim();
  if (!name) fail("Enter the golfer's name or select a member.", "validation");
  if (db.rangeTabs.some((t) => t.status === "open" && ((m && t.memberId === m.id) || t.name.toLowerCase() === name.toLowerCase()))) fail(`${name} already has an open range tab. Add items to it instead.`, "duplicate");
  if (i.bay !== undefined) { if (i.bay < 1 || i.bay > RANGE_BAYS) fail("Choose a valid bay.", "validation"); const o = bayOccupancy(db)[i.bay]; if (o) fail(`Bay ${i.bay} is occupied by ${o.name}.`, "conflict"); }
  const t: RangeTab = { id: nextId(db, "rangeTab", "RT-", 5), no: nextId(db, "rangeTabNo", "TAB-", 5), openedAt: db.meta.now, name, customerId: cust?.id, memberId: m?.id, bay: i.bay, status: "open", lines: [] };
  db.rangeTabs.push(t); audit(db, ctx, "range.tab.open", "range_tab", t.id, `${t.no} ${name}${i.bay ? ` bay ${i.bay}` : ""}`); return t;
}
export function addRangeLine(db: DB, ctx: Ctx, tabId: string, code: string, qty: number, bay?: number) {
  needPerm(db, ctx, "range.sell");
  const t = req(db.rangeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("This tab is already billed out or cancelled.");
  const it = req(RANGE_ITEMS(db).find((c) => c.code === code), "Unknown range item."); if (!Number.isInteger(qty) || qty < 1) fail("Quantity must be a whole number ≥ 1.", "validation");
  if (code === "SES-30" && !t.bay) {
    if (!bay) fail("Assign a bay to this tab before adding a practice session.", "validation");
    if (bay! < 1 || bay! > RANGE_BAYS) fail("Choose a valid bay.", "validation"); const o = bayOccupancy(db)[bay!]; if (o) fail(`Bay ${bay} is occupied by ${o.name}.`, "conflict"); t.bay = bay;
  }
  const balls = it.balls * qty; const ball = db.inventory.find((x) => x.sku === "RNG-BALL");
  if (ball && balls) adjustStock(db, ctx, ball.id, -balls, "sale", t.no, `Range balls dispensed to ${t.name}`);
  t.lines.push({ id: nextId(db, "rangeLine", "RL-", 6), code, name: it.name, qty, price: it.price, at: db.meta.now, minutes: code === "SES-30" ? 30 * qty : undefined, balls: balls || undefined });
  audit(db, ctx, "range.tab.add", "range_tab", t.id, `${qty}× ${it.name}`); return t;
}
export function removeRangeLine(db: DB, ctx: Ctx, tabId: string, lineId: string) {
  needPerm(db, ctx, "range.sell");
  const t = req(db.rangeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("This tab is already billed out or cancelled.");
  const l = req(t.lines.find((x) => x.id === lineId), "Line not found."); const ball = db.inventory.find((x) => x.sku === "RNG-BALL");
  if (ball && l.balls) adjustStock(db, ctx, ball.id, l.balls, "void_return", t.no, "Tab line removed");
  t.lines = t.lines.filter((x) => x.id !== lineId); audit(db, ctx, "range.tab.void_line", "range_tab", t.id, `Removed ${l.qty}× ${l.name}`);
}
export function cancelRangeTab(db: DB, ctx: Ctx, tabId: string) {
  needPerm(db, ctx, "range.sell"); const t = req(db.rangeTabs.find((x) => x.id === tabId), "Tab not found.");
  if (t.status !== "open") fail("Only open tabs can be cancelled."); if (t.lines.length) fail("Remove all items first, or bill the tab out.", "validation");
  t.status = "cancelled"; t.bay = undefined; if (t.cafeTabId) { const c = db.cafeTabs.find((x) => x.id === t.cafeTabId); if (c) c.rangeTabId = undefined; t.cafeTabId = undefined; } audit(db, ctx, "range.tab.cancel", "range_tab", t.id, t.no);
}
/** Bill-out: ONE charge for everything on the tab, then one payment (or member-account posting). The bay is released. */
export function billOutRangeTab(db: DB, ctx: Ctx, tabId: string, method: PayMethod): RangeSale {
  needPerm(db, ctx, "range.sell");
  const t = req(db.rangeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("This tab is already billed out or cancelled.");
  if (!t.lines.length) fail("The tab has no items to bill.", "validation");
  const pc = t.cafeTabId ? db.cafeTabs.find((x) => x.id === t.cafeTabId && x.status === "open" && x.lines.length) : undefined; if (pc) fail("This range tab is linked to a café tab with items. Use the combined bill-out so the golfer pays once.", "linked");
  const tot = tabTotals(db, t); const m = t.memberId ? db.members.find((x) => x.id === t.memberId) : undefined;
  if (method === "member_account") { if (!m) fail("Member account charging needs a member on the tab.", "validation"); memberForCharging(db, m!.id, tot.total); }
  else if (!openShift(db)) fail("No open cashier shift. Open a shift before taking payments.", "no_shift");
  const id = nextId(db, "range", "RS-", 6);
  const chg = createCharge(db, ctx, { dept: "range", description: `Range tab ${t.no}: ${t.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}`, amount: tot.gross, discount: tot.discount, discountReason: tot.pct ? `Member range discount ${tot.pct}%` : undefined, name: t.name, customerId: t.customerId, memberId: t.memberId, refType: "range_sale", refId: id, billTo: method === "member_account" ? "member_account" : "counter" });
  const agg: Record<string, { code: string; name: string; qty: number; price: number }> = {}; for (const l of t.lines) { (agg[l.code] ??= { code: l.code, name: l.name, qty: 0, price: l.price }).qty += l.qty; }
  const sale: RangeSale = { id, at: db.meta.now, date: today(db), customerId: t.customerId, memberId: t.memberId, name: t.name, items: Object.values(agg), bay: t.bay, minutes: tot.minutes || undefined, ended: true, amount: tot.total, discount: tot.discount, chargeId: chg.id, method };
  if (method !== "member_account" && tot.total > 0) applyPayment(db, ctx, { chargeId: chg.id, amount: tot.total, method: method as PaymentMethod });
  db.rangeSales.push(sale); t.status = "billed"; t.billedAt = db.meta.now; t.chargeId = chg.id; t.saleId = id; t.method = method; t.total = tot.total; t.discount = tot.discount; t.bay = undefined;
  audit(db, ctx, "range.tab.bill", "range_tab", t.id, `${t.no} billed ₱${tot.total} via ${method}`); return sale;
}

/* ------------------------- running café tabs ------------------------- */
export function cafeTabTotals(db: DB, t: CafeTab, manualPct = 0) {
  const subtotal = r2(t.lines.reduce((a, l) => a + l.qty * l.price, 0));
  const m = t.memberId ? db.members.find((x) => x.id === t.memberId && x.status === "active") : undefined; const memberPct = m ? (db.plans.find((p) => p.id === m.planId)?.cafeDiscountPct ?? 0) : 0;
  const pct = Math.max(memberPct, manualPct); const discount = r2((subtotal * pct) / 100);
  return { subtotal, memberPct, pct, discount, total: r2(subtotal - discount), items: t.lines.reduce((a, l) => a + l.qty, 0), unserved: t.lines.filter((l) => l.fulfil !== "served").length };
}
export function openCafeTab(db: DB, ctx: Ctx, i: { label?: string; memberId?: string }): CafeTab {
  needPerm(db, ctx, "pos.sell");
  const m = i.memberId ? db.members.find((x) => x.id === i.memberId) : undefined; if (i.memberId && !m) fail("Member not found.", "validation");
  if (m && m.status !== "active") fail(`Member ${m.id} is ${m.status.replace("_", " ")} — member discount and account charging are unavailable. Open the tab as a regular customer instead.`, "eligibility");
  const cust = m ? db.customers.find((c) => c.id === m.customerId) : undefined; const label = (i.label ?? "").trim() || cust?.name || ""; if (!label) fail("Enter a table / golfer name or select a member.", "validation");
  if (db.cafeTabs.some((t) => t.status === "open" && ((m && t.memberId === m.id) || t.label.toLowerCase() === label.toLowerCase()))) fail(`"${label}" already has an open café tab. Add items to it instead.`, "duplicate");
  const t: CafeTab = { id: nextId(db, "cafeTab", "CT-", 5), no: nextId(db, "cafeTabNo", "CTAB-", 5), openedAt: db.meta.now, label, customerId: cust?.id, memberId: m?.id, status: "open", lines: [] };
  db.cafeTabs.push(t); audit(db, ctx, "cafe.tab.open", "cafe_tab", t.id, `${t.no} ${label}`); return t;
}
/** Adds items and deducts stock immediately (the kitchen is preparing them). */
export function addCafeLine(db: DB, ctx: Ctx, tabId: string, itemId: string, qty: number) {
  needPerm(db, ctx, "pos.sell");
  const t = req(db.cafeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("This tab is already billed out or cancelled.");
  const it = req(db.inventory.find((x) => x.id === itemId && x.price != null), "Unknown menu item."); if (!Number.isInteger(qty) || qty < 1) fail("Quantity must be a whole number ≥ 1.", "validation");
  adjustStock(db, ctx, itemId, -qty, "sale", t.no, `Café tab ${t.label}`);
  t.lines.push({ id: nextId(db, "cafeLine", "CL-", 6), itemId, name: it.name, qty, price: it.price!, at: db.meta.now, fulfil: "new" });
  audit(db, ctx, "cafe.tab.add", "cafe_tab", t.id, `${qty}× ${it.name}`); return t;
}
export function setCafeLineStatus(db: DB, ctx: Ctx, tabId: string, lineId: string, st: "new" | "preparing" | "served") {
  needPerm(db, ctx, "pos.sell"); const t = req(db.cafeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("This tab is closed.");
  req(t.lines.find((x) => x.id === lineId), "Line not found.").fulfil = st;
}
export function removeCafeLine(db: DB, ctx: Ctx, tabId: string, lineId: string, reason?: string) {
  needPerm(db, ctx, "pos.sell"); const t = req(db.cafeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("This tab is closed.");
  const l = req(t.lines.find((x) => x.id === lineId), "Line not found.");
  if (l.fulfil === "served") { needPerm(db, ctx, "pos.void"); requireText(reason, "Reason for removing a served item", 3); }
  adjustStock(db, ctx, l.itemId, l.qty, "void_return", t.no, "Tab line removed"); t.lines = t.lines.filter((x) => x.id !== lineId);
  audit(db, ctx, "cafe.tab.void_line", "cafe_tab", t.id, `Removed ${l.qty}× ${l.name}${reason ? ": " + reason : ""}`);
}
export function cancelCafeTab(db: DB, ctx: Ctx, tabId: string) {
  needPerm(db, ctx, "pos.sell"); const t = req(db.cafeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("Only open tabs can be cancelled.");
  if (t.lines.length) fail("Remove all items first, or bill the tab out.", "validation"); t.status = "cancelled"; if (t.rangeTabId) { const r = db.rangeTabs.find((x) => x.id === t.rangeTabId); if (r) r.cafeTabId = undefined; t.rangeTabId = undefined; } audit(db, ctx, "cafe.tab.cancel", "cafe_tab", t.id, t.no);
}
/** Bill-out: one charge + one payment (or member-account posting) for everything on the tab, plus a POS order record for café reports. */
export function billOutCafeTab(db: DB, ctx: Ctx, tabId: string, i: { method: PayMethod; manualDiscountPct?: number }): PosOrder {
  needPerm(db, ctx, "pos.sell"); const t = req(db.cafeTabs.find((x) => x.id === tabId), "Tab not found."); if (t.status !== "open") fail("This tab is already billed out or cancelled.");
  if (!t.lines.length) fail("The tab has no items to bill.", "validation");
  const pr = t.rangeTabId ? db.rangeTabs.find((x) => x.id === t.rangeTabId && x.status === "open" && x.lines.length) : undefined; if (pr) fail("This café tab is linked to a range tab with items. Use the combined bill-out so the golfer pays once.", "linked");
  const manual = i.manualDiscountPct ?? 0; if (manual < 0 || manual > 100) fail("Discount must be between 0 and 100%.", "validation");
  if (manual > db.settings.authority.posDiscountStaffMaxPct) needPerm(db, ctx, "pos.discount");
  const tot = cafeTabTotals(db, t, manual); const m = t.memberId ? db.members.find((x) => x.id === t.memberId) : undefined;
  if (i.method === "member_account") { if (!m) fail("Member account charging needs a member on the tab.", "validation"); memberForCharging(db, m!.id, tot.total); }
  else if (!openShift(db)) fail("No open cashier shift. Open a shift before taking payments.", "no_shift");
  const id = nextId(db, "pos", "PO-", 6); const no = nextId(db, "posNo", "POS-", 5);
  const chg = createCharge(db, ctx, { dept: "cafe", description: `Café tab ${t.no} (${t.label}) → ${no}`, amount: tot.subtotal, discount: tot.discount, discountReason: tot.pct ? (tot.memberPct >= manual ? `Member discount ${tot.pct}%` : `Authorised discount ${tot.pct}%`) : undefined, name: t.label, customerId: t.customerId, memberId: t.memberId, refType: "pos_order", refId: id, billTo: i.method === "member_account" ? "member_account" : "counter" });
  const agg: Record<string, PosOrder["items"][number]> = {}; for (const l of t.lines) (agg[l.itemId] ??= { itemId: l.itemId, name: l.name, qty: 0, price: l.price }).qty += l.qty;
  const order: PosOrder = { id, no, at: db.meta.now, date: today(db), items: Object.values(agg), subtotal: tot.subtotal, discountPct: tot.pct, discount: tot.discount, total: tot.total, method: i.method, fulfil: "served", memberId: t.memberId, customerName: t.label, chargeId: chg.id, cashier: ctx.actor, note: `Tab ${t.no}` };
  if (i.method !== "member_account" && tot.total > 0) applyPayment(db, ctx, { chargeId: chg.id, amount: tot.total, method: i.method as PaymentMethod });
  db.posOrders.push(order); t.status = "billed"; t.billedAt = db.meta.now; t.orderId = id; t.chargeId = chg.id; t.method = i.method; t.total = tot.total; t.lines.forEach((l) => { l.fulfil = "served"; });
  audit(db, ctx, "cafe.tab.bill", "cafe_tab", t.id, `${t.no} billed ₱${tot.total} via ${i.method}`); return order;
}

/* ------------- linked visit: range tab + café tab, one combined bill ------------- */
export function linkTabs(db: DB, ctx: Ctx, rangeTabId: string, cafeTabId: string) {
  needPerm(db, ctx, "pos.sell");
  const r = req(db.rangeTabs.find((x) => x.id === rangeTabId), "Range tab not found."); const c = req(db.cafeTabs.find((x) => x.id === cafeTabId), "Café tab not found.");
  if (r.status !== "open" || c.status !== "open") fail("Only open tabs can be linked.");
  if ((r.cafeTabId && r.cafeTabId !== c.id) || (c.rangeTabId && c.rangeTabId !== r.id)) fail("One of these tabs is already linked to another tab. Unlink it first.", "conflict");
  if (r.memberId && c.memberId && r.memberId !== c.memberId) fail("These tabs belong to different members and cannot be combined.", "validation");
  r.cafeTabId = c.id; c.rangeTabId = r.id; audit(db, ctx, "tabs.link", "range_tab", r.id, `${r.no} ↔ ${c.no} (${r.name})`);
}
export function unlinkTabs(db: DB, ctx: Ctx, tabId: string) {
  needPerm(db, ctx, "pos.sell");
  const r = db.rangeTabs.find((x) => x.id === tabId) ?? db.rangeTabs.find((x) => x.cafeTabId === tabId); const c = r?.cafeTabId ? db.cafeTabs.find((x) => x.id === r.cafeTabId) : db.cafeTabs.find((x) => x.id === tabId);
  if (!r?.cafeTabId || !c) fail("This tab is not linked.");
  if (r!.status !== "open" || c!.status !== "open") fail("Only open tabs can be unlinked.");
  r!.cafeTabId = undefined; c!.rangeTabId = undefined; audit(db, ctx, "tabs.unlink", "range_tab", r!.id, `${r!.no} ✕ ${c!.no}`);
}
/** Order food & drinks for a golfer on a range tab: reuses an unlinked open café tab for the same golfer, otherwise opens one (and links it). */
export function orderFoodForRangeTab(db: DB, ctx: Ctx, rangeTabId: string): CafeTab {
  needPerm(db, ctx, "pos.sell");
  const r = req(db.rangeTabs.find((x) => x.id === rangeTabId), "Range tab not found."); if (r.status !== "open") fail("This range tab is already billed out or cancelled.");
  if (r.cafeTabId) { const c = db.cafeTabs.find((x) => x.id === r.cafeTabId && x.status === "open"); if (c) return c; }
  const existing = db.cafeTabs.find((x) => x.status === "open" && !x.rangeTabId && ((r.memberId && x.memberId === r.memberId) || x.label.toLowerCase() === r.name.toLowerCase()));
  const c = existing ?? openCafeTab(db, ctx, { label: r.name, memberId: r.memberId }); linkTabs(db, ctx, r.id, c.id); return c;
}
export function visitTotals(db: DB, r: RangeTab, c?: CafeTab, manualPct = 0) {
  const rt = tabTotals(db, r); const ct = c ? cafeTabTotals(db, c, manualPct) : null;
  return { range: rt, cafe: ct, grand: r2(rt.total + (ct?.total ?? 0)), items: r.lines.length + (c?.lines.length ?? 0) };
}
/** One bill, one payment for the whole visit. Revenue still posts to two departments (range / café) via two charges. */
export function billOutCombined(db: DB, ctx: Ctx, rangeTabId: string, i: { method: PayMethod; manualDiscountPct?: number }): { sale: RangeSale | null; order: PosOrder | null; grand: number } {
  needPerm(db, ctx, "pos.sell"); needPerm(db, ctx, "range.sell");
  const r = req(db.rangeTabs.find((x) => x.id === rangeTabId), "Range tab not found."); if (r.status !== "open") fail("This tab is already billed out or cancelled.");
  const c = r.cafeTabId ? db.cafeTabs.find((x) => x.id === r.cafeTabId && x.status === "open") : undefined;
  const manual = i.manualDiscountPct ?? 0; if (manual < 0 || manual > 100) fail("Discount must be between 0 and 100%.", "validation");
  if (manual > db.settings.authority.posDiscountStaffMaxPct) needPerm(db, ctx, "pos.discount");
  const v = visitTotals(db, r, c, manual); if (v.items === 0) fail("There is nothing on this visit to bill.", "validation");
  const m = r.memberId ? db.members.find((x) => x.id === r.memberId) : undefined;
  if (i.method === "member_account") { if (!m) fail("Member account charging needs a member on the tab.", "validation"); memberForCharging(db, m!.id, v.grand); }
  else if (!openShift(db)) fail("No open cashier shift. Open a shift before taking payments.", "no_shift");
  const group = nextId(db, "visit", "VISIT-", 5); let sale: RangeSale | null = null; let order: PosOrder | null = null;
  const settle = (tot: number, chargeId: string) => { if (i.method !== "member_account" && tot > 0) applyPayment(db, ctx, { chargeId, amount: tot, method: i.method as PaymentMethod, ref: group }); };
  if (r.lines.length) {
    const rt = v.range; const chg = createCharge(db, ctx, { dept: "range", description: `Range tab ${r.no} (${group}): ${r.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}`, amount: rt.gross, discount: rt.discount, discountReason: rt.pct ? `Member range discount ${rt.pct}%` : undefined, name: r.name, customerId: r.customerId, memberId: r.memberId, refType: "range_sale", billTo: i.method === "member_account" ? "member_account" : "counter", billingKey: undefined });
    const agg: Record<string, { code: string; name: string; qty: number; price: number }> = {}; for (const l of r.lines) (agg[l.code] ??= { code: l.code, name: l.name, qty: 0, price: l.price }).qty += l.qty;
    const id = nextId(db, "range", "RS-", 6); chg.refId = id; sale = { id, at: db.meta.now, date: today(db), customerId: r.customerId, memberId: r.memberId, name: r.name, items: Object.values(agg), bay: r.bay, minutes: rt.minutes || undefined, ended: true, amount: rt.total, discount: rt.discount, chargeId: chg.id, method: i.method };
    settle(rt.total, chg.id); db.rangeSales.push(sale); r.saleId = id; r.chargeId = chg.id; r.total = rt.total; r.discount = rt.discount;
  }
  if (c && c.lines.length && v.cafe) {
    const ct = v.cafe; const id = nextId(db, "pos", "PO-", 6); const no = nextId(db, "posNo", "POS-", 5);
    const chg = createCharge(db, ctx, { dept: "cafe", description: `Café tab ${c.no} (${c.label}) → ${no} (${group})`, amount: ct.subtotal, discount: ct.discount, discountReason: ct.pct ? (ct.memberPct >= manual ? `Member discount ${ct.pct}%` : `Authorised discount ${ct.pct}%`) : undefined, name: c.label, customerId: c.customerId, memberId: c.memberId, refType: "pos_order", refId: id, billTo: i.method === "member_account" ? "member_account" : "counter" });
    const agg: Record<string, PosOrder["items"][number]> = {}; for (const l of c.lines) (agg[l.itemId] ??= { itemId: l.itemId, name: l.name, qty: 0, price: l.price }).qty += l.qty;
    order = { id, no, at: db.meta.now, date: today(db), items: Object.values(agg), subtotal: ct.subtotal, discountPct: ct.pct, discount: ct.discount, total: ct.total, method: i.method, fulfil: "served", memberId: c.memberId, customerName: c.label, chargeId: chg.id, cashier: ctx.actor, note: `Tab ${c.no} · ${group}` };
    settle(ct.total, chg.id); db.posOrders.push(order); c.orderId = id; c.chargeId = chg.id; c.total = ct.total; c.lines.forEach((l) => { l.fulfil = "served"; });
  }
  r.status = "billed"; r.billedAt = db.meta.now; r.method = i.method; r.bay = undefined;
  if (c) { c.status = "billed"; c.billedAt = db.meta.now; c.method = i.method; }
  audit(db, ctx, "visit.bill", "range_tab", r.id, `${group} ${r.no}${c ? " + " + c.no : ""} billed ₱${v.grand} via ${i.method}`); return { sale, order, grand: v.grand };
}
