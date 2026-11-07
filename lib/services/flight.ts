import type { Booking, BookingPlayer, DB, IncidentType, Round } from "../types";
import { Ctx, audit, fail, hasPerm, needPerm, nextId, note, req, requireText } from "./core";
import { ROUND_MINUTES, blockingClosure, isActive, memberEligibility, validateBooking, type PlayerInput } from "./booking";
import { applyDepositToCharge, createCharge, outstanding } from "./finance";
import { bookingAssignments, completeCaddies, promoteReserved, requiredCaddies, startCaddies } from "./caddie";
import { cartsFor, returnBookingCarts, startCarts } from "./cart";
import { payerOf } from "./payer";
import { addMinTs, fmt12, minsBetween, mkTs, timeOf } from "../time";
import { r2 } from "../format";

export const roundOf = (db: DB, bookingId: string) => db.rounds.find((r) => r.bookingId === bookingId);
export const schedStart = (b: Booking) => mkTs(b.date, b.time);

/* --------------------------- requirements --------------------------- */
export interface Requirement { key: string; label: string; ok: boolean; blocking: boolean; detail: string }
export function flightRequirements(db: DB, b: Booking): Requirement[] {
  const present = b.players.filter((p) => p.checkedIn).length;
  const needCaddies = requiredCaddies(db, b.id); const haveCaddies = bookingAssignments(db, b.id).length;
  const carts = cartsFor(db, b.id); const cartsNeeded = Math.ceil(b.players.length / db.settings.rates.playersPerCart);
  const open = db.charges.filter((c) => c.bookingId === b.id && c.billTo === "counter" && outstanding(c) > 0);
  const openAmt = r2(open.reduce((a, c) => a + outstanding(c), 0));
  const notDisp = carts.filter((c) => c.status === "reserved");
  return [
    { key: "players", label: "All players checked in", ok: present === b.players.length && present > 0, blocking: true, detail: `${present}/${b.players.length} arrived` },
    { key: "caddies", label: "Caddies assigned", ok: haveCaddies >= needCaddies, blocking: true, detail: needCaddies === 0 ? "Not required" : `${haveCaddies}/${needCaddies} assigned` },
    { key: "payment", label: "Payment cleared", ok: openAmt === 0, blocking: true, detail: openAmt ? `₱${openAmt.toLocaleString()} due at counter` : "No counter balance (member account charges allowed)" },
    { key: "cart", label: "Cart assigned & dispatched", ok: carts.length > 0 && notDisp.length === 0, blocking: false, detail: carts.length ? (notDisp.length ? `${notDisp.length} reserved, not dispatched` : `${carts.length} cart(s) ready`) : `0/${cartsNeeded} carts (optional)` },
  ];
}

/* ------------------------------ arrival ----------------------------- */
export function modifyFlightPlayers(db: DB, ctx: Ctx, bookingId: string, players: PlayerInput[]) {
  needPerm(db, ctx, "checkin.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found.");
  if (!["booked", "confirmed"].includes(b.status)) fail("The flight list can be modified only before arrival is confirmed (charges are raised at arrival).");
  const v = validateBooking(db, ctx, { date: b.date, time: b.time, tee: b.tee, holes: b.holes, players, excludeId: b.id, contactMemberId: b.contactMemberId, channel: "walk_in", override: false });
  b.players = v.players; b.greenFeeTotal = v.total;
  db.sponsorships = db.sponsorships.filter((s) => s.bookingId !== b.id);
  for (const p of b.players.filter((x) => x.type === "guest" && x.sponsorId)) db.sponsorships.push({ id: nextId(db, "sponsor", "SP-", 5), memberId: p.sponsorId!, guestName: p.name, guestCustomerId: p.customerId, bookingId: b.id, date: b.date, fee: p.rate });
  note(b.history, db, ctx, `Flight list modified at front desk (${b.players.length} golfer(s))`);
  audit(db, ctx, "checkin.players", "booking", b.id, `${b.ref} players updated`);
}

