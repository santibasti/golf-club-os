# Production-readiness checklist
This repository is a **demonstration**. Nothing below is claimed as done unless ticked.

## Identity, authorization, tenancy
- [ ] Replace the demo role switcher with Supabase Auth (email/OTP/SSO); map users → `users.role_id`
- [ ] Enforce permissions **server-side** (RLS policies + API guards); never rely on hidden buttons
- [ ] Row-level security on every table by `club_id` (template at the end of `schema.sql`); automated cross-tenant tests
- [ ] Club onboarding, per-club settings, per-club domains/branding
## Data & integrity
- [ ] Move services to server (transactions, serializable isolation for slot capacity, caddie/cart exclusivity)
- [ ] Apply `schema.sql` constraints/triggers (capacity guard, payment ≤ outstanding)
- [ ] Append-only audit log (revoke UPDATE/DELETE), backups, point-in-time recovery, retention policy
- [ ] Migrations, seed scripts, concurrency tests (two staff booking the same slot)
## Payments, tax, compliance (requires qualified advice)
- [ ] Licensed payment gateway integration (GCash/Maya/cards) — PCI scope via hosted fields only
- [ ] BIR-compliant invoicing/POS (CAS/EIS accreditation, official receipts); current receipts are **previews only**
- [ ] VAT/service-charge/withholding rules; SC/PWD discounts
- [ ] Data Privacy Act (NPC) review: consent, retention, DPO, breach process; photos/ID handling
## Operations
- [ ] Real SMS/email provider (templates, opt-out, rate limits) — demo logs *simulated* messages only
- [ ] Offline/low-connectivity strategy for the starter & caddie master tablets
- [ ] Official handicap/tournament rule engines (demo scoring = gross strokes only)
- [ ] GPS pace-of-play (manual checkpoints today), weather API (placeholder today)
- [ ] File/photo storage for members, work orders, incidents (Supabase Storage)
## Quality & delivery
- [ ] E2E tests (Playwright) on top of the included service tests; accessibility audit; load test
- [ ] Observability (Sentry, logs), CI/CD, environments, secret management
- [ ] Penetration test; admin MFA; session policies
