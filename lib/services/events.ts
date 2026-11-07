import type { ClubEvent, DB, PaymentMethod } from "../types";
import { Ctx, audit, fail, needPerm, nextId, req, requireText, today } from "./core";
import { applyPayment, createCharge, openShift, refundCharge, voidCharge } from "./finance";
import { createClosure, liftClosure, bookingConflicts } from "./booking";
import { fromMin, toMin } from "../time";
import { r2 } from "../format";

export const coursePar = (db: DB) => db.holes.reduce((a, h) => a + h.par, 0);
export interface NewEvent { name: string; type: ClubEvent["type"]; date: string; start: string; end: string; organizer: string; expected: number; fee: number; venue: string; format: string; blockTeeSheet: boolean; notes?: string }
export function createEvent(db: DB, ctx: Ctx, i: NewEvent) {
  needPerm(db, ctx, "event.manage"); requireText(i.name, "Event name", 3); requireText(i.organizer, "Organizer"); requireText(i.venue, "Venue");
  if (i.date < today(db)) fail("Event date cannot be in the past.", "validation"); if (toMin(i.end) <= toMin(i.start)) fail("End time must be after start time.", "validation");
  if (!(i.expected > 0)) fail("Expected participants must be greater than zero.", "validation"); if (i.fee < 0) fail("Registration fee cannot be negative.", "validation");
  const e: ClubEvent = { id: nextId(db, "event", "EV-", 4), name: i.name.trim(), type: i.type, date: i.date, start: i.start, end: i.end, organizer: i.organizer, expected: i.expected, fee: i.fee, venue: i.venue, status: "confirmed", registrations: [], flights: [], catering: [], resources: [], notes: i.notes ?? "", format: i.format };
  db.events.push(e); let impact = 0;
  if (i.blockTeeSheet) { const r = createClosure(db, { ...ctx, bypass: true }, { date: i.date, from: i.start, to: i.end, type: "tee", tee: "all", holes: [], category: "tournament", reason: `Event block: ${e.name}`, eventId: e.id }); e.closureId = r.closure.id; impact = r.impact.length; }
  audit(db, ctx, "event.create", "event", e.id, `${e.name} ${e.date}${impact ? `, ${impact} reservation(s) affected by tee block` : ""}`); return { event: e, impact };
}
export function setEventStatus(db: DB, ctx: Ctx, id: string, st: ClubEvent["status"]) {
  needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === id), "Event not found.");
  if (["completed", "cancelled"].includes(e.status)) fail(`A ${e.status} event cannot change status.`);
  if (st === "cancelled" && e.closureId) { const c = db.closures.find((x) => x.id === e.closureId); if (c?.active) liftClosure(db, { ...ctx, bypass: true }, c.id); }
  if (st === "completed" && e.closureId) { const c = db.closures.find((x) => x.id === e.closureId); if (c?.active && c.date >= today(db)) liftClosure(db, { ...ctx, bypass: true }, c.id); }
  e.status = st; audit(db, ctx, "event.status", "event", id, `→ ${st}`);
}
export function registerPlayer(db: DB, ctx: Ctx, eventId: string, i: { name: string; customerId?: string; memberId?: string; payMethod?: PaymentMethod }) {
  needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found.");
  if (["completed", "cancelled"].includes(e.status)) fail("Registration is closed for this event."); requireText(i.name, "Player name", 3);
  const active = e.registrations.filter((r) => r.status === "registered");
  if (active.some((r) => (i.memberId && r.memberId === i.memberId) || (i.customerId && r.customerId === i.customerId) || r.name.toLowerCase() === i.name.trim().toLowerCase())) fail(`${i.name.trim()} is already registered.`, "duplicate");
  if (active.length >= e.expected) fail(`Registration is full (${e.expected} participants). Increase expected participants first.`, "full");
  const chg = createCharge(db, ctx, { dept: "event", description: `Registration — ${e.name}`, amount: e.fee, name: i.name.trim(), customerId: i.customerId, memberId: i.memberId, refType: "event_reg", refId: e.id, billTo: "counter" });
  chg.date = e.date; // revenue is recognised on the event date, cash is recorded when received
  if (i.payMethod && e.fee > 0) applyPayment(db, ctx, { chargeId: chg.id, amount: e.fee, method: i.payMethod });
  e.registrations.push({ id: nextId(db, "reg", "REG-", 5), name: i.name.trim(), customerId: i.customerId, memberId: i.memberId, chargeId: chg.id, status: "registered" });
  audit(db, ctx, "event.register", "event", e.id, i.name);
}
export function withdrawPlayer(db: DB, ctx: Ctx, eventId: string, regId: string) {
  needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found."); const r = req(e.registrations.find((x) => x.id === regId), "Registration not found.");
  const c = r.chargeId ? db.charges.find((x) => x.id === r.chargeId) : undefined;
  if (c && c.paid > 0) { if (!openShift(db)) fail("Open a cashier shift to refund the registration fee.", "no_shift"); refundCharge(db, { ...ctx, bypass: true }, c.id, c.paid - c.refunded, "cash", `Withdrawal from ${e.name}`); }
  else if (c) voidCharge(db, ctx, c.id, `Withdrawn from ${e.name}`);
  r.status = "withdrawn"; r.flight = undefined; audit(db, ctx, "event.withdraw", "event", eventId, r.name);
}
export function assignFlights(db: DB, ctx: Ctx, eventId: string) {
  needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found."); const regs = e.registrations.filter((r) => r.status === "registered");
  if (!regs.length) fail("No registered players to group."); const size = db.settings.teeSheet.maxPlayers; const step = db.settings.teeSheet.interval; e.flights = [];
  regs.forEach((r, idx) => { r.flight = Math.floor(idx / size) + 1; });
  for (let f = 1; f <= Math.ceil(regs.length / size); f++) e.flights.push({ no: f, time: fromMin(toMin(e.start) + (f - 1) * step) });
  if (toMin(e.flights[e.flights.length - 1].time) >= toMin(e.end)) fail("Flights do not fit in the event time window. Extend the end time or reduce participants.");
  audit(db, ctx, "event.flights", "event", eventId, `${e.flights.length} flights`);
}
export function recordScore(db: DB, ctx: Ctx, eventId: string, regId: string, gross: number) {
  needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found."); const r = req(e.registrations.find((x) => x.id === regId), "Registration not found.");
  if (!Number.isInteger(gross) || gross < 30 || gross > 200) fail("Enter a whole-number gross score between 30 and 200.", "validation"); r.gross = gross; audit(db, ctx, "event.score", "event", eventId, `${r.name} ${gross}`);
}
export function leaderboard(db: DB, e: ClubEvent) {
  const par = coursePar(db); const scored = e.registrations.filter((r) => r.status === "registered" && r.gross != null).sort((a, b) => a.gross! - b.gross!);
  let rank = 0; let prev = -1; return scored.map((r, i) => { if (r.gross !== prev) { rank = i + 1; prev = r.gross!; } return { rank, tie: scored.filter((x) => x.gross === r.gross).length > 1, reg: r, toPar: r.gross! - par }; });
}
export function addCatering(db: DB, ctx: Ctx, eventId: string, item: string, qty: number, cost: number) {
  needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found."); requireText(item, "Item"); if (!(qty > 0) || !(cost >= 0)) fail("Enter a valid quantity and cost.", "validation");
  e.catering.push({ id: nextId(db, "catering", "CT-", 4), item, qty, cost: r2(cost), status: "requested" });
}
export function confirmCatering(db: DB, ctx: Ctx, eventId: string, id: string) {
  needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found."); const c = req(e.catering.find((x) => x.id === id), "Request not found."); if (c.status !== "requested") fail("Already confirmed.");
  const chg = createCharge(db, ctx, { dept: "event", description: `Catering — ${c.item} ×${c.qty} (${e.name})`, amount: c.cost, name: e.organizer, refType: "event_catering", refId: e.id, billTo: "counter" }); chg.date = e.date; c.chargeId = chg.id; c.status = "confirmed"; audit(db, ctx, "event.catering", "event", eventId, c.item);
}
export function toggleResource(db: DB, ctx: Ctx, eventId: string, id: string) { needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found."); const r = req(e.resources.find((x) => x.id === id), "Resource not found."); r.done = !r.done; }
export function addResource(db: DB, ctx: Ctx, eventId: string, text: string) { needPerm(db, ctx, "event.manage"); const e = req(db.events.find((x) => x.id === eventId), "Event not found."); requireText(text, "Resource requirement", 3); e.resources.push({ id: nextId(db, "resource", "RS-", 4), text: text.trim(), done: false }); }
export { bookingConflicts };
