import type { Caddie, CaddieAssignment, DB } from "../types";
import { Ctx, audit, fail, needPerm, nextId, req, requireText, today } from "./core";
import { createCharge, chargeNet } from "./finance";
import { payerOf } from "./payer";
import { dateOf, timeOf } from "../time";
import { r2 } from "../format";

export const ACTIVE_ASSIGN: CaddieAssignment["status"][] = ["reserved", "assigned", "on_course"];
export const activeAssignment = (db: DB, caddieId: string) => db.caddieAssignments.find((a) => a.caddieId === caddieId && ACTIVE_ASSIGN.includes(a.status));
export const roundsToday = (db: DB, caddieId: string, date = today(db)) => db.caddieAssignments.filter((a) => a.caddieId === caddieId && a.date === date && a.status !== "cancelled" && a.status !== "replaced").length;
export const completedRounds = (db: DB, c: Caddie) => c.baseRounds + db.caddieAssignments.filter((a) => a.caddieId === c.id && a.status === "completed").length;
export const totalFees = (db: DB, c: Caddie) => c.baseFees + db.caddieAssignments.filter((a) => a.caddieId === c.id && a.status === "completed").reduce((s, a) => s + a.fee + a.special + a.extra + a.tip, 0);
export const attendanceToday = (db: DB, caddieId: string) => db.caddieAttendance.find((a) => a.caddieId === caddieId && a.date === today(db));

/** Rotation queue — the configurable example rule:
 *  fewest_rounds: fewest rounds today first, ties by who has waited longest (time released/in), then assignment priority.
 *  time_in: strict first-in-first-out by the time the caddie became available. */
export function rotationQueue(db: DB): Caddie[] {
  const mode = db.settings.rotation.mode;
  const waiting = (c: Caddie) => c.lastReleasedAt ?? attendanceToday(db, c.id)?.timeIn ?? "9999";
  return db.caddies.filter((c) => c.status === "available" && !activeAssignment(db, c.id)).sort((a, b) => {
    if (mode === "fewest_rounds") { const d = roundsToday(db, a.id) - roundsToday(db, b.id); if (d) return d; }
    const w = waiting(a).localeCompare(waiting(b)); if (w) return w;
    return a.priority - b.priority;
  });
}

export function caddieCheckIn(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "caddie.manage");
  const c = req(db.caddies.find((x) => x.id === id), "Caddie not found.");
  const att = attendanceToday(db, id);
  if (att?.timeIn && !att.timeOut && c.status !== "off" && c.status !== "absent" && c.status !== "day_off") fail(`${c.name} is already on duty.`);
  const t = timeOf(db.meta.now);
  if (att) { att.timeIn = t; att.timeOut = undefined; att.status = t > "06:30" ? "late" : "present"; }
  else db.caddieAttendance.push({ id: nextId(db, "attendance", "ATT-", 6), caddieId: id, date: today(db), timeIn: t, status: t > "06:30" ? "late" : "present" });
  c.status = "available"; c.lastReleasedAt = db.meta.now; c.unavailableReason = undefined;
  audit(db, ctx, "caddie.timein", "caddie", id, `${c.name} time-in ${t}`);
}
export function caddieCheckOut(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "caddie.manage");
  const c = req(db.caddies.find((x) => x.id === id), "Caddie not found.");
  if (activeAssignment(db, id)) fail(`${c.name} still has an active assignment and cannot time out.`);
  if (c.status === "returned") fail(`${c.name} has just returned — release to queue or complete turn-in first.`);
  const att = attendanceToday(db, id); if (!att?.timeIn) fail(`${c.name} has not timed in today.`);
  att!.timeOut = timeOf(db.meta.now); c.status = "off";
  audit(db, ctx, "caddie.timeout", "caddie", id, `${c.name} time-out ${att!.timeOut}`);
}
export function setCaddieStatus(db: DB, ctx: Ctx, id: string, status: "unavailable" | "absent" | "day_off" | "available", reason?: string) {
  needPerm(db, ctx, "caddie.manage");
  const c = req(db.caddies.find((x) => x.id === id), "Caddie not found.");
  if (activeAssignment(db, id)) fail(`${c.name} has an active assignment. Replace or complete the assignment first.`);
  if (status === "available") {
    if (c.status === "available") fail(`${c.name} is already available.`);
    if (!attendanceToday(db, id)?.timeIn) fail(`${c.name} has not timed in. Use Time-in first.`);
    c.status = "available"; c.lastReleasedAt = db.meta.now; c.unavailableReason = undefined;
  } else {
    if (status === "unavailable") requireText(reason, "Reason", 3);
    c.status = status; c.unavailableReason = reason;
    const att = attendanceToday(db, id);
    if (status !== "unavailable") { if (att) att.status = status === "absent" ? "absent" : "day_off"; else db.caddieAttendance.push({ id: nextId(db, "attendance", "ATT-", 6), caddieId: id, date: today(db), status: status === "absent" ? "absent" : "day_off" }); }
    db.rotationEvents.push({ id: nextId(db, "rotation", "ROT-", 6), at: db.meta.now, caddieId: id, type: "unavailable", reason: reason ?? status, by: ctx.actor });
  }
  audit(db, ctx, "caddie.status", "caddie", id, `${c.name} → ${status}${reason ? ": " + reason : ""}`);
}

