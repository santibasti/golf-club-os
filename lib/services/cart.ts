import type { Cart, CartDispatch, DB } from "../types";
import { Ctx, audit, fail, needPerm, nextId, note, req, requireText } from "./core";
import { createCharge } from "./finance";
import { payerOf } from "./payer";
import { createWorkOrder } from "./maintenance";
import { r2 } from "../format";
import { addDays } from "../time";

export const ACTIVE_CART: Cart["status"][] = ["reserved", "dispatched", "in_use"];
export const cartsFor = (db: DB, bookingId: string) => db.carts.filter((c) => c.bookingId === bookingId && ACTIVE_CART.includes(c.status));
export const requiredCarts = (db: DB, bookingId: string) => { const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); return Math.ceil(b.players.length / db.settings.rates.playersPerCart); };
const openDispatch = (db: DB, cartId: string) => [...db.cartDispatches].reverse().find((d) => d.cartId === cartId && ["reserved", "dispatched"].includes(d.status));
const cartLog = (db: DB, ctx: Ctx, c: Cart, text: string) => note(c.history, db, ctx, text);

export function cartRentalFee(db: DB, bookingId: string) {
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); const r = db.settings.rates;
  const gross = b.holes === 18 ? r.cart18 : r.cart9;
  const m = b.contactMemberId ? db.members.find((x) => x.id === b.contactMemberId) : undefined;
  const pct = m && m.status === "active" ? (db.plans.find((p) => p.id === m.planId)?.cartDiscountPct ?? 0) : 0;
  return { gross, discount: r2((gross * pct) / 100), pct };
}

export function assignCart(db: DB, ctx: Ctx, bookingId: string, cartId: string) {
  needPerm(db, ctx, "cart.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found.");
  const c = req(db.carts.find((x) => x.id === cartId), "Cart not found.");
  if (!["confirmed", "arrived", "ready"].includes(b.status)) fail(`Carts can be assigned to confirmed or checked-in flights (this booking is ${b.status.replace("_", " ")}).`);
  if (c.status === "maintenance") fail(`Cart #${c.no} is under maintenance and cannot be assigned.`, "maintenance");
  if (c.status !== "available") fail(`Cart #${c.no} is ${c.status.replace("_", " ")} and cannot be assigned.`, "unavailable");
  if (c.bookingId && ACTIVE_CART.includes(c.status)) fail(`Cart #${c.no} is already assigned to another flight.`, "conflict");
  if (cartsFor(db, bookingId).length >= requiredCarts(db, bookingId)) fail("This flight already has enough carts for its golfers.");
  const fee = cartRentalFee(db, bookingId); const payer = payerOf(db, b, fee.gross - fee.discount);
  const chg = createCharge(db, ctx, { dept: "cart", description: `Cart rental #${c.no} (${b.holes}H)`, amount: fee.gross, discount: fee.discount, discountReason: fee.pct ? `Member cart discount ${fee.pct}%` : undefined, name: payer.name, customerId: payer.customerId, memberId: payer.memberId, bookingId: b.id, refType: "cart_dispatch", billTo: payer.billTo });
  const d: CartDispatch = { id: nextId(db, "dispatch", "CD-", 6), cartId: c.id, bookingId: b.id, date: b.date, reservedAt: db.meta.now, fee: fee.gross - fee.discount, chargeId: chg.id, status: "reserved" };
  chg.refId = d.id; db.cartDispatches.push(d);
  c.status = "reserved"; c.bookingId = b.id; cartLog(db, ctx, c, `Reserved for ${b.ref}`);
  audit(db, ctx, "cart.assign", "cart", c.id, `Cart #${c.no} → ${b.ref}`);
}

export function unassignCart(db: DB, ctx: Ctx, cartId: string) {
  needPerm(db, ctx, "cart.manage");
  const c = req(db.carts.find((x) => x.id === cartId), "Cart not found.");
  if (c.status !== "reserved") fail("Only reserved (not yet dispatched) carts can be released from a flight.");
  releaseCart(db, ctx, c, "Released by supervisor");
}
function releaseCart(db: DB, ctx: Ctx, c: Cart, why: string) {
  const d = openDispatch(db, c.id);
  if (d) { d.status = "cancelled"; const chg = db.charges.find((x) => x.id === d.chargeId); if (chg && chg.paid === 0 && chg.status === "unpaid") { chg.status = "voided"; chg.reason = why; note(chg.history, db, ctx, `Voided: ${why}`); } }
  cartLog(db, ctx, c, why); c.status = "available"; c.bookingId = undefined; audit(db, ctx, "cart.release", "cart", c.id, `Cart #${c.no}: ${why}`);
}
export function releaseBookingCarts(db: DB, ctx: Ctx, bookingId: string) {
  for (const c of db.carts.filter((x) => x.bookingId === bookingId && ACTIVE_CART.includes(x.status))) {
    if (c.status === "reserved") releaseCart(db, ctx, c, "Booking cancelled / no-show");
    else { const d = openDispatch(db, c.id); if (d) d.status = "cancelled"; c.status = "returned"; c.returnedAt = db.meta.now; c.bookingId = undefined; cartLog(db, ctx, c, "Returned: booking ended before play"); }
  }
}

