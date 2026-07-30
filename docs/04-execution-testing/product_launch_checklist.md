# Product Launch Checklist: Business Helper

> **Exhaustive Go-Live & Operational Readiness Checklist**
>
> Chronological task checklist for launching **Business Helper** in Mexico. Ensures technical, legal, marketing, and customer support domains are fully verified before public launch.

---

## 01 Pre-Launch (T-4 Weeks: Aug 25 – Sep 1, 2026)

### Product & Engineering Readiness
- [ ] **P0 Core Features Complete**: Quote Creation, Accounts Receivable Kanban, Client CRM, and SPEI Receipt Uploads fully built.
- [ ] **RLS Multi-Tenant Audit**: All 9 database tables verified with active RLS policies (`organization_id` scoping).
- [ ] **Test Gate Compliance**: Code coverage exceeds **85%**; Playwright E2E happy path tests pass without retries.
- [ ] **Security Sanitization**: File upload magic byte validation active; brute-force OTP lockout tested (3 failed attempts).
- [ ] **Stripe Subscription Billing**: Stripe Products & Prices ($299, $599, $999 MXN) configured in Sandbox mode.

### Marketing & Legal Content
- [ ] **Landing Page Finalized**: Landing page implemented per [landing-page-brief.md](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/design-docs/landing-page-brief.md).
- [ ] **Legal Documents Live**: Privacy Notice (*Aviso de Privacidad*) and Terms of Service updated for Mexican LFPDPPP compliance on `/privacy` and `/terms`.
- [ ] **Demo Video Recorded**: 60-second video demonstrating quote creation to WhatsApp sharing.

---

## 02 Pre-Launch (T-1 Week: Sep 12 – Sep 18, 2026)

### Technical Verification
- [ ] **Production DB Migrations**: Run `npx supabase db push` to production project.
- [ ] **Domain & SSL Setup**: Custom domain `businesshelper.mx` configured on Vercel with SSL certificate.
- [ ] **Production Secrets Loaded**: Vercel environment variables verified (Stripe live keys, Facturapi live keys, Resend API key).
- [ ] **Sentry Monitoring Live**: Sentry error alerts configured to send instant alerts to founder's phone.

### Support & Operational Readiness
- [ ] **WhatsApp Support Line**: Dedicated WhatsApp Business phone number configured for client inquiries.
- [ ] **Help Center FAQ**: In-app FAQ page updated with quote, SPEI, and SAT tax questions.

---

## 03 Launch Day Execution (Sep 19, 2026)

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

## 04 Post-Launch (Week 1 & Month 1)

### Week 1 Monitoring
- [ ] Track Daily Active Users (DAU), quote creation counts, and onboarding completion rates.
- [ ] Triage and hotfix any critical user-reported issues within **< 4 hours**.
- [ ] Conduct 5 exit interviews with drop-off trial users.

### Month 1 Review
- [ ] Evaluate 30-day targets vs. actual results (Target: 50 Signups → 15 Paid Accounts).
- [ ] Review Accountant Partner Program feedback and refine the 1-Click Monthly ZIP Export tool.
