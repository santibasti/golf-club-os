import type { Booking, BookingPlayer, Channel, Closure, DB, DayType, Member, PaymentMethod, PlayerType, Tee, Waitlist } from "../types";
import { Ctx, audit, fail, needPerm, nextId, note, req, requireText, today, hasPerm } from "./core";
import { addDays, diffDays, fromMin, isWeekend, minsBetween, toMin, mkTs, fmt12 } from "../time";
import { applyDepositToCharge, createCharge, openShift, recordDeposit } from "./finance";
import { releaseBookingCaddies } from "./caddie";
import { releaseBookingCarts } from "./cart";
import { r2 } from "../format";

export const ACTIVE: Booking["status"][] = ["booked", "confirmed", "arrived", "ready", "started"];
export const PRE_ARRIVAL: Booking["status"][] = ["booked", "confirmed"];
export const isActive = (b: Booking) => ACTIVE.includes(b.status);
export const ROUND_MINUTES = (db: DB, holes: 9 | 18) => (holes === 18 ? db.settings.pace.minutes18 : db.settings.pace.minutes9);

export function dayType(db: DB, date: string): DayType {
  if (db.settings.teeSheet.holidays.some((h) => h.date === date)) return "holiday";
  return isWeekend(date) ? "weekend" : "weekday";
}
export function gridTimes(db: DB): string[] {
  const t = db.settings.teeSheet; const out: string[] = [];
  for (let m = toMin(t.firstTee); m <= toMin(t.lastTee); m += t.interval) out.push(fromMin(m));
  return out;
}

/* ----------------------------- closures ----------------------------- */
export function blockingClosure(db: DB, date: string, time: string, tee: Tee): Closure | undefined {
  const m = toMin(time);
  return db.closures.find((c) => c.active && c.date === date && c.type !== "partial" && m >= toMin(c.from) && m < toMin(c.to) && (c.type === "full" || c.tee === "all" || c.tee === tee));
}
export function restrictions(db: DB, date: string, time: string): Closure[] {
  const m = toMin(time);
  return db.closures.filter((c) => c.active && c.date === date && c.type === "partial" && m >= toMin(c.from) && m < toMin(c.to));
}
/** Active bookings that fall inside a closure window (blocking closures conflict; partial restrictions are advisory). */
export function closureImpact(db: DB, c: Closure): Booking[] {
  return db.bookings.filter((b) => b.date === c.date && ["booked", "confirmed", "arrived", "ready"].includes(b.status) && toMin(b.time) >= toMin(c.from) && toMin(b.time) < toMin(c.to) && (c.type !== "tee" || c.tee === "all" || c.tee === b.tee));
}
export function bookingConflicts(db: DB): { booking: Booking; closure: Closure }[] {
  const out: { booking: Booking; closure: Closure }[] = [];
  for (const c of db.closures.filter((x) => x.active && x.type !== "partial")) for (const b of closureImpact(db, c)) out.push({ booking: b, closure: c });
  return out;
}

export function createClosure(db: DB, ctx: Ctx, input: Omit<Closure, "id" | "active" | "createdBy" | "createdAt">) {
  needPerm(db, ctx, "course.closure");
  requireText(input.reason, "Reason", 3);
  if (toMin(input.to) <= toMin(input.from)) fail("End time must be after the start time.", "validation");
  if (input.type === "partial" && input.holes.length === 0) fail("Select at least one restricted hole for a partial restriction.", "validation");
  if (input.date < today(db)) fail("A restriction cannot be created for a past date.", "validation");
  const c: Closure = { ...input, id: nextId(db, "closure", "CLS-", 4), active: true, createdBy: ctx.actor, createdAt: db.meta.now };
  db.closures.push(c);
  const impact = closureImpact(db, c);
  audit(db, ctx, "closure.create", "closure", c.id, `${c.type} ${c.category} ${c.date} ${c.from}-${c.to}: ${c.reason}. ${impact.length} reservation(s) affected.`);
  return { closure: c, impact };
}
export function liftClosure(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "course.closure");
  const c = req(db.closures.find((x) => x.id === id), "Restriction not found.");
  if (!c.active) fail("This restriction is already lifted.");
  c.active = false; c.liftedAt = db.meta.now; c.liftedBy = ctx.actor;
  audit(db, ctx, "closure.lift", "closure", c.id, `Lifted ${c.reason}`);
}

