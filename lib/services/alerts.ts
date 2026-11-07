import type { DB } from "../types";
import { today } from "./core";
import { bookingConflicts } from "./booking";
import { flightDelayed } from "./flight";
import { lowStock } from "./inventory";
import { memberBalance, outstanding } from "./finance";
import { diffDays } from "../time";
import { allTracks } from "./tracking";

export interface Alert { id: string; level: "critical" | "warning" | "info"; type: string; title: string; detail: string; href: string }
export function computeAlerts(db: DB): Alert[] {
  const t = today(db); const out: Alert[] = [];
  for (const b of db.bookings.filter((x) => x.date === t && flightDelayed(db, x))) out.push({ id: "delay-" + b.id, level: "warning", type: "Delayed flight", title: `Flight ${b.ref} delayed`, detail: `${b.time} · ${b.contactName}`, href: "/check-in?tab=starter" });
  const mc = db.carts.filter((c) => c.status === "maintenance"); if (mc.length) out.push({ id: "carts-m", level: mc.length > 2 ? "warning" : "info", type: "Unavailable carts", title: `${mc.length} cart(s) unavailable`, detail: mc.map((c) => "#" + c.no).join(", "), href: "/carts" });
  const exp = db.members.filter((m) => (m.status === "active" && m.expiryDate && diffDays(m.expiryDate, t) <= 30) || m.status === "expired"); if (exp.length) out.push({ id: "renew", level: "info", type: "Pending renewals", title: `${exp.length} membership renewal(s) pending`, detail: "Expiring within 30 days or lapsed", href: "/membership?tab=renewals" });
  const bal = db.members.map((m) => ({ m, b: memberBalance(db, m.id) })).filter((x) => x.b > 0); const old = db.charges.filter((c) => c.memberId && outstanding(c) > 0 && diffDays(t, c.date) > 30);
  if (bal.length) out.push({ id: "bal", level: old.length ? "warning" : "info", type: "Outstanding balances", title: `${bal.length} member account(s) with balances`, detail: `${old.length} charge(s) older than 30 days`, href: "/finance?tab=receivables" });
  for (const w of db.workOrders.filter((x) => x.priority === "urgent" && x.status !== "completed")) out.push({ id: "urgent-" + w.id, level: "critical", type: "Urgent maintenance", title: `${w.code}: ${w.location}`, detail: w.description.slice(0, 70), href: "/maintenance" });
  const apps = db.members.filter((m) => m.status === "pending_approval").length, pend = db.bookings.filter((b) => b.status === "booked").length, insp = db.workOrders.filter((w) => w.status === "for_inspection").length;
  if (apps) out.push({ id: "apps", level: "info", type: "Pending approval", title: `${apps} membership application(s) awaiting approval`, detail: "Review in Membership", href: "/membership?tab=applications" });
  if (pend) out.push({ id: "pend", level: "info", type: "Pending approval", title: `${pend} online reservation(s) await confirmation`, detail: "Confirm in Reservations", href: "/reservations" });
  if (insp) out.push({ id: "insp", level: "info", type: "Pending approval", title: `${insp} work order(s) awaiting inspection`, detail: "Inspect to complete", href: "/maintenance" });
  const bc = bookingConflicts(db); if (bc.length) out.push({ id: "conf", level: "critical", type: "Booking conflict", title: `${bc.length} reservation(s) conflict with a course restriction`, detail: "Reschedule affected golfers", href: "/reservations" });
  for (const c of db.closures.filter((x) => x.active && x.date >= t)) out.push({ id: "cl-" + c.id, level: c.type === "partial" ? "info" : "warning", type: "Course restriction", title: `${c.type === "full" ? "Course closed" : c.type === "tee" ? "Tee block" : "Holes restricted"} ${c.date === t ? "today" : c.date} ${c.from}–${c.to}`, detail: c.reason, href: "/reservations" });
  const ls = lowStock(db); if (ls.length) out.push({ id: "stock", level: "warning", type: "Low stock", title: `${ls.length} item(s) at or below reorder level`, detail: ls.slice(0, 3).map((i) => i.name).join(", "), href: "/inventory" });
  for (const t of allTracks(db)) {
    if (t.hazard) out.push({ id: "geo-" + t.cartId, level: t.hazard.kind === "closed" ? "critical" : "warning", type: "Cart on restricted hole", title: `Cart #${t.no} is on hole ${t.hole} (${t.hazard.kind})`, detail: `${t.flightLabel ?? ""} — ${t.hazard.reason ?? "course restriction in effect"}`, href: "/course-map" });
    else if (t.overdue) out.push({ id: "late-" + t.cartId, level: "warning", type: "Cart overdue", title: `Cart #${t.no} still out past expected finish`, detail: t.flightLabel ?? "", href: "/course-map" });
    else if (t.zone === "course" && t.battery !== null && t.battery < 20) out.push({ id: "bat-" + t.cartId, level: "warning", type: "Low cart battery", title: `Cart #${t.no} battery ${t.battery}% on hole ${t.hole}`, detail: t.flightLabel ?? "", href: "/course-map" });
  }
  const order = { critical: 0, warning: 1, info: 2 }; return out.sort((a, b) => order[a.level] - order[b.level]);
}
