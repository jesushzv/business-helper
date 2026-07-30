# Feature Implementation Spec: Sprint 2 — Client CRM, Onboarding & RFC Validation

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprint 2 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Sprint 2 — Client Directory, CRM-Lite, Onboarding Setup Wizard & RFC Validation
* **Target Module**: CRM-Lite (`/app/(dashboard)/clients`, `/app/onboarding`, `/lib/hooks`, `/lib/whatsappLink.ts`, `/lib/clientHealthScore.ts`, `/app/api/clients`)
* **Primary User**: Don Roberto ("El Dueño Tradicional") & Lic. Mariana ("La Administradora Eficiente")
* **Goal**: Deliver a 10-minute onboarding setup wizard (`/onboarding`), Client Directory view (`/dashboard/clients`), Client Detail view (`/dashboard/clients/[id]`), live RFC Modulo-11 validation, computed 0–100 Client Health Score, 1-tap WhatsApp Click-to-Chat links, and chronological activity feed.

### Scope Boundaries
* **In Scope**:
  * **Onboarding Setup Wizard (`app/onboarding/page.tsx`)**: Step-by-step business setup capturing business name, RFC, SAT tax regime, postal code, and industry.
  * **Client Directory View (`app/(dashboard)/clients/page.tsx`)**: Responsive mobile-first list with search bar, health score indicators, 1-tap WhatsApp buttons, and "Nuevo Cliente" action.
  * **Client Detail & Activity View (`app/(dashboard)/clients/[id]/page.tsx`)**: Comprehensive profile showing tax data, health score meter, WhatsApp direct contact button, and chronological activity timeline (quotes, contracts, payments).
  * **Client Creation / Edit Modal (`components/clients/ClientFormModal.tsx`)**: Form with live RFC Modulo-11 validation, phone number formatting for WhatsApp (`+52`), and SAT CFDI options.
  * **App Shell Layout (`app/(dashboard)/layout.tsx`)**: Sidebar (desktop) and Bottom Navigation Bar (mobile) with >=48px touch targets for navigation.
  * **Core Logic Helpers (`lib/clientHealthScore.ts`, `lib/whatsappLink.ts`, `lib/clientActivity.ts`)**:
    * `calculateClientHealthScore`: Computes 0–100 payment reliability score.
    * `generateWhatsAppLink`: Sanitizes 10-digit Mexican phone numbers into valid `wa.me/52...` URLs with pre-filled message copy.
    * `formatClientActivity`: Transforms raw quotes, contracts, and payments into a chronological activity feed.
  * **Custom React Hook (`lib/hooks/useClients.ts`)**: State management and API dispatcher with dual storage strategy (Demo Mode LocalStorage + Supabase `clients` API).
  * **API Route Handlers (`app/api/clients/route.ts`, `app/api/clients/[id]/route.ts`, `app/api/organization/route.ts`)**: Server routes scoped to `organization_id` multi-tenancy.
  * **TDD Test Suite in `scripts/test-runner.js`**: Unit tests for health score calculations, WhatsApp URL generation, client activity formatting, and API data serialization.
* **Out of Scope**:
  * 3-step Quote Wizard & public quote approval portal (Sprint 3).
  * Accounts Receivable SPEI payment confirmation portal (Sprint 4).
  * Facturapi live CFDI stamping (Sprint 7).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [x] **AC 2.1**: Onboarding Setup Wizard (`/onboarding`) allows user to configure Organization name, RFC, SAT tax regime, postal code, and industry in < 3 minutes on mobile viewport.
- [x] **AC 2.2**: Client Directory (`/dashboard/clients`) displays all organization clients with search filtering by name/RFC, 0-100 Health Score badges, and 1-tap WhatsApp Click-to-Chat buttons (>= 48px tap targets).
- [x] **AC 2.3**: Client Detail View (`/dashboard/clients/[id]`) presents client profile info, SAT tax data (RFC, Regimen, CP, CFDI Use), computed health score meter, and a chronological activity history feed (quotes sent, contracts signed, payments confirmed).
- [x] **AC 2.4**: Client Form Modal/Page enables creating & editing clients with live RFC Modulo-11 check-digit validation and WhatsApp phone number formatting.
- [x] **AC 2.5**: Core utilities `clientHealthScore.ts` (0-100 logic), `whatsappLink.ts` (1-tap `wa.me` links), and `clientActivity.ts` (chronological feed transformer) are fully unit-tested with 100% test passing in `scripts/test-runner.js`.
- [x] **AC 2.6**: Client CRUD API routes (`/api/clients`, `/api/clients/[id]`, `/api/organization`) and client hooks (`useClients.ts`) enforce `organization_id` multi-tenant security and support dual-mode (Demo Mode + Supabase).
- [x] **AC 2.7**: All quality gates (`npm run typecheck`, `npm test`) pass with 0 errors and 0 warnings.

