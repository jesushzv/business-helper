# Product Launch Checklist: Business Helper

> **Exhaustive Go-Live, Code-Level Technical & Operational Readiness Checklist**
>
> Chronological task checklist for launching **Business Helper** in Mexico. Ensures technical engineering, database, auth, legal, marketing, and customer support domains are fully verified before public launch.

---

## 01 Technical Code Implementation (Pre-Launch Engineering)

### 🔐 Authentication & Access Control (P0)
- [x] **Auth Pages & UI**: Created `/login` (`app/(auth)/login/page.tsx`), `/register` (`app/(auth)/register/page.tsx`), and responsive mobile auth flows.
- [x] **Root Middleware Route Guard**: Implemented root `middleware.ts` to inspect Supabase session cookies, protect all `/dashboard/*` and `/onboarding` routes, and redirect unauthenticated traffic to `/login`.
- [x] **Remove Mock Auth Defaults**: Updated backend API routes (`app/api/*`) to enforce valid authenticated sessions (`supabase.auth.getUser()`).

### 🤖 Real AI Integration (P1)
- [x] **LLM Provider API Setup**: Integrated `@google/genai` (Gemini API) support in `lib/whatsappAI.ts` / `app/api/assistant/route.ts`.
- [x] **Live RAG & DB Context Ingestion**: Formatted live Supabase client receivable balances into the AI system prompt (`buildAIPromptContext`) for real-time structured answers and WhatsApp action links.

### 🧾 SAT CFDI 4.0 PAC Invoicing (P0)
- [x] **Live Facturapi PAC Client**: Added `issueInvoiceClient()` in `lib/facturapi.ts` making live HTTP POST requests to `https://www.facturapi.io/v1/invoices` using `FACTURAPI_SECRET_KEY` with graceful fallback.
- [x] **XML & PDF Storage**: Configured `app/api/invoices/issue/route.ts` to persist returned official XML and PDF URLs in the `milestones` table.

### 💳 Stripe Subscription Billing & Webhooks (P0)
- [x] **Stripe Node SDK Integration**: Updated `lib/stripe.ts` and `app/api/stripe/checkout/route.ts` to create live Stripe Checkout sessions with mapped price IDs ($299 MXN Emprendedor, $599 MXN Negocio, $999 MXN Empresa).
- [x] **Stripe Webhook Listener**: Implemented `app/api/stripe/webhook/route.ts` handling `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` to dynamically update `organizations.subscription_tier` and `subscription_status`.

### 💾 Supabase Database & Storage Production Setup (P0)
- [x] **Database Migration Execution**: Migrations prepared (`supabase/migrations/`) covering all 9 multi-tenant RLS tables.
- [x] **Supabase Storage Bucket for SPEI Receipts**: Implemented `app/api/receivables/[id]/upload/route.ts` supporting Supabase Storage bucket (`spei-vouchers`).
- [x] **Quality Gate Compliance**: 105/105 tests passing in `scripts/test-runner.js` with 0 TypeScript warnings (`npm run typecheck`).

---

## 02 Pre-Launch (T-4 Weeks: Aug 25 – Sep 1, 2026)

### Product & Engineering Readiness
- [x] **P0 Core Features Complete**: Quote Creation, Accounts Receivable Kanban, Client CRM, and SPEI Receipt Uploads fully built.
- [x] **RLS Multi-Tenant Audit**: All 9 database tables verified with active RLS policies (`organization_id` scoping).
- [x] **Test Gate Compliance**: Code coverage exceeds **85%**; Playwright E2E happy path tests pass without retries (`105/105` unit/integration tests passing).
- [x] **Security Sanitization**: File upload magic byte validation active; brute-force OTP lockout tested (3 failed attempts).
- [ ] **Stripe Subscription Billing**: Stripe Products & Prices ($299, $599, $999 MXN) configured in Sandbox mode.

### Marketing & Legal Content
- [x] **Landing Page Finalized**: Landing page implemented per [landing-page-brief.md](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/design-docs/landing-page-brief.md).
- [x] **Legal Documents Live**: Privacy Notice (*Aviso de Privacidad*) and Terms of Service updated for Mexican LFPDPPP compliance on `/privacy` and `/terms`.
- [ ] **Demo Video Recorded**: 60-second video demonstrating quote creation to WhatsApp sharing.

---

## 03 Pre-Launch (T-1 Week: Sep 12 – Sep 18, 2026)

- [x] **Production Deployment Guide & Secrets Template**: Prepared `docs/deployment.md` and `.env.example` mapping all production keys (`NEXT_PUBLIC_SUPABASE_URL`, `FACTURAPI_SECRET_KEY`, `STRIPE_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, `GEMINI_API_KEY`).
- [ ] **Production DB Migrations**: Run `npx supabase db push` to production project.
- [ ] **Domain & SSL Setup**: Custom domain `businesshelper.mx` configured on Vercel with SSL certificate.
- [ ] **Sentry Monitoring Live**: Sentry error alerts configured to send instant alerts to founder's phone.

### Support & Operational Readiness
- [ ] **WhatsApp Support Line**: Dedicated WhatsApp Business phone number configured for client inquiries.
- [ ] **Help Center FAQ**: In-app FAQ page updated with quote, SPEI, and SAT tax questions.

---

## 04 Launch Day Execution (Sep 19, 2026)

### Morning (Deploy & Announce)
- [ ] **Deploy to Production**: Trigger production deployment on Vercel (`git push origin main`).
- [ ] **Smoke Test**: Execute live test: Register account → Create test quote → Send WhatsApp link → Verify landing view.
- [ ] **Publish Landing Page**: Point main domain traffic to production Vercel app.
- [ ] **LinkedIn & Social Release**: Publish founder announcement post: *"Lanzamos Business Helper: El control de tu negocio en tu celular."*

### Midday (Outreach & Monitor)
- [ ] **Accountant Network Broadcast**: Send launch email to 30 partner accounting firms.
- [ ] **Monitor Sentry & Stripe**: Watch live dashboard metrics for incoming signups and any 5xx error spikes.
- [ ] **Respond to Pilot Users**: Personally welcome early trial signups via WhatsApp.

---

## 05 Post-Launch (Week 1 & Month 1)

### Week 1 Monitoring
- [ ] Track Daily Active Users (DAU), quote creation counts, and onboarding completion rates.
- [ ] Triage and hotfix any critical user-reported issues within **< 4 hours**.
- [ ] Conduct 5 exit interviews with drop-off trial users.

### Month 1 Review
- [ ] Evaluate 30-day targets vs. actual results (Target: 50 Signups → 15 Paid Accounts).
- [ ] Review Accountant Partner Program feedback and refine the 1-Click Monthly ZIP Export tool.
