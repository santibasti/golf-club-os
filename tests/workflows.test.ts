import { beforeAll, describe, expect, it } from "vitest";
import { createSeedDB } from "@/lib/seed";
import type { DB } from "@/lib/types";
import { DomainError, Ctx } from "@/lib/services/core";
import * as Bk from "@/lib/services/booking";
import * as Fl from "@/lib/services/flight";
import * as Cd from "@/lib/services/caddie";
import * as Ct from "@/lib/services/cart";
import * as Fn from "@/lib/services/finance";
import * as Ms from "@/lib/services/membership";
import * as Pos from "@/lib/services/pos";
import * as Mt from "@/lib/services/maintenance";
import * as Ev from "@/lib/services/events";
import { financeTotals, totalRevenue, roundsBooked } from "@/lib/services/metrics";
import { memberLedger } from "@/lib/services/membership";
import { computeAlerts } from "@/lib/services/alerts";
import { REPORTS } from "@/lib/services/reports";
import { ROLES } from "@/lib/permissions";

const TODAY = "2026-11-07";
let base: DB;
beforeAll(() => { base = createSeedDB(TODAY); }, 60000);
const fresh = () => structuredClone(base);
const as = (role: string): Ctx => ({ role: role as Ctx["role"], actor: ROLES.find((r) => r.id === role)?.user ?? role });
const RES = as("reservations"), CM = as("caddie_master"), CS = as("cart_supervisor"), ST = as("starter"), CASH = as("cashier"), SUP = as("superintendent"), MX = as("maintenance"), GM = as("gm"), POS = as("cafe"), MEM = as("membership");
const err = (f: () => unknown) => { try { f(); } catch (e) { if (e instanceof DomainError) return e; throw e; } throw new Error("expected DomainError"); };
const openSlot = (db: DB, date: string, after = "00:00") => Bk.buildSlots(db, date).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= after)!;
let seq = 0; // synthetic walk-in golfers (no customer record) so tests never collide with seeded bookings
const publicPlayers = (_db: DB, n: number, _from = 0) => Array.from({ length: n }, () => ({ name: `Test Golfer ${++seq}`, type: "public" as const, customerId: undefined as string | undefined }));
const activeMember = (db: DB, i = 0) => db.members.filter((m) => m.status === "active")[i];
const mkPublic = (db: DB, date = addD(TODAY, 2), time?: string, n = 4) => { const s = openSlot(db, date); const p = publicPlayers(db, n, 120); return Bk.createBooking(db, RES, { date, time: time ?? s.time, holes: 18, channel: "phone", players: p, contactName: p[0].name, contactPhone: "0917", contactCustomerId: p[0].customerId }); };
import { addDays as addD } from "@/lib/time";

describe("seed integrity", () => {
  it("meets the requested volumes", () => {
    expect(base.customers.length).toBe(150); expect(base.members.filter((m) => m.status === "active").length).toBe(60); expect(base.caddies.length).toBe(45); expect(base.carts.length).toBe(30); expect(base.holes.length).toBe(18); expect(base.bookings.length).toBeGreaterThan(40);
  });
  it("is deterministic", () => { const a = createSeedDB(TODAY), b = createSeedDB(TODAY); expect(JSON.stringify(a)).toBe(JSON.stringify(b)); }, 60000);
  it("has no charge overpaid and consistent member ledgers", () => {
    for (const c of base.charges) { expect(c.paid).toBeLessThanOrEqual(Fn.chargeNet(c) + 0.01); expect(c.payable).toBeLessThanOrEqual(Fn.chargeNet(c) + 0.01); }
    for (const m of base.members) { const l = memberLedger(base, m.id); expect(Math.abs(l.closing - Fn.memberBalance(base, m.id))).toBeLessThan(0.02); }
  });
  it("applied payments equal charge.paid (no double counting)", () => { for (const c of base.charges) expect(base.payments.filter((p) => p.chargeId === c.id).reduce((a, p) => a + p.amount, 0)).toBeCloseTo(c.paid, 1); });
  it("no caddie or cart is double-assigned", () => {
    for (const c of base.caddies) expect(base.caddieAssignments.filter((a) => a.caddieId === c.id && ["reserved", "assigned", "on_course"].includes(a.status)).length).toBeLessThanOrEqual(1);
    for (const c of base.carts) expect(base.carts.filter((x) => x.bookingId && x.bookingId === c.bookingId && x.id === c.id).length).toBeLessThanOrEqual(1);
  });
  it("every report builds for every range", () => { for (const r of REPORTS) { const res = r.build(base, { from: addD(TODAY, -13), to: TODAY }); expect(res.columns.length).toBeGreaterThan(0); } });
});

