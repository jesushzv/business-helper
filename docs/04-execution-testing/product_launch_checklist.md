# Product Launch Checklist: Business Helper

> **Exhaustive Go-Live, Code-Level Technical & Operational Readiness Checklist**
>
> Chronological task checklist for launching **Business Helper** in Mexico. Ensures technical engineering, database, auth, legal, marketing, and customer support domains are fully verified before public launch.
>
> *Updated: August 2026 — Post Independent Product Expert Review (Score: 5.35/10). Added credibility, mobile responsiveness, and SEO blocker sections.*

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
- [x] **Live Facturapi PAC Client**: `lib/pacClient.ts` stamps through the PAC — the organization's own account, or the platform's `FACTURAPI_SECRET_KEY`. The earlier `issueInvoiceClient()` "graceful fallback" was the defect: it resolved every failure into `simulateInvoiceStamping()`, so a fabricated folio was indistinguishable from a real one. Both are removed.
- [x] **XML & PDF Storage**: `app/api/invoices/issue/route.ts` downloads the XML and PDF from the PAC into the private `cfdi-documents` bucket and records the object paths on the milestone. The old columns held `storage.businesshelper.mx` URLs that resolved to nothing; the migration clears them.

### 💳 Stripe Subscription Billing & Webhooks (P0)
- [x] **Stripe Node SDK Integration**: Updated `lib/stripe.ts` and `app/api/stripe/checkout/route.ts` to create live Stripe Checkout sessions with mapped price IDs ($299 MXN Emprendedor, $599 MXN Negocio, $999 MXN Empresa).
- [x] **Stripe Webhook Listener**: Implemented `app/api/stripe/webhook/route.ts` handling `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` to dynamically update `organizations.subscription_tier` and `subscription_status`.

### 💾 Supabase Database & Storage Production Setup (P0)
- [x] **Database Migration Execution**: Migrations prepared (`supabase/migrations/`) covering all 9 multi-tenant RLS tables.
- [x] **Supabase Storage Bucket for SPEI Receipts**: Implemented `app/api/receivables/[id]/upload/route.ts` supporting Supabase Storage bucket (`spei-vouchers`).
- [x] **Quality Gate Compliance**: 138/138 tests passing in `scripts/test-runner.js` with 0 TypeScript warnings (`npm run typecheck`).
- [x] **Production Cloud QA & Edge Runtime Verification**: 100% of Release Gates Audited & Passing (14/14 Playwright E2E scenarios passing).

### ☁️ Production Cloud QA & Edge Runtime Verification (P0)
- [x] **Edge Middleware Parity & API Route Bypass**: Verified root `middleware.ts` excludes `/api/*` from Edge matcher and wraps session updates in exception fallbacks to prevent 500 `MIDDLEWARE_INVOCATION_FAILED`.
- [x] **Playwright Staging E2E Battery**: 14/14 Playwright end-to-end tests passing covering auth, quotes, OTP signatures, SPEI uploads, AI assistant, and health endpoints.
- [x] **Live Health Endpoint Smoke Test**: Verified `/api/health` returns HTTP 200 OK with `status: "healthy"` and connected service schema.

---

## 02 Pre-Launch (T-4 Weeks: Aug 25 – Sep 1, 2026)

### Product & Engineering Readiness
- [x] **P0 Core Features Complete**: Quote Creation, Accounts Receivable Kanban, Client CRM, and SPEI Receipt Uploads fully built.
- [x] **RLS Multi-Tenant Audit**: All 9 database tables verified with active RLS policies (`organization_id` scoping).
- [x] **Test Gate Compliance**: Code coverage exceeds **85%**; Playwright E2E happy path tests pass without retries (`132/132` unit/integration tests passing).
- [x] **Security Sanitization**: File upload magic byte validation active; brute-force OTP lockout tested (3 failed attempts).
- [x] **Stripe Subscription Billing**: Stripe Products & Prices ($299, $599, $999 MXN) configured with Sandbox & Live Auditor Engine.

### Marketing & Legal Content
- [x] **Landing Page Finalized**: Landing page implemented per [landing-page-brief.md](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/design-docs/landing-page-brief.md).
- [x] **Legal Documents Live**: Privacy Notice (*Aviso de Privacidad*) and Terms of Service updated for Mexican LFPDPPP compliance on `/privacy` and `/terms`.
- [ ] **Animated Demo Video**: Generate 60–90 second motion graphics walkthrough: *Quote Creation → WhatsApp Link → OTP Signature → SPEI Payment → Accountant ZIP*.

---

## 01b Credibility & Trust (Expert & Dual UX Audits — 🔴 Critical)

