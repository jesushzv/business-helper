# Feature Implementation Spec: Sprint 3 — Quotes & Proposals Engine

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprint 3 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Sprint 3 — 3-Step Quote Generator, Public Quote Approval Portal, OTP Digital Signature & Quote-to-Contract Conversion
* **Target Module**: Quotes & Proposals Engine (`/app/(dashboard)/quotes`, `/app/q/[token]`, `/components/quotes`, `/lib/quoteCalculator.ts`, `/lib/quoteToContract.ts`, `/lib/otpSeal.ts`, `/lib/hooks/useQuotes.ts`, `/app/api/quotes`)
* **Primary User**: Don Roberto ("El Dueño Tradicional") & Lic. Mariana ("La Administradora Eficiente")
* **Goal**: Deliver a 3-step quote generator (`/dashboard/quotes`), live SAT tax calculation per line item, 1-tap WhatsApp link sharing (`wa.me/` with `/q/[token]` public link), zero-login mobile public quote approval portal (`/q/[token]`), 6-digit OTP digital signature verification with SHA-256 cryptoseal, and 1-tap Quote → Contract transformation with milestone receivables.

### Scope Boundaries
* **In Scope**:
  * **3-Step Quote Generator (`components/quotes/QuoteWizardModal.tsx`)**: Step 1: Select client & quote details; Step 2: Add line items with quantities, prices & SAT tax toggles (IVA 16%, ISR 10%, IVA 10.6667%); Step 3: Preview breakdown & generate WhatsApp link.
  * **Quotes Dashboard View (`app/(dashboard)/quotes/page.tsx`)**: Responsive mobile-first list with status filter (`draft`, `sent`, `accepted`, `rejected`, `converted`), search bar, summary cards, 1-tap WhatsApp share buttons, and 1-tap Convert to Contract trigger.
  * **Public Quote Portal (`app/q/[token]/page.tsx`)**: Zero-login mobile web view for clients to review line items, totals, organization logo, accept/sign quote via OTP, or request revisions via WhatsApp.
  * **OTP Digital Signature Modal (`components/quotes/OtpSignatureModal.tsx`)**: 6-digit OTP code entry, validation, attempt tracking, and SHA-256 contract cryptoseal creation.
  * **Core Logic Helpers (`lib/quoteCalculator.ts`, `lib/quoteToken.ts`, `lib/quoteToContract.ts`, `lib/otpSeal.ts`)**:
    * `calculateQuoteTotals`: Calculates subtotal, IVA, Retención ISR, Retención IVA, and total amount across line items.
    * `generatePublicToken`: Creates cryptographic random token for secure public quote URLs.
    * `convertQuoteToContract`: Transforms an accepted quote into contract schema and milestone receivables (50% anticipo, 50% entrega).
    * `generateDigitalSeal`: Generates SHA-256 digest hash from contract terms, client name, timestamp, and verified OTP.
  * **Custom React Hook (`lib/hooks/useQuotes.ts`)**: Dual-mode state dispatcher (Demo LocalStorage + Supabase `/api/quotes`).
  * **API Route Handlers (`app/api/quotes/route.ts`, `app/api/quotes/[id]/route.ts`, `app/api/quotes/[id]/convert/route.ts`, `app/api/quotes/public/[token]/route.ts`)**: Multi-tenant RLS routes for quote lifecycle and public quote signing.
  * **TDD Unit Test Suite in `scripts/test-runner.js`**: Unit tests for tax calculations, public tokens, contract conversion, and OTP cryptoseals.
* **Out of Scope**:
  * SPEI voucher upload portal & Accounts Receivable aging dashboard (Sprint 4).
  * Facturapi CFDI 4.0 XML stamping (Sprint 7).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [ ] **AC 3.1**: 3-Step Quote Generator Modal (`components/quotes/QuoteWizardModal.tsx`) enables creating proposals with multiple line items, custom quantities, unit prices, and SAT tax options in < 2 minutes on mobile viewport.
