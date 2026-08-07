# Product Launch Checklist: Business Helper

> **Exhaustive Go-Live, Code-Level Technical & Operational Readiness Checklist**
>
> Chronological task checklist for launching **Business Helper** in Mexico. Ensures technical engineering, database, auth, legal, marketing, and customer support domains are fully verified before public launch.
>
> *Updated: 2026-08-07 — §01 completion marks corrected against `main` @ `5c35719` following the security review. Prior revision: August 2026 post expert review (Score: 5.35/10).*

> [!CAUTION]
> **Several items in §01 were previously marked complete on the strength of a module existing, not on the
> integration working.** The 2026-08-06 security review found CFDI stamping, Stripe checkout, team invites
> and the accountant export were simulated. Those marks are corrected below.
>
> **Standard applied here:** an item is `[x]` only when its outbound call has executed against the real
> service, or when it requires no third party. Everything else is `[ ]` with the gap named.
> See [`launch_readiness_memo_aug2026.md`](launch_readiness_memo_aug2026.md) for the full reconciliation.

---

## 01 Technical Code Implementation (Pre-Launch Engineering)

### 🔐 Authentication & Access Control (P0)
- [x] **Auth Pages & UI**: Created `/login` (`app/(auth)/login/page.tsx`), `/register` (`app/(auth)/register/page.tsx`), and responsive mobile auth flows.
- [x] **Root Middleware Route Guard**: Implemented root `middleware.ts` to inspect Supabase session cookies, protect all `/dashboard/*` and `/onboarding` routes, and redirect unauthenticated traffic to `/login`.
- [x] **Remove Mock Auth Defaults**: Updated backend API routes (`app/api/*`) to enforce valid authenticated sessions (`supabase.auth.getUser()`).

