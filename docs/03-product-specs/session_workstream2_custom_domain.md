# Single-Session Feature Spec: Workstream 2 — Custom Domain, SSL & Webhook Alignment

> **Active Execution Session Specification Document**
>
> Executing **Workstream 2: Custom Domain, SSL & Webhook Alignment** of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**, @[docs/AGENTS-DOCS-GUIDE.md], and @[MASTER_PROMPT.md].

---

## 01 Feature Summary

* **Feature Name**: Workstream 2 — Custom Domain, SSL & Webhook Alignment
* **Target Module**: URL Engine (`lib/url.ts`), Auth Middleware (`middleware.ts`, `lib/supabase/middleware.ts`), Stripe Checkout & Webhooks (`lib/stripe.ts`, `/app/api/stripe/checkout/route.ts`, `/app/api/stripe/webhook/route.ts`), and Test Suite (`scripts/test-runner.js`).
* **Primary User**: Platform Owner, Subscribers, & External Webhook Listeners.
* **Goal**: Provide automated base URL, callback URL, and webhook URL resolution (`getAppBaseUrl()`), update auth middleware redirect handling for custom domain `businesshelper.mx`, and verify live webhook endpoint URL formatting.

### Scope Boundaries
* **In Scope**:
  1. **URL Resolution Helper Module (`lib/url.ts`)**:
     - Build `getAppBaseUrl()`, `getAuthCallbackUrl()`, and `getStripeWebhookUrl()` dynamically parsing `NEXT_PUBLIC_APP_URL` (e.g. `https://businesshelper.mx`) with fallback to local development.
  2. **Auth & Webhook Route Alignment (`middleware.ts` & `lib/stripe.ts`)**:
     - Ensure Supabase auth redirects and Stripe Checkout `success_url` / `cancel_url` use `getAppBaseUrl()`.
  3. **Unit Test Suite Expansion (`scripts/test-runner.js`)**:
     - Add Suite 42 asserting URL helper resolution, callback URL generation, and environment fallback.

---

## 02 Acceptance Criteria (P0 / P1)

### Must-Have (P0 / P1)
- [ ] **AC 1.1**: `lib/url.ts` exports `getAppBaseUrl()`, `getAuthCallbackUrl()`, and `getStripeWebhookUrl()`.
- [ ] **AC 1.2**: `getAppBaseUrl()` strips trailing slashes and formats clean HTTPS origins (`https://businesshelper.mx`).
- [ ] **AC 1.3**: Stripe checkout session payload constructs `success_url` and `cancel_url` using dynamic origin resolution.
- [ ] **AC 1.4**: All test suites in `scripts/test-runner.js` pass with 100% success rate (Suite 42 added).
- [ ] **AC 1.5**: `npm run typecheck` and `npm test` execute with 0 errors and 0 warnings.

---

## 03 Technical Implementation & Files

### Exact Files to Modify / Create

#### URL Engine & Handlers
* `lib/url.ts` — [NEW] Base URL, auth callback URL, and webhook URL resolution module.
* `lib/stripe.ts` — [MODIFY] Update checkout payload URLs to use `getAppBaseUrl()`.
* `middleware.ts` — [MODIFY] Ensure auth redirects preserve custom domain callback parameters.

#### Test Suite
* `scripts/test-runner.js` — [MODIFY] Add Suite 42 assertions for URL engine.

---

## 04 4-Phase Execution Checklist

- [x] **Phase 1: Planning & Spec**: Created `session_workstream2_custom_domain.md` and `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add Suite 42 assertions in `scripts/test-runner.js`. Verify Red/Green phase.
- [ ] **Phase 3: Implementation & Security**: Build `lib/url.ts` and update `lib/stripe.ts` and middleware.
- [ ] **Phase 4: Verification & Quality Gates**: Run `npm run typecheck` and `npm test` ensuring 0 errors/warnings.
