/**
 * Metric definitions (single source of truth — dashboards, finance and reports all call these):
 *  - Reservation (Booking): a tee-time booking with a status. "Rounds booked" = players in non-cancelled, non-no-show bookings on the play date.
 *  - Round played: a Round record with startedAt. "Rounds started" = players in bookings that have started/completed.
 *  - Charge: an amount owed (accrual). Net revenue = charge amount − discount − refunds − third-party payables (caddie contractors), by CHARGE date. Voided / written-off charges are excluded.
 *  - Payment: cash/e-payment received (applied to a charge, or a held deposit). Cash collected = payments − refunds, by payment date.
 *  - Member account charge: a Charge with memberId; it is receivable until paid. It is never cash and never double counted when later paid.
 */
import type { DB, Dept } from "../types";
import { addDays, dateRange, toMin } from "../time";
import { chargeNet, outstanding, recognisedRevenue } from "./finance";
import { buildSlots, isActive } from "./booking";
import { r2 } from "../format";

export interface Range { from: string; to: string }
export const inRange = (d: string, r: Range) => d >= r.from && d <= r.to;
export const DEPTS: { id: Dept; label: string }[] = [
  { id: "green", label: "Green fees" }, { id: "cart", label: "Cart rental" }, { id: "caddie", label: "Caddie (club share)" }, { id: "membership", label: "Membership" },
  { id: "cafe", label: "Café" }, { id: "range", label: "Driving range" }, { id: "event", label: "Events" }, { id: "other", label: "Other" },
];
export const deptLabel = (d: Dept) => DEPTS.find((x) => x.id === d)?.label ?? d;

export function revenueByDept(db: DB, r: Range): Record<Dept, number> {
  const out = Object.fromEntries(DEPTS.map((d) => [d.id, 0])) as Record<Dept, number>;
  for (const c of db.charges) if (inRange(c.date, r)) out[c.dept] = r2(out[c.dept] + recognisedRevenue(c));
  return out;
}
export const totalRevenue = (db: DB, r: Range) => r2(Object.values(revenueByDept(db, r)).reduce((a, b) => a + b, 0));
export function financeTotals(db: DB, r: Range) {
  const ch = db.charges.filter((c) => inRange(c.date, r) && c.status !== "voided");
  const gross = r2(ch.reduce((a, c) => a + c.amount, 0)); const discounts = r2(ch.reduce((a, c) => a + c.discount, 0));
  const refunds = r2(db.refunds.filter((x) => inRange(x.date, r)).reduce((a, x) => a + x.amount, 0));
  const payables = r2(ch.filter((c) => c.status !== "written_off").reduce((a, c) => a + c.payable, 0));
  const payments = r2(db.payments.filter((p) => inRange(p.date, r)).reduce((a, p) => a + p.amount, 0));
  const writeOffs = r2(ch.filter((c) => c.status === "written_off").reduce((a, c) => a + chargeNet(c) - c.paid, 0));
  return { gross, discounts, refunds, payables, payments, cashCollected: r2(payments - refunds), writeOffs, netRevenue: totalRevenue(db, r), billedOnAccount: r2(ch.filter((c) => c.billTo === "member_account").reduce((a, c) => a + chargeNet(c), 0)) };
}
export const receivables = (db: DB) => r2(db.charges.reduce((a, c) => a + outstanding(c), 0));
export const memberReceivables = (db: DB) => r2(db.charges.filter((c) => c.memberId).reduce((a, c) => a + outstanding(c), 0));

