/**
 * Role-aware "Today" tasks. Tasks are DERIVED from live data (never stored), so completing the underlying work makes the task vanish.
 * Each task may carry an inline one-click action that runs the same permission-checked service the full screen uses.
 */
import type { DB, RoleId } from "../types";
import { Ctx, fail, hasPerm } from "./core";
import { bookingConflicts, waitlistMatches } from "./booking";
import { flightDelayed, flightRequirements, paceOf, roundOf } from "./flight";
import * as Fl from "./flight";
import * as Cd from "./caddie";
import * as Ct from "./cart";
import * as Bk from "./booking";
import * as Fn from "./finance";
import * as Ms from "./membership";
import * as Mt from "./maintenance";
import { lowStock } from "./inventory";
import { addMinTs, diffDays, fmt12, minsBetween, toMin } from "../time";
import { outstanding } from "./finance";

export type TaskModule = "starter" | "caddie" | "carts" | "reservations" | "cashier" | "membership" | "course" | "cafe" | "events";
export type TaskLevel = "now" | "soon" | "later";
export type ActionKind = "release_flight" | "mark_ready" | "complete_round" | "assign_caddie" | "release_caddie" | "settle_caddie" | "assign_cart" | "dispatch_cart" | "pass_inspection" | "confirm_booking" | "open_shift" | "approve_member" | "generate_recurring";
export interface TaskAction { kind: ActionKind; label: string; id?: string }
export interface Task { id: string; module: TaskModule; level: TaskLevel; icon: string; title: string; detail?: string; at?: string; href: string; action?: TaskAction }

const ACTION_PERM: Record<ActionKind, string> = { release_flight: "starter.manage", mark_ready: "starter.manage", complete_round: "starter.manage", assign_caddie: "caddie.manage", release_caddie: "caddie.manage", settle_caddie: "caddie.settle", assign_cart: "cart.manage", dispatch_cart: "cart.manage", pass_inspection: "cart.manage", confirm_booking: "booking.edit", open_shift: "finance.shift", approve_member: "membership.approve", generate_recurring: "course.manage" };
export const ROLE_MODULES: Record<RoleId, TaskModule[] | "all"> = {
  system_admin: "all", owner: "all", gm: "all", golf_ops: ["starter", "caddie", "carts", "reservations", "course", "events"], membership: ["membership"], reservations: ["reservations"], caddie_master: ["caddie"], starter: ["starter"],
  cart_supervisor: ["carts"], superintendent: ["course"], maintenance: ["course"], cashier: ["cashier"], cafe: ["cafe"], tournament: ["events"], member: [],
};
const ORDER: Record<TaskLevel, number> = { now: 0, soon: 1, later: 2 };

export function bestCart(db: DB) {
  return db.carts.filter((c) => c.status === "available").sort((a, b) => (b.fuel === "electric" ? b.battery : 100) - (a.fuel === "electric" ? a.battery : 100) || a.no - b.no)[0];
}