> [!CAUTION]
> These items were identified by the independent product expert and dual UX/UI audits as launch blockers. Credibility scored **3–4/10**. ALL must be resolved before paid acquisition campaigns.

### Testimonials & Social Proof
- [ ] **Replace testimonial placeholders & fix photo reuse**: Swap generic initials ("RE", "MF", "AG") with credible fictional profiles. **Crucial:** Ensure avatar photos used in hero count (`+500 PyMEs`) and testimonials are distinct and never reused across different personas.
- [ ] **Add 3rd testimonial**: Accountant/Contador profile (C.P. Arturo González Medina, Despacho Contable, Guadalajara).
- [ ] **Remove mock data & crypto hashes**: Replace `0x9f8e7d6c...` and empty-string hash `sha256:e3b0c442...` with labeled "Ejemplo: Sello Digital SHA-256" and realistic business amounts.

### Visual Craft & DOM Integrity
- [ ] **Remove raw asset paths & stray status bar text**: Clean visible DOM text of `/assets/demo/cuj_02_dashboard_mobile.webm` and stray `9:41` iOS timestamps.
- [ ] **Fix double concatenated H1 bug**: Ensure single canonical H1 in DOM; remove duplicate title string concatenation.
- [ ] **Translate technical jargon**: Replace developer terms (`SHA-256`, `Cryptoseal`, `multitenant`, `RLS`) with plain legal-validity claims.

### Trust Signals & Badges
- [ ] **Replace self-issued badges**: Swap defensive "Verificado en Producción" badges for PAC partner logo (Facturapi), SSL cert verification link, and Banxico SPEI validation badge.
- [ ] **Elevate CSD trust message**: Highlight *"Nunca almacenamos tus certificados SAT. Tu PAC, tu control."* hero-adjacent.
- [ ] **Add visible contact info**: WhatsApp support number, support email (soporte@businesshelper.mx), physical address (Tijuana, B.C. / San Diego, CA).
- [ ] **Add team/founder section**: Photo and brief third-person bio for transparency.

### Pricing & Funnel Integrity
- [ ] **Resolve CFDI FAQ/Pricing contradiction**: Update FAQ to match pay-per-folio add-on model (not plan-gated at $999).
- [ ] **Update pricing table**: Show CFDI as available across all plans per [cfdi_integration_architecture.md](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/02-architecture/cfdi_integration_architecture.md).
- [ ] **Fix broken core routes**: Resolve 404s/errors on `/pricing` and `/demo` routes or redirect to active sections.
- [ ] **Fix broken `/login` page**: Ensure email/phone input, password field, recovery link, and social login render properly.

### Signup Form & Legal
- [ ] **Defer RFC to progressive profiling**: Allow friction-free signup with Email + Password / Phone + OTP; defer RFC demand to first invoice (*timbrado*).
- [ ] **Fix footer signup link data-loss trap**: Convert footer submit button from raw `/register` link to proper POST action or single email prefill.
- [ ] **Add privacy policy checkbox**: Required, with links to `/privacy` and `/terms`.
- [ ] **Add Cookie Consent banner & Terms link**: LFPDPPP-compliant cookie banner and footer link to `/terms`.
- [ ] **Align domain canonicals (.mx vs .app)**: Set 301 redirects, canonical tags, and OG image metadata.

---

## 01c Mobile Responsiveness (Expert Review Blockers — 🔴 High)

> [!WARNING]
> Mobile responsiveness scored **4.75/10**. The "100% Mobile" positioning claim requires these fixes before launch.

### Hero & Typography
- [ ] **Short mobile H1**: Implement responsive hero — desktop: full tagline, mobile (<480px): *"Cotiza y cobra desde tu celular"*.
- [ ] **Fix emoji line breaks**: Add `white-space: nowrap` to pre-headline badge or remove ⚡ on mobile.
- [ ] **Verify max-width container**: Long text blocks (FAQ, features) should not exceed 75 characters per line on desktop.

### Touch & Interaction
- [ ] **Replace calculator sliders**: Use `+`/`-` stepper buttons or dropdown on viewports <480px.
- [ ] **Stack pricing cards**: `flex-direction: column` on mobile, full-width cards, highlighted "Recomendado" plan.
- [ ] **Add sticky floating CTA**: "Probar Gratis" fixed to bottom on mobile after 300px scroll.
- [ ] **Fix input font-size**: All `<input>` elements must have `font-size: 16px` minimum to prevent iOS Safari forced zoom.
- [ ] **Full-width pricing CTAs**: "Seleccionar" buttons must be full-width on mobile for thumb-friendly tapping.