export function arriveBooking(db: DB, ctx: Ctx, bookingId: string, arrivedPlayerIds: string[]): Round {
  needPerm(db, ctx, "checkin.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found.");
  if (b.status === "booked") fail("This reservation is awaiting confirmation. Confirm it before check-in.");
  if (b.status !== "confirmed") fail(`Booking ${b.ref} is ${b.status.replace("_", " ")} and cannot be checked in.`);
  if (b.date !== db.meta.now.slice(0, 10)) fail("Only today's bookings can be checked in.");
  const arrived = b.players.filter((p) => arrivedPlayerIds.includes(p.id));
  if (arrived.length === 0) fail("Select at least one arriving golfer.", "validation");
  // re-validate privileges at the moment of arrival
  for (const p of arrived) {
    if (p.type === "member") { const m = db.members.find((x) => x.id === p.memberId)!; const bad = memberEligibility(db, m, b.date); if (bad) fail(`${bad} Change this golfer to Public in the flight list before checking in.`, "eligibility"); }
    if (p.type === "guest") { const sp = db.members.find((x) => x.id === p.sponsorId)!; const bad = memberEligibility(db, sp, b.date); if (bad) fail(`Sponsor problem: ${bad}`, "eligibility"); if (!arrived.some((q) => q.memberId === sp.id)) fail(`Sponsor ${sp.id} has not arrived; guest ${p.name} cannot be checked in without the sponsoring member.`, "eligibility"); }
  }
  const dropped = b.players.filter((p) => !arrivedPlayerIds.includes(p.id));
  b.players = arrived.map((p) => ({ ...p, checkedIn: true }));
  b.greenFeeTotal = r2(b.players.reduce((a, p) => a + p.rate, 0));
  if (dropped.length) { note(b.history, db, ctx, `Not arrived, removed from flight: ${dropped.map((d) => d.name).join(", ")}`); db.sponsorships = db.sponsorships.filter((s) => !(s.bookingId === b.id && dropped.some((d) => d.name === s.guestName))); }

  // group green fees by payer
  const groups = new Map<string, { payer: ReturnType<typeof payerOf>; players: BookingPlayer[]; key: string }>();
  const contactIsMember = !!b.contactMemberId;
  for (const p of b.players) {
    let key: string; let payer;
    if (p.type === "member") { key = p.memberId!; payer = payerOf(db, { ...b, contactMemberId: p.memberId } as Booking); }
    else if (p.type === "guest" && db.settings.billing.guestFeeBillTo === "sponsor") { key = p.sponsorId!; payer = payerOf(db, { ...b, contactMemberId: p.sponsorId } as Booking); }
    else { key = contactIsMember ? `walkin:${b.id}` : `cust:${b.contactCustomerId ?? b.id}`; payer = { name: contactIsMember ? `${b.contactName} (public players)` : b.contactName, customerId: contactIsMember ? undefined : b.contactCustomerId, billTo: "counter" as const }; }
    const g = groups.get(key) ?? { payer, players: [], key }; g.players.push(p); groups.set(key, g);
  }
  const chargesMade = [];
  for (const g of groups.values()) {
    const amount = r2(g.players.reduce((a, p) => a + p.rate, 0));
    const payer = g.payer.memberId ? payerOf(db, { ...b, contactMemberId: g.payer.memberId } as Booking, amount) : g.payer;
    chargesMade.push(createCharge(db, ctx, { dept: "green", description: `Green fees ${b.holes}H — ${g.players.map((p) => p.name).join(", ")}`, amount, name: payer.name, customerId: payer.customerId, memberId: payer.memberId, bookingId: b.id, refType: "green_fee", billTo: payer.billTo, billingKey: `green:${b.id}:${g.key}` }));
  }
  if (b.deposit?.status === "held") { const target = chargesMade.find((c) => c.billTo === "counter") ?? chargesMade[0]; if (target) { const used = applyDepositToCharge(db, ctx, b.deposit.paymentId, target.id); if (used > 0) { b.deposit.status = "applied"; note(b.history, db, ctx, `Deposit ₱${used.toLocaleString()} applied to ${target.no}`); } } }

  const flightNo = db.rounds.filter((r) => r.date === b.date).length + 1;
  const r: Round = { id: nextId(db, "round", "RD-", 5), bookingId: b.id, date: b.date, flightNo, arrivedAt: db.meta.now, checkpoints: [], incidents: [] };
  db.rounds.push(r); b.flightNo = flightNo; b.status = "arrived"; promoteReserved(db, b.id);
  note(b.history, db, ctx, `Checked in at ${fmt12(timeOf(db.meta.now))} — flight #${flightNo}, ${b.players.length} golfer(s); digital check-in record created ${r.id}`);
  audit(db, ctx, "checkin.arrive", "booking", b.id, `${b.ref} arrived (${b.players.length})`);
  return r;
}