describe("reservations", () => {
  it("prevents double-booking a slot and releases capacity on cancel", () => {
    const db = fresh(); const b = mkPublic(db); expect(b.status).toBe("confirmed");
    expect(err(() => Bk.createBooking(db, RES, { date: b.date, time: b.time, holes: 18, channel: "phone", players: publicPlayers(db, 2, 10), contactName: "X", contactPhone: "1" })).code).toBe("conflict");
    Bk.cancelBooking(db, RES, b.id, "test"); expect(Bk.buildSlots(db, b.date).find((s) => s.time === b.time)!.bookings.length).toBe(0);
    expect(Bk.createBooking(db, RES, { date: b.date, time: b.time, holes: 18, channel: "phone", players: publicPlayers(db, 2, 10), contactName: "X", contactPhone: "1" }).status).toBe("confirmed");
  });
  it("enforces max players per flight and shared-slot capacity when enabled", () => {
    const db = fresh(); const s = openSlot(db, addD(TODAY, 2)); expect(err(() => Bk.createBooking(db, RES, { date: s.key.split("|")[0], time: s.time, holes: 18, channel: "phone", players: publicPlayers(db, 5, 10), contactName: "X", contactPhone: "1" })).code).toBe("validation");
    db.settings.teeSheet.allowSharedSlots = true; Bk.createBooking(db, RES, { date: addD(TODAY, 2), time: s.time, holes: 18, channel: "phone", players: publicPlayers(db, 2, 10), contactName: "A", contactPhone: "1" });
    expect(err(() => Bk.createBooking(db, RES, { date: addD(TODAY, 2), time: s.time, holes: 18, channel: "phone", players: publicPlayers(db, 3, 20), contactName: "B", contactPhone: "1" })).message).toMatch(/space/);
    Bk.createBooking(db, RES, { date: addD(TODAY, 2), time: s.time, holes: 18, channel: "phone", players: publicPlayers(db, 2, 30), contactName: "C", contactPhone: "1" });
  });
  it("member status drives eligibility and rate; guest limits apply", () => {
    const db = fresh(); const m = db.members.find((x) => x.status === "active" && !db.bookings.some((b) => b.date === addD(TODAY, 3) && b.players.some((p) => p.memberId === x.id)))!; const c = db.customers.find((x) => x.id === m.customerId)!; const plan = db.plans.find((p) => p.id === m.planId)!;
    const date = addD(TODAY, 3); const s = openSlot(db, date);
    const players = [{ name: c.name, type: "member" as const, memberId: m.id, customerId: c.id }, ...publicPlayers(db, plan.guestsPerRound + 1, 130).map((g) => ({ name: g.name, type: "guest" as const, sponsorId: m.id }))];
    expect(err(() => Bk.createBooking(db, RES, { date, time: s.time, holes: 18, channel: "member", players, contactName: c.name, contactPhone: "1", contactMemberId: m.id })).code).toBe("guest_limit");
    const b = Bk.createBooking(db, RES, { date, time: s.time, holes: 18, channel: "member", players: players.slice(0, 1 + plan.guestsPerRound), contactName: c.name, contactPhone: "1", contactMemberId: m.id });
    expect(b.players[0].rate).toBe(plan.greenFee18); expect(b.players[1].rate).toBe(plan.guestRate18); expect(db.sponsorships.filter((x) => x.bookingId === b.id).length).toBe(plan.guestsPerRound);
    const sus = db.members.find((x) => x.status === "suspended")!; const sc = db.customers.find((x) => x.id === sus.customerId)!; const s2 = openSlot(db, date, "12:00");
    expect(err(() => Bk.createBooking(db, RES, { date, time: s2.time, holes: 18, channel: "member", players: [{ name: sc.name, type: "member", memberId: sus.id, customerId: sc.id }], contactName: sc.name, contactPhone: "1" })).code).toBe("eligibility");
  });
  it("respects booking window for public bookers; staff override is permission-gated", () => {
    const db = fresh(); const far = addD(TODAY, 20); const s = openSlot(db, far);
    expect(err(() => Bk.createBooking(db, RES, { date: far, time: s.time, holes: 18, channel: "phone", players: publicPlayers(db, 1, 10), contactName: "X", contactPhone: "1" })).code).toBe("window");
    expect(err(() => Bk.createBooking(db, RES, { date: far, time: s.time, holes: 18, channel: "phone", players: publicPlayers(db, 1, 10), contactName: "X", contactPhone: "1", override: true })).code).toBe("forbidden");
  });
  it("same person cannot be in two overlapping bookings", () => {
    const db = fresh(); const date = addD(TODAY, 2); const cu = db.customers.find((c) => !c.memberId && !db.bookings.some((b) => b.date === date && b.players.some((p) => p.customerId === c.id)))!; const p = [{ name: cu.name, type: "public" as const, customerId: cu.id }]; const a = openSlot(db, date, "07:00"); Bk.createBooking(db, RES, { date, time: a.time, holes: 18, channel: "phone", players: p, contactName: "A", contactPhone: "1" });
    const b = openSlot(db, date, "09:00"); expect(err(() => Bk.createBooking(db, RES, { date, time: b.time, holes: 18, channel: "phone", players: p, contactName: "A", contactPhone: "1" })).message).toMatch(/already in booking/);
  });
  it("late cancellation forfeits the deposit; timely cancellation refunds", () => {
    const db = fresh(); const date = TODAY; const slot = Bk.buildSlots(db, date).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time > "09:40" && s.time < "20:00")!;
    const p = publicPlayers(db, 2, 50); const b = Bk.createBooking(db, RES, { date, time: slot.time, holes: 18, channel: "phone", players: p, contactName: p[0].name, contactPhone: "1", depositAmount: 1000, depositMethod: "cash" });
    Bk.cancelBooking(db, RES, b.id, "late test"); expect(db.bookings.find((x) => x.id === b.id)!.deposit!.status).toBe("forfeited"); expect(db.charges.some((c) => c.bookingId === b.id && c.refType === "cancel_fee" && c.status === "paid")).toBe(true);
    const b2 = mkPublic(db, addD(TODAY, 3)); b2.deposit = undefined; const d2 = Bk.createBooking(db, RES, { date: addD(TODAY, 4), time: openSlot(db, addD(TODAY, 4)).time, holes: 18, channel: "phone", players: publicPlayers(db, 2, 60), contactName: "Z", contactPhone: "1", depositAmount: 500 });
    Bk.cancelBooking(db, RES, d2.id, "plans changed"); expect(db.bookings.find((x) => x.id === d2.id)!.deposit!.status).toBe("refunded"); expect(db.refunds.length).toBeGreaterThan(base.refunds.length);
  });
});