/* ------------------------------ slots ------------------------------- */
export interface SlotInfo { key: string; time: string; tee: Tee; bookings: Booking[]; taken: number; remaining: number; blocked?: Closure; restricted: Closure[]; past: boolean; offGrid: boolean }
export function buildSlots(db: DB, date: string): SlotInfo[] {
  const ts = db.settings.teeSheet; const times = new Set(gridTimes(db));
  const day = db.bookings.filter((b) => b.date === date && isActive(b));
  const grid = [...times];
  for (const b of day) if (!times.has(b.time)) { times.add(b.time); grid.push(b.time); }
  grid.sort();
  const nowTs = db.meta.now;
  const out: SlotInfo[] = [];
  for (const time of grid) for (const tee of ts.startingTees) {
    const bs = day.filter((b) => b.time === time && b.tee === tee);
    const taken = bs.reduce((a, b) => a + b.players.length, 0);
    out.push({
      key: `${date}|${time}|${tee}`, time, tee, bookings: bs, taken, remaining: Math.max(0, ts.maxPlayers - taken),
      blocked: blockingClosure(db, date, time, tee), restricted: restrictions(db, date, time), past: mkTs(date, time) < nowTs, offGrid: !gridTimes(db).includes(time),
    });
  }
  return out;
}

/* ------------------------------- rates ------------------------------ */
export function memberEligibility(db: DB, m: Member, date: string): string | null {
  const c = db.customers.find((x) => x.id === m.customerId);
  if (m.status !== "active") return `${c?.name ?? m.id} (${m.id}) is ${m.status.replace("_", " ")} — member privileges unavailable.`;
  if (m.expiryDate && m.expiryDate < date) return `${c?.name ?? m.id} (${m.id}) membership expires ${m.expiryDate}, before the play date.`;
  return null;
}
export function priceFor(db: DB, date: string, holes: 9 | 18, p: { type: PlayerType; memberId?: string; sponsorId?: string }): { rate: number; label: string } {
  const rates = db.settings.rates; const nine = rates.ninePct / 100;
  if (p.type === "member" && p.memberId) {
    const m = req(db.members.find((x) => x.id === p.memberId), "Member not found."); const plan = req(db.plans.find((x) => x.id === m.planId), "Plan missing.");
    return { rate: holes === 18 ? plan.greenFee18 : plan.greenFee9, label: `${plan.name} member` };
  }
  if (p.type === "guest" && p.sponsorId) {
    const m = req(db.members.find((x) => x.id === p.sponsorId), "Sponsor not found."); const plan = req(db.plans.find((x) => x.id === m.planId), "Plan missing.");
    return { rate: r2(holes === 18 ? plan.guestRate18 : plan.guestRate18 * nine), label: `Guest of ${m.id}` };
  }
  const dt = dayType(db, date); const base = rates.green[dt].public;
  return { rate: r2(holes === 18 ? base : base * nine), label: `Public ${dt}` };
}

export interface PlayerInput { name: string; type: PlayerType; customerId?: string; memberId?: string; sponsorId?: string }
export interface BookingCheck { date: string; time: string; tee: Tee; holes: 9 | 18; players: PlayerInput[]; excludeId?: string; contactMemberId?: string; channel: Channel; override?: boolean }

export function guestAllowance(db: DB, memberId: string): number {
  const m = req(db.members.find((x) => x.id === memberId), "Member not found."); const plan = req(db.plans.find((x) => x.id === m.planId), "Plan missing.");
  return m.guestLimitOverride ?? plan.guestsPerRound;
}

