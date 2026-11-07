import type { Customer, DB, Member } from "../types";
import { Ctx, audit, fail, needPerm, nextId, note, req, requireText, today } from "./core";
import { createCharge, memberBalance, outstanding, chargeNet } from "./finance";
import { addMonths } from "../time";
import { r2 } from "../format";

export const DOC_LIST: { key: string; label: string; required: boolean }[] = [
  { key: "application_form", label: "Signed application form", required: true },
  { key: "valid_id", label: "Valid government ID", required: true },
  { key: "photo", label: "2x2 photo", required: false },
  { key: "proof_of_address", label: "Proof of address", required: false },
  { key: "sponsor_endorsement", label: "Sponsor / endorser letter", required: false },
];
const CYCLE_MONTHS = { monthly: 1, quarterly: 3, annual: 12, none: 0 } as const;
const planOf = (db: DB, m: Member) => req(db.plans.find((p) => p.id === m.planId), "Membership plan missing.");
export const customerOf = (db: DB, m: Member) => req(db.customers.find((c) => c.id === m.customerId), "Customer missing.");
const log = (db: DB, ctx: Ctx, m: Member, text: string) => note(m.history, db, ctx, text);
export function duesPerCycle(db: DB, m: Member) { const p = planOf(db, m); const k = CYCLE_MONTHS[p.billingCycle]; return k ? r2((p.annualDues * k) / 12) : 0; }

