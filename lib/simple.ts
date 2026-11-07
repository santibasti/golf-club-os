/** "Simple mode" content: plain-language labels, the few menu items each role really needs, help text, and one-tap fixes for common blockers. */
import type { DB, RoleId } from "./types";
import { toMin } from "./time";
import { bookingConflicts } from "./services/booking";
import { rotationQueue, bookingAssignments, requiredCaddies } from "./services/caddie";
import { cartsFor, requiredCarts } from "./services/cart";
import { flightRequirements } from "./services/flight";
import { openShift, outstanding } from "./services/finance";
import { lowStock } from "./services/inventory";

export const SIMPLE_LABEL: Record<string, string> = {
  "/": "Home", "/golf-operations": "Course Overview", "/course-map": "Course Map", "/field": "Tablet Console", "/walk-in": "Walk-in Golfer", "/reservations": "Tee Sheet", "/check-in": "Check-in & Start",
  "/caddies": "Caddies", "/carts": "Golf Carts", "/maintenance": "Course Repairs", "/membership": "Members", "/range": "Driving Range", "/pos": "Café", "/events": "Events", "/finance": "Money & Payments",
  "/inventory": "Stock & Equipment", "/reports": "Reports", "/admin": "Settings",
};
/** The few pages each role actually uses (the rest sit under "More…"). */
export const CORE_NAV: Record<RoleId, string[]> = {
  system_admin: ["/", "/golf-operations", "/reports", "/admin"], owner: ["/", "/reports", "/finance", "/golf-operations"], gm: ["/", "/golf-operations", "/reservations", "/finance"],
  golf_ops: ["/", "/field", "/reservations", "/check-in", "/caddies", "/carts"], membership: ["/", "/membership", "/reservations"], reservations: ["/", "/walk-in", "/reservations", "/check-in"],
  caddie_master: ["/", "/field", "/caddies", "/check-in"], starter: ["/", "/field", "/check-in", "/course-map"], cart_supervisor: ["/", "/field", "/carts", "/course-map"],
  superintendent: ["/", "/maintenance", "/course-map"], maintenance: ["/", "/maintenance"], cashier: ["/", "/finance", "/pos", "/range"], cafe: ["/", "/pos", "/range", "/inventory"],
  tournament: ["/", "/events", "/reservations"], member: [],
};

/** Turns a rule violation into a one-tap fix so staff never get stuck on an error. */
export function fixFor(code?: string): { label: string; href: string } | undefined {
  switch (code) {
    case "no_shift": return { label: "Open cashier shift", href: "/finance?tab=shift" };
    case "no_caddie": return { label: "Open caddies", href: "/caddies" };
    case "requirements": return { label: "See what's missing", href: "/check-in?tab=starter" };
    case "stock": return { label: "Check stock", href: "/inventory" };
    case "credit": return { label: "View balances", href: "/finance?tab=receivables" };
    case "eligibility": return { label: "Open members", href: "/membership" };
    case "linked": return { label: "Open driving range", href: "/range" };
    case "closed": return { label: "See restrictions", href: "/reservations" };
    default: return undefined;
  }
}

