import type { DB, Permission, RoleId } from "../types";
import { dateOf, timeOf } from "../time";
import { roleLabel } from "../permissions";

/** Domain services mutate a DB draft and throw DomainError to abort. The store only commits drafts that did not throw. */
export class DomainError extends Error {
  constructor(message: string, public code = "domain_error") { super(message); }
}
export const fail = (msg: string, code?: string): never => { throw new DomainError(msg, code); };

export interface Ctx { role: RoleId | "system"; actor: string; bypass?: boolean }
export const SYSTEM: Ctx = { role: "system", actor: "System", bypass: true };

export function needPerm(db: DB, ctx: Ctx, perm: Permission) {
  if (ctx.bypass) return;
  const perms = db.rolePerms[ctx.role as RoleId] ?? [];
  if (!perms.includes(perm)) fail(`Not permitted: "${roleLabel(ctx.role)}" lacks the "${perm}" permission.`, "forbidden");
}
export const hasPerm = (db: DB, ctx: Ctx, perm: Permission) => !!ctx.bypass || (db.rolePerms[ctx.role as RoleId] ?? []).includes(perm);

export const now = (db: DB) => db.meta.now;
export const today = (db: DB) => dateOf(db.meta.now);
export const clock = (db: DB) => timeOf(db.meta.now);

export function nextId(db: DB, key: string, prefix: string, width = 4): string {
  db.seq[key] = (db.seq[key] ?? 0) + 1;
  return `${prefix}${String(db.seq[key]).padStart(width, "0")}`;
}

export function audit(db: DB, ctx: Ctx, action: string, entity: string, entityId: string, detail: string) {
  db.audit.push({ id: nextId(db, "audit", "AUD-", 6), at: db.meta.now, actor: ctx.actor, role: ctx.role, action, entity, entityId, detail });
}

export function note(list: { at: string; by: string; text: string }[], db: DB, ctx: Ctx, text: string) {
  list.push({ at: db.meta.now, by: ctx.actor, text });
}

export function req<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) return fail(msg, "not_found");
  return v;
}
export function requireText(v: string | undefined, label: string, min = 1): string {
  const s = (v ?? "").trim();
  if (s.length < min) fail(`${label} is required.`, "validation");
  return s;
}
export function requirePositive(n: number, label: string) {
  if (!Number.isFinite(n) || n <= 0) fail(`${label} must be greater than zero.`, "validation");
}