export function caddieFee(db: DB, c: Caddie, holes: 9 | 18) { const f = db.settings.rates.caddie[c.category]; return holes === 18 ? f.f18 : f.f9; }
export function requiredCaddies(db: DB, bookingId: string) {
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found.");
  if (b.noCaddie || !db.settings.rates.caddieRequired) return 0;
  return Math.ceil(b.players.length / db.settings.rates.playersPerCaddie);
}
export const bookingAssignments = (db: DB, bookingId: string) => db.caddieAssignments.filter((a) => a.bookingId === bookingId && ACTIVE_ASSIGN.includes(a.status));

export function assignCaddie(db: DB, ctx: Ctx, input: { bookingId: string; caddieId?: string; reason?: string; preferred?: boolean }): CaddieAssignment {
  needPerm(db, ctx, "caddie.manage");
  const b = req(db.bookings.find((x) => x.id === input.bookingId), "Booking not found.");
  if (!["confirmed", "arrived", "ready"].includes(b.status)) fail(`Caddies can be assigned to confirmed or checked-in flights (this booking is ${b.status.replace("_", " ")}).`);
  const have = bookingAssignments(db, b.id);
  if (have.length >= b.players.length) fail("This flight already has a caddie for every golfer.");
  const queue = rotationQueue(db);
  const expected = queue[0];
  const caddie = input.caddieId ? req(db.caddies.find((x) => x.id === input.caddieId), "Caddie not found.") : expected;
  if (!caddie) return fail("No caddie is available in the rotation queue.", "no_caddie");
  if (caddie.status !== "available") fail(`${caddie.name} is ${caddie.status.replace("_", " ")} and cannot be assigned.`, "unavailable");
  const clash = activeAssignment(db, caddie.id); if (clash) fail(`${caddie.name} is already assigned to an active round.`, "conflict");
  let type: "auto" | "preferred" | "override" = "auto";
  if (expected && caddie.id !== expected.id) {
    if (input.preferred) {
      if (!db.settings.rotation.allowPreferred) fail("Preferred-caddie requests are disabled in rotation settings.");
      requireText(input.reason, "Request note (e.g. 'requested by golfer')", 3); type = "preferred";
    } else {
      needPerm(db, ctx, "caddie.override"); requireText(input.reason, "Override reason", 5); type = "override";
    }
  }
  const reserved = b.status === "confirmed";
  const fee = caddieFee(db, caddie, b.holes);
  const a: CaddieAssignment = { id: nextId(db, "cassign", "CA-", 6), caddieId: caddie.id, bookingId: b.id, date: b.date, status: reserved ? "reserved" : "assigned", fee, special: 0, extra: 0, tip: 0, createdAt: db.meta.now };
  db.caddieAssignments.push(a); caddie.status = reserved ? "reserved" : "assigned";
  db.rotationEvents.push({ id: nextId(db, "rotation", "ROT-", 6), at: db.meta.now, caddieId: caddie.id, bookingId: b.id, type, reason: input.reason, by: ctx.actor, expectedCaddieId: expected?.id });
  audit(db, ctx, type === "auto" ? "caddie.assign" : `caddie.assign.${type}`, "booking", b.id, `${caddie.name} → ${b.ref}${input.reason ? " (" + input.reason + ")" : ""}`);
  return a;
}

