# Feature Implementation Spec: Sprint 4 — Accounts Receivable & SPEI Tracking

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprint 4 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Sprint 4 — Accounts Receivable Dashboard ("Quién me Debe"), WhatsApp Payment Reminders, Public SPEI Receipt Upload Portal & Payment Confirmation Workflow
* **Target Module**: Accounts Receivable & SPEI Tracking (`/app/(dashboard)/receivables`, `/app/pay/[token]`, `/components/receivables`, `/lib/receivablesCalculator.ts`, `/lib/whatsappReminder.ts`, `/lib/speiValidator.ts`, `/lib/hooks/useReceivables.ts`, `/app/api/receivables`)
* **Primary User**: Don Roberto ("El Dueño Tradicional") & Lic. Mariana ("La Administradora Eficiente")
* **Goal**: Deliver the "Quién me Debe" dashboard view (`/dashboard/receivables`), real-time totals for Overdue (*Atrasado*), Due Today (*Vence Hoy*), and Upcoming (*Por Vencer*), pre-filled WhatsApp payment reminder Click-to-Chat links (3 days before, on due date, overdue), zero-login mobile public SPEI receipt upload portal (`/pay/[token]`) with Banxico *Clave de Rastreo* entry, and 1-tap owner payment confirmation workflow.

### Scope Boundaries
* **In Scope**:
  * **"Quién me Debe" Summary Cards (`components/receivables/ReceivablesSummaryCards.tsx`)**: Real-time KPI breakdown for Overdue (*Atrasado*), Due Today (*Vence Hoy*), Upcoming (*Por Vencer*), and Confirmed Paid (*Cobrado*).
  * **Accounts Receivable Dashboard (`app/(dashboard)/receivables/page.tsx`)**: Mobile-first list view with status filter tabs (`all`, `overdue`, `due_today`, `upcoming`, `marked_paid`, `confirmed`), client search, 1-tap WhatsApp reminder triggers, and 1-tap Payment Confirmation modal triggers.
  * **WhatsApp Payment Reminders (`lib/whatsappReminder.ts`)**: Pre-filled Click-to-Chat follow-up links customized by status (`upcoming_3d`, `due_today`, `overdue`) including client name, milestone label, amount, due date, and public SPEI upload link (`/pay/[token]`).
  * **Public SPEI Voucher Upload Portal (`app/pay/[token]/page.tsx`)**: Mobile zero-login web page allowing clients to view milestone amount, bank CLABE transfer details, upload receipt (PNG/JPG/PDF < 5MB), enter Banxico *Clave de Rastreo*, and submit proof.
  * **Payment Confirmation Workflow (`components/receivables/SpeiConfirmModal.tsx` & `/api/receivables/[id]/confirm`)**: Owner reviews uploaded SPEI receipt, validates transferred amount, and confirms payment in 1 tap, updating milestone status to `confirmed`.
  * **Core Logic Helpers (`lib/receivablesCalculator.ts`, `lib/whatsappReminder.ts`, `lib/speiValidator.ts`)**:
    * `calculateReceivablesSummary`: Calculates total overdue, due today, upcoming, and collected amounts.
    * `generatePaymentReminderLink`: Generates status-aware `wa.me/` links with pre-filled reminder text.
    * `validateSpeiProof`: Validates file size (<5MB), mime type, and Banxico *Clave de Rastreo* format.
  * **Custom React Hook (`lib/hooks/useReceivables.ts`)**: Dual-mode state dispatcher (Demo LocalStorage + Supabase `/api/receivables`).
  * **API Route Handlers (`app/api/receivables/route.ts`, `app/api/receivables/[id]/route.ts`, `app/api/receivables/[id]/confirm/route.ts`, `app/api/receivables/public/[token]/route.ts`)**: Multi-tenant RLS routes for receivables lifecycle and public SPEI upload.
  * **TDD Unit Test Suite in `scripts/test-runner.js`**: Unit tests for receivables aging calculations, WhatsApp reminder templates, and SPEI proof validators.
* **Out of Scope**:
  * Centro de Control main financial dashboard polish (Sprint 5).
  * SAT CFDI 4.0 electronic invoice stamping via Facturapi (Sprint 7).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [ ] **AC 4.1**: Accounts Receivable Dashboard (`/dashboard/receivables`) displays real-time totals for Overdue (*Atrasado*), Due Today (*Vence Hoy*), and Upcoming (*Por Vencer*) with active status filters and client search.