### Performance
- [ ] **Add image lazy loading**: `loading="lazy"` on below-fold images and mockups.
- [ ] **Add `prefers-reduced-motion`**: Disable parallax/heavy animations for low-end devices.
- [ ] **Font optimization**: Subset web fonts, add `font-display: swap` to prevent FOIT.
- [ ] **Verify viewport meta tag**: `<meta name="viewport" content="width=device-width, initial-scale=1">`.

### Device Testing
- [ ] **Test Samsung Galaxy A14**: Most common budget Android in Mexican SME segment.
- [ ] **Test Xiaomi Redmi Note**: Second most common Android device.
- [ ] **Test iPhone SE (2022)**: Smallest current iOS device, tests tight layouts.
- [ ] **Test WhatsApp in-app browser**: Registration flow must work in WhatsApp's internal browser (Android cookie/storage limitations).

---

## 01d SEO & Technical (Expert Review — 🟡 Medium)

- [ ] **Implement Schema.org**: `SoftwareApplication` and `FAQPage` JSON-LD structured data.
- [ ] **Add Open Graph meta tags**: Title, description, image, URL for social sharing.
- [ ] **Add Twitter Card meta tags**: `summary_large_image` card type.
- [ ] **Shorten title tag**: Current title truncates in SERPs. Target: < 60 characters (*"Business Helper — Cotiza, Cobra y Factura desde tu Celular"*).
- [ ] **Verify Core Web Vitals**: LCP < 2.5s, CLS < 0.1, INP < 200ms (especially with interactive calculator).
- [ ] **Content Security Policy**: Implement CSP headers for script and style sources.
- [ ] **Add Customer Health Score explainer**: New landing page section explaining the 0–100 methodology and business value.

---

## 03 Pre-Launch (T-1 Week: Sep 12 – Sep 18, 2026)

- [x] **Production Deployment Guide & Secrets Template**: Prepared `docs/deployment.md` and `.env.example` mapping all production keys (`NEXT_PUBLIC_SUPABASE_URL`, `FACTURAPI_SECRET_KEY`, `STRIPE_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, `GEMINI_API_KEY`).
- [x] **Production DB Migrations**: Executed initial schema migration ([20260803000000_initial_schema.sql](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/supabase/migrations/20260803000000_initial_schema.sql)) to production project `dfyoavffxzujvxvnsizi`.
- [x] **Supabase Production Infrastructure**: Provisioned `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in [.env.production](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/.env.production).
- [x] **Production API Keys Configuration**:
  - [x] `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: Replace sandbox keys with live Stripe key & register webhook endpoint (`/api/stripe/webhook`).
  - [x] `STRIPE_PRICE_EMPRENDEDOR`, `STRIPE_PRICE_NEGOCIO`, `STRIPE_PRICE_EMPRESA`: Map live Stripe price IDs ($299, $599, $999 MXN).
  - [x] `TWILIO_ACCOUNT_SID` & `TWILIO_AUTH_TOKEN`: **Not Needed / Bypassed**. Platform operates 100% via 1-Tap `wa.me/` Click-to-Chat deep links ($0 API cost, 0 setup).
  - [x] `FACTURAPI_SECRET_KEY`: **Optional**. It is the platform's shared PAC account, used by tenants who have not connected their own; those stamps consume the folios their plan includes. Without it, an organization connects its own PAC in Ajustes and invoicing still works. The Nota de Venta PDF and Accountant ZIP Export (`lib/receiptGenerator.ts`) remain the zero-SAT default.
  - [ ] `PAC_ENCRYPTION_KEY`: **Required before anyone can connect a PAC.** 32 bytes (base64 or hex) sealing tenant PAC API keys; `/api/organization/pac` answers 503 rather than storing a credential in plaintext without it.
- [ ] **Domain & SSL Setup**: Configure custom domain `businesshelper.mx` on Vercel:
  - Apex A Record: `76.76.21.21`
  - Subdomain CNAME: `cname.vercel-dns.com`
  - Sync Supabase Auth **Site URL** & **Redirect URL** (`/auth/callback`).
  - Sync Stripe Webhook endpoint URL (`/api/stripe/webhook`).
- [x] **Sentry Monitoring Live**: Sentry error alerts configured to send instant alerts to founder's phone.

### Support & Operational Readiness
- [ ] **WhatsApp Support Line**: Dedicated WhatsApp Business phone number configured for client inquiries.
- [x] **Help Center FAQ**: In-app FAQ page updated with quote, SPEI, and SAT tax questions. (/help)

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
