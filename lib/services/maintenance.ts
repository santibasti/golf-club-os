import type { DB, Hole, MaintCategory, WorkOrder, WorkStatus } from "../types";
import { Ctx, audit, fail, hasPerm, needPerm, nextId, note, req, requireText, today } from "./core";
import { addDays } from "../time";
import { r2 } from "../format";
import { adjustStock } from "./inventory";

export const WO_FLOW: WorkStatus[] = ["scheduled", "assigned", "in_progress", "for_inspection", "completed"];
export const isOpenWO = (w: WorkOrder) => w.status !== "completed";

export interface NewWO { location: string; hole?: number; category: MaintCategory; description: string; priority: WorkOrder["priority"]; team: string; startDate: string; targetDate: string; estCost: number; assetId?: string; cartId?: string; recurringId?: string; skipPerm?: boolean }
export function createWorkOrder(db: DB, ctx: Ctx, n: NewWO): WorkOrder {
  if (!n.skipPerm) needPerm(db, ctx, "course.manage");
  requireText(n.description, "Description", 5); requireText(n.location, "Location");
  if (n.targetDate < n.startDate) fail("Target date cannot be before the start date.", "validation");
  if (n.estCost < 0) fail("Estimated cost cannot be negative.", "validation");
  const w: WorkOrder = {
    id: nextId(db, "wo", "WO-", 5), code: nextId(db, "woCode", "WO-", 4), location: n.location, hole: n.hole, category: n.category, description: n.description.trim(), priority: n.priority,
    team: n.team, status: n.team ? "assigned" : "scheduled", startDate: n.startDate, targetDate: n.targetDate, estCost: n.estCost, actualCost: 0, notes: [], assetId: n.assetId, cartId: n.cartId,
    recurringId: n.recurringId, labor: [], materials: [], inspections: [], createdBy: ctx.actor, createdAt: db.meta.now,
  };
  note(w.notes, db, ctx, "Work order created"); db.workOrders.push(w);
  audit(db, ctx, "workorder.create", "workorder", w.id, `${w.code} ${w.category} @ ${w.location} [${w.priority}]`);
  return w;
}

export function advanceWorkOrder(db: DB, ctx: Ctx, id: string, to: WorkStatus) {
  needPerm(db, ctx, "course.manage");
  const w = req(db.workOrders.find((x) => x.id === id), "Work order not found.");
  const from = WO_FLOW.indexOf(w.status); const target = WO_FLOW.indexOf(to);
  if (to === "completed") fail("Completion requires inspection. Use 'Inspect' to pass the work order.", "validation");
  if (target !== from + 1 && !(w.status === "for_inspection" && to === "in_progress")) fail(`Cannot move from ${w.status.replace("_", " ")} to ${to.replace("_", " ")}.`);
  if (to === "assigned" && !w.team) fail("Assign a team first.", "validation");
  w.status = to; note(w.notes, db, ctx, `Status → ${to.replace("_", " ")}`);
  if (to === "in_progress" && w.cartId) { const c = db.carts.find((x) => x.id === w.cartId); if (c) note(c.history, db, ctx, `Mechanic started ${w.code}`); }
  if (to === "for_inspection" && w.cartId) { const c = db.carts.find((x) => x.id === w.cartId); if (c) note(c.history, db, ctx, `Repair recorded complete (${w.code}); awaiting supervisor inspection`); }
  audit(db, ctx, "workorder.status", "workorder", w.id, `${w.code} → ${to}`);
}
export function assignTeam(db: DB, ctx: Ctx, id: string, team: string) {
  needPerm(db, ctx, "course.manage"); requireText(team, "Team");
  const w = req(db.workOrders.find((x) => x.id === id), "Work order not found.");
  if (w.status === "completed") fail("Completed work orders cannot be reassigned.");
  w.team = team; if (w.status === "scheduled") w.status = "assigned"; note(w.notes, db, ctx, `Assigned to ${team}`);
}
export function addWONote(db: DB, ctx: Ctx, id: string, text: string) {
  needPerm(db, ctx, "course.manage"); const w = req(db.workOrders.find((x) => x.id === id), "Work order not found."); requireText(text, "Note", 2); note(w.notes, db, ctx, text.trim());
}
export function logLabor(db: DB, ctx: Ctx, id: string, staffId: string, hours: number) {
  needPerm(db, ctx, "course.manage"); const w = req(db.workOrders.find((x) => x.id === id), "Work order not found.");
  if (!(hours > 0 && hours <= 24)) fail("Hours must be between 0 and 24.", "validation"); req(db.staff.find((s) => s.id === staffId), "Select a staff member.");
  w.labor.push({ id: nextId(db, "labor", "LB-", 5), staffId, date: today(db), hours }); w.actualCost = r2(w.actualCost + hours * 85); // ₱85/hr labor cost assumption
  note(w.notes, db, ctx, `${hours}h labor logged`);
}
export function consumeMaterial(db: DB, ctx: Ctx, id: string, itemId: string, qty: number) {
  needPerm(db, ctx, "course.manage"); const w = req(db.workOrders.find((x) => x.id === id), "Work order not found.");
  const item = req(db.inventory.find((i) => i.id === itemId), "Select a material.");
  if (!(qty > 0)) fail("Quantity must be greater than zero.", "validation");
  adjustStock(db, ctx, itemId, -qty, "consume", w.code, "Maintenance material");
  const cost = r2(item.cost * qty); w.materials.push({ itemId, qty, cost }); w.actualCost = r2(w.actualCost + cost);
  note(w.notes, db, ctx, `Used ${qty} ${item.unit} ${item.name} (₱${cost})`);
}
export function assignAssetToWO(db: DB, ctx: Ctx, id: string, assetId: string) {
  needPerm(db, ctx, "course.manage"); const w = req(db.workOrders.find((x) => x.id === id), "Work order not found."); const a = req(db.assets.find((x) => x.id === assetId), "Asset not found.");
  if (a.status === "maintenance" || a.status === "retired") fail(`${a.name} is ${a.status} and cannot be assigned.`);
  if (a.status === "in_use" && w.assetId !== a.id) fail(`${a.name} is already in use (${a.custodian}).`, "conflict");
  w.assetId = a.id; a.status = "in_use"; a.custodian = w.team || a.custodian; note(a.history, db, ctx, `Assigned to ${w.code}`); note(w.notes, db, ctx, `Equipment assigned: ${a.name}`);
}
export function inspectWorkOrder(db: DB, ctx: Ctx, id: string, result: "passed" | "failed", text: string) {
  const w = req(db.workOrders.find((x) => x.id === id), "Work order not found.");
  const allowed = hasPerm(db, ctx, "course.inspect") || (!!w.cartId && hasPerm(db, ctx, "cart.maintenance"));
  if (!allowed) fail("Only a superintendent/manager (or the cart supervisor for cart repairs) can inspect work orders.", "forbidden");
  if (w.status !== "for_inspection") fail("The work order must be 'For Inspection'.");
  requireText(text, "Inspection note", 3);
  w.inspections.push({ at: db.meta.now, by: ctx.actor, result, note: text.trim() });
  if (result === "failed") { w.status = "in_progress"; note(w.notes, db, ctx, `Inspection failed: ${text}`); audit(db, ctx, "workorder.inspect", "workorder", w.id, `${w.code} failed inspection`); return; }
  w.status = "completed"; w.completedAt = db.meta.now; note(w.notes, db, ctx, `Inspection passed: ${text}`);
  if (w.assetId) { const a = db.assets.find((x) => x.id === w.assetId); if (a && a.status === "in_use") { a.status = "available"; note(a.history, db, ctx, `Released after ${w.code}`); } }
  if (w.cartId) {
    const c = db.carts.find((x) => x.id === w.cartId);
    if (c) { c.damage = undefined; if (c.status === "maintenance") { c.status = "available"; c.condition = c.condition === "poor" ? "fair" : c.condition; } note(c.history, db, ctx, `${w.code} inspected by ${ctx.actor} — returned to service`); }
  }
  if (w.closureId) {/* restrictions are lifted explicitly so the audit trail shows who cleared them */}
  audit(db, ctx, "workorder.inspect", "workorder", w.id, `${w.code} passed inspection and completed`);
}

