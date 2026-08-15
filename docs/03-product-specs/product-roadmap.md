# Product & Feature Roadmap: Business Helper

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

> [!NOTE]
> **Live status lives in [`docs/STATUS.md`](../STATUS.md) — not here.** The sprint tables below record what was **planned and built**, not what is verified working. This file marked Sprints 1–16 "Completed" while CFDI stamping, Stripe checkout, team invites and the accountant export were all simulated — that is the incident this whole convention exists to prevent.

> **MVP Scope, Sprint Breakdown, Launch Gates & Expansion Roadmap**
>
> A structured execution document for **Business Helper** mapping the MVP functional scope, sprint-by-sprint release schedule, beta launch gates, and post-MVP expansion phases.

> [!IMPORTANT]
> **What "Completed" means in the sprint table below.** A 2026-08-06 security review established that
> several sprints marked complete had shipped the UI and data model while the third-party call underneath
> was simulated — CFDI stamping most seriously (issue #3). **Read every `[x]` in this document as
> "scope built and unit-tested", not "integration verified against the real service."**
>
> For what is actually launch-safe, see
> [`docs/STATUS.md`](../STATUS.md),
> which supersedes this document wherever the two conflict.
>
> Test counts cited per sprint (`73/73`, `152/152`, `182/182` …) refer to the retired
> `scripts/test-runner.js`, deleted in PR #21. **The current baseline lives in [`docs/STATUS.md`](../STATUS.md) — this file no longer restates it, because it was 182, then 383, then 494, and wrong each time.**
> The per-sprint counts are kept as a historical record only.

---

## 01 Roadmap Overview & Timeline

```mermaid
gantt
    title Product Roadmap: Business Helper (2026)
    dateFormat  YYYY-MM-DD
    section Phase 1: MVP Core
    Sprint 1 (Repo, Auth & Schema)     :active, 2026-08-03, 2026-08-10
    Sprint 2 (Client CRM & Onboarding) :active, 2026-08-11, 2026-08-18
    Sprint 3 (Quotes & Proposals)      :active, 2026-08-19, 2026-08-28
    Sprint 4 (Accounts Receivable)     :active, 2026-08-29, 2026-09-08
    Sprint 5 (Business Dashboard)      :active, 2026-09-09, 2026-09-18
    Sprint 6 (Pilot Beta Launch)       :active, 2026-09-19, 2026-09-30
    section Phase 2: CFDI & Team
    Sprint 7 (SAT CFDI 4.0 Invoicing)  :2026-10-01, 2026-10-15
    Sprint 8 (Team Roles & Export ZIP) :2026-10-16, 2026-10-31
    section Phase 3: AI & Stock
    Sprint 9 (Product Catalog & Stock) :2026-11-01, 2026-11-15
    Sprint 10 (WhatsApp AI Assistant)  :2026-11-16, 2026-11-30
```

---

## 02 Phase 1: MVP Scope & Feature Backlog (Weeks 1–8)

The MVP focuses exclusively on completing the core **Quote → Contract → Pay → Confirm** loop.

### Module 1: Client Directory & CRM-Lite (Sprint 2)
* [x] **Client Profiles**: Create, view, edit client business name, contact person, phone (WhatsApp), email, RFC, and SAT tax regime.
* [x] **RFC Modulo 11 Validator**: Live validation of Mexican RFC syntax (12 chars for Moral, 13 for Física) with check-digit verification.
* [x] **Client Activity History**: Chronological feed of quotes sent, contracts signed, and payments received per client.
* [x] **Client Health Score**: Computed 0–100 score based on historical payment timeliness.

### Module 2: Quotes & Proposals Wizard (Sprint 3)
* [x] **3-Step Quote Generator**: Select client → Add line items with quantities & unit prices → Auto-calculate SAT taxes (IVA 16%, ISR withholding, IVA withholding).
* [x] **WhatsApp One-Tap Share**: Generate context-specific `wa.me/` links with pre-filled professional proposal copy and public view URL (`/q/[token]`).
* [x] **Public Quote Portal**: Zero-login mobile web view for clients to review line items, approve, or request revisions.
* [x] **OTP Digital Signature**: Client accepts quote by verifying a 6-digit OTP sent to their mobile number, generating a SHA-256 cryptoseal.
* [x] **Quote → Contract Conversion**: One-tap transformation of an accepted quote into a binding contract with milestone receivables.

### Module 3: Accounts Receivable & SPEI Tracking (Sprint 4)
* [x] **"Quién me Debe" Dashboard Card**: Real-time totals for Overdue (*Atrasado*), Due Today (*Vence Hoy*), and Upcoming (*Por Vencer*).
* [x] **Automated WhatsApp Payment Reminders**: Pre-filled Click-to-Chat follow-up links sent 3 days before, on due date, and when overdue.
* [x] **SPEI Voucher Upload Portal**: Public link allowing clients to upload SPEI transfer receipts and enter Banxico *Clave de Rastreo*.
* [x] **Payment Confirmation Workflow**: Owner reviews uploaded SPEI receipt and confirms milestone payment with one tap.

### Module 4: Business Dashboard & Analytics (Sprint 5)
* [x] **Centro de Control**: Real-time business financial health view (Collected Revenue, Pending Receivables, Overdue Debt).
* [x] **Top Clients by Revenue**: Ranking of top revenue-generating accounts.
* [x] **Cash Flow Forecast**: Projected 30/60/90-day cash inflows based on active milestone due dates.

---

## 03 Sprint Execution Breakdown

| Sprint | Dates | Core Objective | Key Deliverables | Verification / Definition of Done |
|:---|:---|:---|:---|:---|
| **Sprint 1** | Aug 3–10 | Architecture & Repo Setup | Fork codebase to `business-helper`, run Supabase migrations (`organizations`, `organization_members`, `clients`, `quotes`), setup multi-tenant RLS policies. | [x] Completed — `npm run test` passes (35/35), 8 PostgreSQL tables & multi-tenant RLS policies defined. |
| **Sprint 2** | Aug 11–18 | Client CRM & Onboarding | Build 10-minute setup wizard (`/onboarding`), Client Directory view (`/dashboard/clients`), RFC Modulo-11 validator. | [x] Completed — `npm run test` passes (44/44), setup wizard, Client Directory, 0-100 Health Score & 1-tap WhatsApp links delivered. |
| **Sprint 3** | Aug 19–28 | Quotes & Proposals Engine | Build 3-step quote wizard (`/dashboard/quotes`), line-item tax calculator, public quote view (`/q/[token]`), OTP signature verification. | [x] Completed — `npm run test` passes (55/55), 3-step quote wizard, public quote portal (`/q/[token]`), OTP cryptoseal & 1-tap contract conversion delivered. |
| **Sprint 4** | Aug 29–Sep 8 | Accounts Receivable | Build Accounts Receivable view (`/dashboard/receivables`), WhatsApp payment reminder links, public SPEI receipt upload portal. | [x] Completed — `npm run test` passes (63/63), Accounts Receivable view (`/dashboard/receivables`), WhatsApp payment reminders, public SPEI portal (`/pay/[token]`) & payment confirmation delivered. |
| **Sprint 5** | Sep 9–18 | Business Dashboard & Shell | Build Centro de Control (`/dashboard`), cash flow timeline chart, top clients summary card, mobile bottom navigation bar polish. | [x] Completed — `npm run test` passes (67/67), Centro de Control (`/dashboard`), 30/60/90-day cash flow forecast & top clients leaderboard delivered. |
| **Sprint 6** | Sep 19–30 | Beta Launch & QA Hardening | Deploy to Vercel production, set up Stripe subscription billing ($299/$599/$999), onboard first 5 pilot SMB owners in Monterrey. | [~] Scope built — Settings & Stripe Billing (`/settings`), health check (`/api/health`). **Correction:** checkout was simulated until PR #19; live-mode verification still outstanding (issue #14). Pilot onboarding not started. |
| **Sprint 7** | Oct 1–15 | SAT CFDI 4.0 Invoicing & Product Catalog | Deliver Facturapi PAC 1-click CFDI 4.0 stamping (`/invoices`), 1-click accountant export package (ZIP/CSV), Product Catalog (`/products`) with SAT keys (`E48`, `84111506`), and outbound automated WhatsApp reminder broadcasts. | [~] Scope built — Product Catalog & accountant ZIP export delivered (export made real in PR #19). **Correction:** the "Facturapi SAT CFDI 4.0 engine" was `simulateInvoiceStamping()` — fabricated IDs and URLs written as `cfdi_status: 'issued'` (issue #3). Real PAC integration is **unmerged** in PR #23 and unverified against a live sandbox. |
| **Sprint 8** | Oct 16–31 | Team Roles & Permissions (RBAC) | Multi-User Access & Role Permissions (`/team`), capabilities matrix (`owner`, `manager`, `member`, `accountant`), team invite portal. | [x] Completed — `npm run test` passes (88/88), Team Roles & RBAC engine delivered. |
| **Sprint 9** | Nov 1–15 | Product Catalog & Inventory Stock | Inventory stock level tracking, low-stock threshold warning alerts (<= 5 units), stock deduction on contract creation. | [x] Completed — `npm run test` passes (91/91), Inventory stock tracking & low-stock alerts delivered. |
| **Sprint 10** | Nov 16–30 | WhatsApp AI Operations Assistant | Natural language query handler (`/assistant`) parsing client overdue balances (*"¿Cuánto me debe Grupo Salinas?"*) with 1-tap WhatsApp action links. | [x] Completed — `npm run test` passes (107/107), WhatsApp AI Operations Assistant engine & SPEI upload route delivered. |
| **Sprint 11** | Dec 1–15 | Phase 4 Post-Launch Expansion | Outbound Automated WhatsApp API Engine (Twilio/Meta), Multi-Currency Engine (USD/MXN), and White-Labeling & Organization Branding on public quote and payment portals. | [~] Scope built — Multi-Currency & White-Labeling delivered. **Correction:** outbound WhatsApp reported fabricated success until PR #13 made the dispatch real; it remains inert until provider credentials are configured (issue #2). |
| **Sprint 12** | Pre-Launch | Landing Page & Marketing Alignment | Mobile touch target enforcement (>= 48px), conversion copy alignment with landing page brief, zero-SAT-friction Nota de Venta PDF and 1-Click Accountant ZIP Export callouts. | [x] Completed — `npm run test` passes (144/144), 0 TypeScript warnings (`npm run typecheck`), mobile touch targets & landing page visual polish delivered. |
| **Sprint 13** | Pre-Launch | Demo Fixes, Brand Dark Theme & Tier Comparison | Guarantee demo analytics load non-zero metrics ($145k MXN revenue, cash flow forecast, top clients), unify inner app with Brand Guidelines Dark Slate theme (#090D16 base, emerald accents), sticky Demo Banner with 1-tap landing return link, and interactive Tier Features & Value-Adds comparison matrix modal. | [x] Completed — `node scripts/test-runner.js` passes (152/152), 0 TypeScript warnings (`npm run typecheck`), demo data loading, brand dark theme & tier comparison modal delivered. |
| **Sprint 14** | Pre-Launch | Demo Auth Persistence & Top Navbar Unification | Persist demo/sandbox mode cookies (`demo_mode=true`, `business_helper_sandbox=true`) during unauthenticated navigation, eliminate all login redirect interruptions, and unify top `<Header />` navbar layout across all 10 dashboard pages (`/dashboard`, `/quotes`, `/clients`, `/receivables`, `/products`, `/invoices`, `/team`, `/assistant`, `/help`, `/settings`). | [x] Completed — `node scripts/test-runner.js` passes (158/158), 0 TypeScript warnings (`npm run typecheck`), demo auth persistence & unified navbar layout delivered. |
| **Sprint 15** | Post-Launch | B2B Client Trade Credit Management & SAT PPD/CPP Engine | Extend `clients` database schema and CRM components (`ClientFormModal`, `ClientCard`, `ClientDetailPage`) with B2B credit limit (`credit_limit`), credit terms (`credit_days`), and credit status (`credit_status`). Add live credit limit enforcement and risk warnings to `QuoteWizardModal`. Upgrade Facturapi PAC engine (`lib/facturapi.ts`) to support SAT CFDI 4.0 `PPD` (Pago en Parcialidades o Diferido) and `CPP` (Complemento para Recepción de Pagos). | [x] Completed — `node scripts/test-runner.js` passes (162/162), 0 TypeScript warnings (`npm run typecheck`), B2B credit limits, quote credit guards & SAT PPD/CPP invoicing delivered. |
| **Sprint 16** | Pre-Launch | In-App AI Support Agent Engine | Build in-app AI support endpoint (`/api/ai/support`), extend `lib/whatsappAI.ts` with product FAQ RAG context (`lib/helpFAQ.ts`), classify intents (`app_support_faq`, `client_overdue_balance`, `general_receivables_summary`, `human_handoff_request`), and provide interactive in-app AI chat console on `/help`. | [x] Completed — `node scripts/test-runner.js` passes (171/171), 0 TypeScript warnings (`npm run typecheck`), in-app AI support agent delivered. |
| **Sprint WS-A** | Post-Review | Credibility & Trust Fixes | Replace placeholder profiles with realistic Mexican SME profiles, replace mock hex hashes with labeled SHA-256 seals, add SAT/SSL/SPEI/PAC trust badges, visible contact info (Tijuana/San Diego), founder profiles (Hector Zamora CEO, Gilberto Santana CTO, Guillermo Fernandez COO), and animated demo video storyboard. | [x] Completed — `node scripts/test-runner.js` passes (177/177), 0 TypeScript warnings (`npm run typecheck`), credibility & trust assets delivered. |
| **Sprint WS-B** | Post-Review | CFDI Pricing Repositioning & SAT CSD Trust Messaging | Reposition CFDI 4.0 invoicing as pay-per-folio add-on ($5/$3/$2 MXN/folio) across all plans per `cfdi_integration_architecture.md`. Add Stripe CFDI folio pack products ($100 MXN / 50 folios & $350 MXN / 200 folios). Align FAQ copy and integrate explicit SAT CSD zero-storage trust guarantee ("Nunca almacenamos tus certificados SAT"). | [x] Completed — `node scripts/test-runner.js` passes (182/182), 0 TypeScript warnings (`npm run typecheck`), CFDI add-on pricing, Stripe folio packs & SAT CSD trust messaging delivered. |




---

## 04 Release Criteria & Go/No-Go Gates

### MVP Beta Release Gate (Week 8 — Sep 19, 2026)

Before launching the Beta to pilot SMB owners, the product must pass all 6 hard gates:

- [x] **Data Isolation Gate**: Database queries scoped to multi-tenant RLS policies (`organization_id`); API auth enforcement added in PR #1.
- [x] **Mobile Performance Gate**: Mobile landing and dashboard viewports load in `< 1.8 seconds` on 4G connections.
- [x] **Coverage Gate**: `npx vitest run --coverage` runs in CI against the thresholds in `vitest.config.ts` (#51). Live figures: `docs/STATUS.md`.
- [x] **Zero Warning Gate**: `npm run typecheck` passes clean and CI runs both on every PR. The lint script is `next lint --max-warnings=0` (#46), so any warning fails the `Lint` step — verified by planting a warning and watching the command exit non-zero.
- [~] **OTP Security Gate**: Verification is capped at 3 failed attempts, but **issuance is capped per quote rather than per recipient phone** — one handset can be pumped across a client's several open quotes (issue #17). PR #20 closes this and must merge before a provider goes live.
- [x] **File Security Gate**: SPEI receipt file uploads restricted to `< 5MB` with magic byte header validation (PNG/JPG/PDF only).

> [!CAUTION]
> **These six gates are necessary but not sufficient.** They were all reported green while CFDI stamping
> was simulated and OTP delivery had no provider — because none of them test whether a third-party
> integration actually executes. The money-path and delivery gates in
> [`docs/STATUS.md`](../STATUS.md) §04
> cover that gap and must pass as well.

---

## 05 Product Gap Analysis & Prioritization

The following strategic gaps have been identified and prioritized based on competitive benchmarks and customer friction analysis:

### ⚡ Immediate MVP Launch Gaps (Phase 1.5 / Pre-Launch Polish)
1. * [ ] **SAT CFDI 4.0 Electronic Invoicing (PAC)**: B2B clients in Mexico frequently withhold payment until a valid CFDI invoice is issued. **Not delivered** — the original implementation simulated stamping (issue #3). Real PAC integration is unmerged in PR #23 and has never run against a live sandbox.
2. * [x] **1-Click Accountant Export Package (ZIP/CSV)**: External accountants (*contadores*) are key B2B influencers in Mexico. Delivered; made to read real milestones rather than hardcoded fixtures in PR #19.
3. * [x] **Pre-Saved Product & Service Catalog**: Allow saving standard products/services with SAT unit keys (`E48`) and product codes (`84111506`) to speed up quote creation from minutes to seconds.
4. * [~] **Outbound Automated WhatsApp API (Twilio / Meta)**: Dispatch code is real as of PR #13, but **inert until provider credentials are configured** (issue #2).

### 🚀 Post-MVP Expansion Gaps (Phase 2 & 3 Roadmap)
1. * [x] **Multi-User Role-Based Access Control (RBAC)** (Phase 2): Grant `Owner`, `Manager`, `Member`, and `Accountant` permissions for multi-employee SMB teams.
2. * [x] **Inventory Stock Tracking & Alerts** (Phase 3): Basic stock tracking and low-stock alerts for product-based SMBs and distributors.
3. * [x] **WhatsApp AI Operations Assistant** (Phase 3): Natural language query and action handler on WhatsApp (*"¿Cuánto me debe Grupo Salinas?"*).

---

## 06 Post-MVP Feature Roadmap

### Phase 2: Invoicing & Team Roles (Weeks 9–14 — Q4 2026)

#### Module 5: SAT CFDI 4.0 Electronic Invoicing
* **1-Click Stamping**: Generate official SAT CFDI 4.0 invoices directly from accepted quotes or confirmed milestone payments via Facturapi PAC.
* **Invoice Tracking**: Monitor status (*emmitida*, *cancelada*, *pendiente*).
* **Accountant ZIP Export**: Download 1-month bundle containing all XMLs, PDFs, and SPEI receipts organized in folders.

#### Module 6: Team Roles & Permissions
* **Multi-User Access**: Invite team members with role-based access (`Owner`, `Manager`, `Member`, `Accountant`).
* **Audit Trail**: Activity log tracking which team member created each quote or confirmed each payment.

### Phase 3: Inventory & AI Assistant (Weeks 15–20 — Q1 2027)

#### Module 7: Product Catalog & Basic Inventory
* **Product Catalog**: Pre-save standard products/services with SAT unit keys (`E48`) and product codes (`84111506`).
* **Stock Tracking**: Optional inventory level alerts for product-based distributors.

#### Module 8: WhatsApp AI Operations Assistant
* **Natural Language Queries**: Owner asks on WhatsApp: *"¿Cuánto me debe Construcciones Maya?"* → AI replies instantly with current overdue balance and payment link.
* **Smart Follow-up Timing**: AI analyzes client payment history to suggest optimal days/times to send WhatsApp payment reminders.

#### Module 9: White-Labeling & Organization Branding (Branding Sprint)
* **Tenant Logo & Asset Storage**: Upload custom SVG/PNG company logos stored in Supabase Storage (`org-logos`).
* **Dynamic Theme Application**: Dynamically set `--primary-color`, `--header-bg`, and `--accent-color` generated by `lib/branding.ts` across public portals (`/q/[token]`, `/sign/[token]`, `/pay/[token]`).
* **Branded Deliverables**: Embed custom logo and header styling on generated PDF quotes, contract downloads, and WhatsApp notification footers.
* **Custom Enterprise CNAME**: (Phase 4 Extension) CNAME routing support for Plan Empresa subscribers (`cotizaciones.minegocio.com`).

#### Module 10: Production Cloud QA & Live Environment Testing (Comprehensive Testing Sprint)
* **Vercel Edge Runtime Parity**: Run `vercel dev` edge runtime simulation in local CI to catch Edge V8 isolate incompatibilities, missing globals, and middleware matcher edge-cases prior to deployment.
* **Live Staging E2E Test Suite (Playwright)**: Automated Playwright end-to-end tests targeted directly against live Vercel URLs (`NEXT_PUBLIC_APP_URL`) covering onboarding, quote creation, OTP cryptoseals, and SPEI uploads.
* **Supabase Live DB & RLS Integration Audit**: Integration assertions verifying real PostgreSQL multi-tenant isolation, auth session persistence, and Storage bucket file policies (`spei-vouchers`).
* **Cloud Latency & Cold-Start Benchmarking**: Automated latency profiling (< 1.8s LCP on 4G) and health check smoke testing (`/api/health`).

#### Module 15: Full Master Branding & Commercial Identity Sprint (Pre-Domain Gate Sprint)
* **Brand Strategy & Naming**: Perform brand name positioning, trademark clearance, and Mexican B2B market messaging alignment prior to domain registration.
* **Visual Identity System**: Design logo variants, typography guidelines, primary/secondary color palettes, and social media brand kit.
* **Dynamic Landing Page Refresh**: Refresh `/app/page.tsx` marketing copy, hero sections, interactive ROI pricing calculators, and video demo placeholders based on finalized brand identity.
* **Domain & Registrar Selection Gate**: Lock in custom apex domain (e.g. `businesshelper.app`, `cotiza.mx`) only AFTER brand identity approval.

---

## 07 Scope Modification & PMF Feedback Loop

> [!IMPORTANT]
> **Lean Startup Rule**: Future roadmap items (Phase 2 & 3) are flexible. If pilot users in Phase 1 request a feature not on the roadmap, we re-prioritize using the **RICE Scoring Matrix**:
> `RICE Score = (Reach * Impact * Confidence) / Effort`

* Features with RICE Score `> 50` bypass planned Phase 3 items.
* Features requiring >2 weeks of engineering without direct impact on cash collection or quote creation are rejected.

---

## 08 Third-Party Environment Keys & Sprint Scoping Matrix

The following matrix documents when optional or pending third-party API credentials are scoped for production enablement according to @[docs/AGENTS-DOCS-GUIDE.md]:

| Environment Variable | Service | Current MVP Status | Production Enablement Sprint Scope |
|:---|:---|:---|:---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase DB & Auth | 🟢 Active (`.env`) | **Sprint 1** (Core Database & Auth Infrastructure) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Client Key | 🟢 Active (`.env`) | **Sprint 1** (Core Database & Auth Infrastructure) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role | 🟢 Active (`.env`) | **Sprint 1** (Backend RLS & Storage Bypass) |
| `STRIPE_SECRET_KEY` | Stripe Billing API | 🟡 Sandbox Mode | **Launch Gate — P0** → [#68](https://github.com/jesushzv/business-helper/issues/68). Live key required to take payment. |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Listener | 🟡 Configured | **Launch Gate — P0** → [#63](https://github.com/jesushzv/business-helper/issues/63). Signature enforcement is live in code (PR #16); verify against staging with `npm run verify:webhook`. |
| `STRIPE_PRICE_*` | Stripe Plan Price IDs | 🟡 Price ID Config | **Launch Gate — P0** → [#68](https://github.com/jesushzv/business-helper/issues/68). Map live IDs for each tier; a mismatched map charges the wrong amount. |
| `OTP_DELIVERY_CHANNEL` | OTP channel selector | 🔴 **Unset — flow inoperable** | **Launch Gate — P0** → [#2](https://github.com/jesushzv/business-helper/issues/2). Must be `sms` or `whatsapp` (`sms` is the launch channel; `whatsapp` needs a WABA + approved auth template, #42); unset means `POST /api/quotes/public/[token]/otp` returns 502 and no quote can be signed. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio — **deprecated for OTP** | ⚪ Not required | Email (Resend) has been the OTP launch channel since 2026-08-11, and the sms/whatsapp paths came out of the code in PR #315. Still read by the outbound reminder path (`lib/whatsappOutbound.ts`). Not a launch gate; #2 closed on the email channel (#319). |
| `TWILIO_SMS_NUMBER` / `TWILIO_WHATSAPP_NUMBER` | Twilio sender | ⚪ Not required | Same as above — deprecated for OTP; sender numbers matter only if the reminder path is used (#319). |
| `META_WHATSAPP_TOKEN` / `META_PHONE_NUMBER_ID` | Meta Cloud API | 🔵 Alternative to Twilio | Alternative provider for the same P0 requirement. |
| `PAC_ENCRYPTION_KEY` | PAC API key sealing (AES-256-GCM) | 🔴 Unset | **Required before any PAC can be connected** (PR #23). |
| `FACTURAPI_SECRET_KEY` | Facturapi SAT PAC | 🟡 Test Mode (`sk_test_`) | **Launch Gate — P0** → [#26](https://github.com/jesushzv/business-helper/issues/26). *CFDI shipping at launch was resolved by the founder on 2026-08-07, so this is no longer conditional — the "optional if CFDI is deferred" wording is obsolete.* |
| `GEMINI_API_KEY` | Gemini AI Assistant | 🔵 Fallback Mock AI | P2 — assistant degrades gracefully without it. |
| `NEXT_PUBLIC_SENTRY_DSN` | Error Tracking | 🔴 **No transport exists** | **P1.** Setting the DSN alone does nothing: `lib/sentry.ts` only `console.error`s and there is no `@sentry/nextjs` dependency. A real transport must be added. |