export function replaceCaddie(db: DB, ctx: Ctx, assignmentId: string, newCaddieId: string, reason: string) {
  needPerm(db, ctx, "caddie.manage");
  const a = req(db.caddieAssignments.find((x) => x.id === assignmentId), "Assignment not found.");
  if (!ACTIVE_ASSIGN.includes(a.status)) fail("Only active assignments can be replaced.");
  requireText(reason, "Replacement reason", 3);
  const nc = req(db.caddies.find((x) => x.id === newCaddieId), "Caddie not found.");
  if (nc.id === a.caddieId) fail("Choose a different caddie.");
  if (nc.status !== "available") fail(`${nc.name} is ${nc.status.replace("_", " ")} and cannot be assigned.`);
  const old = req(db.caddies.find((x) => x.id === a.caddieId), "Caddie not found.");
  const wasStatus = a.status;
  a.status = "replaced"; old.status = a.startedAt ? "returned" : "available";
  const b = req(db.bookings.find((x) => x.id === a.bookingId), "Booking not found.");
  const n: CaddieAssignment = { id: nextId(db, "cassign", "CA-", 6), caddieId: nc.id, bookingId: a.bookingId, date: a.date, status: wasStatus, fee: caddieFee(db, nc, b.holes), special: 0, extra: 0, tip: 0, createdAt: db.meta.now, startedAt: a.startedAt, note: `Replaced ${old.name}` };
  db.caddieAssignments.push(n); nc.status = wasStatus === "reserved" ? "reserved" : wasStatus === "assigned" ? "assigned" : "on_course";
  db.rotationEvents.push({ id: nextId(db, "rotation", "ROT-", 6), at: db.meta.now, caddieId: nc.id, bookingId: a.bookingId, type: "replace", reason: `${reason} (replaces ${old.name})`, by: ctx.actor });
  audit(db, ctx, "caddie.replace", "booking", a.bookingId, `${old.name} → ${nc.name}: ${reason}`);
}

export function releaseBookingCaddies(db: DB, ctx: Ctx, bookingId: string, why: string) {
  for (const a of db.caddieAssignments.filter((x) => x.bookingId === bookingId && ACTIVE_ASSIGN.includes(x.status))) {
    a.status = "cancelled"; const c = db.caddies.find((x) => x.id === a.caddieId); if (c && ["reserved", "assigned", "on_course"].includes(c.status)) c.status = "available";
    audit(db, ctx, "caddie.release", "caddie", a.caddieId, `${why}: ${bookingId}`);
  }
}
/** Arrival promotes reserved caddies to assigned. */
export function promoteReserved(db: DB, bookingId: string) {
  for (const a of db.caddieAssignments.filter((x) => x.bookingId === bookingId && x.status === "reserved")) { a.status = "assigned"; const c = db.caddies.find((x) => x.id === a.caddieId); if (c) c.status = "assigned"; }
}
export function startCaddies(db: DB, bookingId: string) {
  for (const a of db.caddieAssignments.filter((x) => x.bookingId === bookingId && x.status === "assigned")) { a.status = "on_course"; a.startedAt = db.meta.now; const c = db.caddies.find((x) => x.id === a.caddieId); if (c) c.status = "on_course"; }
}

/** Completes caddie assignments for a finished round: posts the service charge and (where applicable) a settlement payable.
 *  Club-employed caddies: fee is club revenue. Contractors / freelancers: the club collects on their behalf and records a payable. */
