import type { DB } from "../types";
import { addDays, dateRange, diffDays, fmtShort } from "../time";
import { DEPTS, Range, deptLabel, financeTotals, inRange, playerMix, revenueByDept, roundsBooked, roundsStarted, totalRevenue, utilization } from "./metrics";
import { chargeNet, outstanding, shiftCash, agingBucket } from "./finance";
import { r2 } from "../format";
import { memberLedger } from "./membership";

export type Cell = string | number;
export interface ReportResult {
  kpis: { label: string; value: string }[];
  chart?: { type: "bar" | "line" | "pie"; xKey: string; series: { key: string; label: string }[]; data: Record<string, string | number>[] };
  columns: string[]; rows: Cell[][]; notes?: string;
}
export interface ReportDef { id: string; title: string; description: string; build: (db: DB, r: Range) => ReportResult }

export function resolveRange(key: "today" | "yesterday" | "7d" | "month" | "custom", today: string, custom?: Range): Range {
  switch (key) {
    case "today": return { from: today, to: today };
    case "yesterday": return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d": return { from: addDays(today, -6), to: today };
    case "month": return { from: today.slice(0, 8) + "01", to: today };
    default: return custom && custom.from <= custom.to ? custom : { from: today, to: today };
  }
}
const days = (r: Range) => { if (diffDays(r.to, r.from) > 92) return dateRange(addDays(r.to, -92), r.to); return dateRange(r.from, r.to); };
const P = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");
const pctS = (n: number) => `${Math.round(n * 100)}%`;

