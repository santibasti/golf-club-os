/**
 * Walk-in wizard: one guided transaction instead of five screens.
 * Booking + arrival are REQUIRED (any failure aborts everything — the store only commits when no error is thrown).
 * Caddies, carts, payment, dispatch and "ready" are best-effort steps: each is attempted if the user's role allows it,
 * and reported honestly (done / skipped / failed) so nothing looks complete when it is not.
 */
import type { Booking, DB, PaymentMethod } from "../types";
import { Ctx, DomainError, fail, hasPerm, needPerm } from "./core";
import { PlayerInput, createBooking, estimateAncillary } from "./booking";
import { arriveBooking, markReady, flightRequirements } from "./flight";
import { assignCaddie, requiredCaddies, rotationQueue } from "./caddie";
import { assignCart, cartsFor, dispatchCart, requiredCarts } from "./cart";
import { outstanding, recordPayment } from "./finance";
import { bestCart } from "./tasks";

export interface WalkInInput { time: string; holes: 9 | 18; players: PlayerInput[]; contactName: string; contactPhone?: string; contactCustomerId?: string; contactMemberId?: string; wantCaddies: boolean; wantCarts: boolean; payMethod: PaymentMethod | null; notes?: string }
export interface WalkInStep { key: string; label: string; status: "done" | "skipped" | "failed"; detail?: string }
export interface WalkInResult { booking: Booking; steps: WalkInStep[]; collected: number; due: number; ready: boolean }

export function walkIn(db: DB, ctx: Ctx, i: WalkInInput): WalkInResult {
  needPerm(db, ctx, "booking.create"); needPerm(db, ctx, "checkin.manage");
  const steps: WalkInStep[] = []; const date = db.meta.now.slice(0, 10);
  // 1 + 2: required — throws (and therefore rolls back everything) on any rule violation
  const b = createBooking(db, ctx, { date, time: i.time, holes: i.holes, channel: "walk_in", players: i.players, contactName: i.contactName, contactPhone: i.contactPhone ?? "", contactCustomerId: i.contactCustomerId, contactMemberId: i.contactMemberId, notes: i.notes ?? "", noCaddie: !i.wantCaddies });
  steps.push({ key: "book", label: "Reservation created", status: "done", detail: `${b.ref} · ${b.players.length} golfer(s) · ${b.holes} holes` });
  arriveBooking(db, ctx, b.id, b.players.map((p) => p.id));
  steps.push({ key: "arrive", label: "Checked in — green fees posted", status: "done" });
  const attempt = (key: string, label: string, perm: string | null, skipWhy: string | null, fn: () => string | void) => {
    if (skipWhy) return void steps.push({ key, label, status: "skipped", detail: skipWhy });
    if (perm && !hasPerm(db, ctx, perm)) return void steps.push({ key, label, status: "skipped", detail: "Your role can't do this — it is waiting for the right department" });
    try { const d = fn(); steps.push({ key, label, status: "done", detail: d || undefined }); } catch (e) { if (e instanceof DomainError) steps.push({ key, label, status: "failed", detail: e.message }); else throw e; }
  };
  // 3: caddies
  const needC = requiredCaddies(db, b.id);
  attempt("caddies", "Caddies assigned", "caddie.manage", !i.wantCaddies ? "No caddie requested" : needC === 0 ? "Not required for this flight" : null, () => {
    const names: string[] = []; for (let k = 0; k < needC; k++) { const q = rotationQueue(db); if (!q.length) fail(`Only ${k} of ${needC} caddies were available in the queue`); const a = assignCaddie(db, ctx, { bookingId: b.id }); names.push(db.caddies.find((c) => c.id === a.caddieId)!.name); } return names.join(", ");
  });
  // 4: carts
  const needK = requiredCarts(db, b.id);
  attempt("carts", "Carts reserved", "cart.manage", !i.wantCarts ? "No cart requested" : null, () => {
    const nos: number[] = []; for (let k = 0; k < needK; k++) { const c = bestCart(db); if (!c) fail(`Only ${k} of ${needK} carts were available`); assignCart(db, ctx, b.id, c!.id); nos.push(c!.no); } return nos.map((n) => `#${n}`).join(", ");
  });
  // 5: payment of counter charges (green fees + cart rental). Caddie fees are billed after the round.
  const dueNow = () => db.charges.filter((c) => c.bookingId === b.id && c.billTo === "counter").reduce((a, c) => a + outstanding(c), 0);
  const before = dueNow(); let collected = 0;
  attempt("payment", before > 0 ? `Payment collected (₱${before.toLocaleString()})` : "Payment", "finance.payment", !i.payMethod ? (before > 0 ? "Pay later at the cashier — the starter cannot release the flight until it is paid" : "Nothing due at the counter (member account billing)") : before === 0 ? "Nothing due at the counter (member account billing)" : null, () => {
    for (const c of db.charges.filter((x) => x.bookingId === b.id && x.billTo === "counter" && outstanding(x) > 0)) recordPayment(db, ctx, { chargeId: c.id, amount: outstanding(c), method: i.payMethod! });
    collected = before - dueNow(); return `${i.payMethod}`;
  });
  // 6: dispatch carts + mark ready
  attempt("dispatch", "Carts dispatched to the tee", "cart.manage", cartsFor(db, b.id).length === 0 ? "No carts reserved" : null, () => { const cs = cartsFor(db, b.id).filter((c) => c.status === "reserved"); for (const c of cs) dispatchCart(db, ctx, c.id); return `${cs.length} cart(s)`; });
  let ready = false;
  attempt("ready", "Marked ready at the starter", "starter.manage", null, () => { markReady(db, ctx, b.id); ready = true; });
  if (!ready && !steps.find((s) => s.key === "ready" && s.status !== "done")) { /* no-op */ }
  const reqs = flightRequirements(db, db.bookings.find((x) => x.id === b.id)!).filter((r) => r.blocking && !r.ok);
  return { booking: db.bookings.find((x) => x.id === b.id)!, steps, collected, due: dueNow(), ready: ready && reqs.length === 0 };
}
/** Preview used by the wizard (no mutation). */
export function walkInEstimate(db: DB, players: number, holes: 9 | 18, wantCaddies: boolean, wantCarts: boolean) {
  const a = estimateAncillary(db, players, holes); return { carts: wantCarts ? a.carts : 0, cartFee: wantCarts ? a.cartFee : 0, caddies: wantCaddies ? a.caddies : 0, caddieFee: wantCaddies ? a.caddieFee : 0 };
}