export function computeTasks(db: DB): Task[] {
  const today = db.meta.now.slice(0, 10), nowT = db.meta.now.slice(11, 16), nowM = toMin(nowT); const out: Task[] = []; const T = (t: Task) => out.push(t);
  const flights = db.bookings.filter((b) => b.date === today); const soonMin = (b: { time: string }) => toMin(b.time) - nowM; const name = (b: { contactName: string; players: unknown[] }) => `${b.contactName} · ${b.players.length} golfer${b.players.length > 1 ? "s" : ""}`;
  /* starter */
  for (const b of flights.filter((x) => x.status === "ready")) T({ id: "rel-" + b.id, module: "starter", level: soonMin(b) <= 10 ? "now" : "soon", icon: "Flag", title: `Release the ${fmt12(b.time)} flight`, detail: name(b), at: b.time, href: "/check-in?tab=starter", action: { kind: "release_flight", label: "Release", id: b.id } });
  for (const b of flights.filter((x) => x.status === "arrived")) {
    const miss = flightRequirements(db, b).filter((r) => r.blocking && !r.ok);
    if (!miss.length) T({ id: "rdy-" + b.id, module: "starter", level: soonMin(b) <= 15 ? "now" : "soon", icon: "CircleCheck", title: `Mark the ${fmt12(b.time)} flight ready`, detail: name(b), at: b.time, href: "/check-in?tab=starter", action: { kind: "mark_ready", label: "Mark ready", id: b.id } });
    else T({ id: "blk-" + b.id, module: "starter", level: soonMin(b) <= 15 ? "now" : "soon", icon: "TriangleAlert", title: `${fmt12(b.time)} flight is blocked`, detail: miss.map((m) => `${m.label.toLowerCase()} (${m.detail})`).join("; "), at: b.time, href: "/check-in?tab=starter" });
  }
  for (const b of flights.filter((x) => flightDelayed(db, x) && x.status !== "started")) T({ id: "dly-" + b.id, module: "starter", level: "now", icon: "TimerOff", title: `${fmt12(b.time)} flight is running late`, detail: `${name(b)} — flag the delay or release`, at: b.time, href: "/check-in?tab=starter" });
  for (const b of flights.filter((x) => x.status === "started")) {
    const p = paceOf(db, b); const r = roundOf(db, b.id); const lastCp = r && [...r.checkpoints].sort((a, c) => c.at.localeCompare(a.at))[0];
    if (p.expectedFinish && db.meta.now >= p.expectedFinish) T({ id: "fin-" + b.id, module: "starter", level: "soon", icon: "CheckCheck", title: `${fmt12(b.time)} flight is due in`, detail: `${name(b)} — expected finish ${fmt12(p.expectedFinish.slice(11))}`, at: b.time, href: "/check-in?tab=starter", action: { kind: "complete_round", label: "Complete round", id: b.id } });
    else if (r?.startedAt && minsBetween(lastCp?.at ?? r.startedAt, db.meta.now) >= 90) T({ id: "cp-" + b.id, module: "starter", level: "later", icon: "MapPin", title: `Record a pace checkpoint — ${fmt12(b.time)} flight`, detail: `${name(b)} · no checkpoint for ${minsBetween(lastCp?.at ?? r.startedAt, db.meta.now)} min`, at: b.time, href: "/check-in?tab=starter" });
    if (p.status === "behind") T({ id: "slow-" + b.id, module: "starter", level: "now", icon: "Gauge", title: `${fmt12(b.time)} flight is ${p.behindMin} min behind pace`, detail: name(b), at: b.time, href: "/course-map" });
  }
  /* caddies */
  const queue = Cd.rotationQueue(db);
  for (const b of flights.filter((x) => ["confirmed", "arrived", "ready"].includes(x.status))) {
    const need = Cd.requiredCaddies(db, b.id), have = Cd.bookingAssignments(db, b.id).length; if (have >= need) continue; const urgent = b.status !== "confirmed" || soonMin(b) <= 30; if (!urgent && soonMin(b) > 90) continue;
    T({ id: "cad-" + b.id, module: "caddie", level: urgent ? "now" : "soon", icon: "Users", title: `Assign caddies — ${fmt12(b.time)} flight (${have}/${need})`, detail: `${name(b)} · ${queue.length ? `next up: ${queue[0].name}` : "no caddie available in queue"}`, at: b.time, href: "/caddies", action: queue.length ? { kind: "assign_caddie", label: `Assign ${queue[0].name.split(" ")[0]}`, id: b.id } : undefined });
  }
  for (const c of db.caddies.filter((x) => x.status === "returned")) T({ id: "ret-" + c.id, module: "caddie", level: "soon", icon: "Undo2", title: `${c.name} has returned`, detail: "Release to the rotation queue", href: "/caddies", action: { kind: "release_caddie", label: "Release to queue", id: c.id } });
  const settle = db.caddieSettlements.filter((s) => s.status === "pending" && (() => { const ch = db.charges.find((x) => x.id === s.chargeId); return ch && ch.status === "paid"; })());
  settle.slice(0, 4).forEach((s) => T({ id: "set-" + s.id, module: "caddie", level: "later", icon: "Handshake", title: `Settle ₱${s.payable.toLocaleString()} to ${db.caddies.find((c) => c.id === s.caddieId)?.name}`, detail: "Customer has paid — payable is collectable", href: "/caddies", action: { kind: "settle_caddie", label: "Settle", id: s.id } }));
  if (settle.length > 4) T({ id: "set-more", module: "caddie", level: "later", icon: "Handshake", title: `${settle.length - 4} more settlements ready`, href: "/caddies" });
  /* carts */
  for (const b of flights.filter((x) => ["confirmed", "arrived", "ready"].includes(x.status))) {
    const need = Ct.requiredCarts(db, b.id), have = Ct.cartsFor(db, b.id).length; const urgent = b.status !== "confirmed" || soonMin(b) <= 30; if (have >= need || (!urgent && soonMin(b) > 90)) continue; const c = bestCart(db);
    T({ id: "cart-" + b.id, module: "carts", level: urgent ? "now" : "soon", icon: "Car", title: `Assign carts — ${fmt12(b.time)} flight (${have}/${need})`, detail: `${name(b)}${c ? ` · suggested cart #${c.no}` : " · no cart available"}`, at: b.time, href: "/carts", action: c ? { kind: "assign_cart", label: `Assign #${c.no}`, id: b.id } : undefined });
  }
  for (const c of db.carts.filter((x) => x.status === "reserved")) { const b = db.bookings.find((x) => x.id === c.bookingId); if (b && ["arrived", "ready"].includes(b.status)) T({ id: "dsp-" + c.id, module: "carts", level: soonMin(b) <= 15 ? "now" : "soon", icon: "Route", title: `Dispatch cart #${c.no}`, detail: `${fmt12(b.time)} flight · ${b.contactName}`, at: b.time, href: "/carts", action: { kind: "dispatch_cart", label: "Dispatch", id: c.id } }); }
  for (const c of db.carts.filter((x) => ["returned", "inspection"].includes(x.status))) T({ id: "insp-" + c.id, module: "carts", level: "soon", icon: "SearchCheck", title: `Inspect cart #${c.no} (${c.status})`, detail: "Pass inspection to put it back in service", href: "/carts", action: { kind: "pass_inspection", label: "Pass → available", id: c.id } });
  for (const w of db.workOrders.filter((x) => x.cartId && x.status === "for_inspection")) T({ id: "cwo-" + w.id, module: "carts", level: "now", icon: "Wrench", title: `Inspect repair ${w.code} — cart #${db.carts.find((c) => c.id === w.cartId)?.no}`, detail: "Mechanic marked it repaired; inspect and return to service", href: "/carts" });
  /* reservations */
  for (const b of db.bookings.filter((x) => x.status === "booked" && x.date >= today)) T({ id: "cnf-" + b.id, module: "reservations", level: b.date === today ? "now" : "soon", icon: "Hourglass", title: `Confirm online request ${b.ref}`, detail: `${b.contactName} · ${b.date === today ? "today" : b.date} ${fmt12(b.time)}`, at: b.date === today ? b.time : undefined, href: "/reservations?booking=" + b.id, action: { kind: "confirm_booking", label: "Confirm", id: b.id } });
  for (const b of flights.filter((x) => x.status === "confirmed" && soonMin(x) <= 30 && soonMin(x) >= -15)) T({ id: "chk-" + b.id, module: "reservations", level: "soon", icon: "ClipboardCheck", title: `Check in the ${fmt12(b.time)} party`, detail: name(b), at: b.time, href: "/check-in?booking=" + b.id });
  const bc = bookingConflicts(db); if (bc.length) T({ id: "conf", module: "reservations", level: "now", icon: "OctagonAlert", title: `${bc.length} reservation(s) clash with a course restriction`, detail: "Reschedule the affected golfers", href: "/reservations" });
  const wl = db.waitlist.filter((w) => waitlistMatches(db, w).length > 0); if (wl.length) T({ id: "wl", module: "reservations", level: "soon", icon: "ListOrdered", title: `${wl.length} waitlisted golfer(s) now have an open slot`, detail: wl.map((w) => w.name).slice(0, 3).join(", "), href: "/reservations" });
  /* cashier */
  if (!Fn.openShift(db)) T({ id: "shift", module: "cashier", level: "now", icon: "Landmark", title: "Open the cashier shift", detail: "Payments, POS and range sales are blocked until a shift is open", href: "/finance?tab=shift", action: { kind: "open_shift", label: "Open shift (₱5,000 float)" } });
  for (const b of flights.filter((x) => ["arrived", "ready", "started"].includes(x.status))) { const due = db.charges.filter((c) => c.bookingId === b.id && c.billTo === "counter").reduce((a, c) => a + outstanding(c), 0); if (due > 0) T({ id: "due-" + b.id, module: "cashier", level: b.status === "started" ? "soon" : "now", icon: "Banknote", title: `Collect ₱${due.toLocaleString()} — ${fmt12(b.time)} flight`, detail: `${b.contactName} (${b.status})`, at: b.time, href: "/finance?tab=charges" }); }
  const aged = db.charges.filter((c) => c.memberId && outstanding(c) > 0 && diffDays(today, c.date) > 30); if (aged.length) T({ id: "aged", module: "cashier", level: "later", icon: "HandCoins", title: `${aged.length} member charge(s) older than 30 days`, detail: `₱${aged.reduce((a, c) => a + outstanding(c), 0).toLocaleString()} outstanding`, href: "/finance?tab=receivables" });
  /* membership */
  for (const m of db.members.filter((x) => x.status === "pending_approval")) T({ id: "apr-" + m.id, module: "membership", level: "soon", icon: "FileCheck2", title: `Approve application ${m.id}`, detail: db.customers.find((c) => c.id === m.customerId)?.name, href: "/membership?member=" + m.id, action: { kind: "approve_member", label: "Approve & activate", id: m.id } });
  for (const m of db.members.filter((x) => x.status === "applicant")) T({ id: "doc-" + m.id, module: "membership", level: "later", icon: "FileClock", title: `Complete documents for ${m.id}`, detail: db.customers.find((c) => c.id === m.customerId)?.name, href: "/membership?member=" + m.id });
  const ren = db.members.filter((m) => m.status === "expired" || (m.status === "active" && m.expiryDate && diffDays(m.expiryDate, today) <= 14)); if (ren.length) T({ id: "ren", module: "membership", level: "later", icon: "CalendarClock", title: `${ren.length} membership renewal(s) due`, href: "/membership?tab=renewals" });
  /* course */
  for (const w of db.workOrders.filter((x) => x.priority === "urgent" && x.status !== "completed")) T({ id: "urg-" + w.id, module: "course", level: "now", icon: "Siren", title: `Urgent: ${w.code} ${w.location}`, detail: w.description.slice(0, 80), href: "/maintenance" });
  for (const w of db.workOrders.filter((x) => x.status === "for_inspection" && !x.cartId)) T({ id: "wi-" + w.id, module: "course", level: "soon", icon: "SearchCheck", title: `Inspect ${w.code} — ${w.location}`, detail: w.description.slice(0, 70), href: "/maintenance" });
  const over = db.workOrders.filter((x) => x.status !== "completed" && x.targetDate < today && x.priority !== "urgent"); if (over.length) T({ id: "over", module: "course", level: "soon", icon: "CalendarX", title: `${over.length} work order(s) past target date`, href: "/maintenance" });
  const rec = db.recurring.filter((r) => r.active && r.nextDue <= today); if (rec.length) T({ id: "rec", module: "course", level: "soon", icon: "Repeat", title: `${rec.length} recurring task(s) due today`, detail: rec.map((r) => r.title).slice(0, 2).join(", "), href: "/maintenance", action: { kind: "generate_recurring", label: "Generate work orders" } });
  /* café & range */
  for (const t of db.cafeTabs.filter((x) => x.status === "open")) { const un = t.lines.filter((l) => l.fulfil !== "served"); if (un.length) T({ id: "caf-" + t.id, module: "cafe", level: minsBetween(un[0].at, db.meta.now) > 15 ? "now" : "soon", icon: "Coffee", title: `${un.length} item(s) not served — ${t.label}`, detail: `${t.no} · ordered ${minsBetween(un[0].at, db.meta.now)} min ago`, href: "/pos" }); }
  for (const t of db.rangeTabs.filter((x) => x.status === "open" && minsBetween(x.openedAt, db.meta.now) >= 90)) T({ id: "rng-" + t.id, module: "cafe", level: "soon", icon: "Target", title: `${t.name} has been at the range ${minsBetween(t.openedAt, db.meta.now)} min`, detail: "Check if they are ready to bill out", href: "/range" });
  const low = lowStock(db); if (low.length) T({ id: "low", module: "cafe", level: "soon", icon: "PackageMinus", title: `${low.length} item(s) at or below reorder level`, detail: low.slice(0, 3).map((i) => i.name).join(", "), href: "/inventory" });
  /* events */
  for (const e of db.events.filter((x) => x.status === "confirmed" && x.date >= today && diffDays(x.date, today) <= 14)) {
    const regs = e.registrations.filter((r) => r.status === "registered"); const unpaid = regs.filter((r) => { const c = db.charges.find((x) => x.id === r.chargeId); return c && outstanding(c) > 0; }).length;
    if (unpaid) T({ id: "evp-" + e.id, module: "events", level: "soon", icon: "Receipt", title: `${unpaid} unpaid registration(s) — ${e.name}`, detail: `Event ${e.date}`, href: "/events" });
    if (e.type === "tournament" && regs.length && e.flights.length === 0) T({ id: "evf-" + e.id, module: "events", level: "soon", icon: "Users", title: `Assign flights — ${e.name}`, detail: `${regs.length} players registered`, href: "/events" });
  }
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level] || (a.at ?? "99:99").localeCompare(b.at ?? "99:99"));
}