/** Validates a prospective booking and returns priced players. Throws DomainError with the first blocking problem. */
export function validateBooking(db: DB, ctx: Ctx, c: BookingCheck): { players: BookingPlayer[]; total: number } {
  const ts = db.settings.teeSheet; const now = db.meta.now;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !/^\d{2}:\d{2}$/.test(c.time)) fail("Choose a valid date and tee time.", "validation");
  if (c.players.length < 1) fail("Add at least one golfer.", "validation");
  if (c.players.length > ts.maxPlayers) fail(`A flight can have at most ${ts.maxPlayers} golfers.`, "validation");
  if (!ts.startingTees.includes(c.tee)) fail(`Tee ${c.tee} is not an active starting tee.`);
  const canOverride = !!c.override && hasPerm(db, ctx, "booking.override");
  if (c.override && !canOverride) fail("Only staff with booking-override permission can bypass booking rules.", "forbidden");

  // time-based rules
  const dt = mkTs(c.date, c.time);
  if (!canOverride) {
    const mins = minsBetween(now, dt);
    const notice = c.channel === "walk_in" ? 0 : ts.minNoticeMinutes;
    if (mins < notice - (c.channel === "walk_in" ? 15 : 0)) fail(c.date < today(db) ? "That date has already passed." : `Tee time must be at least ${notice} minutes from now.`, "window");
    const contact = c.contactMemberId ? db.members.find((m) => m.id === c.contactMemberId) : undefined;
    const memberWindow = contact && !memberEligibility(db, contact, c.date) ? (db.plans.find((p) => p.id === contact.planId)?.advanceDays ?? ts.advanceDaysMember) : 0;
    const window = Math.max(ts.advanceDaysPublic, memberWindow);
    if (diffDays(c.date, today(db)) > window) fail(`Bookings open ${window} day(s) ahead for this ${memberWindow ? "member" : "public"} booker (latest ${addDays(today(db), window)}).`, "window");
  }
  if (c.date < today(db)) fail("That date has already passed.", "window");
  if (blockingClosure(db, c.date, c.time, c.tee)) { const k = blockingClosure(db, c.date, c.time, c.tee)!; fail(`Tee time unavailable: ${k.reason} (${k.category}).`, "closed"); }

  // capacity
  const existing = db.bookings.filter((b) => b.date === c.date && b.time === c.time && b.tee === c.tee && isActive(b) && b.id !== c.excludeId);
  const taken = existing.reduce((a, b) => a + b.players.length, 0);
  if (existing.length && !ts.allowSharedSlots) fail(`The ${fmt12(c.time)} slot is already reserved (${existing[0].ref}).`, "conflict");
  if (taken + c.players.length > ts.maxPlayers) fail(`Only ${Math.max(0, ts.maxPlayers - taken)} space(s) left in the ${fmt12(c.time)} flight.`, "conflict");

  // players
  const seen = new Set<string>(); const out: BookingPlayer[] = []; const guestCount: Record<string, number> = {};
  const roundLen = ROUND_MINUTES(db, c.holes);
  for (const p of c.players) {
    const name = p.name.trim(); if (!name) fail("Every golfer needs a name.", "validation");
    const idKey = p.memberId ?? p.customerId; if (idKey) { if (seen.has(idKey)) fail(`${name} is listed twice in this booking.`, "conflict"); seen.add(idKey); }
    if (p.type === "member") {
      const m = req(db.members.find((x) => x.id === p.memberId), `Select a valid member for ${name}.`);
      const bad = memberEligibility(db, m, c.date); if (bad) fail(bad, "eligibility");
    }
    if (p.type === "guest") {
      const sp = req(db.members.find((x) => x.id === p.sponsorId), `Guest ${name} needs a sponsoring member.`);
      const bad = memberEligibility(db, sp, c.date); if (bad) fail(`Sponsor not eligible: ${bad}`, "eligibility");
      if (!c.players.some((q) => q.type === "member" && q.memberId === sp.id)) fail(`Sponsor ${sp.id} must be playing in the same flight as guest ${name}.`, "eligibility");
      guestCount[sp.id] = (guestCount[sp.id] ?? 0) + 1;
      const allow = guestAllowance(db, sp.id);
      if (guestCount[sp.id] > allow) fail(`${db.customers.find((x) => x.id === sp.customerId)?.name} (${sp.id}) may sponsor at most ${allow} guest(s) per round.`, "guest_limit");
    }
    // cross-booking double-booking of the same person
    if (idKey) {
      const clash = db.bookings.find((b) => b.id !== c.excludeId && b.date === c.date && isActive(b) && b.players.some((q) => (q.memberId ?? q.customerId) === idKey) && Math.abs(toMin(b.time) - toMin(c.time)) < roundLen);
      if (clash) fail(`${name} is already in booking ${clash.ref} at ${fmt12(clash.time)} on the same day.`, "conflict");
    }
    const pr = priceFor(db, c.date, c.holes, p);
    out.push({ id: nextId(db, "bplayer", "BP-", 6), name, type: p.type, customerId: p.customerId, memberId: p.memberId, sponsorId: p.sponsorId, rate: pr.rate, rateLabel: pr.label, checkedIn: false });
  }
  return { players: out, total: r2(out.reduce((a, p) => a + p.rate, 0)) };
}