export const HELP: Record<string, { title: string; steps: string[]; tip?: string }> = {
  "/": { title: "Your home screen", steps: ["Look at \"Today's tasks\". Red ones need doing now.", "Press the button on a task to do it in one tap — no need to open other screens.", "Use the big tiles at the top to jump to your main jobs.", "The red number on \"Home\" in the menu is how many tasks are waiting."], tip: "When the list says \"You're all caught up\", there is nothing to do." },
  "/walk-in": { title: "Walk-in golfer (fastest way to start a group)", steps: ["Step 1 — type who is playing and how many people.", "Step 2 — tap a tee time (the earliest is already chosen).", "Step 3 — leave caddies and carts on automatic unless they don't want them.", "Step 4 — pick how they pay, then press the gold button. Done."], tip: "If something couldn't be done (for example no cart free), the last screen tells you exactly what is left." },
  "/reservations": { title: "Tee sheet", steps: ["Each row is a tee time. Press \"Book\" on an open time to reserve it.", "Tap a booking to see it, change it, move it or cancel it.", "Someone just walked in? Use \"Walk-in wizard\" at the top."], tip: "Greyed or striped rows are closed — the reason is written on the row." },
  "/check-in": { title: "Check-in & starting a group", steps: ["Front desk tab: search the name, tap the booking, press \"Confirm arrival\".", "Starter tab: press \"Mark ready\" when everything is green, then \"Release flight\".", "Press \"Complete round\" when the group finishes."], tip: "A red item (caddie, payment, cart) tells you what is still missing." },
  "/field": { title: "Tablet console", steps: ["Pick your board at the top (Starter, Caddie or Cart).", "Press the big button on a card — that is the next thing to do.", "Press \"Fullscreen\" and \"Keep screen on\" for use outdoors."], tip: "Turn on Display ▸ Outdoor high-contrast in bright sunlight." },
  "/caddies": { title: "Caddies", steps: ["The queue shows who is next. Press \"Assign next\" on a group that needs caddies.", "Want a different caddie? Choose them — you'll be asked for a short reason.", "Caddie back from a round? Press \"Release to queue\"."], tip: "Fees are settled in the \"Fees & settlements\" tab once the customer has paid." },
  "/carts": { title: "Golf carts", steps: ["Green = ready, dark = on the course, red = broken.", "Press a cart to assign it, send it out, or take it back.", "Cart broken? Press \"Report issue\" — it is pulled from use automatically."], tip: "A cart under repair cannot be sent out until it is inspected." },
  "/course-map": { title: "Course map", steps: ["Dots on the map are the golf carts. Press one to see who is riding.", "Press \"Play\" to watch carts move (demo positions).", "Orange or red holes are restricted — carts there raise an alert."] },
  "/maintenance": { title: "Course repairs", steps: ["\"Work orders\" is the list of jobs. Press a job to update it.", "A job moves: Scheduled → Assigned → In progress → For inspection → Done.", "Need to stop play on a hole or time? Press \"Restrict course / time\"."], tip: "A repair job alone does not close the course." },
  "/range": { title: "Driving range", steps: ["Press a free bay to start a golfer's tab. Press a busy bay to see their bill.", "Add buckets or sessions as they play — nothing is charged yet.", "Press \"Bill out\" when they finish and choose how they pay."], tip: "Press \"Order food & drinks\" to add café items to the same bill." },
  "/pos": { title: "Café", steps: ["\"Running tabs\": open a tab for a table or golfer and keep adding items.", "\"Quick sale\" is for one-off orders paid straight away.", "Press \"Bill out\" on a tab when they are done."], tip: "Member? Pick them first to apply their discount or charge their account." },
  "/events": { title: "Events", steps: ["Press an event to register players and group them into flights.", "Enter scores on the \"Scoring\" tab to see the leaderboard.", "Use \"New event\" to add one; it can block the tee sheet automatically."] },
  "/membership": { title: "Members", steps: ["Search a member to see their account, privileges and history.", "New person? Press \"New application\", tick the documents, then submit.", "A manager approves applications; dues are charged automatically."], tip: "Suspended or expired members don't get member prices." },
  "/finance": { title: "Money & payments", steps: ["First thing in the day: open your cashier shift (\"Cashier shift\" tab).", "To take a payment, open the charge and press \"Record payment\".", "End of day: count the cash and press \"Close shift\"."], tip: "Refunds and write-offs need a reason and the right permission." },
  "/inventory": { title: "Stock & equipment", steps: ["\"Stock\" shows what is low (red). Press \"Receive / adjust\" when stock arrives.", "\"Asset registry\" lists equipment and who looks after it."] },
  "/reports": { title: "Reports", steps: ["Pick a report and a date range.", "Press \"Export CSV\" to open it in Excel."] },
  "/admin": { title: "Settings", steps: ["Change rules and prices in the tabs, then press \"Save settings\".", "Only change settings if you are sure — everything is recorded in the audit log."] },
  "/golf-operations": { title: "Course overview", steps: ["See flights, carts and caddies at a glance.", "Red items at the bottom need attention — press one to fix it."] },
};
export const helpFor = (path: string) => HELP[path] ?? HELP[Object.keys(HELP).filter((k) => k !== "/" && path.startsWith(k)).sort((a, b) => b.length - a.length)[0]] ?? HELP["/"];

