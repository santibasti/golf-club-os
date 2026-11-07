import type { DB, Permission, RoleId } from "./types";

/** DEMO ONLY: the role switcher is not authentication. In production, enforce these server-side (Postgres RLS + API guards). */
export const ROLES: { id: RoleId; label: string; short: string; user: string; home: string; blurb: string }[] = [
  { id: "system_admin", label: "System Administrator", short: "Sys Admin", user: "Ramon Dela Cruz", home: "/", blurb: "Full access, configuration, roles, audit." },
  { id: "owner", label: "Club Owner / Board", short: "Owner / Board", user: "Atty. Lourdes Villanueva", home: "/", blurb: "Executive view, approvals, financial oversight." },
  { id: "gm", label: "General Manager", short: "GM", user: "Eduardo Santiago", home: "/", blurb: "All operations, approvals, write-offs, closures." },
  { id: "golf_ops", label: "Golf Operations Manager", short: "Golf Ops Mgr", user: "Marco Reyes", home: "/golf-operations", blurb: "Tee sheet, flights, caddies, carts, starter." },
  { id: "membership", label: "Membership Officer", short: "Membership", user: "Carmela Bautista", home: "/membership", blurb: "Applications, plans, dues, renewals." },
  { id: "reservations", label: "Reservations Officer", short: "Reservations", user: "Jenny Alcantara", home: "/reservations", blurb: "Tee-time bookings, waitlist, check-in." },
  { id: "caddie_master", label: "Caddie Master", short: "Caddie Master", user: "Rodel Manalo", home: "/caddies", blurb: "Attendance, rotation, assignments, settlements." },
  { id: "starter", label: "Starter / Course Marshal", short: "Starter", user: "Danilo Pascual", home: "/check-in", blurb: "Release flights, pace of play, incidents." },
  { id: "cart_supervisor", label: "Golf Cart Supervisor", short: "Cart Supervisor", user: "Nestor Aguilar", home: "/carts", blurb: "Cart dispatch, returns, inspection." },
  { id: "superintendent", label: "Course Superintendent", short: "Superintendent", user: "Engr. Felix Tolentino", home: "/maintenance", blurb: "Course condition, work orders, closures." },
  { id: "maintenance", label: "Maintenance Staff", short: "Maintenance", user: "Joel Mercado", home: "/maintenance", blurb: "Update work orders, log labor and materials." },
  { id: "cashier", label: "Cashier / Finance Officer", short: "Cashier / Finance", user: "Maricel Ocampo", home: "/finance", blurb: "Payments, shifts, receivables, refunds." },
  { id: "cafe", label: "Café Manager / POS Staff", short: "Café / POS", user: "Grace Domingo", home: "/pos", blurb: "POS, café stock, range sales." },
  { id: "tournament", label: "Tournament Coordinator", short: "Tournaments", user: "Patrick Lim", home: "/events", blurb: "Events, registrations, flights, scoring." },
  { id: "member", label: "Member / Golfer", short: "Member / Golfer", user: "Portal user", home: "/portal", blurb: "Self-service portal (mobile-first)." },
];
export const roleLabel = (r: RoleId | "system") => (r === "system" ? "System" : ROLES.find((x) => x.id === r)?.label ?? r);

export const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  ...["dashboard", "golfops", "membership", "reservations", "checkin", "caddies", "carts", "maintenance", "range", "pos", "events", "finance", "inventory", "reports", "admin"].map((k) => ({ key: `view.${k}`, label: `View ${k}`, group: "Module access" })),
  { key: "membership.edit", label: "Create / edit members & applications", group: "Membership" },
  { key: "membership.approve", label: "Approve applications", group: "Membership" },
  { key: "membership.suspend", label: "Suspend / reinstate members", group: "Membership" },
  { key: "membership.billing", label: "Run dues billing & renewals", group: "Membership" },
  { key: "booking.create", label: "Create bookings", group: "Reservations" },
  { key: "booking.edit", label: "Edit / reschedule / cancel bookings", group: "Reservations" },
  { key: "booking.override", label: "Override booking windows & rules", group: "Reservations" },
  { key: "checkin.manage", label: "Check-in / no-show", group: "Front desk" },
  { key: "starter.manage", label: "Starter actions (ready, release, pace)", group: "Starter" },
  { key: "caddie.manage", label: "Caddie attendance & assignment", group: "Caddies" },
  { key: "caddie.override", label: "Override caddie rotation", group: "Caddies" },
  { key: "caddie.settle", label: "Settle caddie payables", group: "Caddies" },
  { key: "cart.manage", label: "Dispatch & return carts", group: "Carts" },
  { key: "cart.maintenance", label: "Cart maintenance & release to service", group: "Carts" },
  { key: "course.manage", label: "Create / update work orders", group: "Maintenance" },
  { key: "course.inspect", label: "Inspect & complete work orders", group: "Maintenance" },
  { key: "course.closure", label: "Create / lift course restrictions", group: "Maintenance" },
  { key: "range.sell", label: "Range sales", group: "Range" },
  { key: "pos.sell", label: "Café POS sales", group: "POS" },
  { key: "pos.discount", label: "POS discounts above staff limit", group: "POS" },
  { key: "pos.void", label: "Void / refund POS orders", group: "POS" },
  { key: "event.manage", label: "Manage events & scoring", group: "Events" },
  { key: "finance.payment", label: "Record payments & charges", group: "Finance" },
  { key: "finance.refund", label: "Issue refunds", group: "Finance" },
  { key: "finance.writeoff", label: "Write off receivables", group: "Finance" },
  { key: "finance.shift", label: "Open / close cashier shifts", group: "Finance" },
  { key: "inventory.manage", label: "Adjust inventory & assets", group: "Inventory" },
  { key: "admin.settings", label: "Change club settings", group: "Administration" },
  { key: "admin.roles", label: "Edit role permissions", group: "Administration" },
  { key: "admin.audit", label: "View audit logs", group: "Administration" },
];
const ALL = ALL_PERMISSIONS.map((p) => p.key);
const v = (...m: string[]) => m.map((x) => `view.${x}`);