export function generateRecurring(db: DB, ctx: Ctx, horizonDays = 0) {
  needPerm(db, ctx, "course.manage"); const limit = addDays(today(db), horizonDays); const out: WorkOrder[] = [];
  for (const r of db.recurring.filter((x) => x.active && x.nextDue <= limit)) {
    const hole = /Hole (\d+)/.exec(r.location)?.[1];
    out.push(createWorkOrder(db, ctx, { location: r.location, hole: hole ? Number(hole) : undefined, category: r.category, description: `[Recurring] ${r.title}`, priority: r.priority, team: r.team, startDate: r.nextDue, targetDate: addDays(r.nextDue, 1), estCost: r.estCost, recurringId: r.id }));
    r.nextDue = addDays(r.nextDue < today(db) ? today(db) : r.nextDue, r.everyDays);
  }
  if (!out.length) fail("No recurring tasks are due.", "none_due");
  return out;
}
export function setHoleCondition(db: DB, ctx: Ctx, no: number, condition: Hole["condition"]) {
  needPerm(db, ctx, "course.manage"); const h = req(db.holes.find((x) => x.no === no), "Hole not found."); h.condition = condition; audit(db, ctx, "hole.condition", "hole", String(no), `Hole ${no} → ${condition}`);
}
export function budgetUse(db: DB, month: string) {
  const out: Record<string, number> = {};
  for (const w of db.workOrders) { const d = (w.completedAt ?? w.startDate).slice(0, 7); if (d === month) out[w.category] = (out[w.category] ?? 0) + w.actualCost; }
  return out;
}
export function holePlayability(db: DB, hole: number): { label: "Playable" | "Restricted" | "Closed"; reason?: string } {
  const t = today(db); const m = db.meta.now.slice(11, 16);
  const full = db.closures.find((c) => c.active && c.date === t && c.type === "full" && m >= c.from && m < c.to);
  if (full) return { label: "Closed", reason: full.reason };
  const part = db.closures.find((c) => c.active && c.date === t && c.type === "partial" && c.holes.includes(hole) && m >= c.from && m < c.to);
  if (part) return { label: "Restricted", reason: part.reason };
  return { label: "Playable" };
}
