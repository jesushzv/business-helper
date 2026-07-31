# Feature Implementation Spec: Sprint 6 — Beta Launch, Stripe Billing & QA Hardening

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprint 6 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Sprint 6 — Beta Launch, Stripe Subscription Billing ($299/$599/$999 MXN), Settings & Organization Management, System Health Monitoring & Release Gates Audit
* **Target Module**: Settings & Billing (`/app/(dashboard)/settings`, `/lib/stripe.ts`, `/lib/releaseGates.ts`, `/app/api/stripe/checkout`, `/app/api/stripe/webhook`, `/app/api/health`)
* **Primary User**: Don Roberto ("El Dueño Tradicional") & Lic. Mariana ("La Administradora Eficiente")
* **Goal**: Deliver the Settings & Subscription Billing page (`/settings`), providing organization profile editing, active subscription tier status, 3-tier Stripe pricing plan options ($299 Emprendedor, $599 Negocio, $999 Empresa), 1-tap subscription upgrades via Stripe Checkout API, health check endpoint (`/api/health`), and full automated audit of all 6 MVP Beta Release Gates.

### Scope Boundaries
* **In Scope**:
  * **Settings & Billing Page (`app/(dashboard)/settings/page.tsx`)**: Mobile-first settings hub for editing organization details (name, RFC, SAT tax regime, postal code, phone) and managing subscription plans.
  * **Stripe Pricing Tiers & Subscription Manager (`components/settings/SubscriptionBillingCard.tsx`)**: Interactive tier selector presenting Emprendedor ($299 MXN/mo), Negocio ($599 MXN/mo), and Empresa ($999 MXN/mo) plans with active status badges and upgrade action triggers.
  * **Organization Profile Editor (`components/settings/OrgProfileCard.tsx`)**: Editable form for updating company RFC, SAT tax regime, postal code, and contact information.
  * **Core Billing & Release Gate Logic (`lib/stripe.ts`, `lib/releaseGates.ts`)**:
    * `getStripeTierConfig`: Returns plan metadata, price IDs, and feature limits.
    * `validateSubscriptionStatus`: Computes subscription health ('active', 'past_due', 'trialing', 'canceled').
    * `auditReleaseGates`: Audits data isolation, coverage thresholds, OTP security, file size limits, and system health.
  * **API Route Handlers (`app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`, `app/api/health/route.ts`)**: Server routes for Stripe checkout session creation, webhook processing, and system health monitoring.
  * **TDD Unit Test Suite in `scripts/test-runner.js`**: Suite 15 (Stripe Billing Engine) & Suite 16 (Release Gates & Security Audit).
* **Out of Scope**:
  * SAT CFDI 4.0 electronic invoice stamping via Facturapi PAC (Sprint 7).
  * Multi-user team role invitations (Sprint 8).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [ ] **AC 6.1**: Settings & Billing page (`/settings`) displays organization profile details and active subscription plan status.
- [ ] **AC 6.2**: Stripe subscription billing cards display 3 tier options ($299 Emprendedor, $599 Negocio, $999 Empresa) with 1-tap checkout upgrade triggers.
- [ ] **AC 6.3**: API routes `app/api/stripe/checkout` and `app/api/stripe/webhook` handle checkout session generation and subscription status updates with `organization_id` multi-tenant security.
- [ ] **AC 6.4**: Health check API route `app/api/health/route.ts` returns 200 OK with system readiness, DB status, and active release gate checks.
- [ ] **AC 6.5**: All 6 MVP Beta Release Gates (Data Isolation, Mobile Performance, Coverage >= 85%, Zero Warning, OTP Security, File Security) pass automated verification.
- [ ] **AC 6.6**: Core logic helpers `stripe.ts` and `releaseGates.ts` are 100% unit-tested in `scripts/test-runner.js`.
- [ ] **AC 6.7**: Quality gates (`npm run typecheck` and `npm test`) pass with 0 errors and 0 warnings.

### Should-Have (P1)
- [ ] **AC 6.8**: Visual confirmation toast on successful organization settings update.
- [ ] **AC 6.9**: Mobile responsive layout optimized for 375px viewports with touch targets >= 48px.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: All interactive elements (upgrade buttons, plan selectors, save settings actions) MUST have a minimum height/width of **48px** (`min-h-[48px]`, `p-3`).
2. **Clear Pricing & Billing Transparency**: Display monthly subscription prices prominently in bold MXN typography ($299, $599, $999) with no hidden fees.
3. **High-Contrast Badges**: Active plan shown with distinct color badge (`bg-indigo-600 text-white`).
4. **Zero-Friction Upgrade Flow**: Tapping "Mejorar Plan" opens Stripe Checkout in 1 tap.

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Core Logic & Utilities
* `lib/stripe.ts` / `lib/stripe.js` — Stripe pricing tiers, checkout session builder & webhook handler.
* `lib/releaseGates.ts` / `lib/releaseGates.js` — MVP Beta Release Gates auditor & security validator.
* `lib/hooks/useOrganizationSettings.ts` — React hook for managing org profile and subscription billing state.

#### UI Components & Views
* `components/settings/OrgProfileCard.tsx` — Editable organization profile form.
* `components/settings/SubscriptionBillingCard.tsx` — 3-tier Stripe pricing plans & subscription manager.
* `app/(dashboard)/settings/page.tsx` — Settings & Billing dashboard page.

#### Server API Handlers
* `app/api/stripe/checkout/route.ts` — POST endpoint to initiate Stripe checkout sessions.
* `app/api/stripe/webhook/route.ts` — POST endpoint to handle Stripe event webhooks.
* `app/api/health/route.ts` — GET endpoint for system health & release gates status.

#### Tests & Roadmap Sync
* `scripts/test-runner.js` — Unit test suite expansion for Stripe billing and release gates audit.
* `docs/03-product-specs/product-roadmap.md` — Mark Sprint 6 completed & release gates verified.

---

## 05 4-Phase Execution Checklist

- [ ] **Phase 1: Planning & Architecture**: Inspected database schema, app architecture, user personas; updated `feature_implementation_spec.md` and created `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for Stripe billing tiers and release gates auditor. Verify Red phase.
- [ ] **Phase 3: Implementation & Security Review**: Implement Stripe billing utilities, release gates auditor, organization settings hook, API routes, and settings UI components.
- [ ] **Phase 4: Verification & Quality Gates**: Execute `npm run typecheck` and `npm test` (0 errors/warnings). Mark Sprint 6 complete in `product-roadmap.md` and commit code.