/** Tasks relevant to a role; inline actions are only offered when the role may perform them. */
export function tasksForRole(db: DB, role: RoleId): Task[] {
  const mods = ROLE_MODULES[role]; const all = computeTasks(db); const mine = mods === "all" ? all : all.filter((t) => mods.includes(t.module));
  return mine.map((t) => (t.action && !hasPerm(db, { role, actor: "", bypass: false }, ACTION_PERM[t.action.kind]) ? { ...t, action: undefined } : t));
}

/** Executes an inline task action through the permission-checked services. */
export function runTask(db: DB, ctx: Ctx, a: TaskAction): string {
  const id = a.id ?? "";
  switch (a.kind) {
    case "release_flight": Fl.startRound(db, ctx, id); return "Flight released — start time recorded";
    case "mark_ready": Fl.markReady(db, ctx, id); return "Flight marked ready";
    case "complete_round": Fl.completeRound(db, ctx, id); return "Round completed — caddies and carts returned";
    case "assign_caddie": Cd.assignCaddie(db, ctx, { bookingId: id }); return "Next caddie in rotation assigned";
    case "release_caddie": Cd.releaseToQueue(db, ctx, id); return "Caddie released to the queue";
    case "settle_caddie": Cd.settleCaddie(db, ctx, id); return "Settlement recorded";
    case "assign_cart": { const c = bestCart(db); if (!c) fail("No carts are available."); Ct.assignCart(db, ctx, id, c.id); return `Cart #${c.no} reserved`; }
    case "dispatch_cart": Ct.dispatchCart(db, ctx, id); return "Cart dispatched";
    case "pass_inspection": Ct.passInspection(db, ctx, id); return "Cart passed inspection — available";
    case "confirm_booking": Bk.confirmBooking(db, ctx, id); return "Reservation confirmed — SMS simulated";
    case "open_shift": Fn.openShiftFor(db, ctx, 5000); return "Cashier shift opened";
    case "approve_member": Ms.approveMember(db, ctx, id); return "Member approved & activated";
    case "generate_recurring": { const r = Mt.generateRecurring(db, ctx, 0); return `${r.length} recurring work order(s) generated`; }
  }
}
void addMinTs;