- [ ] **AC 4.2**: 1-Tap WhatsApp Payment Reminders generate pre-filled `wa.me/` links with status-specific messaging (3 days before, due today, overdue) and public SPEI portal link (`/pay/[token]`).
- [ ] **AC 4.3**: Public SPEI Upload Portal (`/pay/[token]`) provides zero-login mobile interface displaying bank transfer CLABE details, file upload dropzone (< 5MB), Banxico *Clave de Rastreo* input, and submission feedback.
- [ ] **AC 4.4**: Payment Confirmation Workflow allows owner to review uploaded SPEI receipt and mark milestone as `confirmed` with 1 tap, updating client health score and audit log.
- [ ] **AC 4.5**: Core logic helpers `receivablesCalculator.ts`, `whatsappReminder.ts`, and `speiValidator.ts` are 100% unit-tested in `scripts/test-runner.js`.
- [ ] **AC 4.6**: Multi-tenant `organization_id` security isolation enforced across all receivables API route handlers with dual-mode execution (Demo LocalStorage + Supabase).
- [ ] **AC 4.7**: Quality gates (`npm run typecheck` and `npm test`) pass with 0 errors and 0 warnings.

### Should-Have (P1)
- [ ] **AC 4.8**: Empty state graphics for zero overdue receivables.
- [ ] **AC 4.9**: Mobile responsive design optimized for 375px viewports with touch targets >= 48px.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: All interactive elements (buttons, filter tabs, WhatsApp reminder links, confirm triggers) MUST have a minimum height/width of **48px** (`min-h-[48px]`, `p-3`).
2. **1-Tap WhatsApp Reminder Links**: Click-to-chat links must open `https://wa.me/521XXXXXXXXXX?text=...` directly with friendly yet direct Mexican business copy.
3. **High-Contrast Metrics**: Receivables monetary totals shown in large bold typography with color-coded indicators (`text-red-600` for Overdue, `text-amber-600` for Due Today, `text-emerald-600` for Confirmed).
4. **Zero-Friction SPEI Upload**: Public `/pay/[token]` portal works on mobile browsers without requiring login or app download.

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Core Logic & Utilities
* `lib/receivablesCalculator.ts` / `lib/receivablesCalculator.js` — Receivables aging & totals aggregator.
* `lib/whatsappReminder.ts` / `lib/whatsappReminder.js` — Pre-filled WhatsApp payment reminder link generator.
* `lib/speiValidator.ts` / `lib/speiValidator.js` — Banxico Clave de Rastreo & receipt file validator.
* `lib/hooks/useReceivables.ts` — React hook for receivables state management and API dispatch.

#### UI Components & Layout
* `components/receivables/ReceivablesSummaryCards.tsx` — KPI summary cards ("Quién me Debe").
* `components/receivables/ReceivableCard.tsx` — Milestone receivable card with WhatsApp reminder & confirm trigger.
* `components/receivables/SpeiConfirmModal.tsx` — Owner SPEI proof review & confirmation modal.

#### Pages & Views
* `app/(dashboard)/receivables/page.tsx` — Accounts Receivable dashboard view.
* `app/pay/[token]/page.tsx` — Public mobile SPEI receipt upload portal.

#### Server API Handlers
* `app/api/receivables/route.ts` — GET / POST for org receivables.
* `app/api/receivables/[id]/route.ts` — GET / PUT / DELETE for single milestone.
* `app/api/receivables/[id]/confirm/route.ts` — POST route to confirm milestone payment.
* `app/api/receivables/public/[token]/route.ts` — GET / POST for public SPEI receipt upload portal.

#### Tests & Roadmap Sync
* `scripts/test-runner.js` — Unit test suite expansion for receivables calculations, WhatsApp reminders, and SPEI validation.
* `docs/03-product-specs/product-roadmap.md` — Sprint 4 completion update.

---

## 05 4-Phase Execution Checklist

- [ ] **Phase 1: Planning & Architecture**: Inspected database schema, app architecture, user personas; updated `feature_implementation_spec.md` and created `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for receivables aging, WhatsApp payment reminders, and SPEI proof validation. Verify Red phase.
- [ ] **Phase 3: Implementation & Security Review**: Implement logic helpers, hooks, API routes with `organization_id` multi-tenancy, Accounts Receivable view, SPEI confirmation modal, and Public SPEI upload portal.
- [ ] **Phase 4: Verification & Quality Gates**: Execute `npm run typecheck` and `npm test` (0 errors/warnings). Mark Sprint 4 complete in `product-roadmap.md` and commit code.

