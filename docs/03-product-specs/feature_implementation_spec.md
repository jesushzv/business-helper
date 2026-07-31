# Feature Implementation Spec: Sprint 5 — Business Dashboard & Analytics ("Centro de Control")

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprint 5 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Sprint 5 — Business Dashboard & Analytics ("Centro de Control"), Cash Flow Forecast, Top Clients Ranking & Mobile Bottom Navigation Polish
* **Target Module**: Business Dashboard (`/app/(dashboard)/dashboard`, `/components/dashboard`, `/lib/dashboardAnalytics.ts`, `/lib/hooks/useDashboardAnalytics.ts`, `/app/api/dashboard/analytics`, `/components/layout/AppShell.tsx`)
* **Primary User**: Don Roberto ("El Dueño Tradicional") & Lic. Mariana ("La Administradora Eficiente")
* **Goal**: Deliver the "Centro de Control" real-time executive dashboard view (`/dashboard`), providing high-level financial health indicators (Collected Revenue, Pending Receivables, Overdue Debt), top clients by revenue ranking card, 30/60/90-day projected cash flow forecast timeline based on active milestone due dates, dual-mode execution (Demo LocalStorage + Supabase API), and polished mobile bottom navigation.

### Scope Boundaries
* **In Scope**:
  * **Financial Overview Cards (`components/dashboard/FinancialOverviewCards.tsx`)**: Real-time KPI metrics for Collected Revenue (*Cobrado*), Pending Receivables (*Por Cobrar*), and Overdue Debt (*Deuda Atrasada*).
  * **Top Clients Ranking Card (`components/dashboard/TopClientsCard.tsx`)**: Leaderboard ranking top clients by total collected revenue and active contracts, complete with 1-tap WhatsApp quick actions.
  * **Cash Flow Forecast Card (`components/dashboard/CashFlowForecastCard.tsx`)**: Projected 30-day, 60-day, and 90-day cash inflows breakdown calculated from active milestone due dates.
  * **Centro de Control Page (`app/(dashboard)/dashboard/page.tsx`)**: Executive dashboard layout integrating financial KPIs, cash flow forecast, top clients, and client directory highlights.
  * **Core Analytics Logic (`lib/dashboardAnalytics.ts` & `lib/dashboardAnalytics.js`)**:
    * `calculateBusinessMetrics`: Aggregates total collected revenue, pending receivables, overdue debt, and active counts.
    * `getTopClientsByRevenue`: Calculates revenue breakdown per client and returns sorted top N clients.
    * `calculateCashFlowForecast`: Computes projected 30/60/90-day cash inflows from active milestones based on a reference date.
  * **Custom React Hook (`lib/hooks/useDashboardAnalytics.ts`)**: Dual-mode state dispatcher (Demo LocalStorage + Supabase `/api/dashboard/analytics`).
  * **API Route Handler (`app/api/dashboard/analytics/route.ts`)**: Multi-tenant RLS route for aggregated organization financial metrics.
  * **Mobile Bottom Navigation Bar Polish (`components/layout/AppShell.tsx`)**: Touch target size verification (>= 48px), active tab visual indicator, and smooth mobile experience.
  * **TDD Unit Test Suite in `scripts/test-runner.js`**: Unit tests for financial metric aggregations, client revenue ranking, and 30/60/90-day cash flow projections.
* **Out of Scope**:
  * SAT CFDI 4.0 electronic invoice stamping via Facturapi (Sprint 7).
  * Multi-user team role permissions (Sprint 8).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [ ] **AC 5.1**: Centro de Control dashboard (`/dashboard`) displays real-time financial totals for Collected Revenue (*Cobrado*), Pending Receivables (*Por Cobrar*), and Overdue Debt (*Vencido*).
- [ ] **AC 5.2**: Top Clients Ranking Card displays top 5 clients sorted by revenue with 1-tap WhatsApp link actions and profile navigation.
- [ ] **AC 5.3**: Cash Flow Forecast Card displays projected 30-day, 60-day, and 90-day cash inflows derived from pending milestone due dates.
- [ ] **AC 5.4**: Core analytics logic helpers in `lib/dashboardAnalytics.ts` and `lib/dashboardAnalytics.js` are 100% unit-tested in `scripts/test-runner.js`.
- [ ] **AC 5.5**: API route handler `app/api/dashboard/analytics/route.ts` enforces `organization_id` multi-tenant security isolation.
- [ ] **AC 5.6**: AppShell mobile bottom navigation bar enforces >= 48px touch targets and clear active tab indicators.
- [ ] **AC 5.7**: Quality gates (`npm run typecheck` and `npm test`) pass with 0 errors and 0 warnings.

### Should-Have (P1)
- [ ] **AC 5.8**: Visual indicator badges for zero overdue debt or high payment reliability scores.
- [ ] **AC 5.9**: Mobile responsive design optimized for 375px viewports with touch targets >= 48px.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: All interactive elements (navigation tabs, view profile buttons, WhatsApp quick actions) MUST have a minimum height/width of **48px** (`min-h-[48px]`, `p-3`).
2. **High-Contrast Financial Numbers**: Display key financial numbers in bold, large typography with color-coded status badges (`text-emerald-600` for Cobrado, `text-amber-600` for Por Cobrar, `text-red-600` for Vencido).
3. **1-Tap WhatsApp Links**: Quick actions on top clients list directly launch `https://wa.me/521XXXXXXXXXX?text=...`.
4. **Bottom Nav Usability**: Bottom nav bar remains fixed on mobile screens with backdrop blur and clear active icons.

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Core Analytics Logic & Helpers
* `lib/dashboardAnalytics.ts` / `lib/dashboardAnalytics.js` — Business metrics aggregator, top clients calculator & 30/60/90-day cash flow forecaster.
* `lib/hooks/useDashboardAnalytics.ts` — React hook for dashboard state management and API dispatching.

#### UI Components & Layout
* `components/dashboard/FinancialOverviewCards.tsx` — Executive KPI summary cards.
* `components/dashboard/TopClientsCard.tsx` — Top revenue accounts ranking card.
* `components/dashboard/CashFlowForecastCard.tsx` — Projected 30/60/90-day cash inflow timeline visualization.
* `components/layout/AppShell.tsx` — Mobile bottom navigation polish and active tab highlighting.

#### Pages & Views
* `app/(dashboard)/dashboard/page.tsx` — Centro de Control main page layout.

#### Server API Handlers
* `app/api/dashboard/analytics/route.ts` — GET route handler for multi-tenant org business metrics.

#### Tests & Roadmap Sync
* `scripts/test-runner.js` — Unit test suite expansion for dashboard analytics, top client ranking, and cash flow forecasting.
* `docs/03-product-specs/product-roadmap.md` — Mark Sprint 5 completed.

---

## 05 4-Phase Execution Checklist

- [ ] **Phase 1: Planning & Architecture**: Inspected database schema, app architecture, user personas; updated `feature_implementation_spec.md` and created `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for financial metrics aggregation, top clients ranking, and cash flow forecast calculation. Verify Red phase.
- [ ] **Phase 3: Implementation & Security Review**: Implement analytics logic helpers, custom hooks, API routes with `organization_id` multi-tenancy, dashboard components, and navigation bar polish.
- [ ] **Phase 4: Verification & Quality Gates**: Execute `npm run typecheck` and `npm test` (0 errors/warnings). Mark Sprint 5 complete in `product-roadmap.md` and commit code.
