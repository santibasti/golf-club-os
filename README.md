# GOLF CLUB OS — *One Platform. Every Department. Complete Control.*
Interactive operations platform demo for a Philippine public golf course with membership (fictional club **Sierra Verde Golf & Country Club**, fictional data). Next.js (App Router) · React · TypeScript · Tailwind · Recharts · Lucide.

> ⚠ **DEMO ONLY.** Data is fictional and lives in *your browser's localStorage* — not a production database, not multi-user, not secure. The role switcher is not authentication. No payments, SMS, email or tax invoicing are connected; receipts are previews, not BIR-compliant. See `docs/PRODUCTION_READINESS.md`.

## Run it
```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 33 workflow tests (vitest)
npm run build && npm start   # production build
```
No API keys, accounts or environment variables are needed. **Reset Demo Data** (top bar ↺ or Administration → Demo & production) restores the seeded state. The demo uses a **controllable clock** (top bar `+10m / +1h`, starts at 9:00 AM today) so tee-time situations (delays, arrivals) are reproducible.

## What's in the box (15 modules + portal)
Executive Dashboard · Golf Operations · Membership · Reservations/Tee Sheet · Check-In & Starter · Caddie Management · Golf Carts · Course Maintenance · Driving Range (running tabs: items accumulate, one bill at bill-out) · Café/POS (running tabs + quick sale) · Tournaments & Events · Finance · Inventory & Assets · Reports (16 reports, filters, CSV) · Administration · mobile-first Golfer/Member Portal (`/portal`).
All screens share one data layer (`lib/store.tsx` → `lib/services/*`). Docs: `docs/DATA_MODEL.md`, `docs/schema.sql`, `docs/DEMO_ROLES.md`, `docs/PRODUCTION_READINESS.md`.

## Guided demo of the six scenarios (all real UI interactions)
Start as **General Manager** (can do everything) or switch roles as noted.
* **A – Public golfer:** *Reservations* → **Book** a slot (add 4 golfers, see fees) → *Check-In & Starter* → open booking → **Confirm arrival** → in the dialog **Assign next caddie ×2** and **Assign cart ×2** → pay the counter charge (**Pay**) → *Starter dashboard* → **Mark ready** → *Release* → **Pace checkpoint** → **Complete round** → *Dashboard* rounds/revenue/caddies/carts update.
* **B – Member with guests:** book with a **Member** golfer + 2 **Guest** golfers (sponsor selected); check in → charges post to the member account (*Membership → member → Account ledger*; *Finance*). Try a suspended member → rate/eligibility blocked.
* **C – Caddie rotation:** *Caddies* → queue → **Assign next**; choose a specific caddie → *Preferred request* (reason) or *Override* (reason, needs Caddie Master/Ops) → exception logged → complete round → *Fees & settlements* (contractor payable vs club revenue) → *Reports → Caddie rotation*.
* **D – Cart maintenance:** *Carts → Cart inventory →* #12 → **Report issue** → cart turns red, work order created, cannot be assigned/dispatched → as **Maintenance Staff**: *Course Maintenance* → open the cart work order → Advance to *In progress* → *For inspection* → as **Cart Supervisor**: **Inspect: pass & return to service** → available again.
* **E – Course restriction:** as **Superintendent**: *Maintenance → Restrict course/time* (e.g. tomorrow 7–10 AM, tee block) → dialog previews affected reservations → *Reservations → Restrictions & impact* → **Reschedule** affected golfers → **Lift restriction** → *Admin → Audit logs*.
* **F – Café member charge:** *Café / POS* → add coffee + meal → choose a member → **Charge to member account** → complete → *Membership → Ledger* and *Finance* show it once (no double counting); void as Café Manager restores stock/ledger.

## Assumptions (all configurable in Administration)
10-minute tee intervals, 4 players/flight, one booking per slot, 6:00–15:30 start window, 7-day public / 14-day member booking window, 24-hour cancellation policy with deposit forfeiture, 1 cart per 2 golfers, 1 caddie per 2 golfers, caddie club-share (employee 100% / contractor 0% / freelance 10%), rotation = fewest rounds then longest wait, pace 4h30 / 2h15, six *example* membership categories, green-fee/cart/caddie/café prices, 12% VAT *placeholder*.

## Test results & limitations
`npm test` → 33 tests: seed integrity (volumes, determinism, ledger/payment consistency, no double assignment), reservations (double-booking, capacity, member eligibility/rates, guest limits, windows, overlap, deposits), Scenarios A–F, finance rules (overpay, refund, write-off authority, shifts), maintenance flow, events, permissions, pace/delay alerts. `next build` succeeds; all 16 routes load without console errors in a Chromium smoke test; booking via the UI persists across reload.
Known limitations: shadcn/ui CLI components were not generated — equivalent hand-written components live in `components/ui.tsx`; photos/attachments, GPS, online payments, real notifications and official handicap are *future features* (labelled in the UI); work-order photos not implemented; the tournament scorer is gross-strokes only; localStorage (~5 MB) holds ≈ 14 days of seeded history; no multi-user sync; tests cover services (not browser E2E).

## Deploy to Vercel
No credentials were used and nothing was deployed. To deploy as a **new** project (never over an existing one):
```bash
npm i -g vercel && vercel login
vercel link --yes --project golf-club-os   # creates a NEW project
vercel --prod
```
or push this folder to its own GitHub repo and import it in Vercel (framework: Next.js, no env vars needed; `vercel.json` included).

## Structure
`app/(staff)/*` module pages · `app/portal` golfer portal · `components/` UI kit, shell, dialogs · `lib/services/*` business rules · `lib/seed.ts` deterministic seed (drives the real services) · `lib/store.tsx` shared state/persistence · `tests/` · `docs/`.
