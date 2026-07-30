# Product & Feature Roadmap: Business Helper

> **MVP Scope, Sprint Breakdown, Launch Gates & Expansion Roadmap**
>
> A structured execution document for **Business Helper** mapping the MVP functional scope, sprint-by-sprint release schedule, beta launch gates, and post-MVP expansion phases.

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
| **Sprint 2** | Aug 11–18 | Client CRM & Onboarding | Build 10-minute setup wizard (`/onboarding`), Client Directory view (`/dashboard/clients`), RFC Modulo-11 validator. | User can complete onboarding and register a client in <3 minutes. |
| **Sprint 3** | Aug 19–28 | Quotes & Proposals Engine | Build 3-step quote wizard (`/dashboard/quotes`), line-item tax calculator, public quote view (`/q/[token]`), OTP signature verification. | End-to-end Playwright test passes: Create quote → Send WhatsApp link → Client OTP sign → Convert to contract. |
| **Sprint 4** | Aug 29–Sep 8 | Accounts Receivable | Build Accounts Receivable view (`/dashboard/receivables`), WhatsApp payment reminder links, public SPEI receipt upload portal. | Client uploads SPEI voucher → Owner receives alert → Confirms payment → Receivable updates to `confirmed`. |
| **Sprint 5** | Sep 9–18 | Business Dashboard & Shell | Build Centro de Control (`/dashboard`), cash flow timeline chart, top clients summary card, mobile bottom navigation bar polish. | 100% responsive on 375px mobile viewport; all financial totals match DB aggregations. |
| **Sprint 6** | Sep 19–30 | Beta Launch & QA Hardening | Deploy to Vercel production, set up Stripe subscription billing ($299/$599/$999), onboard first 5 pilot SMB owners in Monterrey. | 5 real SMB owners create live quotes and send them to their clients without critical errors. |

---

## 04 Release Criteria & Go/No-Go Gates

### MVP Beta Release Gate (Week 8 — Sep 19, 2026)

Before launching the Beta to pilot SMB owners, the product must pass all 6 hard gates:

- [ ] **Data Isolation Gate**: 100% of database queries verified against multi-tenant RLS policies (`organization_id` scoping).
- [ ] **Mobile Performance Gate**: Mobile landing and dashboard viewports load in `< 1.8 seconds` on 4G connections.
- [ ] **Coverage Gate**: Unit test coverage across tax calculators, RFC validators, and storage dispatchers meets **>= 85%**.
- [ ] **Zero Warning Gate**: ESLint and TypeScript checks pass with `--max-warnings=0`.
- [ ] **OTP Security Gate**: Client signature OTP capped at 3 failed attempts; brute-force protection active.
- [ ] **File Security Gate**: SPEI receipt file uploads restricted to `< 5MB` with magic byte header validation (PNG/JPG/PDF only).

---

## 05 Post-MVP Feature Roadmap

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

---

## 06 Scope Modification & PMF Feedback Loop

> [!IMPORTANT]
> **Lean Startup Rule**: Future roadmap items (Phase 2 & 3) are flexible. If pilot users in Phase 1 request a feature not on the roadmap, we re-prioritize using the **RICE Scoring Matrix**:
> `RICE Score = (Reach * Impact * Confidence) / Effort`

* Features with RICE Score `> 50` bypass planned Phase 3 items.
* Features requiring >2 weeks of engineering without direct impact on cash collection or quote creation are rejected.