### Should-Have (P1)
- [x] **AC 2.8**: Empty state illustrations and quick-add actions when no clients exist yet.
- [x] **AC 2.9**: Mobile-responsive layout tested on 375px viewport with bottom navigation bar.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: All interactive elements (buttons, inputs, cards, WhatsApp links, icon triggers) MUST have a minimum height/width of **48px** (`min-h-[48px]`, `p-3`).
2. **1-Tap WhatsApp Links**: Click-to-chat links must open `https://wa.me/521XXXXXXXXXX?text=...` directly without secondary prompt screens.
3. **High-Contrast Metrics**: Monetary figures and Health Scores displayed in large bold font (`text-2xl font-bold`).
4. **Zero-Cognitive Burden Form Inputs**: Select dropdowns pre-populated with standard Mexican SAT tax regimes (601, 603, 605, 606, 612, 626 - RESICO) and CFDI uses (G01, G03, P01, CP01, S01).

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Core Logic & Utilities
* `lib/whatsappLink.ts` — 1-tap WhatsApp Click-to-Chat URL generator with Mexican phone sanitization (+52 / 10-digit).
* `lib/clientHealthScore.ts` — Client Health Score (0–100) calculator based on historical payment timeliness.
* `lib/clientActivity.ts` — Data transformer for client chronological activity feeds.
* `lib/hooks/useClients.ts` — React hook for client state management, client CRUD, and activity feed fetching.

#### UI Components & Layout
* `components/layout/AppShell.tsx` — Desktop sidebar + Mobile bottom navigation wrapper.
* `components/layout/Header.tsx` — Top application header with org indicator & user menu.
* `components/clients/ClientCard.tsx` — Client Directory list item card with health score & WhatsApp 1-tap trigger.
* `components/clients/ClientFormModal.tsx` — Add/Edit Client modal form with live RFC Modulo-11 validation.
* `components/clients/HealthScoreMeter.tsx` — Visual 0–100 health score badge & meter component.
* `components/clients/ActivityTimeline.tsx` — Chronological feed timeline for quotes, contracts, and payments.

#### Pages & Views
* `app/onboarding/page.tsx` — 10-minute setup wizard for business details & RFC.
* `app/(dashboard)/layout.tsx` — Authenticated app shell layout wrapper.
* `app/(dashboard)/dashboard/page.tsx` — Owner dashboard placeholder / shell.
* `app/(dashboard)/clients/page.tsx` — Client Directory page view.
* `app/(dashboard)/clients/[id]/page.tsx` — Client detail profile & activity history view.

#### Server API Handlers
* `app/api/organization/route.ts` — GET / POST route handler for organization setup.
* `app/api/clients/route.ts` — GET / POST route handler for client directory.
* `app/api/clients/[id]/route.ts` — GET / PUT / DELETE route handler for single client.

#### Tests & Roadmap Sync
* `scripts/test-runner.js` — Expanded unit test suite for health score, WhatsApp links, client activity, and API payload schemas.
* `docs/03-product-specs/product-roadmap.md` — Sprint 2 completed checkmark update.

---

## 05 4-Phase Execution Checklist

- [x] **Phase 1: Planning & Architecture**: Inspected database schema, app architecture, user personas; created `feature_implementation_spec.md` and `implementation_plan.md`.
- [x] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for `calculateClientHealthScore`, `generateWhatsAppLink`, and `formatClientActivity`. Verify Red phase.
- [x] **Phase 3: Implementation & Security Review**: Implement logic utilities, hooks, API routes with `organization_id` multi-tenancy, App Shell, Onboarding wizard, and Client Directory views.
- [x] **Phase 4: Verification & Quality Gates**: Execute `npm run typecheck` and `npm test` (0 errors/warnings). Mark Sprint 2 complete in `product-roadmap.md` and commit code.