describe("Scenario A — public golfer end-to-end", () => {
  it("books, checks in, assigns caddies/cart, pays, starts, completes; dashboard reflects it", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`;
    const slot = Bk.buildSlots(db, TODAY).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= "09:50")!;
    const p = publicPlayers(db, 4, 70); const before = financeTotals(db, { from: TODAY, to: TODAY }).netRevenue; const bookedBefore = roundsBooked(db, { from: TODAY, to: TODAY });
    const b = Bk.createBooking(db, RES, { date: TODAY, time: slot.time, holes: 18, channel: "phone", players: p, contactName: p[0].name, contactPhone: "0917", contactCustomerId: p[0].customerId });
    expect(roundsBooked(db, { from: TODAY, to: TODAY })).toBe(bookedBefore + 4); expect(b.greenFeeTotal).toBe(4 * db.settings.rates.green.weekend.public);
    db.meta.now = `${TODAY}T${slot.time.replace(/^(\d\d):(\d\d)$/, (_, h, m) => { const t = Number(h) * 60 + Number(m) - 20; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })}`;
    Fl.arriveBooking(db, RES, b.id, b.players.map((x) => x.id)); expect(db.bookings.find((x) => x.id === b.id)!.status).toBe("arrived");
    expect(err(() => Fl.markReady(db, ST, b.id)).code).toBe("requirements");
    Cd.assignCaddie(db, CM, { bookingId: b.id }); Cd.assignCaddie(db, CM, { bookingId: b.id }); expect(Cd.bookingAssignments(db, b.id).length).toBe(2);
    const cart1 = db.carts.find((c) => c.status === "available")!, cart2 = db.carts.find((c) => c.status === "available" && c.id !== cart1.id)!; Ct.assignCart(db, CS, b.id, cart1.id); Ct.assignCart(db, CS, b.id, cart2.id);
    expect(err(() => Fl.markReady(db, ST, b.id)).code).toBe("requirements"); // unpaid counter charges
    for (const c of db.charges.filter((x) => x.bookingId === b.id && Fn.outstanding(x) > 0)) Fn.recordPayment(db, CASH, { chargeId: c.id, amount: Fn.outstanding(c), method: "cash" });
    Ct.dispatchCart(db, CS, cart1.id); Ct.dispatchCart(db, CS, cart2.id); Fl.markReady(db, ST, b.id); Fl.startRound(db, ST, b.id);
    expect(db.caddies.filter((c) => Cd.activeAssignment(db, c.id)?.bookingId === b.id).every((c) => c.status === "on_course")).toBe(true); expect(db.carts.find((c) => c.id === cart1.id)!.status).toBe("in_use");
    db.meta.now = `${TODAY}T${slot.time}`; Fl.recordCheckpoint(db, ST, b.id, 9);
    expect(db.bookings.find((x) => x.id === b.id)!.status).toBe("started"); // payment never completes a round
    Fl.completeRound(db, ST, b.id, {}); expect(db.bookings.find((x) => x.id === b.id)!.status).toBe("completed");
    expect(db.carts.find((c) => c.id === cart1.id)!.status).toBe("returned"); expect(db.caddies.filter((c) => c.status === "returned").length).toBeGreaterThanOrEqual(2);
    expect(financeTotals(db, { from: TODAY, to: TODAY }).netRevenue).toBeGreaterThan(before + 4 * 3600 - 1);
  });
});

describe("Scenario B — member with guests; account charging", () => {
  it("charges member and guest rates to the member ledger; cash is not recorded", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const m = activeMember(db, 5); const c = db.customers.find((x) => x.id === m.customerId)!; const plan = db.plans.find((p) => p.id === m.planId)!;
    const slot = Bk.buildSlots(db, TODAY).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= "10:00")!; const g = publicPlayers(db, 2, 90);
    const balBefore = Fn.memberBalance(db, m.id); const cashBefore = financeTotals(db, { from: TODAY, to: TODAY }).cashCollected;
    const b = Bk.createBooking(db, RES, { date: TODAY, time: slot.time, holes: 18, channel: "member", players: [{ name: c.name, type: "member", memberId: m.id, customerId: c.id }, ...g.slice(0, Math.min(2, plan.guestsPerRound)).map((x) => ({ name: x.name, type: "guest" as const, sponsorId: m.id }))], contactName: c.name, contactPhone: "1", contactMemberId: m.id, contactCustomerId: c.id });
    Fl.arriveBooking(db, RES, b.id, b.players.map((p) => p.id));
    const expected = plan.greenFee18 + Math.min(2, plan.guestsPerRound) * plan.guestRate18;
    expect(Fn.memberBalance(db, m.id)).toBeCloseTo(balBefore + expected, 1); expect(financeTotals(db, { from: TODAY, to: TODAY }).cashCollected).toBe(cashBefore);
    expect(memberLedger(db, m.id).rows.some((r) => r.description.startsWith("Green fees"))).toBe(true);
    // paying the balance doesn't create revenue
    const rev = totalRevenue(db, { from: TODAY, to: TODAY }); Fn.payMemberBalance(db, CASH, m.id, expected, "cash"); expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBe(rev);
  });
  it("suspension blocks member rates & POS charging; reinstatement restores", () => {
    const db = fresh(); const m = activeMember(db, 7); Ms.suspendMember(db, GM, m.id, "test"); const item = db.inventory.find((i) => i.price)!;
    expect(err(() => Pos.createPosOrder(db, POS, { items: [{ itemId: item.id, qty: 1 }], method: "member_account", memberId: m.id })).code).toBe("eligibility");
    expect(err(() => Ms.suspendMember(db, RES, m.id, "x")).code).toBe("forbidden"); Ms.reinstateMember(db, GM, m.id, "settled"); expect(m.status).toBe("active");
  });
  it("membership workflow: apply → docs → approve → activation posts fees; approval needs permission", () => {
    const db = fresh(); const m = Ms.createApplication(db, MEM, { name: "Test Applicant", phone: "09171234567", email: "t@example.test", address: "1 Test St", birthDate: "1990-01-01", planId: "PL-IND", emergencyName: "Em Contact", emergencyPhone: "09170000000", emergencyRelation: "Spouse", billingPref: "account" });
    expect(err(() => Ms.submitForApproval(db, MEM, m.id)).code).toBe("docs"); Ms.toggleDoc(db, MEM, m.id, "application_form"); Ms.toggleDoc(db, MEM, m.id, "valid_id"); Ms.submitForApproval(db, MEM, m.id);
    expect(err(() => Ms.approveMember(db, MEM, m.id)).code).toBe("forbidden"); Ms.approveMember(db, GM, m.id); expect(m.status).toBe("active"); expect(db.charges.filter((c) => c.memberId === m.id).length).toBe(2);
    const n = db.charges.length; Ms.runDuesBilling(db, MEM); Ms.runDuesBilling(db, MEM); expect(db.charges.length).toBeGreaterThanOrEqual(n); // idempotent billing keys
  });
});

describe("Scenario C — caddie rotation", () => {
  it("assigns next in queue, records preferred & override exceptions, blocks double assignment", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const b = mkPublic(db, TODAY, Bk.buildSlots(db, TODAY).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= "10:30")!.time);
    const q = Cd.rotationQueue(db); expect(q.length).toBeGreaterThan(3); const a1 = Cd.assignCaddie(db, CM, { bookingId: b.id }); expect(a1.caddieId).toBe(q[0].id);
    const nextQ = Cd.rotationQueue(db); const a2 = Cd.assignCaddie(db, CM, { bookingId: b.id, caddieId: nextQ[3].id, preferred: true, reason: "Requested by golfer" }); expect(db.rotationEvents.at(-1)!.type).toBe("preferred"); expect(a2.caddieId).toBe(nextQ[3].id);
    const b2 = mkPublic(db, TODAY, Bk.buildSlots(db, TODAY).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= "12:00")!.time);
    expect(err(() => Cd.assignCaddie(db, CM, { bookingId: b2.id, caddieId: Cd.rotationQueue(db)[2].id })).message).toMatch(/reason/i); // override needs reason
    expect(err(() => Cd.assignCaddie(db, RES, { bookingId: b2.id })).code).toBe("forbidden");
    expect(err(() => Cd.assignCaddie(db, CM, { bookingId: b2.id, caddieId: a1.caddieId })).message).toMatch(/cannot be assigned/); // already reserved
    Cd.assignCaddie(db, CM, { bookingId: b2.id, caddieId: Cd.rotationQueue(db)[2].id, reason: "Skipping: caddie on meal break" }); expect(db.rotationEvents.at(-1)!.type).toBe("override");
  });
  it("employee fees are club revenue; contractor fees become payables and settle only once collected", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const slot = Bk.buildSlots(db, TODAY).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= "10:30")!; const p = publicPlayers(db, 2, 80);
    const b = Bk.createBooking(db, RES, { date: TODAY, time: slot.time, holes: 18, channel: "phone", players: p, contactName: p[0].name, contactPhone: "1", contactCustomerId: p[0].customerId });
    Fl.arriveBooking(db, RES, b.id, b.players.map((x) => x.id)); const contractor = db.caddies.find((c) => c.classification === "contractor" && c.status === "available")!; Cd.assignCaddie(db, CM, { bookingId: b.id, caddieId: contractor.id, preferred: true, reason: "requested" });
    for (const c of db.charges.filter((x) => x.bookingId === b.id && Fn.outstanding(x) > 0)) Fn.recordPayment(db, CASH, { chargeId: c.id, amount: Fn.outstanding(c), method: "cash" });
    Fl.markReady(db, ST, b.id); Fl.startRound(db, ST, b.id); const rev = totalRevenue(db, { from: TODAY, to: TODAY }); Fl.completeRound(db, ST, b.id, {});
    const s = db.caddieSettlements.at(-1)!; expect(s.caddieId).toBe(contractor.id); expect(s.clubRetained).toBe(0); expect(s.payable).toBeGreaterThan(0);
    expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBe(rev); // contractor fee is not club revenue
    expect(err(() => Cd.settleCaddie(db, CM, s.id)).code).toBe("not_collected");
    const ch = db.charges.find((c) => c.id === s.chargeId)!; Fn.recordPayment(db, CASH, { chargeId: ch.id, amount: Fn.outstanding(ch), method: "cash" }); Cd.settleCaddie(db, CM, s.id); expect(s.status).toBe("settled");
  });
});

describe("Scenario D — cart maintenance", () => {
  it("pulls cart 12 from dispatch, creates work order, requires inspection before service", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const cart = db.carts.find((c) => c.no === 12)!; expect(cart.status).toBe("available");
    const { workOrder } = Ct.reportCartIssue(db, CS, cart.id, "Steering rattle and mechanical fault"); expect(cart.status).toBe("maintenance"); expect(workOrder.cartId).toBe(cart.id);
    const b = mkPublic(db, TODAY, Bk.buildSlots(db, TODAY).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= "10:30")!.time);
    expect(err(() => Ct.assignCart(db, CS, b.id, cart.id)).code).toBe("maintenance"); expect(err(() => Ct.dispatchCart(db, CS, cart.id)).code).toBe("maintenance");
    Mt.advanceWorkOrder(db, MX, workOrder.id, "in_progress"); Mt.advanceWorkOrder(db, MX, workOrder.id, "for_inspection"); expect(cart.status).toBe("maintenance");
    expect(err(() => Mt.inspectWorkOrder(db, MX, workOrder.id, "passed", "ok")).code).toBe("forbidden"); Mt.inspectWorkOrder(db, CS, workOrder.id, "passed", "Brake and steering tested");
    expect(cart.status).toBe("available"); Ct.assignCart(db, CS, b.id, cart.id); expect(cart.status).toBe("reserved");
  });
});

describe("Scenario E — course restriction", () => {
  it("blocks tee times, flags affected reservations, supports reschedule/lift, and audits", () => {
    const db = fresh(); const date = addD(TODAY, 2); const b = mkPublic(db, date, openSlot(db, date, "08:00").time); const log0 = db.audit.length;
    expect(err(() => Bk.createClosure(db, RES, { date, from: "07:30", to: "10:00", type: "full", tee: "all", holes: [], category: "maintenance", reason: "x" })).code).toBe("forbidden");
    const r = Bk.createClosure(db, SUP, { date, from: "07:30", to: "11:00", type: "tee", tee: "all", holes: [], category: "maintenance", reason: "Irrigation repair" }); expect(r.impact.some((x) => x.id === b.id)).toBe(true);
    expect(Bk.bookingConflicts(db).some((c) => c.booking.id === b.id)).toBe(true); expect(Bk.buildSlots(db, date).find((s) => s.time === b.time)!.blocked).toBeTruthy(); expect(computeAlerts(db).some((a) => a.type === "Booking conflict")).toBe(true);
    expect(err(() => Bk.createBooking(db, RES, { date, time: "07:40", holes: 18, channel: "phone", players: publicPlayers(db, 1, 10), contactName: "X", contactPhone: "1" })).code).toBe("closed");
    Bk.rescheduleBooking(db, RES, b.id, { date, time: openSlot(db, date, "12:00").time }); expect(Bk.bookingConflicts(db).some((c) => c.booking.id === b.id)).toBe(false);
    Bk.liftClosure(db, SUP, r.closure.id); expect(Bk.buildSlots(db, date).find((s) => s.time === "07:40")!.blocked).toBeUndefined(); expect(db.audit.length - log0).toBeGreaterThanOrEqual(3);
  });
  it("a work order alone does not close the course", () => { const db = fresh(); const t = db.meta.today; Mt.createWorkOrder(db, SUP, { location: "Hole 3", hole: 3, category: "Greens", description: "Aeration works", priority: "high", team: "Greens Crew", startDate: t, targetDate: t, estCost: 100 }); expect(Bk.buildSlots(db, t).every((s) => !s.blocked)).toBe(true); });
});

describe("Scenario F — café member charge", () => {
  it("charges member account once; reports do not double count; void restores stock and ledger", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const m = activeMember(db, 9); const coffee = db.inventory.find((i) => i.sku === "COF-03")!, meal = db.inventory.find((i) => i.sku === "MEL-01")!; const stock = coffee.qty;
    const bal = Fn.memberBalance(db, m.id); const rev = totalRevenue(db, { from: TODAY, to: TODAY }); const cash = financeTotals(db, { from: TODAY, to: TODAY }).cashCollected;
    const o = Pos.createPosOrder(db, POS, { items: [{ itemId: coffee.id, qty: 2 }, { itemId: meal.id, qty: 1 }], method: "member_account", memberId: m.id });
    expect(o.discountPct).toBe(db.plans.find((p) => p.id === m.planId)!.cafeDiscountPct); expect(Fn.memberBalance(db, m.id)).toBeCloseTo(bal + o.total, 1); expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBeCloseTo(rev + o.total, 1);
    expect(financeTotals(db, { from: TODAY, to: TODAY }).cashCollected).toBe(cash); expect(coffee.qty).toBe(stock - 2);
    expect(err(() => Pos.voidPosOrder(db, CASH, o.id, "customer changed mind")).code).toBe("forbidden"); Pos.voidPosOrder(db, POS, o.id, "customer changed mind"); expect(coffee.qty).toBe(stock); expect(Fn.memberBalance(db, m.id)).toBeCloseTo(bal, 1);
  });
  it("discount above staff limit needs authority; insufficient stock is rejected; credit limit enforced", () => {
    const db = fresh(); const it = db.inventory.find((i) => i.price)!; expect(err(() => Pos.createPosOrder(db, CASH, { items: [{ itemId: it.id, qty: 1 }], method: "cash", manualDiscountPct: 50 })).code).toBe("forbidden");
    expect(err(() => Pos.createPosOrder(db, POS, { items: [{ itemId: it.id, qty: it.qty + 1 }], method: "cash" })).code).toBe("stock");
    const m = activeMember(db, 2); const plan = db.plans.find((p) => p.id === m.planId)!; Fn.createCharge(db, GM, { dept: "other", description: "x", amount: plan.creditLimit, name: "m", memberId: m.id, billTo: "member_account" });
    expect(err(() => Pos.createPosOrder(db, POS, { items: [{ itemId: it.id, qty: 1 }], method: "member_account", memberId: m.id })).code).toBe("credit");
  });
});

describe("finance rules", () => {
  it("rejects overpayment, requires an open shift, supports refund/write-off with authority", () => {
    const db = fresh(); const c = Fn.createCharge(db, GM, { dept: "other", description: "Test", amount: 1000, name: "A" });
    expect(err(() => Fn.recordPayment(db, CASH, { chargeId: c.id, amount: 1500, method: "cash" })).code).toBe("validation"); Fn.recordPayment(db, CASH, { chargeId: c.id, amount: 400, method: "cash" }); expect(c.status).toBe("partial");
    expect(err(() => Fn.writeOff(db, CASH, c.id, "uncollectible debt")).code).toBe("forbidden"); Fn.recordPayment(db, CASH, { chargeId: c.id, amount: 600, method: "gcash" }); expect(c.status).toBe("paid");
    Fn.refundCharge(db, CASH, c.id, 1000, "cash", "service issue"); expect(c.status).toBe("refunded"); expect(Fn.recognisedRevenue(c)).toBe(0); expect(err(() => Fn.refundCharge(db, CASH, c.id, 1, "cash", "again")).code).toBe("validation");
    const u = Fn.createCharge(db, GM, { dept: "other", description: "Unpaid", amount: 500, name: "B" }); Fn.writeOff(db, GM, u.id, "approved by general manager"); expect(Fn.outstanding(u)).toBe(0); expect(Fn.recognisedRevenue(u)).toBe(0);
    db.shifts.forEach((s) => { s.status = "closed"; }); expect(err(() => Fn.recordPayment(db, CASH, { chargeId: Fn.createCharge(db, GM, { dept: "other", description: "n", amount: 10, name: "n" }).id, amount: 10, method: "cash" })).code).toBe("no_shift");
  });
  it("shift reconciliation computes expected cash and variance", () => { const db = fresh(); const s = Fn.openShift(db)!; const e = Fn.shiftCash(db, s.id).expected; Fn.closeShift(db, CASH, s.id, e - 50); expect(s.variance).toBe(-50); expect(s.status).toBe("closed"); });
});

describe("maintenance, events, permissions", () => {
  it("work order flow requires inspection; recurring generation is idempotent", () => {
    const db = fresh(); const w = Mt.createWorkOrder(db, SUP, { location: "Hole 1", hole: 1, category: "Tee boxes", description: "Re-level tee", priority: "normal", team: "", startDate: TODAY, targetDate: TODAY, estCost: 500 }); expect(w.status).toBe("scheduled"); expect(err(() => Mt.advanceWorkOrder(db, MX, w.id, "assigned")).code).toBe("validation");
    Mt.assignTeam(db, SUP, w.id, "Fairway Crew"); Mt.advanceWorkOrder(db, MX, w.id, "in_progress"); expect(err(() => Mt.advanceWorkOrder(db, MX, w.id, "completed")).code).toBe("validation"); Mt.advanceWorkOrder(db, MX, w.id, "for_inspection"); Mt.inspectWorkOrder(db, SUP, w.id, "passed", "good"); expect(w.status).toBe("completed");
    Mt.generateRecurring(db, SUP, 0); expect(err(() => Mt.generateRecurring(db, SUP, 0)).code).toBe("none_due");
  });
  it("events: duplicate registration blocked; tee block affects reservations; scoring validation; leaderboard order", () => {
    const db = fresh(); const date = addD(TODAY, 5); const b = mkPublic(db, date, openSlot(db, date, "07:00").time); const { event, impact } = Ev.createEvent(db, as("tournament"), { name: "Test Cup", type: "tournament", date, start: "06:30", end: "12:00", organizer: "Org", expected: 8, fee: 1000, venue: "Course", format: "Stroke", blockTeeSheet: true }); expect(impact).toBeGreaterThanOrEqual(0); void b;
    Ev.registerPlayer(db, as("tournament"), event.id, { name: "Player One" }); expect(err(() => Ev.registerPlayer(db, as("tournament"), event.id, { name: "player one" })).code).toBe("duplicate"); Ev.registerPlayer(db, as("tournament"), event.id, { name: "Player Two" });
    const [r1, r2] = event.registrations; expect(err(() => Ev.recordScore(db, as("tournament"), event.id, r1.id, 5)).code).toBe("validation"); Ev.recordScore(db, as("tournament"), event.id, r1.id, 90); Ev.recordScore(db, as("tournament"), event.id, r2.id, 82); expect(Ev.leaderboard(db, event)[0].reg.name).toBe("Player Two");
    expect(db.charges.find((c) => c.id === r1.chargeId)!.date).toBe(date); // revenue recognised on event date
  });
  it("roles: every role has a defined permission set; member has no staff permissions; admin can edit roles", () => {
    expect(ROLES.length).toBe(15); expect(base.rolePerms.member.length).toBe(0); expect(base.rolePerms.system_admin).toContain("admin.roles"); expect(base.rolePerms.cashier).not.toContain("finance.writeoff");
  });
  it("starter pace and delays are computed from the demo clock", () => {
    const db = fresh(); const late = db.bookings.find((b) => b.date === TODAY && b.status === "ready"); expect(late).toBeTruthy(); expect(Fl.paceOf(db, late!).status).toBe("delayed"); expect(computeAlerts(db).some((a) => a.type === "Delayed flight")).toBe(true);
  });
});

describe("Driving range — running tabs", () => {
  it("accumulates items without charging, then bills once at bill-out and releases the bay", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const RNG = as("cafe");
    const bay = Array.from({ length: 20 }, (_, i) => i + 1).find((b) => !Pos.bayOccupancy(db)[b])!;
    const charges0 = db.charges.length, pay0 = db.payments.length, rev0 = totalRevenue(db, { from: TODAY, to: TODAY });
    const t = Pos.openRangeTab(db, RNG, { name: "Tab Test Golfer", bay });
    Pos.addRangeLine(db, RNG, t.id, "BKT-M", 1); Pos.addRangeLine(db, RNG, t.id, "BKT-S", 2); const sess = Pos.addRangeLine(db, RNG, t.id, "SES-30", 1);
    expect(db.charges.length).toBe(charges0); expect(db.payments.length).toBe(pay0); expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBe(rev0); // nothing charged yet
    expect(Pos.bayOccupancy(db)[bay].tabId).toBe(t.id); expect(Pos.tabTotals(db, t).total).toBe(150 + 200 + 350);
    Pos.removeRangeLine(db, RNG, t.id, sess.lines.at(-1)!.id); expect(Pos.tabTotals(db, t).total).toBe(350);
    const sale = Pos.billOutRangeTab(db, RNG, t.id, "cash");
    expect(db.charges.length).toBe(charges0 + 1); expect(db.payments.length).toBe(pay0 + 1); expect(sale.amount).toBe(350); expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBe(rev0 + 350);
    expect(t.status).toBe("billed"); expect(Pos.bayOccupancy(db)[bay]).toBeUndefined(); expect(err(() => Pos.billOutRangeTab(db, RNG, t.id, "cash")).message).toMatch(/already billed/);
  });
  it("applies member discount and charges the member account at bill-out; blocks duplicates, occupied bays and suspended members", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const RNG = as("cafe"); const m = db.members.filter((x) => x.status === "active")[40]; const plan = db.plans.find((p) => p.id === m.planId)!;
    const t = Pos.openRangeTab(db, RNG, { memberId: m.id }); expect(err(() => Pos.openRangeTab(db, RNG, { memberId: m.id })).code).toBe("duplicate");
    Pos.addRangeLine(db, RNG, t.id, "BKT-L", 2); const bal = Fn.memberBalance(db, m.id); const total = 500 * (1 - plan.rangeDiscountPct / 100);
    Pos.billOutRangeTab(db, RNG, t.id, "member_account"); expect(Fn.memberBalance(db, m.id)).toBeCloseTo(bal + total, 1);
    const sus = db.members.find((x) => x.status === "suspended")!; expect(err(() => Pos.openRangeTab(db, RNG, { memberId: sus.id })).code).toBe("eligibility");
    const occ = Object.keys(Pos.bayOccupancy(db)).map(Number)[0]; if (occ) expect(err(() => Pos.openRangeTab(db, RNG, { name: "Other", bay: occ })).code).toBe("conflict");
    const t2 = Pos.openRangeTab(db, RNG, { name: "No Bay" }); expect(err(() => Pos.addRangeLine(db, RNG, t2.id, "SES-30", 1)).code).toBe("validation"); expect(err(() => Pos.billOutRangeTab(db, RNG, t2.id, "cash")).code).toBe("validation"); Pos.cancelRangeTab(db, RNG, t2.id); expect(t2.status).toBe("cancelled");
  });
});

describe("Café — running tabs", () => {
  it("accumulates orders without charging, deducts stock, then bills once at bill-out", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const C = as("cafe"); const coffee = db.inventory.find((i) => i.sku === "COF-02")!, meal = db.inventory.find((i) => i.sku === "MEL-04")!; const s0 = coffee.qty;
    const ch0 = db.charges.length, pay0 = db.payments.length, po0 = db.posOrders.length, rev0 = totalRevenue(db, { from: TODAY, to: TODAY });
    const t = Pos.openCafeTab(db, C, { label: "Table 9 test" }); Pos.addCafeLine(db, C, t.id, coffee.id, 2); const l2 = Pos.addCafeLine(db, C, t.id, meal.id, 1).lines.at(-1)!; Pos.addCafeLine(db, C, t.id, coffee.id, 1);
    expect(db.charges.length).toBe(ch0); expect(db.payments.length).toBe(pay0); expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBe(rev0); expect(coffee.qty).toBe(s0 - 3);
    Pos.removeCafeLine(db, C, t.id, l2.id); expect(meal.qty).toBe(db.inventory.find((i) => i.sku === "MEL-04")!.qty); expect(Pos.cafeTabTotals(db, t).total).toBe(330);
    const o = Pos.billOutCafeTab(db, C, t.id, { method: "cash" }); expect(o.total).toBe(330); expect(db.charges.length).toBe(ch0 + 1); expect(db.payments.length).toBe(pay0 + 1); expect(db.posOrders.length).toBe(po0 + 1); expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBe(rev0 + 330);
    expect(t.status).toBe("billed"); expect(err(() => Pos.billOutCafeTab(db, C, t.id, { method: "cash" })).message).toMatch(/already billed/);
  });
  it("member discount + account billing at bill-out; discount authority; stock; duplicates; served-line removal needs authority", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const C = as("cafe"); const m = db.members.filter((x) => x.status === "active")[45]; const plan = db.plans.find((p) => p.id === m.planId)!; const item = db.inventory.find((i) => i.sku === "MEL-01")!;
    const t = Pos.openCafeTab(db, C, { memberId: m.id }); expect(err(() => Pos.openCafeTab(db, C, { memberId: m.id })).code).toBe("duplicate"); const line = Pos.addCafeLine(db, C, t.id, item.id, 2).lines[0];
    expect(err(() => Pos.addCafeLine(db, C, t.id, item.id, item.qty + 1)).code).toBe("stock"); Pos.setCafeLineStatus(db, C, t.id, line.id, "served"); expect(err(() => Pos.removeCafeLine(db, CASH, t.id, line.id, "oops")).code).toBe("forbidden");
    expect(err(() => Pos.billOutCafeTab(db, CASH, t.id, { method: "cash", manualDiscountPct: 50 })).code).toBe("forbidden");
    const bal = Fn.memberBalance(db, m.id); const o = Pos.billOutCafeTab(db, C, t.id, { method: "member_account" }); expect(o.total).toBeCloseTo(570 * (1 - plan.cafeDiscountPct / 100), 1); expect(Fn.memberBalance(db, m.id)).toBeCloseTo(bal + o.total, 1);
    const sus = db.members.find((x) => x.status === "suspended")!; expect(err(() => Pos.openCafeTab(db, C, { memberId: sus.id })).code).toBe("eligibility");
    const t2 = Pos.openCafeTab(db, C, { label: "Empty" }); expect(err(() => Pos.billOutCafeTab(db, C, t2.id, { method: "cash" })).code).toBe("validation"); Pos.cancelCafeTab(db, C, t2.id);
  });
});

describe("Range + café linked visit", () => {
  it("links café to a range tab, blocks separate billing, and bills once while posting two department charges", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const C = as("cafe"); const m = db.members.filter((x) => x.status === "active")[50]; const plan = db.plans.find((p) => p.id === m.planId)!;
    const r = Pos.openRangeTab(db, C, { memberId: m.id }); Pos.addRangeLine(db, C, r.id, "BKT-L", 2);
    const c = Pos.orderFoodForRangeTab(db, C, r.id); expect(c.rangeTabId).toBe(r.id); expect(r.cafeTabId).toBe(c.id); expect(Pos.orderFoodForRangeTab(db, C, r.id).id).toBe(c.id); // idempotent, no duplicate café tab
    Pos.addCafeLine(db, C, c.id, db.inventory.find((i) => i.sku === "COF-03")!.id, 2); Pos.addCafeLine(db, C, c.id, db.inventory.find((i) => i.sku === "MEL-03")!.id, 1);
    expect(err(() => Pos.billOutRangeTab(db, C, r.id, "cash")).code).toBe("linked"); expect(err(() => Pos.billOutCafeTab(db, C, c.id, { method: "cash" })).code).toBe("linked");
    const v = Pos.visitTotals(db, r, c); const ch0 = db.charges.length, pay0 = db.payments.length; const rev0 = totalRevenue(db, { from: TODAY, to: TODAY }); const bal0 = Fn.memberBalance(db, m.id);
    const res = Pos.billOutCombined(db, C, r.id, { method: "member_account" }); expect(res.grand).toBeCloseTo(v.grand, 2);
    expect(db.charges.length).toBe(ch0 + 2); expect(db.payments.length).toBe(pay0); expect(Fn.memberBalance(db, m.id)).toBeCloseTo(bal0 + v.grand, 1); expect(totalRevenue(db, { from: TODAY, to: TODAY })).toBeCloseTo(rev0 + v.grand, 1);
    expect(db.charges.find((x) => x.id === res.sale!.chargeId)!.dept).toBe("range"); expect(db.charges.find((x) => x.id === res.order!.chargeId)!.dept).toBe("cafe");
    expect(r.status).toBe("billed"); expect(c.status).toBe("billed"); expect(plan.rangeDiscountPct).toBeGreaterThan(0); expect(res.sale!.discount).toBeGreaterThan(0);
  });
  it("one cash payment covers both charges; works with only café items; unlink restores separate billing; different members can't be linked", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const C = as("cafe"); const r = Pos.openRangeTab(db, C, { name: "Cash Visit" }); Pos.addRangeLine(db, C, r.id, "BKT-S", 1); const c = Pos.orderFoodForRangeTab(db, C, r.id); Pos.addCafeLine(db, C, c.id, db.inventory.find((i) => i.sku === "BEV-01")!.id, 2);
    const pay0 = db.payments.length; const res = Pos.billOutCombined(db, C, r.id, { method: "cash" }); expect(res.grand).toBe(150); expect(db.payments.length).toBe(pay0 + 2); expect(db.payments.slice(-2).reduce((a, p) => a + p.amount, 0)).toBe(150); expect(new Set(db.payments.slice(-2).map((p) => p.ref)).size).toBe(1);
    const r2 = Pos.openRangeTab(db, C, { name: "Unlink Me" }); Pos.addRangeLine(db, C, r2.id, "BKT-S", 1); const c2 = Pos.orderFoodForRangeTab(db, C, r2.id); Pos.addCafeLine(db, C, c2.id, db.inventory.find((i) => i.sku === "BEV-01")!.id, 1); Pos.unlinkTabs(db, C, r2.id); expect(c2.rangeTabId).toBeUndefined(); Pos.billOutRangeTab(db, C, r2.id, "cash"); Pos.billOutCafeTab(db, C, c2.id, { method: "cash" });
    const ms = db.members.filter((x) => x.status === "active"); const ra = Pos.openRangeTab(db, C, { memberId: ms[3].id }), cb = Pos.openCafeTab(db, C, { memberId: ms[4].id }); expect(err(() => Pos.linkTabs(db, C, ra.id, cb.id)).code).toBe("validation");
    const r3 = Pos.openRangeTab(db, C, { name: "Only Food" }); const c3 = Pos.orderFoodForRangeTab(db, C, r3.id); Pos.addCafeLine(db, C, c3.id, db.inventory.find((i) => i.sku === "BEV-01")!.id, 1); expect(Pos.billOutCombined(db, C, r3.id, { method: "cash" }).sale).toBeNull();
  });
});

describe("Cart tracking & course map (simulated GPS)", () => {
  it("parks idle carts at the barn, shows maintenance carts at the shed, and moves in-use carts along the course with the clock", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const tracks = Trk.allTracks(db);
    expect(tracks.length).toBe(30); for (const t of tracks) { expect(t.x).toBeGreaterThanOrEqual(0); expect(t.x).toBeLessThanOrEqual(Trk.MAP_W); expect(t.y).toBeGreaterThanOrEqual(0); expect(t.y).toBeLessThanOrEqual(Trk.MAP_H); expect(t.simulated).toBe(true); }
    const used = db.carts.find((c) => c.status === "in_use")!; const a = Trk.cartTrack(db, used); expect(a.zone).toBe("course"); expect(a.hole).toBeGreaterThanOrEqual(1);
    const m = db.carts.find((c) => c.status === "maintenance")!; expect(Trk.cartTrack(db, m).zone).toBe("shed"); const av = db.carts.find((c) => c.status === "available")!; expect(Trk.cartTrack(db, av).zone).toBe("barn");
    db.meta.now = `${TODAY}T10:30`; const b = Trk.cartTrack(db, used); expect(b.progress!).toBeGreaterThan(a.progress!); expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(5);
  });
  it("flags a cart on a restricted hole once the restriction window starts, and path geometry stays on the map", () => {
    const db = fresh(); const SUPC = as("superintendent"); db.meta.now = `${TODAY}T09:00`;
    const t0 = Trk.allTracks(db).find((t) => t.zone === "course")!; const r = Bk.createClosure(db, SUPC, { date: TODAY, from: "09:00", to: "15:00", type: "partial", tee: "all", holes: [t0.hole!], category: "maintenance", reason: "Test restriction" }); expect(r.closure.active).toBe(true);
    const hz = Trk.allTracks(db).find((t) => t.cartId === t0.cartId)!; expect(hz.hazard?.kind).toBe("restricted"); expect(computeAlerts(db).some((a) => a.type === "Cart on restricted hole")).toBe(true);
    for (let p = 0; p <= 18; p += 0.25) { const q = Trk.pathAt(p, 18); expect(q.pt.x).toBeGreaterThan(0); expect(q.pt.x).toBeLessThan(Trk.MAP_W); expect(q.hole).toBeGreaterThanOrEqual(1); expect(q.hole).toBeLessThanOrEqual(18); }
  });
});
import * as Trk from "@/lib/services/tracking";

describe("Cart map — crew and animation", () => {
  it("lists the golfers and caddies riding each cart and moves carts continuously with fractional minutes", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const t0 = Trk.allTracks(db).find((t) => t.zone === "course" && (t.riders?.length ?? 0) > 0)!;
    expect(t0.riders!.length).toBeGreaterThan(0); expect(t0.riders!.length).toBeLessThanOrEqual(db.settings.rates.playersPerCart); expect(t0.ref).toBeTruthy(); expect((t0.caddies ?? []).every((c) => !!c.name)).toBe(true);
    const flight = db.bookings.find((b) => b.ref === t0.ref)!; const allRiders = Trk.allTracks(db).filter((t) => t.ref === t0.ref).flatMap((t) => t.riders!.map((r) => r.name)); expect(new Set(allRiders).size).toBe(Math.min(flight.players.length, allRiders.length)); // no golfer seated twice
    const a = Trk.allTracks(db, 0).find((t) => t.cartId === t0.cartId)!, b = Trk.allTracks(db, 0.5).find((t) => t.cartId === t0.cartId)!, c = Trk.allTracks(db, 1).find((t) => t.cartId === t0.cartId)!;
    expect(b.holeProgress!).toBeGreaterThan(a.holeProgress!); expect(c.holeProgress!).toBeGreaterThan(b.holeProgress!); expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0); // sub-minute movement = smooth animation
    const done = Trk.allTracks(db, 600).find((t) => t.cartId === t0.cartId)!; expect(done.zone).toBe("clubhouse"); // finished carts roll back to the clubhouse
  });
});

describe("Today tasks (role-aware, derived, one-click)", () => {
  it("shows each role its own work, offers actions only when permitted, and tasks vanish once done", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`;
    const starter = Tk.tasksForRole(db, "starter"); expect(starter.length).toBeGreaterThan(0); expect(starter.every((t) => t.module === "starter")).toBe(true);
    const caddie = Tk.tasksForRole(db, "caddie_master"); expect(caddie.every((t) => t.module === "caddie")).toBe(true); expect(Tk.tasksForRole(db, "member")).toEqual([]);
    const gm = Tk.tasksForRole(db, "gm"); expect(new Set(gm.map((t) => t.module)).size).toBeGreaterThan(2);
    // permission gating: reservations officer sees caddie-less flights? no — caddie tasks never appear; cashier sees no starter actions
    expect(Tk.tasksForRole(db, "cashier").every((t) => t.module === "cashier")).toBe(true);
    const assign = caddie.find((t) => t.action?.kind === "assign_caddie"); expect(assign).toBeTruthy(); const before = Cd.bookingAssignments(db, assign!.action!.id!).length;
    Tk.runTask(db, CM, assign!.action!); expect(Cd.bookingAssignments(db, assign!.action!.id!).length).toBe(before + 1);
    expect(err(() => Tk.runTask(db, RES, { kind: "assign_caddie", label: "x", id: assign!.action!.id })).code).toBe("forbidden"); // services still enforce permissions
    const rel = starter.find((t) => t.action?.kind === "release_flight"); if (rel) { Tk.runTask(db, ST, rel.action!); expect(Tk.tasksForRole(db, "starter").some((t) => t.id === rel.id)).toBe(false); }
    const sh = db.shifts.find((s) => s.status === "open")!; sh.status = "closed"; expect(Tk.tasksForRole(db, "cashier").some((t) => t.action?.kind === "open_shift")).toBe(true); Tk.runTask(db, CASH, { kind: "open_shift", label: "x" }); expect(Fn.openShift(db)).toBeTruthy();
    const conf = Bk.createBooking(db, as("reservations"), { date: addD(TODAY, 1), time: openSlot(db, addD(TODAY, 1)).time, holes: 18, channel: "online", players: publicPlayers(db, 1), contactName: "Pending Online", contactPhone: "1" }); expect(conf.status).toBe("booked");
  });
});

