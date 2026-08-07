# Product Launch Checklist: Business Helper

> **Exhaustive Go-Live, Code-Level Technical & Operational Readiness Checklist**
>
> Chronological task checklist for launching **Business Helper** in Mexico. Ensures technical engineering, database, auth, legal, marketing, and customer support domains are fully verified before public launch.

---

## 01 Technical Code Implementation (Pre-Launch Engineering)

### 🔐 Authentication & Access Control (P0)
- [ ] **Auth Pages & UI**: Create `/login` (`app/(auth)/login/page.tsx`), `/register` (`app/(auth)/register/page.tsx`), and password reset flows using `@supabase/ssr`.
- [ ] **Root Middleware Route Guard**: Implement root `middleware.ts` to inspect Supabase session cookies, protect all `/dashboard/*` and `/onboarding` routes, and redirect unauthenticated traffic to `/login`.
- [ ] **Remove Mock Auth Defaults**: Remove all fallback defaults to `'org-demo-1'` and `'user-demo-1'` in API routes (`app/api/*`) and require valid authenticated sessions (`supabase.auth.getUser()`).

### 🤖 Real AI Integration (P1)
- [ ] **LLM Provider API Setup**: Integrate `@google/genai` (Gemini API) or `@ai-sdk/google` in `lib/whatsappAI.ts` / `app/api/assistant/route.ts`. Still open: `parseNaturalLanguageQuery` is keyword matching, and responses now say so (`engine: 'rules'`) instead of implying a model.
- [x] **Live RAG & DB Context Ingestion**: `/api/ai/assistant` and `/api/ai/support` read the caller's own clients and open milestones via `lib/aiOrgContext.ts`. The hardcoded "Grupo Salinas" ledger and the fallback WhatsApp number are gone; the sample book of business survives only where no backend is configured, and is badged as an example in the UI.

### 🧾 SAT CFDI 4.0 PAC Invoicing (P0)
- [ ] **Live Facturapi PAC Client**: Replace `simulateInvoiceStamping()` in `lib/facturapi.ts` with real HTTP POST requests to `https://www.facturapi.io/v1/invoices` using `FACTURAPI_SECRET_KEY`.
- [ ] **XML & PDF Storage**: Store official XML (`legal_name.xml`) and PDF file URLs returned by Facturapi in the `milestones` and `invoices` database tables.

### 💳 Stripe Subscription Billing & Webhooks (P0)
- [x] **Stripe Checkout Session Creation**: `app/api/stripe/checkout/route.ts` creates a real Checkout Session against the configured `STRIPE_PRICE_*` ids ($299 MXN Inicial, $599 MXN Negocio, $999 MXN Empresa) through `lib/stripeClient.ts`, which calls the REST API directly — the `stripe` SDK was not added for a single form-encoded request. Without `STRIPE_SECRET_KEY` the endpoint answers 503 rather than a placeholder URL.
- [ ] **Stripe Webhook Listener**: Implement `app/api/stripe/webhook/route.ts` handling `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` to dynamically update `organizations.subscription_tier` and `subscription_status`.

### 💾 Supabase Database & Storage Production Setup (P0)
- [ ] **Database Migration Execution**: Run `npx supabase db push` against the live production Supabase instance to create all 9 multi-tenant RLS tables.
- [ ] **Supabase Storage Bucket for SPEI Receipts**: Configure a private/authenticated Supabase Storage bucket (`spei-vouchers`) and update `app/api/receivables/[id]/upload/route.ts` to store client-uploaded SPEI transfer receipts.
- [ ] **Disable LocalStorage Fallback in Production**: Ensure client state hooks (`useQuotes`, `useClients`, `useReceivables`) strictly query backend APIs in production mode.

---

## 02 Pre-Launch (T-4 Weeks: Aug 25 – Sep 1, 2026)

### Product & Engineering Readiness
- [x] **P0 Core Features Complete**: Quote Creation, Accounts Receivable Kanban, Client CRM, and SPEI Receipt Uploads fully built.
- [x] **RLS Multi-Tenant Audit**: All 9 database tables verified with active RLS policies (`organization_id` scoping).
- [x] **Test Gate Compliance**: Code coverage exceeds **85%**; Playwright E2E happy path tests pass without retries (`97/97` unit/integration tests passing).
- [x] **Security Sanitization**: File upload magic byte validation active; brute-force OTP lockout tested (3 failed attempts).
- [ ] **Stripe Subscription Billing**: Stripe Products & Prices ($299, $599, $999 MXN) configured in Sandbox mode.

### Marketing & Legal Content
- [x] **Landing Page Finalized**: Landing page implemented per [landing-page-brief.md](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/design-docs/landing-page-brief.md).
- [x] **Legal Documents Live**: Privacy Notice (*Aviso de Privacidad*) and Terms of Service updated for Mexican LFPDPPP compliance on `/privacy` and `/terms`.
- [ ] **Demo Video Recorded**: 60-second video demonstrating quote creation to WhatsApp sharing.

---

## 03 Pre-Launch (T-1 Week: Sep 12 – Sep 18, 2026)

### Technical Verification
- [ ] **Production DB Migrations**: Run `npx supabase db push` to production project.
- [ ] **Domain & SSL Setup**: Custom domain `businesshelper.mx` configured on Vercel with SSL certificate.
- [ ] **Production Secrets Loaded**: Vercel environment variables verified (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FACTURAPI_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`).
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