const noShowCount = (db: DB, customerId?: string) => (customerId ? db.bookings.filter((b) => b.status === "no_show" && b.contactCustomerId === customerId).length : 0);

export interface NewBooking {
  date: string; time: string; tee?: Tee; holes: 9 | 18; channel: Channel; players: PlayerInput[]; contactName: string; contactPhone: string;
  contactCustomerId?: string; contactMemberId?: string; notes?: string; depositAmount?: number; depositMethod?: PaymentMethod; noCaddie?: boolean;
  preferredCaddieId?: string; override?: boolean; eventId?: string; waitlistId?: string; selfService?: boolean;
}
export function sendConfirmation(db: DB, b: Booking, text: string) {
  db.messages.push({ id: nextId(db, "message", "MSG-", 5), at: db.meta.now, channel: "sms", to: b.contactPhone || "(no number)", text, bookingId: b.id, simulated: true });
}
export function createBooking(db: DB, ctx: Ctx, input: NewBooking): Booking {
  if (!input.selfService) needPerm(db, ctx, "booking.create");
  requireText(input.contactName, "Contact name");
  if (!input.contactPhone.trim() && input.channel !== "walk_in") fail("Contact phone is required.", "validation");
  const tee = input.tee ?? "1";
  const strikes = noShowCount(db, input.contactCustomerId);
  if (strikes >= db.settings.teeSheet.noShowStrikeLimit && !(input.depositAmount && input.depositAmount > 0) && !input.override) fail(`${input.contactName} has ${strikes} recorded no-shows. A deposit is required for further bookings.`, "no_show_policy");
  const v = validateBooking(db, ctx, { ...input, tee, contactMemberId: input.contactMemberId });
  const id = nextId(db, "booking", "BK-", 5);
  const ref = nextId(db, "bookingRef", "RSV-", 5);
  const pendingConfirm = input.channel === "online" && !input.contactMemberId;
  const b: Booking = {
    id, ref, date: input.date, time: input.time, tee, holes: input.holes, channel: input.channel, status: pendingConfirm ? "booked" : "confirmed", players: v.players,
    contactName: input.contactName.trim(), contactPhone: input.contactPhone.trim(), contactCustomerId: input.contactCustomerId, contactMemberId: input.contactMemberId, notes: input.notes ?? "",
    noCaddie: input.noCaddie, preferredCaddieId: input.preferredCaddieId, eventId: input.eventId, createdAt: db.meta.now, createdBy: ctx.actor, history: [], greenFeeTotal: v.total,
    confirmedAt: pendingConfirm ? undefined : db.meta.now,
  };
  note(b.history, db, ctx, `Reservation created via ${input.channel} by ${ctx.actor} (${v.players.length} golfer(s), ${input.holes} holes, est. green fees ₱${v.total.toLocaleString()})`);
  db.bookings.push(b);
  if (input.depositAmount && input.depositAmount > 0) {
    const p = recordDeposit(db, ctx, { amount: input.depositAmount, method: input.depositMethod ?? "cash", name: b.contactName, bookingId: b.id, customerId: b.contactCustomerId, memberId: b.contactMemberId });
    b.deposit = { amount: p.amount, method: p.method, paymentId: p.id, status: "held" };
    note(b.history, db, ctx, `Deposit ₱${p.amount.toLocaleString()} received (${p.no})`);
  }
  // sponsored guest history
  for (const p of b.players.filter((x) => x.type === "guest" && x.sponsorId)) db.sponsorships.push({ id: nextId(db, "sponsor", "SP-", 5), memberId: p.sponsorId!, guestName: p.name, guestCustomerId: p.customerId, bookingId: b.id, date: b.date, fee: p.rate });
  if (input.waitlistId) { const w = db.waitlist.find((x) => x.id === input.waitlistId); if (w) { w.status = "booked"; w.bookingId = b.id; } }
  sendConfirmation(db, b, `[SIMULATED SMS] ${db.settings.club.shortName}: ${b.ref} ${pendingConfirm ? "received (pending confirmation)" : "confirmed"} for ${b.date} ${fmt12(b.time)}, ${b.players.length} golfer(s).`);
  audit(db, ctx, "booking.create", "booking", b.id, `${b.ref} ${b.date} ${b.time} ${b.players.length}p ${b.channel}`);
  return b;
}