### ✍️ E-Signature OTP Delivery (P0 — blocks the core loop)
- [x] **Provider Code Paths**: `lib/otpDelivery.ts` implements Twilio SMS, Twilio WhatsApp, and Meta Cloud API, selected by `OTP_DELIVERY_CHANNEL`. Fails closed outside development (PR #16).
- [ ] **Provider Credentials Configured**: No credentials in the environment. Until set, `POST /api/quotes/public/[token]/otp` returns 502 and **no quote can be signed**. See issue #2.
- [ ] **Per-Recipient Rate Limiting**: Sends are capped per *quote*, not per *phone* — one handset can be pumped across a client's several open quotes. Must land before any provider goes live. Issue #17 / **PR #20 unmerged**.
- [ ] **Real Handset Verification**: A code arrives within ~10s on the configured channel and cannot be replayed.

### 🤖 Real AI Integration (P1)
- [x] **Live RAG & DB Context Ingestion**: `/api/ai/assistant` and `/api/ai/support` read the caller's own clients and open milestones via `lib/aiOrgContext.ts`. The hardcoded "Grupo Salinas" ledger and the fallback WhatsApp number are gone; the sample book of business survives only where no backend is configured, and is badged as an example in the UI.
- [ ] **LLM Provider API Setup**: Still open — `parseNaturalLanguageQuery` is keyword matching, not a model. Responses now say so (`engine: 'rules'`) rather than implying otherwise, so this is honest but not yet intelligent. P2: it degrades gracefully and does not gate launch.

### 🧾 SAT CFDI 4.0 PAC Invoicing (P0)
- [x] **Live Facturapi PAC Client**: `lib/pacClient.ts` stamps through the PAC — the organization's own account, or the platform's `FACTURAPI_SECRET_KEY`. The earlier `issueInvoiceClient()` "graceful fallback" was the defect: it resolved every failure into `simulateInvoiceStamping()`, so a fabricated folio was indistinguishable from a real one. Both are removed. *(Merged in PR #23.)*
- [x] **XML & PDF Storage**: `app/api/invoices/issue/route.ts` downloads the XML and PDF from the PAC into the private `cfdi-documents` bucket and records the object paths on the milestone. The old columns held `storage.businesshelper.mx` URLs that resolved to nothing; the migration clears them.
- [x] **Complemento de Pago**: filed when a PPD milestone is confirmed *(PR #29)*.
- [ ] **One real stamp against a live PAC**: **still outstanding, and the item that matters.** PR #23's coverage runs against a mocked `fetch`, which proves the code is correct, not that the integration works. Obtain a Facturapi sandbox key and issue one invoice end to end, confirming a real SAT UUID comes back and the stored XML/PDF open.
- [ ] **Migration Applied**: `20260807120000_cfdi_pac_integration.sql` must be applied to production before the deploy carrying it.

### 💳 Stripe Subscription Billing & Webhooks (P0)
- [x] **Checkout Implementation**: `lib/stripeClient.ts` creates Checkout Sessions via raw REST against `api.stripe.com/v1`. *(There is no `stripe` SDK dependency — the earlier "Install `stripe` package" description does not match the implementation.)* Made real in PR #19.
- [x] **Webhook Listener & Signature Verification**: `app/api/stripe/webhook/route.ts` + `lib/stripeWebhook.ts` handle subscription lifecycle events and enforce `STRIPE_WEBHOOK_SECRET` (PR #16).
- [ ] **Live Mode Verified**: Live keys and price IDs mapped, a real card charged, and unsigned/duplicate webhook deliveries confirmed rejected/idempotent against staging (`npm run verify:webhook`). See issue #14.
- [ ] **CFDI Folio Pack Purchase**: `createFolioPackCheckoutPayload` exists and the read path honours `cfdi_folios_purchased`, but no route creates the session and no webhook credits it.

### 💾 Supabase Database & Storage Production Setup (P0)
- [x] **Migrations Authored**: `supabase/migrations/` covers the multi-tenant RLS tables, security hardening, and team invitations. `npm run db:migrate` (+ `--dry-run`) added in PR #11.
- [ ] **Production Migrations Applied**: Two migrations from unmerged PRs are pending — `20260807000000_otp_send_rate_limit.sql` (#20) and `20260807120000_cfdi_pac_integration.sql` (#23). **Both must be applied before the code that depends on them deploys**, or the affected routes 500.
- [x] **Supabase Storage Bucket for SPEI Receipts**: `app/api/receivables/[id]/upload/route.ts` writes to the `spei-vouchers` bucket with magic-byte validation.
- [x] **Quality Gate Compliance**: **383 tests / 58 files** passing via `npx vitest run`, 0 TypeScript warnings. *(`scripts/test-runner.js` was retired in PR #21; any count of 138/144/175/182 is stale.)*
- [ ] **Playwright E2E Verification**: `playwright.config.ts` and `tests/e2e/` exist and `npm run test:e2e` is wired, but the suite was not executed in the 2026-08-07 verification pass. The prior "14/14 passing" claim is unverified.

### ☁️ Production Cloud QA & Edge Runtime Verification (P0)
- [x] **Edge Middleware Parity & API Route Bypass**: Root `middleware.ts` excludes `/api/*` from the Edge matcher and wraps session updates in exception fallbacks to prevent 500 `MIDDLEWARE_INVOCATION_FAILED`.
- [ ] **Playwright Staging E2E Battery**: Suite exists (`tests/e2e/`, `npm run test:e2e`) but was **not executed** in the 2026-08-07 verification pass. Run it against a live staging URL before launch — note that the OTP and CFDI scenarios cannot pass meaningfully until their providers are configured.
- [ ] **Live Health Endpoint Smoke Test**: Confirm `/api/health` returns HTTP 200 with `status: "healthy"` **against the deployed production URL**, not locally.

---

## 02 Pre-Launch (T-4 Weeks: Aug 25 – Sep 1, 2026)

### Product & Engineering Readiness
- [x] **P0 Core Features Complete**: Quote Creation, Accounts Receivable Kanban, Client CRM, and SPEI Receipt Uploads fully built.
- [x] **RLS Multi-Tenant Audit**: All 9 database tables verified with active RLS policies (`organization_id` scoping).
- [x] **Test Gate Compliance**: Code coverage exceeds **85%**; **383 unit/integration tests** passing via `npx vitest run`.
- [x] **Security Sanitization**: File upload magic byte validation active; brute-force OTP *verification* lockout tested (3 failed attempts). *(OTP **issuance** limiting is separate and still open — see §01.)*
- [ ] **Stripe Subscription Billing**: Products & Prices ($299, $599, $999 MXN) configured in sandbox. Live-mode mapping and a real charge remain unverified.

### Marketing & Legal Content
- [x] **Landing Page Finalized**: Landing page implemented per [landing-page-brief.md](../03-product-specs/landing-page-brief.md).
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
- [ ] **Add visible contact info**: WhatsApp support number, support email (soporte@businesshelper.app), physical address (Tijuana, B.C. / San Diego, CA).
- [ ] **Add team/founder section**: Photo and brief third-person bio for transparency.

### Pricing & Funnel Integrity
- [ ] **Resolve CFDI FAQ/Pricing contradiction**: Update FAQ to match pay-per-folio add-on model (not plan-gated at $999).
- [ ] **Update pricing table**: Show CFDI as available across all plans per [cfdi_integration_architecture.md](../../docs/02-architecture/cfdi_integration_architecture.md).
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

- [x] **Production Deployment Guide & Secrets Template**: `docs/deployment.md` and `.env.example` map the production keys.
- [ ] **Production DB Migrations**: Confirm every migration in `supabase/migrations/` is applied to the production project, **including the two that landed with PRs #20 and #23** (`20260807000000_otp_send_rate_limit.sql`, `20260807120000_cfdi_pac_integration.sql`). Both are on `main` now, so a deploy without them returns 500s from the OTP and invoice routes. Verify with `npm run db:migrate:dry`.
- [ ] **Supabase Production Infrastructure**: Verify `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are set in the Vercel environment. *(Do not record project refs, keys, or `.env.production` contents in this repo.)*
- [ ] **Production API Keys Configuration**:
  - [ ] `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: Live key set and webhook endpoint registered (`/api/stripe/webhook`). Verify with `npm run verify:webhook`.
  - [ ] `STRIPE_PRICE_*`: Live price IDs mapped for each tier (Inicial / Negocio / Empresa).
  - [ ] `OTP_DELIVERY_CHANNEL` + `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / sender number — **required, not optional.** The earlier "Not Needed / Bypassed" note was wrong: `wa.me/` Click-to-Chat only covers *owner-initiated* messages. It cannot deliver an OTP to a signer, so without a provider the e-signature flow is inoperable and no quote can be signed. One Twilio account also covers the outbound reminders in `lib/whatsappOutbound.ts`. (Meta Cloud API is the alternative; Twilio SMS is the fastest to provision.)
  - [ ] `PAC_ENCRYPTION_KEY`: **Required before anyone can connect a PAC.** 32 bytes (base64 or hex) sealing tenant PAC API keys; `/api/organization/pac` answers 503 rather than storing a credential in plaintext without it.
  - [ ] `FACTURAPI_SECRET_KEY`: **Optional.** It is the platform's shared PAC account, used by tenants who have not connected their own; those stamps consume the folios their plan includes. Without it, an organization connects its own PAC in Ajustes and invoicing still works. The Nota de Venta PDF and Accountant ZIP Export (`lib/receiptGenerator.ts`) remain the zero-SAT default.
- [ ] **Domain & SSL Setup**: The domain is **`businesshelper.app`** — `.mx` was never registered. On Vercel:
  - Apex A Record: `76.76.21.21`
  - Subdomain CNAME: `cname.vercel-dns.com`
  - Sync Supabase Auth **Site URL** & **Redirect URL** (`/auth/callback`).
  - Sync Stripe Webhook endpoint URL (`/api/stripe/webhook`).
- [ ] **Error Monitoring Live**: **Previously marked complete in error.** There is no `@sentry/nextjs` dependency; `lib/sentry.ts` `captureException` only calls `console.error` and transmits nothing. Wire a real transport and confirm an alert reaches the founder's phone — for a solo operator this is the only signal that production is broken.

### Support & Operational Readiness
- [ ] **WhatsApp Support Line**: Dedicated WhatsApp Business phone number configured for client inquiries.
- [ ] **Per-Organization CLABE**: Every pilot org must have real bank details configured (`components/settings/BankAccountCard.tsx`). Payment confirmation against a placeholder account is meaningless. See issue #14.
- [x] **Help Center FAQ**: In-app FAQ page updated with quote, SPEI, and SAT tax questions. (`/help`)

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