export interface ApplicationInput { customerId?: string; name: string; phone: string; email: string; address: string; birthDate: string; planId: string; emergencyName: string; emergencyPhone: string; emergencyRelation: string; billingPref: "account" | "counter" }
export function createApplication(db: DB, ctx: Ctx, i: ApplicationInput): Member {
  needPerm(db, ctx, "membership.edit");
  requireText(i.name, "Full name", 3); requireText(i.phone, "Mobile number", 7); requireText(i.address, "Address", 3);
  if (!/^\S+@\S+\.\S+$/.test(i.email)) fail("Enter a valid email address.", "validation");
  if (!i.birthDate || i.birthDate > today(db)) fail("Enter a valid date of birth.", "validation");
  req(db.plans.find((p) => p.id === i.planId && p.active), "Select an active membership plan.");
  requireText(i.emergencyName, "Emergency contact name", 3); requireText(i.emergencyPhone, "Emergency contact number", 7);
  let cust: Customer | undefined = i.customerId ? db.customers.find((c) => c.id === i.customerId) : undefined;
  if (cust?.memberId && db.members.find((m) => m.id === cust!.memberId && !["cancelled", "expired"].includes(m.status))) fail(`${cust.name} already holds membership ${cust.memberId}.`, "duplicate");
  if (!cust) { cust = { id: nextId(db, "customer", "C-", 4), name: i.name.trim(), phone: i.phone.trim(), email: i.email.trim(), address: i.address.trim(), birthDate: i.birthDate, createdAt: db.meta.now }; db.customers.push(cust); }
  else { cust.phone = i.phone; cust.email = i.email; cust.address = i.address; cust.birthDate = i.birthDate; }
  const m: Member = { id: nextId(db, "member", "M-", 4), customerId: cust.id, planId: i.planId, status: "applicant", applicationDate: today(db), emergencyContact: { name: i.emergencyName, phone: i.emergencyPhone, relation: i.emergencyRelation || "—" }, billingPref: i.billingPref, docs: {}, colorSeed: db.members.length * 7 + 3, history: [] };
  cust.memberId = m.id; log(db, ctx, m, "Application received"); db.members.push(m);
  audit(db, ctx, "member.apply", "member", m.id, `${cust.name} applied for ${planOf(db, m).name}`); return m;
}
export function updateMember(db: DB, ctx: Ctx, id: string, p: { planId?: string; phone?: string; email?: string; address?: string; billingPref?: "account" | "counter"; emergency?: Member["emergencyContact"]; notes?: string; guestLimitOverride?: number | null }) {
  needPerm(db, ctx, "membership.edit"); const m = req(db.members.find((x) => x.id === id), "Member not found."); const c = customerOf(db, m);
  if (p.planId && p.planId !== m.planId) { req(db.plans.find((x) => x.id === p.planId && x.active), "Plan not available."); log(db, ctx, m, `Plan changed ${planOf(db, m).name} → ${db.plans.find((x) => x.id === p.planId)!.name}`); m.planId = p.planId; }
  if (p.phone !== undefined) { requireText(p.phone, "Mobile number", 7); c.phone = p.phone; }
  if (p.email !== undefined) { if (!/^\S+@\S+\.\S+$/.test(p.email)) fail("Enter a valid email address.", "validation"); c.email = p.email; }
  if (p.address !== undefined) c.address = p.address; if (p.billingPref) m.billingPref = p.billingPref; if (p.emergency) m.emergencyContact = p.emergency; if (p.notes !== undefined) m.notes = p.notes;
  if (p.guestLimitOverride !== undefined) m.guestLimitOverride = p.guestLimitOverride === null ? undefined : p.guestLimitOverride;
  audit(db, ctx, "member.edit", "member", id, "Profile updated");
}
export function toggleDoc(db: DB, ctx: Ctx, id: string, key: string) { needPerm(db, ctx, "membership.edit"); const m = req(db.members.find((x) => x.id === id), "Member not found."); m.docs[key] = !m.docs[key]; log(db, ctx, m, `Document '${key}' ${m.docs[key] ? "received" : "unchecked"}`); }
export function submitForApproval(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "membership.edit"); const m = req(db.members.find((x) => x.id === id), "Member not found.");
  if (m.status !== "applicant") fail("Only applicants can be submitted for approval.");
  const missing = DOC_LIST.filter((d) => d.required && !m.docs[d.key]); if (missing.length) fail(`Required documents missing: ${missing.map((d) => d.label).join(", ")}.`, "docs");
  m.status = "pending_approval"; log(db, ctx, m, "Submitted for approval (documents complete)"); audit(db, ctx, "member.submit", "member", id, "pending approval");
}
/** Approval + activation + benefits allocation: posts joining fee and first dues cycle (idempotent via billing keys). */
export function approveMember(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "membership.approve"); const m = req(db.members.find((x) => x.id === id), "Member not found.");
  if (m.status !== "pending_approval") fail("Only applications pending approval can be approved.");
  const p = planOf(db, m); const c = customerOf(db, m);
  m.status = "active"; m.activationDate = today(db); m.expiryDate = p.termMonths ? addMonths(today(db), p.termMonths) : undefined;
  if (p.joiningFee > 0) createCharge(db, ctx, { dept: "membership", description: `Joining fee — ${p.name}`, amount: p.joiningFee, name: c.name, customerId: c.id, memberId: m.id, refType: "joining", billTo: "counter", billingKey: `join:${m.id}` });
  const k = CYCLE_MONTHS[p.billingCycle];
  if (k) { createCharge(db, ctx, { dept: "membership", description: `Membership dues — ${p.name} (${p.billingCycle})`, amount: duesPerCycle(db, m), name: c.name, customerId: c.id, memberId: m.id, refType: "dues", billTo: "member_account", billingKey: `dues:${m.id}:${today(db)}` }); m.nextBillingDate = addMonths(today(db), k); }
  log(db, ctx, m, `Approved by ${ctx.actor} and activated. Benefits allocated: ${p.name} rates, ${p.guestsPerRound} guest(s)/round, ${p.advanceDays}-day booking window`);
  audit(db, ctx, "member.approve", "member", id, `${c.name} approved & activated`);
}
export function rejectApplication(db: DB, ctx: Ctx, id: string, reason: string) {
  needPerm(db, ctx, "membership.approve"); const m = req(db.members.find((x) => x.id === id), "Member not found.");
  if (!["applicant", "pending_approval"].includes(m.status)) fail("Only applications can be declined."); requireText(reason, "Reason", 3);
  m.status = "cancelled"; log(db, ctx, m, `Application declined: ${reason}`); audit(db, ctx, "member.decline", "member", id, reason);
}
export function suspendMember(db: DB, ctx: Ctx, id: string, reason: string) {
  needPerm(db, ctx, "membership.suspend"); const m = req(db.members.find((x) => x.id === id), "Member not found.");
  if (m.status !== "active") fail("Only active members can be suspended."); requireText(reason, "Suspension reason", 3);
  m.status = "suspended"; log(db, ctx, m, `Suspended: ${reason}`); audit(db, ctx, "member.suspend", "member", id, reason);
}
export function reinstateMember(db: DB, ctx: Ctx, id: string, reason: string) {
  needPerm(db, ctx, "membership.suspend"); const m = req(db.members.find((x) => x.id === id), "Member not found.");
  if (m.status !== "suspended") fail("Only suspended members can be reinstated."); requireText(reason, "Reinstatement note", 3);
  if (m.expiryDate && m.expiryDate < today(db)) fail("Membership has expired — renew instead of reinstating.");
  m.status = "active"; log(db, ctx, m, `Reinstated: ${reason}`); audit(db, ctx, "member.reinstate", "member", id, reason);
}
export function cancelMembership(db: DB, ctx: Ctx, id: string, reason: string) {
  needPerm(db, ctx, "membership.suspend"); const m = req(db.members.find((x) => x.id === id), "Member not found."); requireText(reason, "Reason", 3);
  if (["cancelled"].includes(m.status)) fail("Already cancelled."); const bal = memberBalance(db, id);
  m.status = "cancelled"; log(db, ctx, m, `Membership cancelled: ${reason}${bal ? ` (outstanding balance ₱${bal.toLocaleString()} remains collectible)` : ""}`); audit(db, ctx, "member.cancel", "member", id, reason);
}
export function renewMember(db: DB, ctx: Ctx, id: string) {
  needPerm(db, ctx, "membership.billing"); const m = req(db.members.find((x) => x.id === id), "Member not found."); const p = planOf(db, m);
  if (!["active", "expired"].includes(m.status)) fail("Only active or expired memberships can be renewed.");
  if (!p.termMonths) fail("This plan has no expiry and does not require renewal.");
  const from = m.expiryDate && m.expiryDate > today(db) ? m.expiryDate : today(db); const newExpiry = addMonths(from, p.termMonths!);
  createCharge(db, ctx, { dept: "membership", description: `Renewal — ${p.name} to ${newExpiry}`, amount: p.annualDues, name: customerOf(db, m).name, customerId: m.customerId, memberId: m.id, refType: "renewal", billTo: "member_account", billingKey: `renew:${m.id}:${newExpiry}` });
  m.expiryDate = newExpiry; m.status = "active"; log(db, ctx, m, `Renewed to ${newExpiry}`); audit(db, ctx, "member.renew", "member", id, `to ${newExpiry}`);
}
/** Marks lapsed memberships as expired. Idempotent. */
export function expireLapsed(db: DB, ctx: Ctx) { let n = 0; for (const m of db.members) if (m.status === "active" && m.expiryDate && m.expiryDate < today(db)) { m.status = "expired"; log(db, ctx, m, "Membership expired"); n++; } return n; }
/** Recurring dues: posts one charge per due billing period per member. Safe to re-run (billing keys). */
export function runDuesBilling(db: DB, ctx: Ctx) {
  needPerm(db, ctx, "membership.billing"); let n = 0; let total = 0; const expired = expireLapsed(db, ctx);
  for (const m of db.members.filter((x) => x.status === "active" && x.nextBillingDate && x.nextBillingDate <= today(db))) {
    const p = planOf(db, m); const k = CYCLE_MONTHS[p.billingCycle]; if (!k) continue;
    const amt = duesPerCycle(db, m);
    if (amt > 0) { createCharge(db, ctx, { dept: "membership", description: `Membership dues — ${p.name} (${m.nextBillingDate})`, amount: amt, name: customerOf(db, m).name, customerId: m.customerId, memberId: m.id, refType: "dues", billTo: "member_account", billingKey: `dues:${m.id}:${m.nextBillingDate}` }); n++; total += amt; }
    m.nextBillingDate = addMonths(m.nextBillingDate!, k);
  }
  audit(db, ctx, "billing.run", "membership", "dues", `${n} dues charge(s) posted (₱${total.toLocaleString()}); ${expired} membership(s) expired`);
  return { count: n, total, expired };
}
export interface LedgerRow { at: string; date: string; ref: string; description: string; debit: number; credit: number; balance: number; kind: "charge" | "payment" | "refund" | "writeoff" | "void" }
export function memberLedger(db: DB, memberId: string, from?: string, to?: string): { rows: LedgerRow[]; opening: number; closing: number } {
  type E = Omit<LedgerRow, "balance">; const ev: E[] = [];
  const charges = db.charges.filter((c) => c.memberId === memberId && c.status !== "voided");
  for (const c of charges) {
    ev.push({ at: c.createdAt, date: c.date, ref: c.no, description: c.description, debit: chargeNet(c), credit: 0, kind: "charge" });
    if (c.status === "written_off") ev.push({ at: c.createdAt + "~", date: c.date, ref: c.no, description: "Written off — " + (c.reason ?? ""), debit: 0, credit: r2(chargeNet(c) - c.paid), kind: "writeoff" });
  }
  const ids = new Set(charges.map((c) => c.id));
  for (const p of db.payments.filter((p) => p.chargeId && ids.has(p.chargeId))) ev.push({ at: p.at, date: p.date, ref: p.no, description: `Payment (${p.method})`, debit: 0, credit: p.amount, kind: "payment" });
  for (const r of db.refunds.filter((r) => r.chargeId && ids.has(r.chargeId))) ev.push({ at: r.at, date: r.date, ref: r.id, description: `Refund — ${r.reason}`, debit: r.amount, credit: 0, kind: "refund" });
  ev.sort((a, b) => a.at.localeCompare(b.at)); let bal = 0; let opening = 0; const rows: LedgerRow[] = [];
  for (const e of ev) { bal = r2(bal + e.debit - e.credit); if (from && e.date < from) { opening = bal; continue; } if (to && e.date > to) continue; rows.push({ ...e, balance: bal }); }
  return { rows, opening, closing: rows.length ? rows[rows.length - 1].balance : opening };
}
export { outstanding };
