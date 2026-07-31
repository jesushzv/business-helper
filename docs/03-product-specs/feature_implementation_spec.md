# Feature Implementation Spec: Sprints 8–10 — Team RBAC, Inventory Stock & WhatsApp AI Assistant

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprints 8, 9, and 10 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Post-MVP Expansion (Sprints 8, 9 & 10) — Multi-User Role-Based Access Control (RBAC), Inventory Stock Tracking & Low-Stock Alerts, and WhatsApp AI Operations Assistant.
* **Target Module**: Team & RBAC (`/team`, `/lib/teamRBAC.ts`), Inventory (`/lib/inventory.ts`), and AI Assistant (`/assistant`, `/lib/whatsappAI.ts`)
* **Primary User**: Don Roberto ("El Dueño Tradicional") & Lic. Mariana ("La Administradora Eficiente")
* **Goal**: Deliver team invitation and role permissions (`owner`, `manager`, `member`, `accountant`), inventory stock tracking and low-stock threshold alerts, and a natural language WhatsApp AI Operations Assistant to query financial health and receivables hands-free.

### Scope Boundaries
* **In Scope**:
  * **Sprint 8 (Team Roles & RBAC)**:
    * `lib/teamRBAC.ts` & `lib/teamRBAC.js`: Permission matrix evaluator and invite token generator.
    * `lib/hooks/useTeamMembers.ts`: Hook for managing org members and pending invitations.
    * `app/api/organization/members/route.ts` & `/invite/route.ts`: Multi-tenant team API endpoints.
    * `components/team/TeamMembersCard.tsx` & `app/(dashboard)/team/page.tsx`: Team management screen.
  * **Sprint 9 (Inventory Stock Tracking & Alerts)**:
    * `lib/inventory.ts` & `lib/inventory.js`: Stock deduction engine on contract creation and low-stock alert evaluator (threshold <= 5 units).
    * `app/api/inventory/route.ts`: Inventory adjustment endpoint.
    * Inventory stock tracking controls in `components/products/ProductCatalogCard.tsx`.
  * **Sprint 10 (WhatsApp AI Operations Assistant)**:
    * `lib/whatsappAI.ts` & `lib/whatsappAI.js`: Natural language query parser (*"¿Cuánto me debe Construcciones Maya?"*, *"¿Qué pagos vencen hoy?"*).
    * `lib/hooks/useAIAssistant.ts`: Hook managing AI query interactions.
    * `app/api/ai/assistant/route.ts`: Natural language query API endpoint.
    * `components/assistant/AIAssistantCard.tsx` & `app/(dashboard)/assistant/page.tsx`: AI Operations Assistant screen.
  * **TDD Test Suites in `scripts/test-runner.js`**: Suites 22 (Team RBAC), 23 (Inventory Stock Tracking), 24 (WhatsApp AI Assistant).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [ ] **AC 8.1**: Team RBAC engine (`lib/teamRBAC.ts`) enforces role hierarchy (`owner`, `manager`, `member`, `accountant`) across quotes, receivables, CFDI, and billing capabilities.
- [ ] **AC 8.2**: Team Management page (`/team`) allows inviting members by email and changing roles with `organization_id` multi-tenant security.
- [ ] **AC 8.3**: Inventory Engine (`lib/inventory.ts`) tracks product stock quantities, deducts stock on contract conversion, and flags low-stock items (<= 5 units).
- [ ] **AC 8.4**: Product catalog UI displays stock levels and low-stock warning banners with 1-tap stock replenishment actions.
- [ ] **AC 8.5**: WhatsApp AI Assistant (`lib/whatsappAI.ts`) parses Spanish natural language queries regarding overdue balances, client totals, and cash flow, generating instant structured answers and WhatsApp action links.
- [ ] **AC 8.6**: AI Assistant page (`/assistant`) provides interactive query chips and rapid response cards with >= 48px touch targets.
- [ ] **AC 8.7**: Test suites 22, 23, and 24 in `scripts/test-runner.js` pass cleanly (100%).
- [ ] **AC 8.8**: `npm run typecheck` and `npm test` execute with 0 errors and 0 warnings.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: Interactive elements (Invite Member, Replenish Stock, Quick Query Chips) MUST have a minimum touch target height/width of **48px** (`min-h-[48px]`, `p-3`).
2. **1-Tap WhatsApp Actions**: Pre-fill 1-tap WhatsApp Click-to-Chat deep links in AI assistant responses to immediately contact delinquent clients.
3. **High-Contrast Indicators**: Role badges (`Dueño`, `Gerente`, `Miembro`, `Contador`) and Stock warning badges rendered in high-contrast Tailwind colors.

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Core Logic & Utilities
* `lib/teamRBAC.ts` / `lib/teamRBAC.js` — Role-based access control evaluator and invitation token generator.
* `lib/inventory.ts` / `lib/inventory.js` — Inventory stock tracking, deduction, and low-stock alert evaluator.
* `lib/whatsappAI.ts` / `lib/whatsappAI.js` — Natural language query engine for financial operations on WhatsApp.
* `lib/hooks/useTeamMembers.ts` — React hook for team member management.
* `lib/hooks/useAIAssistant.ts` — React hook for AI operations assistant queries.

#### UI Components & Views
* `components/team/TeamMembersCard.tsx` & `app/(dashboard)/team/page.tsx` — Team management view.
* `components/assistant/AIAssistantCard.tsx` & `app/(dashboard)/assistant/page.tsx` — WhatsApp AI Operations Assistant view.
* `components/layout/AppShell.tsx` — Add `/team` and `/assistant` to navigation bar.

#### Server API Handlers
* `app/api/organization/members/route.ts` & `app/api/organization/members/invite/route.ts` — Team API routes.
* `app/api/inventory/route.ts` — Inventory update route.
* `app/api/ai/assistant/route.ts` — AI query API route.

#### Tests & Roadmap Sync
* `scripts/test-runner.js` — Add Suites 22 (Team RBAC), 23 (Inventory Stock), 24 (WhatsApp AI Assistant).
* `docs/03-product-specs/product-roadmap.md` — Mark Sprints 8, 9, 10 completed.

---

## 05 4-Phase Execution Checklist

- [ ] **Phase 1: Planning & Architecture**: Updated `feature_implementation_spec.md` and `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for RBAC, Inventory, and WhatsApp AI Assistant. Verify Red phase.
- [ ] **Phase 3: Implementation & Security Review**: Implement logic modules, custom hooks, API routes, and UI components.
- [ ] **Phase 4: Verification & Quality Gates**: Execute `npm run typecheck` and `npm test` (0 errors/warnings). Mark Sprints 8, 9, 10 complete in `product-roadmap.md` and commit code.