export function confirmBooking(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "booking.edit");
  const b = req(db.bookings.find((x) => x.id === id), "Booking not found.");
  if (b.status !== "booked") fail("Only bookings awaiting confirmation can be confirmed.");
  b.status = "confirmed"; b.confirmedAt = db.meta.now; note(b.history, db, ctx, "Reservation confirmed by staff");
  sendConfirmation(db, b, `[SIMULATED SMS] ${db.settings.club.shortName}: ${b.ref} is now confirmed for ${b.date} ${fmt12(b.time)}.`);
  audit(db, ctx, "booking.confirm", "booking", b.id, b.ref);
}

export function editBooking(db: DB, ctx: Ctx, id: string, patch: { players?: PlayerInput[]; holes?: 9 | 18; notes?: string; contactName?: string; contactPhone?: string; noCaddie?: boolean }) {
  needPerm(db, ctx, "booking.edit");
  const b = req(db.bookings.find((x) => x.id === id), "Booking not found.");
  if (!PRE_ARRIVAL.includes(b.status)) fail("Only bookings that have not arrived can be edited here. Use Check-in to change the flight list after arrival.");
  const holes = patch.holes ?? b.holes;
  const players = patch.players ?? b.players.map((p) => ({ name: p.name, type: p.type, customerId: p.customerId, memberId: p.memberId, sponsorId: p.sponsorId }));
  const v = validateBooking(db, ctx, { date: b.date, time: b.time, tee: b.tee, holes, players, excludeId: b.id, contactMemberId: b.contactMemberId, channel: "staff", override: false });
  b.players = v.players; b.greenFeeTotal = v.total; b.holes = holes;
  if (patch.notes !== undefined) b.notes = patch.notes; if (patch.contactName) b.contactName = patch.contactName; if (patch.contactPhone !== undefined) b.contactPhone = patch.contactPhone;
  if (patch.noCaddie !== undefined) b.noCaddie = patch.noCaddie;
  db.sponsorships = db.sponsorships.filter((s) => s.bookingId !== b.id);
  for (const p of b.players.filter((x) => x.type === "guest" && x.sponsorId)) db.sponsorships.push({ id: nextId(db, "sponsor", "SP-", 5), memberId: p.sponsorId!, guestName: p.name, guestCustomerId: p.customerId, bookingId: b.id, date: b.date, fee: p.rate });
  note(b.history, db, ctx, `Edited: ${b.players.length} golfer(s), ${b.holes} holes, est. fees ₱${b.greenFeeTotal.toLocaleString()}`);
  audit(db, ctx, "booking.edit", "booking", b.id, `${b.ref} updated`);
}

export function rescheduleBooking(db: DB, ctx: Ctx, id: string, to: { date: string; time: string; tee?: Tee; override?: boolean }) {
  needPerm(db, ctx, "booking.edit");
  const b = req(db.bookings.find((x) => x.id === id), "Booking not found.");
  if (!PRE_ARRIVAL.includes(b.status)) fail("Only bookings that have not arrived can be rescheduled.");
  const tee = to.tee ?? b.tee;
  const players = b.players.map((p) => ({ name: p.name, type: p.type, customerId: p.customerId, memberId: p.memberId, sponsorId: p.sponsorId }));
  const v = validateBooking(db, ctx, { date: to.date, time: to.time, tee, holes: b.holes, players, excludeId: b.id, contactMemberId: b.contactMemberId, channel: "staff", override: to.override });
  const from = `${b.date} ${b.time}`;
  b.rescheduledFrom = from; b.date = to.date; b.time = to.time; b.tee = tee; b.players = v.players; b.greenFeeTotal = v.total;
  for (const s of db.sponsorships.filter((s) => s.bookingId === b.id)) s.date = b.date;
  note(b.history, db, ctx, `Rescheduled from ${from} to ${b.date} ${b.time}`);
  sendConfirmation(db, b, `[SIMULATED SMS] ${db.settings.club.shortName}: ${b.ref} moved to ${b.date} ${fmt12(b.time)}.`);
  audit(db, ctx, "booking.reschedule", "booking", b.id, `${b.ref} ${from} → ${b.date} ${b.time}`);
}