/* ------------------------------ starter ----------------------------- */
export function markReady(db: DB, ctx: Ctx, bookingId: string, waive?: string) {
  needPerm(db, ctx, "starter.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found.");
  if (b.status !== "arrived") fail("Only checked-in (arrived) flights can be marked ready.");
  const miss = flightRequirements(db, b).filter((r) => r.blocking && !r.ok);
  const r = req(roundOf(db, b.id), "Round record missing.");
  if (miss.length) {
    const w = (waive ?? "").trim(); if (w.length < 5) fail(`Incomplete requirements: ${miss.map((m) => `${m.label} (${m.detail})`).join("; ")}. Provide a waiver reason (min 5 chars) to proceed.`, "requirements");
    r.requirementsWaived = w; note(b.history, db, ctx, `Ready with waived requirements: ${w}`);
    audit(db, ctx, "starter.waive", "booking", b.id, `${b.ref} ready, waived ${miss.map((m) => m.key).join(",")}: ${w}`);
  }
  b.status = "ready"; r.readyAt = db.meta.now; note(b.history, db, ctx, "Marked ready at the starter");
  audit(db, ctx, "starter.ready", "booking", b.id, b.ref);
}
export function startRound(db: DB, ctx: Ctx, bookingId: string) {
  needPerm(db, ctx, "starter.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found.");
  if (b.status !== "ready") fail(b.status === "arrived" ? "Mark the flight ready before releasing it." : `Flight is ${b.status.replace("_", " ")}; it cannot be released.`);
  const r = req(roundOf(db, b.id), "Round record missing.");
  const cl = blockingClosure(db, b.date, timeOf(db.meta.now), b.tee); if (cl) fail(`Cannot release: course restriction in effect — ${cl.reason}.`, "closed");
  if (r.suspended) fail("Play is suspended for this flight. Resume before release.");
  const undispatched = cartsFor(db, b.id).filter((c) => c.status === "reserved"); if (undispatched.length) fail(`Cart #${undispatched[0].no} is reserved but not dispatched. Dispatch it first.`);
  b.status = "started"; r.startedAt = db.meta.now; startCaddies(db, b.id); startCarts(db, b.id);
  note(b.history, db, ctx, `Released at ${fmt12(timeOf(db.meta.now))} (scheduled ${fmt12(b.time)})`); audit(db, ctx, "starter.start", "booking", b.id, `${b.ref} started`);
}
export function flagDelay(db: DB, ctx: Ctx, bookingId: string, reason: string) {
  needPerm(db, ctx, "starter.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); const r = roundOf(db, b.id);
  if (!r) fail("Only checked-in flights can be flagged as delayed."); requireText(reason, "Delay reason", 3);
  r!.delay = { reason: reason.trim(), at: db.meta.now }; note(b.history, db, ctx, `Delay flagged: ${reason.trim()}`); audit(db, ctx, "starter.delay", "booking", b.id, `${b.ref}: ${reason}`);
}
export function clearDelay(db: DB, ctx: Ctx, bookingId: string) {
  needPerm(db, ctx, "starter.manage"); const r = roundOf(db, bookingId); if (!r?.delay) fail("No delay flag to clear."); r!.delay = undefined;
}
export function suspendFlight(db: DB, ctx: Ctx, bookingId: string, reason: string) {
  needPerm(db, ctx, "starter.manage"); const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); const r = req(roundOf(db, b.id), "No round.");
  if (!["arrived", "ready", "started"].includes(b.status)) fail("Only active flights can be suspended."); requireText(reason, "Reason", 3);
  r.suspended = { reason: reason.trim(), at: db.meta.now }; note(b.history, db, ctx, `Play suspended: ${reason.trim()}`); audit(db, ctx, "starter.suspend", "booking", b.id, reason);
}
export function resumeFlight(db: DB, ctx: Ctx, bookingId: string) {
  needPerm(db, ctx, "starter.manage"); const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); const r = req(roundOf(db, b.id), "No round.");
  if (!r.suspended) fail("Play is not suspended."); r.suspended = null; note(b.history, db, ctx, "Play resumed"); audit(db, ctx, "starter.resume", "booking", b.id, b.ref);
}
export function recordCheckpoint(db: DB, ctx: Ctx, bookingId: string, hole: number, noteText?: string) {
  needPerm(db, ctx, "starter.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); const r = req(roundOf(db, b.id), "No round.");
  if (b.status !== "started" || !r.startedAt) fail("Pace checkpoints can be recorded for flights on the course.");
  if (!Number.isInteger(hole) || hole < 1 || hole > b.holes) fail(`Hole must be between 1 and ${b.holes}.`, "validation");
  if (r.checkpoints.some((c) => c.hole === hole)) fail(`A checkpoint for hole ${hole} already exists.`);
  const per = ROUND_MINUTES(db, b.holes) / b.holes;
  r.checkpoints.push({ id: nextId(db, "checkpoint", "CP-", 6), hole, at: db.meta.now, expectedAt: addMinTs(r.startedAt!, Math.round(per * hole)), note: noteText });
  audit(db, ctx, "starter.checkpoint", "booking", b.id, `${b.ref} hole ${hole}`);
}
export function recordIncident(db: DB, ctx: Ctx, bookingId: string, type: IncidentType, text: string) {
  needPerm(db, ctx, "starter.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); const r = req(roundOf(db, b.id), "No round for this flight.");
  requireText(text, "Incident description", 5);
  r.incidents.push({ id: nextId(db, "incident", "INC-", 5), type, note: text.trim(), at: db.meta.now, by: ctx.actor }); note(b.history, db, ctx, `Incident (${type.replace("_", " ")}): ${text.trim()}`);
  audit(db, ctx, "starter.incident", "booking", b.id, `${type}: ${text}`);
}
export function completeRound(db: DB, ctx: Ctx, bookingId: string, extras: Record<string, { tip?: number; special?: number; extra?: number }> = {}) {
  needPerm(db, ctx, "starter.manage");
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found."); const r = req(roundOf(db, b.id), "No round.");
  if (b.status !== "started") fail("Only a started round can be completed.");
  b.status = "completed"; r.finishedAt = db.meta.now; r.suspended = null;
  completeCaddies(db, ctx, b.id, extras); returnBookingCarts(db, ctx, b.id);
  note(b.history, db, ctx, `Round completed at ${fmt12(timeOf(db.meta.now))} (${minsBetween(r.startedAt!, db.meta.now)} min)`); audit(db, ctx, "starter.complete", "booking", b.id, `${b.ref} completed`);
}

/* ------------------------------- pace ------------------------------- */
export interface Pace { scheduled: string; actualStart?: string; expectedFinish?: string; actualFinish?: string; elapsed?: number; expectedElapsed: number; lateStartMin?: number; behindMin: number; status: "not_started" | "on_pace" | "behind" | "ahead" | "delayed" | "suspended" | "finished" }
export function paceOf(db: DB, b: Booking): Pace {
  const r = roundOf(db, b.id); const total = ROUND_MINUTES(db, b.holes); const tol = db.settings.pace.toleranceMin; const now = db.meta.now;
  const base: Pace = { scheduled: schedStart(b), expectedElapsed: total, behindMin: 0, status: "not_started" };
  if (!r?.startedAt) {
    const late = ["arrived", "ready", "confirmed", "booked"].includes(b.status) ? minsBetween(schedStart(b), now) : 0;
    return { ...base, status: r?.suspended ? "suspended" : r?.delay || late > 10 ? "delayed" : "not_started", lateStartMin: Math.max(0, late) };
  }
  const exp = addMinTs(r.startedAt, total); const end = r.finishedAt ?? now;
  const elapsed = minsBetween(r.startedAt, end); const lastCp = [...r.checkpoints].sort((a, c) => c.hole - a.hole)[0];
  const behind = r.finishedAt ? Math.max(0, minsBetween(exp, r.finishedAt)) : lastCp ? minsBetween(lastCp.expectedAt, lastCp.at) : Math.max(0, elapsed - total);
  const out: Pace = { ...base, actualStart: r.startedAt, expectedFinish: exp, actualFinish: r.finishedAt, elapsed, behindMin: behind, lateStartMin: Math.max(0, minsBetween(schedStart(b), r.startedAt)), status: "on_pace" };
  if (r.finishedAt) out.status = "finished"; else if (r.suspended) out.status = "suspended"; else if (behind > tol || r.delay) out.status = "behind"; else if (behind < -tol) out.status = "ahead";
  return out;
}
export const flightDelayed = (db: DB, b: Booking) => isActive(b) && ["delayed", "behind"].includes(paceOf(db, b).status);
export { hasPerm };
