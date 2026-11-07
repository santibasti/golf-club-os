import type { DB } from "../types";
import { Ctx, audit, fail, needPerm, nextId, req, requireText } from "./core";

export function adjustStock(db: DB, ctx: Ctx, itemId: string, delta: number, type: "sale" | "receive" | "adjust" | "void_return" | "consume", ref?: string, noteText?: string) {
  const it = req(db.inventory.find((i) => i.id === itemId), "Inventory item not found.");
  if (it.qty + delta < 0) fail(`Insufficient stock for ${it.name} (on hand ${it.qty}).`, "stock");
  it.qty += delta;
  db.movements.push({ id: nextId(db, "movement", "MV-", 6), itemId, at: db.meta.now, type, qty: delta, ref, by: ctx.actor, note: noteText });
}
export function manualInventory(db: DB, ctx: Ctx, itemId: string, delta: number, type: "receive" | "adjust", noteText: string) {
  needPerm(db, ctx, "inventory.manage");
  if (!delta || !Number.isFinite(delta)) fail("Enter a non-zero quantity.", "validation");
  if (type === "receive" && delta < 0) fail("Received quantity must be positive.", "validation");
  requireText(noteText, "Note / reference", 2);
  adjustStock(db, ctx, itemId, delta, type, undefined, noteText);
  audit(db, ctx, "inventory." + type, "inventory", itemId, `${delta > 0 ? "+" : ""}${delta}: ${noteText}`);
}
export const lowStock = (db: DB) => db.inventory.filter((i) => i.active && i.qty <= i.reorder);
