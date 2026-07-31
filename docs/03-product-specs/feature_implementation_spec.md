# Feature Implementation Spec: Pre-Launch Engineering Sprint — Auth, Live APIs & Production Wiring

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing the **Pre-Launch Engineering Sprint** of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Pre-Launch Engineering Sprint — Production Authentication UI & Root Middleware Guard, Live Facturapi PAC HTTP Stamping, Live Stripe Subscription Checkout & Webhooks, Live Gemini AI Operations Assistant, and Supabase Storage Bucket setup.
* **Target Module**: Authentication (`/login`, `/register`, `middleware.ts`), Facturapi (`/lib/facturapi.ts`, `/api/invoices/issue`), Stripe (`/lib/stripe.ts`, `/api/stripe/checkout`, `/api/stripe/webhook`), AI Assistant (`/lib/whatsappAI.ts`, `/api/assistant`), and Storage (`/api/receivables/[id]/upload`).
* **Primary User**: Business Owners ("Don Roberto"), Operations Managers ("Lic. Mariana"), & External Accountants.
* **Goal**: Replace all sandbox mock fallbacks and static demo strings with production-ready live service connectors, complete authentication flows, route protection, and verified test suites.

### Scope Boundaries
* **In Scope**:
  1. **Authentication & Route Guarding (P0)**:
     - Build `/login` (`app/(auth)/login/page.tsx`) and `/register` (`app/(auth)/register/page.tsx`).
     - Build root `middleware.ts` to inspect Supabase session cookies, protect `/dashboard/*` & `/onboarding`, and redirect unauthenticated traffic to `/login`.
     - Update backend API routes to enforce active user sessions (`supabase.auth.getUser()`) and remove `'org-demo-1'` fallbacks.
  2. **Live SAT CFDI 4.0 Facturapi PAC Stamping (P0)**:
     - Replace `simulateInvoiceStamping()` in `lib/facturapi.ts` with real HTTP POST client targeting `https://www.facturapi.io/v1/invoices` using `FACTURAPI_SECRET_KEY`.
     - Update `app/api/invoices/issue/route.ts` to persist XML and PDF download links.
  3. **Live Stripe Subscription Billing & Webhook Listener (P0)**:
     - Update `app/api/stripe/checkout/route.ts` using `stripe` SDK to create live Checkout sessions for Emprendedor ($299), Negocio ($599), and Empresa ($999).
     - Build `app/api/stripe/webhook/route.ts` handling `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
  4. **Live Gemini AI Operations Assistant (P1)**:
     - Update `lib/whatsappAI.ts` and `app/api/assistant/route.ts` to support `@google/genai` (Gemini API) with dynamic database receivables context.
  5. **Supabase Storage Bucket for SPEI Receipts (P0)**:
     - Update `app/api/receivables/[id]/upload/route.ts` to upload SPEI vouchers to Supabase Storage bucket (`spei-vouchers`).
  6. **Unit & Integration Test Suites in `scripts/test-runner.js`**:
     - Add Suite 26 (Auth & Root Middleware Route Guard), Suite 27 (Facturapi Live PAC HTTP Client), Suite 28 (Stripe Live Checkout & Webhook Listener), Suite 29 (Gemini AI Operations Assistant API).

---

## 02 Acceptance Criteria (P0 / P1)

### Must-Have (P0 / P1)
- [ ] **AC 1.1**: `/login` and `/register` pages render mobile-first, responsive forms with Supabase Auth error feedback and >= 48px touch targets.
- [ ] **AC 1.2**: Root `middleware.ts` intercepts unauthenticated attempts to access `/dashboard/*` or `/onboarding` and redirects to `/login`.
- [ ] **AC 1.3**: Facturapi integration module (`lib/facturapi.ts`) constructs valid SAT CFDI 4.0 JSON payloads and posts to `https://www.facturapi.io/v1/invoices`.
- [ ] **AC 1.4**: Stripe checkout API (`app/api/stripe/checkout/route.ts`) initializes real Stripe Checkout sessions and returns active URLs.
- [ ] **AC 1.5**: Stripe webhook listener (`app/api/stripe/webhook/route.ts`) validates webhook signatures and updates organization subscription status.
- [ ] **AC 1.6**: WhatsApp AI Assistant API (`app/api/assistant/route.ts`) parses user queries using live database context and returns structured JSON responses.
- [ ] **AC 1.7**: All test suites (1 to 29) in `scripts/test-runner.js` pass with 100% success rate.
- [ ] **AC 1.8**: `npm run typecheck` and `npm test` complete with 0 errors and 0 warnings.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: Touch targets on Login, Register, Checkout, and Invoice Stamping buttons MUST be >= **48px** (`min-h-[48px]`, `py-3`).
2. **Clear Error Feedback**: Display friendly Spanish error messages (*"Correo o contraseña incorrectos"*, *"Clave de rastreo SPEI no válida"*) instead of raw technical tracebacks.
3. **Seamless Redirects**: After successful login or registration, seamlessly redirect users to `/dashboard` or `/onboarding`.

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Authentication & Route Protection
* `app/(auth)/login/page.tsx` — Responsive login page.
* `app/(auth)/register/page.tsx` — Business registration page.
* `middleware.ts` — Root Next.js middleware session inspector & route guard.
* `lib/supabase/middleware.ts` — Supabase session updater helper.

#### Facturapi & Invoicing
* `lib/facturapi.ts` — Updated PAC client with live HTTP posting & fallback mode.
* `app/api/invoices/issue/route.ts` — Issue invoice server endpoint.

#### Stripe Billing & Webhooks
* `lib/stripe.ts` — Stripe SDK helper and payload builder.
* `app/api/stripe/checkout/route.ts` — Stripe checkout session route handler.
* `app/api/stripe/webhook/route.ts` — Stripe event webhook handler.

#### AI Operations Assistant
* `lib/whatsappAI.ts` — Updated AI Operations Assistant with Gemini LLM provider support.
* `app/api/assistant/route.ts` — AI assistant POST route handler.

#### Storage & Uploads
* `app/api/receivables/[id]/upload/route.ts` — SPEI receipt voucher upload route with Supabase Storage support.

#### Test Suite
* `scripts/test-runner.js` — Add Suites 26, 27, 28, 29 for Auth, Facturapi, Stripe, and Gemini AI.

---

## 05 4-Phase Execution Checklist

- [ ] **Phase 1: Planning & Architecture**: Updated `feature_implementation_spec.md` and `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for Auth Middleware, Facturapi PAC Client, Stripe Checkout/Webhook, and Gemini AI. Verify Red phase.
- [ ] **Phase 3: Implementation & Security Review**: Implement auth views, root middleware, live service helpers, API routes, and webhook handlers.
- [ ] **Phase 4: Verification & Quality Gates**: Run `npm run typecheck` and `npm test` ensuring 0 errors/warnings. Update launch checklist and walkthrough in `product-roadmap.md` and commit code.