export function isLateCancel(db: DB, b: Booking) {
  return minsBetween(db.meta.now, mkTs(b.date, b.time)) < db.settings.teeSheet.cancelHours * 60;
}
export function cancelBooking(db: DB, ctx: Ctx, id: string, reason: string, opts: { selfService?: boolean; ownerMemberId?: string; ownerCustomerId?: string } = {}) {
  if (!opts.selfService) needPerm(db, ctx, "booking.edit");
  const b = req(db.bookings.find((x) => x.id === id), "Booking not found.");
  if (opts.selfService && !((opts.ownerMemberId && b.contactMemberId === opts.ownerMemberId) || (opts.ownerCustomerId && b.contactCustomerId === opts.ownerCustomerId))) fail("You can only cancel your own bookings.", "forbidden");
  if (!["booked", "confirmed", "arrived", "ready"].includes(b.status)) fail(`A ${b.status.replace("_", " ")} booking cannot be cancelled.`);
  if (opts.selfService && !PRE_ARRIVAL.includes(b.status)) fail("Checked-in bookings can only be cancelled by staff.", "forbidden");
  requireText(reason, "Cancellation reason", 3);
  const late = isLateCancel(db, b);
  if (opts.selfService && late) fail(`Online cancellation closes ${db.settings.teeSheet.cancelHours} hours before tee-off. Please call the Reservations desk.`, "policy");
  releaseBookingCaddies(db, ctx, b.id, "Booking cancelled"); releaseBookingCarts(db, ctx, b.id);
  // void any un-paid charges already raised at arrival
  for (const c of db.charges.filter((c) => c.bookingId === b.id && c.paid === 0 && c.status === "unpaid" && c.refType !== "cancel_fee")) { c.status = "voided"; c.reason = "Booking cancelled"; note(c.history, db, ctx, "Voided: booking cancelled"); }
  b.status = "cancelled"; b.cancelledAt = db.meta.now; b.cancelReason = reason.trim(); b.lateCancel = late;
  db.sponsorships = db.sponsorships.filter((s) => s.bookingId !== b.id);
  const rd = db.rounds.find((r) => r.bookingId === b.id); if (rd && !rd.startedAt) db.rounds = db.rounds.filter((r) => r !== rd);
  settleDepositOnRelease(db, ctx, b, late && db.settings.teeSheet.forfeitDepositOnLateCancel, late ? "Late cancellation" : "Cancelled within policy");
  note(b.history, db, ctx, `Cancelled${late ? " (late — inside cancellation window)" : ""}: ${reason.trim()}. Slot capacity released.`);
  audit(db, ctx, "booking.cancel", "booking", b.id, `${b.ref} cancelled${late ? " (late)" : ""}: ${reason.trim()}`);
}