- [ ] **AC 3.2**: Quotes Dashboard (`/dashboard/quotes`) displays active quotes with status filters (`all`, `draft`, `sent`, `accepted`, `converted`), 1-tap WhatsApp Click-to-Chat buttons (>= 48px tap targets), and "Nueva Cotización" primary action.
- [ ] **AC 3.3**: Public Quote Portal (`/q/[token]`) provides zero-login mobile view displaying line items, SAT tax breakdown, organization logo, "Aceptar y Firmar" button, and "Solicitar Cambios por WhatsApp" button.
- [ ] **AC 3.4**: OTP Digital Signature verifies 6-digit OTP code, caps attempts at max 3 failures, and generates a SHA-256 cryptoseal upon successful acceptance.
- [ ] **AC 3.5**: 1-Tap Quote → Contract Conversion transforms accepted quotes into contracts with initial milestone receivables (50% anticipo, 50% finiquito).
- [ ] **AC 3.6**: Core modules `quoteCalculator.ts`, `quoteToken.ts`, `quoteToContract.ts`, and `otpSeal.ts` are 100% unit-tested in `scripts/test-runner.js`.
- [ ] **AC 3.7**: Quote API route handlers enforcement of `organization_id` multi-tenant security and dual-mode execution (Demo LocalStorage + Supabase).
- [ ] **AC 3.8**: Quality gates (`npm run typecheck` and `npm test`) pass with 0 errors and 0 warnings.

### Should-Have (P1)
- [ ] **AC 3.9**: Empty state graphics and quick-add templates for quotes.
- [ ] **AC 3.10**: Mobile responsive optimization for 375px viewports.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: All interactive elements (buttons, line item inputs, status badges, WhatsApp links) MUST have a minimum height/width of **48px** (`min-h-[48px]`, `p-3`).
2. **1-Tap WhatsApp Links**: Click-to-chat links must open `https://wa.me/521XXXXXXXXXX?text=...` directly with pre-filled proposal copy including `/q/[token]` URL.
3. **High-Contrast Metrics**: Quote monetary totals shown in large bold typography (`text-2xl font-bold text-slate-900`).
4. **Zero-Cognitive Burden Line Items**: Default unit SAT keys (`E48` - Servicio) and pre-filled total tax calculations.

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Core Logic & Utilities
* `lib/quoteCalculator.ts` / `lib/quoteCalculator.js` — Line items SAT tax breakdown & total calculator.
* `lib/quoteToken.ts` / `lib/quoteToken.js` — Public crypto token generator.
* `lib/quoteToContract.ts` / `lib/quoteToContract.js` — Quote to Contract + Milestone data transformer.
* `lib/otpSeal.ts` / `lib/otpSeal.js` — OTP generator, verification & SHA-256 digital cryptoseal generator.
* `lib/hooks/useQuotes.ts` — React hook for quote lifecycle state management and API dispatch.

#### UI Components & Layout
* `components/quotes/QuoteWizardModal.tsx` — 3-step quote generator wizard.
* `components/quotes/QuoteCard.tsx` — Quote item card with 1-tap WhatsApp trigger & convert button.
* `components/quotes/QuoteStatusBadge.tsx` — Status badge component.
* `components/quotes/OtpSignatureModal.tsx` — Public OTP verification modal.

#### Pages & Views
* `app/(dashboard)/quotes/page.tsx` — Quotes & Proposals dashboard view.
* `app/q/[token]/page.tsx` — Public mobile quote approval portal.

#### Server API Handlers
* `app/api/quotes/route.ts` — GET / POST for org quotes.
* `app/api/quotes/[id]/route.ts` — GET / PUT / DELETE for single quote.
* `app/api/quotes/[id]/convert/route.ts` — POST to convert accepted quote to contract.
* `app/api/quotes/public/[token]/route.ts` — GET / POST public token quote view & OTP signature handler.

#### Tests & Roadmap Sync
* `scripts/test-runner.js` — Unit test suite expansion for quotes, taxes, OTP, and cryptoseal.
* `docs/03-product-specs/product-roadmap.md` — Sprint 3 completion update.

---

## 05 4-Phase Execution Checklist

- [ ] **Phase 1: Planning & Architecture**: Inspected database schema, app architecture, user personas; updated `feature_implementation_spec.md` and created `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for quote calculations, token creation, contract conversion, and OTP cryptoseal. Verify Red phase.
- [ ] **Phase 3: Implementation & Security Review**: Implement logic helpers, hooks, API routes with `organization_id` multi-tenancy, Quote Wizard, Quotes list view, and Public Quote portal.
- [ ] **Phase 4: Verification & Quality Gates**: Execute `npm run typecheck` and `npm test` (0 errors/warnings). Mark Sprint 3 complete in `product-roadmap.md` and commit code.