export function dispatchCart(db: DB, ctx: Ctx, cartId: string) {
  needPerm(db, ctx, "cart.manage");
  const c = req(db.carts.find((x) => x.id === cartId), "Cart not found.");
  if (c.status === "maintenance") fail(`Cart #${c.no} is under maintenance and cannot be dispatched.`, "maintenance");
  if (c.status !== "reserved") fail(`Cart #${c.no} must be reserved for a flight before dispatch (currently ${c.status.replace("_", " ")}).`);
  const b = req(db.bookings.find((x) => x.id === c.bookingId), "Booking not found.");
  if (!["arrived", "ready"].includes(b.status)) fail("The flight must be checked in before its cart is dispatched.");
  c.status = "dispatched"; c.dispatchedAt = db.meta.now; c.staff = ctx.actor; c.returnedAt = undefined;
  const d = openDispatch(db, c.id); if (d) { d.status = "dispatched"; d.dispatchedAt = db.meta.now; d.staff = ctx.actor; }
  cartLog(db, ctx, c, `Dispatched to ${b.ref} by ${ctx.actor}`); audit(db, ctx, "cart.dispatch", "cart", c.id, `Cart #${c.no} dispatched for ${b.ref}`);
}
export function startCarts(db: DB, bookingId: string) { for (const c of db.carts.filter((x) => x.bookingId === bookingId && x.status === "dispatched")) c.status = "in_use"; }

function doReturn(db: DB, ctx: Ctx, c: Cart) {
  const d = [...db.cartDispatches].reverse().find((x) => x.cartId === c.id && ["dispatched", "reserved"].includes(x.status));
  if (d) { d.status = "returned"; d.returnedAt = db.meta.now; }
  c.returnedAt = db.meta.now; c.bookingId = undefined;
  if (c.fuel === "electric") c.battery = Math.max(5, c.battery - 30);
  if (c.damage) { c.status = "maintenance"; cartLog(db, ctx, c, `Returned with reported damage — held for maintenance: ${c.damage}`); }
  else { c.status = "returned"; cartLog(db, ctx, c, "Returned from course"); }
}
export function returnCart(db: DB, ctx: Ctx, cartId: string) {
  needPerm(db, ctx, "cart.manage");
  const c = req(db.carts.find((x) => x.id === cartId), "Cart not found.");
  if (!["dispatched", "in_use"].includes(c.status)) fail(`Cart #${c.no} is ${c.status.replace("_", " ")} — only dispatched or in-use carts can be returned.`);
  doReturn(db, ctx, c); audit(db, ctx, "cart.return", "cart", c.id, `Cart #${c.no} returned`);
}
export function returnBookingCarts(db: DB, ctx: Ctx, bookingId: string) { for (const c of db.carts.filter((x) => x.bookingId === bookingId && ["dispatched", "in_use"].includes(x.status))) doReturn(db, ctx, c); }

export function startInspection(db: DB, ctx: Ctx, cartId: string) {
  needPerm(db, ctx, "cart.manage");
  const c = req(db.carts.find((x) => x.id === cartId), "Cart not found.");
  if (c.status !== "returned") fail("Only returned carts go to inspection."); c.status = "inspection"; cartLog(db, ctx, c, "Inspection started");
}
export function passInspection(db: DB, ctx: Ctx, cartId: string, charged = true) {
  needPerm(db, ctx, "cart.manage");
  const c = req(db.carts.find((x) => x.id === cartId), "Cart not found.");
  if (!["inspection", "returned"].includes(c.status)) fail("Cart must be returned or in inspection to be cleared.");
  if (c.fuel === "electric" && c.battery < 40 && charged) c.battery = 100;
  c.status = "available"; cartLog(db, ctx, c, "Inspection passed — available"); audit(db, ctx, "cart.inspect", "cart", c.id, `Cart #${c.no} passed inspection`);
}

/** Report a defect: the cart is pulled from dispatch (if not on course) and a maintenance work order is generated. */
export function reportCartIssue(db: DB, ctx: Ctx, cartId: string, description: string, priority: "normal" | "high" | "urgent" = "high") {
  needPerm(db, ctx, "cart.manage");
  const c = req(db.carts.find((x) => x.id === cartId), "Cart not found."); requireText(description, "Description of the issue", 5);
  if (c.status === "maintenance") fail(`Cart #${c.no} is already under maintenance.`);
  const onCourse = ["dispatched", "in_use"].includes(c.status);
  const reservedBooking = c.status === "reserved" ? c.bookingId : undefined;
  if (c.status === "reserved") releaseCart(db, ctx, c, `Pulled from service: ${description}`);
  c.damage = description.trim();
  if (!onCourse) { c.status = "maintenance"; c.bookingId = undefined; }
  const wo = createWorkOrder(db, ctx, { location: `Cart #${c.no}`, category: "Golf carts", description: `Cart #${c.no}: ${description.trim()}`, priority, team: "Cart Maintenance", startDate: db.meta.now.slice(0, 10), targetDate: addDays(db.meta.now.slice(0, 10), 2), estCost: 1500, cartId: c.id, skipPerm: true });
  cartLog(db, ctx, c, onCourse ? `Defect reported while on course (${description}); WO ${wo.code} raised — will be held on return` : `Marked unavailable — ${description}; WO ${wo.code} raised`);
  audit(db, ctx, "cart.issue", "cart", c.id, `Cart #${c.no}: ${description} → ${wo.code}`);
  return { workOrder: wo, reservedBooking };
}
export function recordCartDamage(db: DB, ctx: Ctx, cartId: string, description: string) { return reportCartIssue(db, ctx, cartId, description, "high"); }
