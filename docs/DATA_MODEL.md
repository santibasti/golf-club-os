# Data model & architecture

## Layers
```
UI (Next.js pages/components)  →  lib/store.tsx  (act(): clone → run service → commit/persist or reject)
                                   ↓
Domain services  lib/services/*  (pure TypeScript functions over a DB object; throw DomainError; permission-checked; audit-logged)
                                   ↓
Data: demo = one JSON DB in localStorage (lib/seed.ts, lib/types.ts)   |   production = Supabase/Postgres (docs/schema.sql)
```
All screens read the **same** DB and mutate it only through services, so a booking made on the tee sheet is instantly visible in check-in, starter, caddies, carts, finance, reports and the dashboard.
**Swapping to Supabase:** keep `lib/services/*` as the business-rule library, run it server-side (Route Handlers / Edge Functions) against Postgres inside a transaction, and replace `StoreProvider.act()` with a call to that API. Screens do not change.

## Service domains (`lib/services`)
| Module | Responsibility |
|---|---|
| `booking.ts` | tee slots, closures/restrictions, rate computation, eligibility, create/edit/reschedule/cancel/no-show, deposits, waitlist |
| `flight.ts` | check-in (arrival), requirements, ready/start/delay/suspend/checkpoint/incident/complete, pace of play |
| `caddie.ts` | attendance, rotation queue (configurable), assignments, overrides, replacement, fees, settlements |
| `cart.ts` | assignment, dispatch, return, inspection, defect → work order |
| `finance.ts` | charges, payments, deposits, refunds, voids, write-offs, shifts, ledgers |
| `membership.ts` | application → approval → activation, dues billing, renewal, suspension, statements |
| `pos.ts` | café POS, member charging, voids, driving range sales & bays |
| `maintenance.ts` | work orders (Scheduled→Assigned→In Progress→For Inspection→Completed), labor, materials, recurring |
| `events.ts` | events, registrations, flights, gross scoring, catering |
| `metrics.ts`, `alerts.ts`, `reports.ts` | **single definitions** of every KPI, alert and report |
| `admin.ts` | settings, role permissions, notices, feedback |

## Metric definitions (docs for `metrics.ts`)
* **Reservation (Booking)** – a tee-time booking. *Rounds booked* = players on non-cancelled, non-no-show bookings.
* **Round played** – a booking whose flight has started. *Rounds started* = players on started/completed bookings. Completion only happens through the Starter action – never from payment.
* **Charge** – amount owed (accrual). **Net club revenue** = amount − discount − refunds − third-party payables (contractor caddie share, tips), by *charge date*. Voided/written-off charges excluded. Event fees are recognised on the event date.
* **Payment** – money received (applied to one charge, or a held deposit until applied). **Cash collected** = payments − refunds by payment date.
* **Member account charge** – a charge with `member_id`, billed `member_account`; it is receivable until paid, never cash, and paying it creates no new revenue.
* **Receivable** = Σ outstanding(net − paid) on live charges.

## Key invariants (enforced in services, mirrored by DB constraints in `schema.sql`)
1. A slot's active bookings never exceed capacity; one booking per slot unless sharing is enabled.
2. A person cannot be in two overlapping active bookings; guests need a playing, eligible sponsor within the guest limit.
3. A caddie holds ≤1 active assignment; a cart holds ≤1 open dispatch; carts in maintenance cannot be assigned/dispatched.
4. Payments ≤ outstanding; refunds ≤ paid; write-offs/refunds/voids/discounts require permission + reason and are audited.
5. Charges are idempotent via `billing_key` (dues, green fees, caddie fees).