export function completeCaddies(db: DB, ctx: Ctx, bookingId: string, extras: Record<string, { tip?: number; special?: number; extra?: number }> = {}) {
  const b = req(db.bookings.find((x) => x.id === bookingId), "Booking not found.");
  for (const a of db.caddieAssignments.filter((x) => x.bookingId === bookingId && x.status === "on_course")) {
    const c = req(db.caddies.find((x) => x.id === a.caddieId), "Caddie not found.");
    const e = extras[a.id] ?? {};
    a.tip = r2(e.tip ?? a.tip); a.special = r2(e.special ?? a.special); a.extra = r2(e.extra ?? a.extra);
    const service = a.fee + a.special + a.extra; const total = r2(service + a.tip);
    const clubSharePct = db.settings.rates.caddieClubSharePct[c.classification];
    const clubRetained = r2(service * clubSharePct / 100);
    const payable = r2(total - clubRetained);
    const payer = payerOf(db, b, total);
    const chg = createCharge(db, ctx, { dept: "caddie", description: `Caddie service — ${c.name} (${c.id}), ${b.holes}H${a.tip ? ` incl. tip ${a.tip}` : ""}`, amount: total, name: payer.name, customerId: payer.customerId, memberId: payer.memberId, bookingId: b.id, refType: "caddie_assignment", refId: a.id, payable, payableToCaddieId: payable > 0 ? c.id : undefined, billTo: payer.billTo, billingKey: `caddie:${a.id}` });
    a.status = "completed"; a.completedAt = db.meta.now; a.chargeId = chg.id; c.status = "returned";
    if (payable > 0) {
      const s = { id: nextId(db, "settlement", "SET-", 5), caddieId: c.id, assignmentId: a.id, date: dateOf(db.meta.now), gross: total, payable, clubRetained, status: "pending" as const, chargeId: chg.id };
      db.caddieSettlements.push(s); a.settlementId = s.id;
    }
  }
}
export function recordTip(db: DB, ctx: Ctx, assignmentId: string, tip: number) {
  needPerm(db, ctx, "caddie.manage");
  const a = req(db.caddieAssignments.find((x) => x.id === assignmentId), "Assignment not found.");
  if (!["assigned", "on_course"].includes(a.status)) fail("Tips can be recorded while the round is in progress.");
  if (tip < 0) fail("Tip cannot be negative.", "validation"); a.tip = r2(tip); audit(db, ctx, "caddie.tip", "caddie", a.caddieId, `Tip ${tip} recorded for ${a.id}`);
}
export function setSpecialFee(db: DB, ctx: Ctx, assignmentId: string, special: number, extra: number) {
  needPerm(db, ctx, "caddie.manage");
  const a = req(db.caddieAssignments.find((x) => x.id === assignmentId), "Assignment not found.");
  if (!["assigned", "on_course", "reserved"].includes(a.status)) fail("Fees can only be changed while the assignment is active.");
  if (special < 0 || extra < 0) fail("Amounts cannot be negative.", "validation");
  a.special = r2(special); a.extra = r2(extra); audit(db, ctx, "caddie.fee", "caddie", a.caddieId, `Special ${special}, additional approved ${extra}`);
}
export function releaseToQueue(db: DB, ctx: Ctx, caddieId: string) {
  needPerm(db, ctx, "caddie.manage");
  const c = req(db.caddies.find((x) => x.id === caddieId), "Caddie not found.");
  if (c.status !== "returned") fail(`${c.name} is not in 'returned' status.`);
  c.status = "available"; c.lastReleasedAt = db.meta.now;
  db.rotationEvents.push({ id: nextId(db, "rotation", "ROT-", 6), at: db.meta.now, caddieId, type: "release", by: ctx.actor });
}
export function settleCaddie(db: DB, ctx: Ctx, settlementId: string) {
  needPerm(db, ctx, "caddie.settle");
  const s = req(db.caddieSettlements.find((x) => x.id === settlementId), "Settlement not found.");
  if (s.status === "settled") fail("Already settled.");
  const chg = req(db.charges.find((x) => x.id === s.chargeId), "Charge missing.");
  if (chg.status === "voided") fail("The customer charge was voided; nothing to settle.");
  if (chg.paid < chargeNet(chg) - 0.005) fail("The customer has not fully paid this caddie charge yet. Settle only collected amounts.", "not_collected");
  s.status = "settled"; s.settledAt = db.meta.now; s.settledBy = ctx.actor;
  audit(db, ctx, "caddie.settle", "settlement", s.id, `Paid ₱${s.payable} to ${s.caddieId}`);
}
export function addCaddieIncident(db: DB, ctx: Ctx, caddieId: string, severity: "minor" | "major", text: string) {
  needPerm(db, ctx, "caddie.manage");
  const c = req(db.caddies.find((x) => x.id === caddieId), "Caddie not found."); requireText(text, "Incident description", 5);
  c.incidents.push({ id: nextId(db, "cincident", "CI-", 5), at: db.meta.now, severity, text: text.trim(), by: ctx.actor });
  audit(db, ctx, "caddie.incident", "caddie", caddieId, `${severity}: ${text}`);
}