const countable = (b: { status: string }) => !["cancelled", "no_show"].includes(b.status);
export function roundsBooked(db: DB, r: Range) { return db.bookings.filter((b) => inRange(b.date, r) && countable(b)).reduce((a, b) => a + b.players.length, 0); }
export function roundsStarted(db: DB, r: Range) { return db.bookings.filter((b) => inRange(b.date, r) && ["started", "completed"].includes(b.status)).reduce((a, b) => a + b.players.length, 0); }
export function playerMix(db: DB, r: Range) {
  const mix = { member: 0, guest: 0, public: 0 };
  for (const b of db.bookings) if (inRange(b.date, r) && countable(b)) for (const p of b.players) mix[p.type]++;
  return mix;
}
export function utilization(db: DB, date: string) {
  const slots = buildSlots(db, date).filter((s) => !s.blocked); const used = slots.filter((s) => s.bookings.length > 0).length;
  const closed = buildSlots(db, date).filter((s) => s.blocked).length;
  return { slots: slots.length, used, closed, pct: slots.length ? used / slots.length : 0 };
}
export function utilizationByHour(db: DB, r: Range) {
  const hours: Record<number, { avail: number; used: number }> = {};
  for (const d of dateRange(r.from, r.to)) for (const s of buildSlots(db, d)) { if (s.blocked) continue; const h = Math.floor(toMin(s.time) / 60); (hours[h] ??= { avail: 0, used: 0 }); hours[h].avail++; if (s.bookings.length) hours[h].used++; }
  return Object.entries(hours).map(([h, v]) => ({ hour: `${Number(h) % 12 || 12}${Number(h) >= 12 ? "p" : "a"}`, h: Number(h), utilization: v.avail ? Math.round((v.used / v.avail) * 100) : 0 }));
}
export function dailyRevenueSeries(db: DB, r: Range) {
  return dateRange(r.from, r.to).map((d) => ({ date: d, revenue: totalRevenue(db, { from: d, to: d }), cash: financeTotals(db, { from: d, to: d }).cashCollected }));
}
export function monthlyComparison(db: DB, today: string) {
  // earlier months: imported summaries (illustrative); current month: live month-to-date from transactions
  const cm = today.slice(0, 7);
  const rows = db.historicalMonthly.filter((m) => m.month < cm).map((m) => ({ month: m.month, revenue: m.revenue, source: "imported summary" }));
  rows.push({ month: cm, revenue: totalRevenue(db, { from: cm + "-01", to: today }), source: "live (month to date)" });
  return rows;
}
export function caddieUtilization(db: DB, date: string) {
  return db.caddies.map((c) => { const rounds = db.caddieAssignments.filter((a) => a.caddieId === c.id && a.date === date && !["cancelled", "replaced"].includes(a.status)).length; return { id: c.id, name: c.name, rounds }; }).filter((x) => x.rounds > 0 || db.caddieAttendance.some((a) => a.caddieId === x.id && a.date === date && a.timeIn));
}
export function maintenanceStats(db: DB, today: string) {
  const open = db.workOrders.filter((w) => w.status !== "completed"); const done = db.workOrders.filter((w) => w.status === "completed");
  const due = db.workOrders.filter((w) => w.startDate <= today);
  const trend = dateRange(addDays(today, -13), today).map((d) => ({ date: d, completed: done.filter((w) => w.completedAt?.slice(0, 10) === d).length, opened: db.workOrders.filter((w) => w.createdAt.slice(0, 10) === d).length }));
  return { open: open.length, done: done.length, rate: due.length ? due.filter((w) => w.status === "completed").length / due.length : 1, trend, urgent: open.filter((w) => w.priority === "urgent").length };
}
export function cartCounts(db: DB) {
  const c = { available: 0, inUse: 0, maintenance: 0, other: 0 };
  for (const x of db.carts) { if (x.status === "available") c.available++; else if (["dispatched", "in_use"].includes(x.status)) c.inUse++; else if (x.status === "maintenance") c.maintenance++; else c.other++; } return c;
}
export function caddieCounts(db: DB) {
  const present = db.caddies.filter((c) => !["off", "absent", "day_off"].includes(c.status));
  return { present: present.length, available: present.filter((c) => c.status === "available").length, assigned: present.filter((c) => ["reserved", "assigned"].includes(c.status)).length, onCourse: present.filter((c) => c.status === "on_course").length, returned: present.filter((c) => c.status === "returned").length };
}
export const liveFlights = (db: DB, date: string) => db.bookings.filter((b) => b.date === date && isActive(b));
