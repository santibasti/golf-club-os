import type { Announcement, DB, Permission, RoleId, Settings } from "../types";
import { Ctx, audit, fail, needPerm, nextId, req, requireText } from "./core";
import { toMin } from "../time";

export function saveSettings(db: DB, ctx: Ctx, s: Settings) {
  needPerm(db, ctx, "admin.settings");
  const t = s.teeSheet;
  if (!(t.interval >= 5 && t.interval <= 30)) fail("Tee interval must be between 5 and 30 minutes.", "validation");
  if (!(t.maxPlayers >= 1 && t.maxPlayers <= 6)) fail("Maximum golfers per flight must be between 1 and 6.", "validation");
  if (toMin(t.lastTee) < toMin(t.firstTee)) fail("Last tee time must be after the first tee time.", "validation");
  if (t.startingTees.length === 0) fail("Select at least one starting tee.", "validation");
  if (t.advanceDaysPublic < 0 || t.advanceDaysMember < t.advanceDaysPublic) fail("Member booking window must be ≥ public window.", "validation");
  const g = s.rates; const nums = [g.cart18, g.cart9, g.ninePct, g.playersPerCart, g.playersPerCaddie, ...Object.values(g.green).flatMap((x) => Object.values(x)), ...Object.values(g.caddie).flatMap((x) => [x.f18, x.f9])];
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) fail("Rates and fees must be non-negative numbers.", "validation");
  if (g.playersPerCart < 1 || g.playersPerCaddie < 1) fail("Players per cart / caddie must be at least 1.", "validation");
  if (Object.values(g.caddieClubSharePct).some((n) => n < 0 || n > 100)) fail("Club share percentages must be 0–100.", "validation");
  if (s.pace.minutes18 < 60 || s.pace.minutes9 < 30) fail("Pace-of-play durations look too short.", "validation");
  const changed: string[] = []; for (const k of Object.keys(s) as (keyof Settings)[]) if (JSON.stringify(s[k]) !== JSON.stringify(db.settings[k])) changed.push(k);
  if (!changed.length) fail("No changes to save.", "none");
  db.settings = s; audit(db, ctx, "settings.save", "settings", db.meta.clubId, `Updated: ${changed.join(", ")}`);
  return changed;
}
export function setRolePermission(db: DB, ctx: Ctx, role: RoleId, perm: Permission, on: boolean) {
  needPerm(db, ctx, "admin.roles");
  if (role === "system_admin" && !on && (perm === "admin.roles" || perm === "admin.settings")) fail("The System Administrator cannot lose role/settings administration.");
  const list = db.rolePerms[role] ?? []; const has = list.includes(perm);
  if (on && !has) list.push(perm); if (!on && has) list.splice(list.indexOf(perm), 1); db.rolePerms[role] = list;
  audit(db, ctx, "role.permission", "role", role, `${on ? "Granted" : "Revoked"} ${perm}`);
}
export function saveAnnouncement(db: DB, ctx: Ctx, a: { id?: string; title: string; body: string; audience: "all" | "members"; active: boolean }) {
  needPerm(db, ctx, "admin.settings"); requireText(a.title, "Title", 3); requireText(a.body, "Message", 5);
  if (a.id) { const x = req(db.announcements.find((n) => n.id === a.id), "Notice not found."); Object.assign(x, { title: a.title, body: a.body, audience: a.audience, active: a.active }); }
  else { const n: Announcement = { id: nextId(db, "announcement", "AN-", 3), title: a.title, body: a.body, audience: a.audience, active: a.active, at: db.meta.now }; db.announcements.push(n); }
  audit(db, ctx, "notice.save", "announcement", a.id ?? "new", a.title);
}
export function submitFeedback(db: DB, ctx: Ctx, f: { customerId?: string; name: string; rating: number; text: string }) {
  if (!(f.rating >= 1 && f.rating <= 5)) fail("Choose a rating from 1 to 5.", "validation");
  requireText(f.text, "Feedback", 5);
  db.feedback.push({ id: nextId(db, "feedback", "FB-", 4), at: db.meta.now, customerId: f.customerId, name: f.name, rating: f.rating, text: f.text.trim() });
  audit(db, ctx, "feedback.submit", "feedback", f.customerId ?? "anon", `${f.rating}★`);
}