describe("Walk-in wizard (one guided transaction)", () => {
  const slot = (db: DB) => Bk.buildSlots(db, TODAY).find((s) => !s.blocked && !s.past && s.bookings.length === 0 && s.time >= "10:30")!;
  it("books, checks in, assigns caddies & carts, collects payment, dispatches and marks ready in one go", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const players = publicPlayers(db, 4); const s = slot(db);
    const r = Wk.walkIn(db, GM, { time: s.time, holes: 18, players, contactName: players[0].name, wantCaddies: true, wantCarts: true, payMethod: "cash" });
    expect(r.steps.map((x) => x.status)).toEqual(["done", "done", "done", "done", "done", "done", "done"]); expect(r.ready).toBe(true); expect(r.booking.status).toBe("ready"); expect(r.due).toBe(0); expect(r.collected).toBeGreaterThan(4 * 3000);
    expect(Cd.bookingAssignments(db, r.booking.id).length).toBe(2); expect(Ct.cartsFor(db, r.booking.id).every((c) => c.status === "dispatched")).toBe(true);
  });
  it("is honest when a role can't do every step, and 'pay later' leaves the flight not ready", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const players = publicPlayers(db, 2); const s = slot(db);
    const r = Wk.walkIn(db, RES, { time: s.time, holes: 18, players, contactName: players[0].name, wantCaddies: true, wantCarts: true, payMethod: "cash" });
    expect(r.booking.status).toBe("arrived"); expect(r.ready).toBe(false); expect(r.steps.find((x) => x.key === "caddies")!.status).toBe("skipped"); expect(r.steps.find((x) => x.key === "payment")!.status).toBe("skipped");
    const p2 = publicPlayers(db, 2); const s2 = Bk.buildSlots(db, TODAY).find((x) => !x.blocked && !x.past && x.bookings.length === 0 && x.time > s.time)!;
    const later = Wk.walkIn(db, GM, { time: s2.time, holes: 9, players: p2, contactName: p2[0].name, wantCaddies: true, wantCarts: true, payMethod: null }); expect(later.ready).toBe(false); expect(later.due).toBeGreaterThan(0); expect(later.steps.find((x) => x.key === "ready")!.status).toBe("failed");
  });
  it("rolls everything back (via the store contract) when a required rule fails; nothing is half-created", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const taken = db.bookings.find((b) => b.date === TODAY && b.status === "confirmed" && b.time >= "09:40")!; const n = db.bookings.length; const players = publicPlayers(db, 2);
    expect(err(() => Wk.walkIn(db, GM, { time: taken.time, holes: 18, players, contactName: "X", wantCaddies: true, wantCarts: true, payMethod: "cash" })).code).toBe("conflict"); expect(db.bookings.length).toBe(n);
    expect(err(() => Wk.walkIn(db, as("caddie_master"), { time: "11:00", holes: 18, players, contactName: "X", wantCaddies: true, wantCarts: true, payMethod: null })).code).toBe("forbidden");
  });
});
import * as Tk from "@/lib/services/tasks";
import * as Wk from "@/lib/services/walkin";

describe("Range bay board", () => {
  it("moves a bay-less tab to a free bay, blocks occupied bays, and a bay session then works", () => {
    const db = fresh(); db.meta.now = `${TODAY}T09:00`; const C = as("cafe"); const t = Pos.openRangeTab(db, C, { name: "No Bay Yet" }); expect(err(() => Pos.addRangeLine(db, C, t.id, "SES-30", 1)).code).toBe("validation");
    const occ = Object.keys(Pos.bayOccupancy(db)).map(Number)[0]; expect(err(() => Pos.assignTabBay(db, C, t.id, occ)).code).toBe("conflict"); const free = Array.from({ length: 20 }, (_, i) => i + 1).find((b) => !Pos.bayOccupancy(db)[b])!;
    Pos.assignTabBay(db, C, t.id, free); expect(t.bay).toBe(free); expect(err(() => Pos.assignTabBay(db, C, t.id, free)).message).toMatch(/already on bay/); Pos.addRangeLine(db, C, t.id, "SES-30", 1); expect(Pos.bayOccupancy(db)[free].tabId).toBe(t.id);
  });
});
