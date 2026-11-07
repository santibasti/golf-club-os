import type { Booking, DB } from "../types";
import { memberBalance } from "./finance";

export interface Payer { name: string; customerId?: string; memberId?: string; billTo: "counter" | "member_account"; creditBlocked?: boolean }

/** Who is billed for non-green-fee charges (cart, caddie) of a booking, honoring member billing preference and credit limit. */
export function payerOf(db: DB, b: Booking, addAmount = 0): Payer {
  const m = b.contactMemberId ? db.members.find((x) => x.id === b.contactMemberId) : undefined;
  if (m) {
    const plan = db.plans.find((p) => p.id === m.planId); const c = db.customers.find((x) => x.id === m.customerId);
    const eligible = m.status === "active" && !!plan?.accountCharging && m.billingPref === "account";
    const within = !plan || memberBalance(db, m.id) + addAmount <= plan.creditLimit;
    return { name: c?.name ?? b.contactName, customerId: m.customerId, memberId: m.id, billTo: eligible && within ? "member_account" : "counter", creditBlocked: eligible && !within };
  }
  return { name: b.contactName, customerId: b.contactCustomerId, billTo: "counter" };
}