export const REPORTS: ReportDef[] = [
  { id: "rounds", title: "Golf rounds summary", description: "Reservations vs rounds actually started and completed (different records).", build: (db, r) => {
    const rows = days(r).map((d) => { const bs = db.bookings.filter((b) => b.date === d); const live = bs.filter((b) => !["cancelled", "no_show"].includes(b.status));
      return [d, bs.length, live.reduce((a, b) => a + b.players.length, 0), bs.filter((b) => ["started", "completed"].includes(b.status)).reduce((a, b) => a + b.players.length, 0), bs.filter((b) => b.status === "completed").reduce((a, b) => a + b.players.length, 0), bs.filter((b) => b.status === "cancelled").length, bs.filter((b) => b.status === "no_show").length] as Cell[]; });
    return { kpis: [{ label: "Players booked", value: String(roundsBooked(db, r)) }, { label: "Rounds started", value: String(roundsStarted(db, r)) }, { label: "Cancelled", value: String(rows.reduce((a, x) => a + Number(x[5]), 0)) }, { label: "No-shows", value: String(rows.reduce((a, x) => a + Number(x[6]), 0)) }],
      chart: { type: "bar", xKey: "date", series: [{ key: "booked", label: "Players booked" }, { key: "started", label: "Rounds started" }], data: rows.map((x) => ({ date: fmtShort(String(x[0])), booked: Number(x[2]), started: Number(x[3]) })) },
      columns: ["Date", "Reservations", "Players booked", "Players started", "Players completed", "Cancelled", "No-shows"], rows };
  } },
  { id: "teesheet", title: "Tee sheet utilization", description: "Occupied vs available (non-blocked) tee slots.", build: (db, r) => {
    const rows = days(r).map((d) => { const u = utilization(db, d); return [d, u.slots, u.used, u.closed, pctS(u.pct)] as Cell[]; });
    const slots = rows.reduce((a, x) => a + Number(x[1]), 0), used = rows.reduce((a, x) => a + Number(x[2]), 0);
    return { kpis: [{ label: "Available slots", value: String(slots) }, { label: "Used slots", value: String(used) }, { label: "Utilization", value: pctS(slots ? used / slots : 0) }], chart: { type: "line", xKey: "date", series: [{ key: "util", label: "Utilization %" }], data: rows.map((x) => ({ date: fmtShort(String(x[0])), util: Math.round((Number(x[2]) / Math.max(1, Number(x[1]))) * 100) })) }, columns: ["Date", "Available slots", "Booked slots", "Blocked slots", "Utilization"], rows };
  } },
  { id: "mix", title: "Member vs public player volume", description: "Players on non-cancelled reservations by type.", build: (db, r) => {
    const rows = days(r).map((d) => { const m = playerMix(db, { from: d, to: d }); return [d, m.member, m.guest, m.public, m.member + m.guest + m.public] as Cell[]; }); const t = playerMix(db, r);
    return { kpis: [{ label: "Members", value: String(t.member) }, { label: "Guests", value: String(t.guest) }, { label: "Public", value: String(t.public) }], chart: { type: "bar", xKey: "date", series: [{ key: "member", label: "Member" }, { key: "guest", label: "Guest" }, { key: "public", label: "Public" }], data: rows.map((x) => ({ date: fmtShort(String(x[0])), member: Number(x[1]), guest: Number(x[2]), public: Number(x[3]) })) }, columns: ["Date", "Members", "Guests", "Public", "Total"], rows };
  } },
  { id: "revenue", title: "Daily revenue", description: "Net club revenue (accrual, by charge date) vs cash collected (by payment date).", build: (db, r) => {
    const rows = days(r).map((d) => { const f = financeTotals(db, { from: d, to: d }); return [d, f.gross, f.discounts, f.refunds, f.payables, f.netRevenue, f.cashCollected] as Cell[]; }); const f = financeTotals(db, r);
    return { kpis: [{ label: "Net revenue", value: P(f.netRevenue) }, { label: "Cash collected", value: P(f.cashCollected) }, { label: "Billed to member accounts", value: P(f.billedOnAccount) }, { label: "Caddie payables (not revenue)", value: P(f.payables) }], chart: { type: "line", xKey: "date", series: [{ key: "rev", label: "Net revenue" }, { key: "cash", label: "Cash collected" }], data: rows.map((x) => ({ date: fmtShort(String(x[0])), rev: Number(x[5]), cash: Number(x[6]) })) }, columns: ["Date", "Gross charges", "Discounts", "Refunds", "Third-party payables", "Net revenue", "Cash collected"], rows, notes: "Unpaid and member-account charges count as revenue when charged, never as cash until paid." };
  } },
  { id: "dept", title: "Revenue by department", description: "Net revenue per department for the period.", build: (db, r) => {
    const rv = revenueByDept(db, r); const total = totalRevenue(db, r);
    const rows = DEPTS.map((d) => { const ch = db.charges.filter((c) => c.dept === d.id && inRange(c.date, r) && c.status !== "voided"); return [d.label, ch.length, r2(ch.reduce((a, c) => a + c.amount, 0)), r2(ch.reduce((a, c) => a + c.discount, 0)), r2(ch.reduce((a, c) => a + c.refunded, 0)), rv[d.id], total ? pctS(rv[d.id] / total) : "0%"] as Cell[]; });
    return { kpis: [{ label: "Net revenue", value: P(total) }], chart: { type: "pie", xKey: "name", series: [{ key: "value", label: "Revenue" }], data: DEPTS.map((d) => ({ name: d.label, value: rv[d.id] })).filter((x) => x.value > 0) }, columns: ["Department", "Charges", "Gross", "Discounts", "Refunds", "Net revenue", "Share"], rows };
  } },
  { id: "membership", title: "Membership activity", description: "Applications, approvals, renewals and status changes in the period.", build: (db, r) => {
    const rows: Cell[][] = []; for (const m of db.members) for (const h of m.history) if (inRange(h.at.slice(0, 10), r)) rows.push([h.at.slice(0, 10), m.id, db.customers.find((c) => c.id === m.customerId)?.name ?? "", db.plans.find((p) => p.id === m.planId)?.name ?? "", h.text, h.by]);
    rows.sort((a, b) => String(b[0]).localeCompare(String(a[0]))); const st: Record<string, number> = {}; for (const m of db.members) st[m.status] = (st[m.status] ?? 0) + 1;
    return { kpis: Object.entries(st).map(([k, v]) => ({ label: k.replace("_", " "), value: String(v) })), chart: { type: "bar", xKey: "status", series: [{ key: "count", label: "Members" }], data: Object.entries(st).map(([k, v]) => ({ status: k.replace("_", " "), count: v })) }, columns: ["Date", "Member ID", "Name", "Plan", "Activity", "By"], rows };
  } },
  { id: "receivables", title: "Membership receivables", description: "Outstanding member account balances with aging (as of today).", build: (db) => {
    const rows = db.members.map((m) => { const cs = db.charges.filter((c) => c.memberId === m.id && outstanding(c) > 0); const b: Record<string, number> = { current: 0, "31-60": 0, "61-90": 0, "90+": 0 }; for (const c of cs) b[agingBucket(db, c)] += outstanding(c); const tot = cs.reduce((a, c) => a + outstanding(c), 0); return [m.id, db.customers.find((c) => c.id === m.customerId)?.name ?? "", m.status, r2(b.current), r2(b["31-60"]), r2(b["61-90"]), r2(b["90+"]), r2(tot)] as Cell[]; }).filter((x) => Number(x[7]) > 0).sort((a, b) => Number(b[7]) - Number(a[7]));
    const tot = rows.reduce((a, x) => a + Number(x[7]), 0);
    return { kpis: [{ label: "Accounts with balance", value: String(rows.length) }, { label: "Total receivable", value: P(tot) }, { label: "Over 30 days", value: P(rows.reduce((a, x) => a + Number(x[4]) + Number(x[5]) + Number(x[6]), 0)) }], chart: { type: "bar", xKey: "bucket", series: [{ key: "amt", label: "Amount" }], data: ["Current", "31-60", "61-90", "90+"].map((k, i) => ({ bucket: k, amt: rows.reduce((a, x) => a + Number(x[3 + i]), 0) })) }, columns: ["Member", "Name", "Status", "Current", "31–60", "61–90", "90+", "Total"], rows, notes: "Aging is not date-range filtered: it always reflects today's receivables." };
  } },
  { id: "caddie_att", title: "Caddie attendance", description: "Attendance records by caddie.", build: (db, r) => {
    const rows = db.caddies.map((c) => { const a = db.caddieAttendance.filter((x) => x.caddieId === c.id && inRange(x.date, r)); return [c.id, c.name, c.classification, a.filter((x) => ["present", "late"].includes(x.status)).length, a.filter((x) => x.status === "late").length, a.filter((x) => x.status === "absent").length, a.filter((x) => x.status === "day_off").length] as Cell[]; }).filter((x) => Number(x[3]) + Number(x[5]) + Number(x[6]) > 0).sort((a, b) => Number(b[3]) - Number(a[3]));
    return { kpis: [{ label: "Caddies with records", value: String(rows.length) }, { label: "Days present", value: String(rows.reduce((a, x) => a + Number(x[3]), 0)) }, { label: "Absences", value: String(rows.reduce((a, x) => a + Number(x[5]), 0)) }], chart: { type: "bar", xKey: "name", series: [{ key: "present", label: "Days present" }], data: rows.slice(0, 15).map((x) => ({ name: String(x[1]).split(" ")[0], present: Number(x[3]) })) }, columns: ["ID", "Caddie", "Class", "Days present", "Late", "Absent", "Day-off"], rows };
  } },
  { id: "caddie_rot", title: "Caddie rotation & utilization", description: "Rounds, earnings and manual exceptions per caddie.", build: (db, r) => {
    const rows = db.caddies.map((c) => { const as = db.caddieAssignments.filter((a) => a.caddieId === c.id && inRange(a.date, r) && a.status === "completed"); const ev = db.rotationEvents.filter((e) => e.caddieId === c.id && inRange(e.at.slice(0, 10), r)); return [c.id, c.name, as.length, r2(as.reduce((a, x) => a + x.fee + x.special + x.extra, 0)), r2(as.reduce((a, x) => a + x.tip, 0)), ev.filter((e) => e.type === "preferred").length, ev.filter((e) => e.type === "override").length] as Cell[]; }).filter((x) => Number(x[2]) > 0 || Number(x[5]) + Number(x[6]) > 0).sort((a, b) => Number(b[2]) - Number(a[2]));
    const ex = db.rotationEvents.filter((e) => inRange(e.at.slice(0, 10), r) && ["override", "preferred"].includes(e.type)).length;
    return { kpis: [{ label: "Completed assignments", value: String(rows.reduce((a, x) => a + Number(x[2]), 0)) }, { label: "Manual exceptions", value: String(ex) }, { label: "Fees", value: P(rows.reduce((a, x) => a + Number(x[3]), 0)) }], chart: { type: "bar", xKey: "name", series: [{ key: "rounds", label: "Rounds" }], data: rows.slice(0, 15).map((x) => ({ name: String(x[1]).split(" ")[0], rounds: Number(x[2]) })) }, columns: ["ID", "Caddie", "Rounds", "Fees", "Tips", "Preferred requests", "Overrides"], rows };
  } },
  { id: "carts", title: "Golf cart utilization", description: "Dispatches and rental revenue per cart.", build: (db, r) => {
    const rows = db.carts.map((c) => { const ds = db.cartDispatches.filter((d) => d.cartId === c.id && inRange(d.date, r) && d.status !== "cancelled"); const mins = ds.reduce((a, d) => a + (d.dispatchedAt && d.returnedAt ? (new Date(d.returnedAt).getTime() - new Date(d.dispatchedAt).getTime()) / 60000 : 0), 0); return [`#${c.no}`, c.type, c.status.replace("_", " "), ds.length, Math.round(mins / 6) / 10, r2(ds.reduce((a, d) => a + d.fee, 0))] as Cell[]; }).sort((a, b) => Number(b[3]) - Number(a[3]));
    return { kpis: [{ label: "Dispatches", value: String(rows.reduce((a, x) => a + Number(x[3]), 0)) }, { label: "Rental revenue", value: P(rows.reduce((a, x) => a + Number(x[5]), 0)) }, { label: "Idle carts", value: String(rows.filter((x) => Number(x[3]) === 0).length) }], chart: { type: "bar", xKey: "cart", series: [{ key: "n", label: "Dispatches" }], data: rows.map((x) => ({ cart: String(x[0]), n: Number(x[3]) })) }, columns: ["Cart", "Type", "Status now", "Dispatches", "Hours in use", "Rental fees"], rows };
  } },
  { id: "maint", title: "Maintenance productivity", description: "Work orders by category: raised, completed, cost.", build: (db, r) => {
    const cats = [...new Set(db.workOrders.map((w) => w.category))];
    const rows = cats.map((c) => { const all = db.workOrders.filter((w) => w.category === c); const created = all.filter((w) => inRange(w.createdAt.slice(0, 10), r)); const done = all.filter((w) => w.completedAt && inRange(w.completedAt.slice(0, 10), r)); const avg = done.length ? done.reduce((a, w) => a + diffDays(w.completedAt!.slice(0, 10), w.startDate), 0) / done.length : 0; return [c, created.length, done.length, all.filter((w) => w.status !== "completed").length, Math.round(avg * 10) / 10, r2(done.reduce((a, w) => a + w.estCost, 0)), r2(done.reduce((a, w) => a + w.actualCost, 0))] as Cell[]; });
    return { kpis: [{ label: "Raised", value: String(rows.reduce((a, x) => a + Number(x[1]), 0)) }, { label: "Completed", value: String(rows.reduce((a, x) => a + Number(x[2]), 0)) }, { label: "Open now", value: String(rows.reduce((a, x) => a + Number(x[3]), 0)) }], chart: { type: "bar", xKey: "cat", series: [{ key: "raised", label: "Raised" }, { key: "done", label: "Completed" }], data: rows.map((x) => ({ cat: String(x[0]).slice(0, 10), raised: Number(x[1]), done: Number(x[2]) })) }, columns: ["Category", "Raised", "Completed", "Open (all time)", "Avg days to complete", "Est. cost (completed)", "Actual cost (completed)"], rows };
  } },
  { id: "cafe", title: "Café sales", description: "POS orders (net of voids).", build: (db, r) => {
    const rows = days(r).map((d) => { const os = db.posOrders.filter((o) => o.date === d); const ok = os.filter((o) => o.fulfil !== "void"); return [d, ok.length, ok.reduce((a, o) => a + o.items.reduce((s, i) => s + i.qty, 0), 0), r2(ok.reduce((a, o) => a + o.subtotal, 0)), r2(ok.reduce((a, o) => a + o.discount, 0)), r2(ok.reduce((a, o) => a + o.total, 0)), os.length - ok.length, r2(ok.filter((o) => o.method === "member_account").reduce((a, o) => a + o.total, 0))] as Cell[]; });
    const items: Record<string, number> = {}; for (const o of db.posOrders) if (inRange(o.date, r) && o.fulfil !== "void") for (const i of o.items) items[i.name] = (items[i.name] ?? 0) + i.qty; const top = Object.entries(items).sort((a, b) => b[1] - a[1])[0];
    return { kpis: [{ label: "Net sales", value: P(rows.reduce((a, x) => a + Number(x[5]), 0)) }, { label: "Orders", value: String(rows.reduce((a, x) => a + Number(x[1]), 0)) }, { label: "Top item", value: top ? `${top[0]} (${top[1]})` : "—" }], chart: { type: "bar", xKey: "date", series: [{ key: "sales", label: "Net sales" }], data: rows.map((x) => ({ date: fmtShort(String(x[0])), sales: Number(x[5]) })) }, columns: ["Date", "Orders", "Items", "Gross", "Discounts", "Net sales", "Voided", "On member account"], rows, notes: "Receipt previews are not BIR-compliant official invoices." };
  } },
  { id: "range", title: "Driving range sales", description: "Buckets, sessions and range revenue.", build: (db, r) => {
    const rows = days(r).map((d) => { const ss = db.rangeSales.filter((s) => s.date === d); const q = (code: string) => ss.reduce((a, s) => a + s.items.filter((i) => i.code.startsWith(code)).reduce((x, i) => x + i.qty, 0), 0); return [d, ss.length, q("BKT"), q("SES"), r2(ss.reduce((a, s) => a + s.discount, 0)), r2(ss.reduce((a, s) => a + s.amount, 0))] as Cell[]; });
    return { kpis: [{ label: "Range revenue", value: P(rows.reduce((a, x) => a + Number(x[5]), 0)) }, { label: "Sales", value: String(rows.reduce((a, x) => a + Number(x[1]), 0)) }], chart: { type: "bar", xKey: "date", series: [{ key: "amt", label: "Revenue" }], data: rows.map((x) => ({ date: fmtShort(String(x[0])), amt: Number(x[5]) })) }, columns: ["Date", "Sales", "Buckets", "Bay sessions (30m)", "Member discounts", "Net sales"], rows };
  } },
  { id: "events", title: "Tournament / event performance", description: "Registrations and event income.", build: (db, r) => {
    const rows = db.events.filter((e) => inRange(e.date, r)).map((e) => { const regs = e.registrations.filter((x) => x.status === "registered"); const ch = regs.map((x) => db.charges.find((c) => c.id === x.chargeId)).filter(Boolean) as typeof db.charges; const cat = db.charges.filter((c) => c.refType === "event_catering" && c.refId === e.id); return [e.date, e.name, e.type, e.status, e.expected, regs.length, r2(ch.reduce((a, c) => a + chargeNet(c), 0)), r2(ch.reduce((a, c) => a + c.paid, 0)), r2(cat.reduce((a, c) => a + chargeNet(c), 0))] as Cell[]; });
    return { kpis: [{ label: "Events", value: String(rows.length) }, { label: "Registrations", value: String(rows.reduce((a, x) => a + Number(x[5]), 0)) }, { label: "Registration income", value: P(rows.reduce((a, x) => a + Number(x[6]), 0)) }], chart: { type: "bar", xKey: "name", series: [{ key: "regs", label: "Registered" }, { key: "exp", label: "Expected" }], data: rows.map((x) => ({ name: String(x[1]).slice(0, 14), regs: Number(x[5]), exp: Number(x[4]) })) }, columns: ["Date", "Event", "Type", "Status", "Expected", "Registered", "Registration billed", "Collected", "Catering billed"], rows };
  } },
  { id: "cashier", title: "Cashier reconciliation", description: "Shift cash reconciliation (cash only; electronic payments shown separately).", build: (db, r) => {
    const rows = db.shifts.filter((s) => inRange(s.date, r)).map((s) => { const c = shiftCash(db, s.id); return [s.date, s.id, s.cashier, s.status, c.float, c.cashIn, c.cashOut, s.expectedCash ?? c.expected, s.countedCash ?? "open", s.variance ?? "—", c.nonCash] as Cell[]; });
    const vars = rows.filter((x) => typeof x[9] === "number").reduce((a, x) => a + Number(x[9]), 0);
    return { kpis: [{ label: "Shifts", value: String(rows.length) }, { label: "Net variance", value: P(vars) }, { label: "Cash received", value: P(rows.reduce((a, x) => a + Number(x[5]), 0)) }], chart: { type: "bar", xKey: "shift", series: [{ key: "variance", label: "Variance" }], data: rows.map((x) => ({ shift: String(x[1]), variance: typeof x[9] === "number" ? Number(x[9]) : 0 })) }, columns: ["Date", "Shift", "Cashier", "Status", "Opening float", "Cash in", "Cash out", "Expected cash", "Counted", "Variance", "Non-cash payments"], rows };
  } },
  { id: "audit", title: "Exceptions & audit", description: "Overrides, refunds, voids, write-offs, waivers, cancellations and restrictions.", build: (db, r) => {
    const pat = /override|refund|void|writeoff|waive|cancel|noshow|closure|suspend|settle|delay|incident|issue|discount|reset/;
    const rows = db.audit.filter((a) => inRange(a.at.slice(0, 10), r) && pat.test(a.action)).map((a) => [a.at.replace("T", " "), a.actor, a.role, a.action, a.entity + " " + a.entityId, a.detail] as Cell[]).reverse();
    const by: Record<string, number> = {}; for (const x of rows) by[String(x[3])] = (by[String(x[3])] ?? 0) + 1;
    return { kpis: [{ label: "Exception events", value: String(rows.length) }], chart: { type: "bar", xKey: "action", series: [{ key: "n", label: "Events" }], data: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ action: k, n: v })) }, columns: ["When", "Actor", "Role", "Action", "Record", "Detail"], rows };
  } },
];
export { memberLedger, deptLabel };