export interface Tile { label: string; sub: string; icon: string; href: string; badge?: number; tone?: "default" | "alert" | "gold" }
/** Big buttons for a role's main jobs, with live counts. */
export function tilesFor(db: DB, role: RoleId): Tile[] {
  const today = db.meta.now.slice(0, 10), nowM = toMin(db.meta.now.slice(11, 16)); const fl = db.bookings.filter((b) => b.date === today); const arrivals = fl.filter((b) => b.status === "confirmed" && toMin(b.time) - nowM <= 45 && toMin(b.time) - nowM >= -20).length;
  const needC = fl.filter((b) => ["confirmed", "arrived", "ready"].includes(b.status) && bookingAssignments(db, b.id).length < requiredCaddies(db, b.id)).length; const needK = fl.filter((b) => ["confirmed", "arrived", "ready"].includes(b.status) && cartsFor(db, b.id).length < requiredCarts(db, b.id)).length;
  const atTee = fl.filter((b) => ["arrived", "ready"].includes(b.status)).length; const onCourse = fl.filter((b) => b.status === "started").length;
  const due = fl.filter((b) => ["arrived", "ready", "started"].includes(b.status)).reduce((a, b) => a + db.charges.filter((c) => c.bookingId === b.id && c.billTo === "counter").reduce((s, c) => s + outstanding(c), 0), 0);
  const blocked = fl.filter((b) => b.status === "arrived" && flightRequirements(db, b).some((r) => r.blocking && !r.ok)).length;
  const T = (label: string, sub: string, icon: string, href: string, badge?: number, tone: Tile["tone"] = "default"): Tile => ({ label, sub, icon, href, badge, tone });
  switch (role) {
    case "reservations": return [T("Walk-in golfer", "Book, check in & ready in one go", "Footprints", "/walk-in", undefined, "gold"), T("Check in arrivals", "Groups arriving soon", "ClipboardCheck", "/check-in", arrivals), T("Tee sheet", "See & book tee times", "CalendarDays", "/reservations"), T("Online requests", "Waiting for you to confirm", "Hourglass", "/reservations", db.bookings.filter((b) => b.status === "booked").length)];
    case "starter": return [T("Release groups", "Groups waiting at the tee", "Flag", "/field", atTee, "gold"), T("Needs attention", "Groups missing something", "TriangleAlert", "/check-in?tab=starter", blocked, blocked ? "alert" : "default"), T("On the course", "Groups playing now", "Route", "/course-map", onCourse), T("Check in", "Front desk check-in", "ClipboardCheck", "/check-in", arrivals)];
    case "caddie_master": return [T("Assign caddies", "Groups that need caddies", "Users", "/field", needC, needC ? "gold" : "default"), T("Caddie queue", "Caddies available now", "ListOrdered", "/caddies", rotationQueue(db).length), T("Time-in", "Caddies who arrived", "UserCheck", "/caddies"), T("Pay caddies", "Settlements ready", "Handshake", "/caddies", db.caddieSettlements.filter((s) => s.status === "pending").length)];
    case "cart_supervisor": return [T("Assign carts", "Groups that need carts", "Car", "/field", needK, needK ? "gold" : "default"), T("Carts ready", "Available now", "CircleCheck", "/carts", db.carts.filter((c) => c.status === "available").length), T("Inspect carts", "Returned, to check", "SearchCheck", "/carts", db.carts.filter((c) => ["returned", "inspection"].includes(c.status)).length), T("Broken carts", "Under repair", "Wrench", "/carts", db.carts.filter((c) => c.status === "maintenance").length, "alert")];
    case "cashier": return [T("Take payment", "Money due at the counter", "Banknote", "/finance?tab=charges", Math.round(due), due ? "gold" : "default"), T("Cashier shift", openShift(db) ? "Shift is open" : "Open your shift first", "Landmark", "/finance?tab=shift", openShift(db) ? undefined : 1, openShift(db) ? "default" : "alert"), T("Café", "Take an order", "Coffee", "/pos"), T("Driving range", "Bill a golfer out", "Target", "/range", db.rangeTabs.filter((t) => t.status === "open").length)];
    case "cafe": return [T("Café tabs", "Open orders to serve or bill", "Coffee", "/pos", db.cafeTabs.filter((t) => t.status === "open").length, "gold"), T("Driving range", "Start or bill a golfer", "Target", "/range", db.rangeTabs.filter((t) => t.status === "open").length), T("Low stock", "Items to reorder", "PackageMinus", "/inventory", lowStock(db).length, lowStock(db).length ? "alert" : "default"), T("Quick sale", "One-off order, pay now", "ShoppingBasket", "/pos")];
    case "membership": return [T("New member", "Start an application", "UserPlus", "/membership", undefined, "gold"), T("Approvals", "Applications waiting", "FileCheck2", "/membership?tab=applications", db.members.filter((m) => ["applicant", "pending_approval"].includes(m.status)).length), T("Renewals", "Expiring or expired", "CalendarClock", "/membership?tab=renewals", db.members.filter((m) => m.status === "expired").length), T("Find a member", "Search by name or ID", "Search", "/membership")];
    case "superintendent": case "maintenance": return [T("Urgent jobs", "Fix these first", "Siren", "/maintenance", db.workOrders.filter((w) => w.priority === "urgent" && w.status !== "completed").length, "alert"), T("My jobs", "Open work orders", "Wrench", "/maintenance", db.workOrders.filter((w) => w.status !== "completed").length, "gold"), T("To inspect", "Marked repaired", "SearchCheck", "/maintenance", db.workOrders.filter((w) => w.status === "for_inspection").length), T("Course map", "See the course", "Map", "/course-map")];
    case "tournament": return [T("Events", "Upcoming & past", "Trophy", "/events", db.events.filter((e) => e.date >= today && e.status !== "cancelled").length, "gold"), T("Tee sheet", "See & book tee times", "CalendarDays", "/reservations"), T("Clashes", "Bookings blocked by an event", "OctagonAlert", "/reservations", bookingConflicts(db).length)];
    case "golf_ops": return [T("Tablet console", "Starter, caddies & carts", "Tablet", "/field", undefined, "gold"), T("Needs attention", "Groups missing something", "TriangleAlert", "/check-in?tab=starter", blocked, blocked ? "alert" : "default"), T("Tee sheet", "See & book tee times", "CalendarDays", "/reservations"), T("Walk-in golfer", "Book & check in fast", "Footprints", "/walk-in")];
    default: return [];
  }
}