function settleDepositOnRelease(db: DB, ctx: Ctx, b: Booking, forfeit: boolean, why: string) {
  if (!b.deposit || b.deposit.status !== "held") return;
  const dep = db.payments.find((p) => p.id === b.deposit!.paymentId)!;
  if (forfeit) {
    const c = createCharge(db, ctx, { dept: "other", description: `${why} fee — deposit forfeited (${b.ref})`, amount: dep.amount, name: b.contactName, customerId: b.contactCustomerId, memberId: b.contactMemberId, bookingId: b.id, refType: "cancel_fee", billTo: "counter" });
    applyDepositToCharge(db, ctx, dep.id, c.id); b.deposit.status = "forfeited"; note(b.history, db, ctx, `Deposit ₱${dep.amount.toLocaleString()} forfeited per cancellation policy`);
  } else {
    if (!openShift(db)) fail("No open cashier shift — open one to refund the booking deposit.", "no_shift");
    db.refunds.push({ id: nextId(db, "refund", "RFD-", 5), date: today(db), at: db.meta.now, paymentId: dep.id, amount: dep.amount, method: dep.method, reason: `Deposit returned: ${why} (${b.ref})`, approvedBy: ctx.actor, shiftId: openShift(db)!.id });
    dep.kind = "deposit"; b.deposit.status = "refunded"; note(b.history, db, ctx, `Deposit ₱${dep.amount.toLocaleString()} refunded`);
  }
}

export function markNoShow(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "checkin.manage");
  const b = req(db.bookings.find((x) => x.id === id), "Booking not found.");
  if (!["booked", "confirmed", "arrived", "ready"].includes(b.status)) fail("Only bookings that have not started can be marked as no-show.");
  releaseBookingCaddies(db, ctx, b.id, "No-show"); releaseBookingCarts(db, ctx, b.id);
  for (const c of db.charges.filter((c) => c.bookingId === b.id && c.paid === 0 && c.status === "unpaid")) { c.status = "voided"; c.reason = "No-show"; note(c.history, db, ctx, "Voided: no-show"); }
  const rd = db.rounds.find((r) => r.bookingId === b.id); if (rd) db.rounds = db.rounds.filter((r) => r !== rd);
  b.status = "no_show"; b.noShowAt = db.meta.now;
  db.sponsorships = db.sponsorships.filter((s) => s.bookingId !== b.id);
  settleDepositOnRelease(db, ctx, b, true, "No-show");
  note(b.history, db, ctx, "Marked as no-show; slot released");
  audit(db, ctx, "booking.noshow", "booking", b.id, `${b.ref} no-show`);
}

/* ----------------------------- waitlist ----------------------------- */
export function addWaitlist(db: DB, ctx: Ctx, w: Omit<Waitlist, "id" | "status" | "createdAt">) {
  needPerm(db, ctx, "booking.create");
  requireText(w.name, "Name"); if (!w.phone.trim()) fail("Phone is required.", "validation");
  if (w.players < 1 || w.players > db.settings.teeSheet.maxPlayers) fail(`Players must be between 1 and ${db.settings.teeSheet.maxPlayers}.`, "validation");
  if (toMin(w.to) < toMin(w.from)) fail("'Latest time' must be after 'Earliest time'.", "validation");
  const e: Waitlist = { ...w, id: nextId(db, "waitlist", "WL-", 4), status: "waiting", createdAt: db.meta.now };
  db.waitlist.push(e); audit(db, ctx, "waitlist.add", "waitlist", e.id, `${e.name} ${e.date} ${e.from}-${e.to} ${e.players}p`); return e;
}
export function removeWaitlist(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "booking.create");
  const w = req(db.waitlist.find((x) => x.id === id), "Waitlist entry not found."); w.status = "cancelled"; audit(db, ctx, "waitlist.cancel", "waitlist", id, w.name);
}
export function waitlistMatches(db: DB, w: Waitlist): SlotInfo[] {
  if (w.status !== "waiting") return [];
  return buildSlots(db, w.date).filter((s) => !s.blocked && !s.past && toMin(s.time) >= toMin(w.from) && toMin(s.time) <= toMin(w.to) && (db.settings.teeSheet.allowSharedSlots ? s.remaining >= w.players : s.bookings.length === 0));
}

/* ------------------------ estimates / helpers ------------------------ */
export function estimateAncillary(db: DB, players: number, holes: 9 | 18) {
  const r = db.settings.rates;
  const carts = Math.ceil(players / r.playersPerCart); const caddies = r.caddieRequired ? Math.ceil(players / r.playersPerCaddie) : 0;
  return { carts, cartFee: carts * (holes === 18 ? r.cart18 : r.cart9), caddies, caddieFee: caddies * (holes === 18 ? r.caddie.B.f18 : r.caddie.B.f9) };
}
export const bookingLabel = (b: Booking) => `${b.ref} · ${b.contactName}`;
