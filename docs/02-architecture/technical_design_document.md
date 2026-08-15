# Technical Design Document: Business Helper Core Engine

> **Engineering Design Specification**
>
> Implementation blueprint for developers working on **Business Helper**. Details module communication protocols, state machine algorithms, testing strategies, deployment procedures, and non-functional security/performance requirements.

---

## 01 Product & Technical Overview

Business Helper solves the operational cash flow crisis faced by Mexican SMBs. It replaces fragmented Excel sheets and loose WhatsApp chats with an integrated, mobile-first quote-to-cash system.

### Engineering Target Metrics
* **Page Load Time**: `< 1.5s` LCP on 4G connections.
* **API Response Time**: `< 150ms` (p95) for all PostgREST and route handlers.
* **Test Coverage**: Line and branch coverage enforced against the thresholds in `vitest.config.ts`, by CI on every pull request. There are no Husky hooks in this repo (#51).
* **Uptime Target**: `99.9%` uptime on Vercel Edge + Supabase Cloud.

---

## 02 Architecture & System Interfaces

### Communication Protocols
* **Client ↔ Next.js Server Components (RSC)**: React Server Actions & direct server data fetching.
* **Next.js Route Handlers ↔ Supabase Postgres**: PostgREST over HTTPS / WebSockets (Realtime).
* **Next.js ↔ Facturapi PAC**: REST API over HTTPS with Bearer token header authentication.
* **Next.js ↔ Stripe**: Webhook events verified via HMAC signature (`stripe-signature`).

### Cryptoseal SHA-256 State Machine Algorithm

```typescript
import { createHash } from 'crypto';

export function calculateContractHash(contractPayload: {
  organizationId: string;
  clientId: string;
  totalAmount: number;
  currency: string;
  scopeDescription: string;
  acceptedAt: string;
  acceptedIp: string;
}): string {
  const normalizedData = JSON.stringify({
    org: contractPayload.organizationId,
    client: contractPayload.clientId,
    amount: contractPayload.totalAmount.toFixed(2),
    currency: contractPayload.currency,
    scope: contractPayload.scopeDescription.trim(),
    acceptedAt: contractPayload.acceptedAt,
    acceptedIp: contractPayload.acceptedIp,
  });

  return createHash('sha256').update(normalizedData).digest('hex');
}
```

---

## 03 Data Model & Flow

```
[User Action on Phone]
       │
       ▼
[Next.js Client Component / Server Action]
       │
       ▼
[Input Sanitizer & hand-written validators]
       │
       ▼
[Supabase Client (@supabase/ssr)]
       │
       ▼
[PostgreSQL DB with Row-Level Security Policies]
       │
       ▼
[AuditLog Trigger Entry Created]
```

---

## 04 Testing Plan

### Testing Strategy & Frameworks

| Level | Framework | Scope / Enforcement Target | CI Trigger |
|:---|:---|:---|:---|
| **Unit Tests** | Vitest + V8 Coverage | Tax withholding functions, RFC Modulo 11 parser, SHA-256 seals, client health score. Coverage floor in `vitest.config.ts`. | CI on every PR (`npx vitest run --coverage`). No Husky hooks exist in this repo (#51) |
| **Component Tests** | Vitest + `@testing-library/react` + JSDOM | React 19 Client components, FaqAccordion, QuoteStatusBadge, Don Roberto 48px+ touch targets. | PR check (`npm run test`) |
| **Integration & E2E Tests** | Playwright Chromium/Mobile | API routes, Playwright happy-path user flows (Quote → WhatsApp link → Client OTP sign → SPEI payment). | Production Deploy (`npm run test:e2e`) |

---

## 05 Deployment Plan & CI/CD

### Environment Pipeline
1. **Development**: against the hosted Supabase project. There is no local Docker stack and no `supabase` CLI dependency — `npx supabase start` and `supabase/config.toml` do not exist here (#319).
2. **Staging**: Vercel Preview Deployments connected to Supabase Staging Database project.
3. **Production**: Vercel Edge Production (`businesshelper.app`) connected to Supabase Production AWS cluster.

### Deploy & Verification Steps
```bash
# 1. Typecheck and lint check
npm run typecheck && npm run lint

# 2. Run unit tests and coverage verification
npm run test

# 3. Apply Supabase database migrations to production
npm run db:migrate:dry   # list what would be applied
npm run db:migrate       # apply — manual, never automatic (hard rule #6)

# 4. Trigger production deploy on Vercel
git push origin main
```

---

## 06 Security, Performance & Observability

### Security Standards
* **Authentication**: Supabase Auth with HTTP-only cookies (`sb-access-token`).
* **Multi-Tenant Isolation**: PostgreSQL Row-Level Security (RLS) policies mandatory on every tenant table. The count is derived from `supabase/migrations/`, not restated here — it was "9" while the schema held 16 (#319).
* **Input Sanitization**: Strip HTML tags and dangerous characters before database insertion.
* **Upload Security**: SPEI receipt attachments restricted to `< 5MB` with magic byte validation (`FF D8 FF` for JPG, `89 50 4E 47` for PNG, `%PDF-` for PDF).

### Observability & Alerting
* **Logging**: Structured JSON logging via Vercel Logs & Supabase Analytics.
* **Error Tracking**: Sentry alert triggers if 5xx API route failures exceed `1%` in a 5-minute window.