export const DEFAULT_ROLE_PERMS: Record<RoleId, Permission[]> = {
  system_admin: ALL,
  owner: [...v("dashboard", "golfops", "membership", "reservations", "checkin", "caddies", "carts", "maintenance", "range", "pos", "events", "finance", "inventory", "reports", "admin"), "membership.approve", "finance.writeoff", "finance.refund", "course.closure", "admin.audit"],
  gm: ALL.filter((p) => !["admin.roles"].includes(p)),
  golf_ops: [...v("dashboard", "golfops", "reservations", "checkin", "caddies", "carts", "maintenance", "range", "events", "reports", "inventory"), "booking.create", "booking.edit", "booking.override", "checkin.manage", "starter.manage", "caddie.manage", "caddie.override", "caddie.settle", "cart.manage", "cart.maintenance", "course.closure", "range.sell", "event.manage"],
  membership: [...v("dashboard", "membership", "reservations", "finance", "reports"), "membership.edit", "membership.billing", "booking.create"],
  reservations: [...v("dashboard", "reservations", "checkin", "membership", "golfops"), "booking.create", "booking.edit", "checkin.manage"],
  caddie_master: [...v("dashboard", "caddies", "checkin", "golfops", "reports"), "caddie.manage", "caddie.override", "caddie.settle", "checkin.manage"],
  starter: [...v("dashboard", "checkin", "golfops", "reservations", "maintenance"), "starter.manage", "checkin.manage"],
  cart_supervisor: [...v("dashboard", "carts", "checkin", "golfops", "inventory", "reports"), "cart.manage", "cart.maintenance", "inventory.manage"],
  superintendent: [...v("dashboard", "maintenance", "golfops", "inventory", "reservations", "reports"), "course.manage", "course.inspect", "course.closure", "inventory.manage"],
  maintenance: [...v("maintenance", "inventory"), "course.manage"],
  cashier: [...v("dashboard", "finance", "membership", "checkin", "reports", "pos", "range"), "finance.payment", "finance.refund", "finance.shift", "checkin.manage", "pos.sell", "range.sell"],
  cafe: [...v("dashboard", "pos", "range", "inventory", "events", "reports"), "pos.sell", "pos.discount", "pos.void", "range.sell", "inventory.manage"],
  tournament: [...v("dashboard", "events", "reservations", "reports"), "event.manage", "booking.create"],
  member: [],
};

export const can = (db: DB, role: RoleId, perm: Permission) => (db.rolePerms[role] ?? []).includes(perm);

export interface NavItem { href: string; label: string; icon: string; perm: Permission }
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "LayoutDashboard", perm: "view.dashboard" },
  { href: "/golf-operations", label: "Golf Operations", icon: "Flag", perm: "view.golfops" },
  { href: "/course-map", label: "Course Map & Carts", icon: "Map", perm: "view.golfops" },
  { href: "/membership", label: "Membership", icon: "IdCard", perm: "view.membership" },
  { href: "/reservations", label: "Reservations / Tee Sheet", icon: "CalendarDays", perm: "view.reservations" },
  { href: "/check-in", label: "Check-In & Starter", icon: "ClipboardCheck", perm: "view.checkin" },
  { href: "/caddies", label: "Caddie Management", icon: "Users", perm: "view.caddies" },
  { href: "/carts", label: "Golf Cart Management", icon: "Car", perm: "view.carts" },
  { href: "/maintenance", label: "Course Maintenance", icon: "Trees", perm: "view.maintenance" },
  { href: "/range", label: "Driving Range", icon: "Target", perm: "view.range" },
  { href: "/pos", label: "Café / POS", icon: "Coffee", perm: "view.pos" },
  { href: "/events", label: "Tournament & Events", icon: "Trophy", perm: "view.events" },
  { href: "/finance", label: "Finance & Billing", icon: "Wallet", perm: "view.finance" },
  { href: "/inventory", label: "Inventory & Assets", icon: "Boxes", perm: "view.inventory" },
  { href: "/reports", label: "Reports & Analytics", icon: "BarChart3", perm: "view.reports" },
  { href: "/admin", label: "Administration", icon: "Settings", perm: "view.admin" },
];
