# Feature Implementation Spec: Sprint 7 — SAT CFDI 4.0 Electronic Invoicing, Accountant Export & Product Catalog

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprint 7 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Sprint 7 — SAT CFDI 4.0 Electronic Invoicing (Facturapi PAC), 1-Click Accountant Export Package (ZIP/CSV), Pre-Saved Product & Service Catalog with SAT Keys, and Automated WhatsApp Outbound Broadcast Generator.
* **Target Module**: Invoicing & Products (`/app/(dashboard)/invoices`, `/app/(dashboard)/products`, `/lib/facturapi.ts`, `/lib/accountantExport.ts`, `/lib/products.ts`, `/lib/whatsappBroadcast.ts`, `/app/api/invoices/issue`, `/app/api/accountant/export`, `/app/api/products`)
* **Primary User**: Don Roberto ("El Dueño Tradicional") & Lic. Mariana ("La Administradora Eficiente")
* **Goal**: Deliver the SAT CFDI 4.0 Electronic Invoicing Engine (`/invoices`), 1-Click Accountant Export Package (ZIP/CSV), Pre-Saved Product & Service Catalog (`/products`) with SAT Unit Keys (`E48`) and SAT Product Codes (`84111506`), and WhatsApp Outbound Broadcast Payload Generator, providing complete SAT tax compliance and administrative time savings for Mexican SMBs.

### Scope Boundaries
* **In Scope**:
  * **Facturapi PAC Integration Engine (`lib/facturapi.ts`, `lib/facturapi.js`)**: Helper functions for constructing SAT CFDI 4.0 invoice payloads, validating SAT tax regime codes (e.g. 601, 626, 612), postal codes (5 digits), RFC check digits, and handling Facturapi PAC API responses/errors.
  * **1-Click Accountant Export Engine (`lib/accountantExport.ts`, `lib/accountantExport.js`)**: Generator for monthly sales summaries, client RFC logs, invoice XML/PDF links, and SPEI vouchers formatted as CSV and ZIP manifest packages for external accountants (*contadores*).
  * **Product & Service Catalog Engine (`lib/products.ts`, `lib/products.js`)**: Catalog manager supporting product/service creation with SAT Clave Unidad (`E48`) and SAT Clave ProdServ (`84111506`), price lookups, and quote line-item pre-filling.
  * **WhatsApp Outbound Broadcast Generator (`lib/whatsappBroadcast.ts`, `lib/whatsappBroadcast.js`)**: Generator for automated outbound payment reminder broadcast payloads (3-day pre-due, due-date, overdue).
  * **Product Catalog UI (`app/(dashboard)/products/page.tsx`, `components/products/ProductCatalogCard.tsx`)**: Responsive mobile-first catalog management screen with >= 48px touch targets and instant search.
  * **Invoicing & Accountant Export Hub (`app/(dashboard)/invoices/page.tsx`, `components/invoices/InvoiceManagerCard.tsx`)**: One-tap CFDI invoice issuance and 1-click accountant ZIP/CSV download center.
  * **Custom React Hooks (`lib/hooks/useProducts.ts`, `lib/hooks/useInvoices.ts`)**: Hooks managing product catalog state and invoice status transitions.
  * **API Route Handlers (`app/api/products/route.ts`, `app/api/invoices/issue/route.ts`, `app/api/accountant/export/route.ts`)**: Server handlers with mandatory `organization_id` multi-tenant RLS isolation.
  * **TDD Unit Test Suites in `scripts/test-runner.js`**: Suites 18, 19, 20, and 21.
* **Out of Scope**:
  * Multi-user team role invitations & granular RBAC permissions (Sprint 8).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [ ] **AC 7.1**: Facturapi integration engine (`lib/facturapi.ts`) validates SAT CFDI 4.0 metadata (RFC, Regimen Fiscal, Postal Code, CFDI Use G03/P01, SAT Unit E48, SAT Product Code 84111506) and constructs valid CFDI invoice payloads.
- [ ] **AC 7.2**: 1-Click Accountant Export package engine (`lib/accountantExport.ts`) generates structured monthly financial summaries (CSV format & ZIP manifest metadata) including sales totals, client RFCs, CFDI statuses, and SPEI proof URLs.
- [ ] **AC 7.3**: Product & Service Catalog engine (`lib/products.ts`) supports adding, filtering, and pre-populating quote line-items with default SAT unit keys (`E48`) and SAT product codes (`84111506`).
- [ ] **AC 7.4**: WhatsApp Outbound Broadcast engine (`lib/whatsappBroadcast.ts`) generates scheduled payment reminder broadcast payloads with deep-links for batch client communication.
- [ ] **AC 7.5**: Product Catalog View (`/products`) and Invoicing/Accountant Hub (`/invoices`) render responsive, high-contrast interfaces with >= 48px touch targets and 1-tap action buttons.
- [ ] **AC 7.6**: API endpoints `/api/products`, `/api/invoices/issue`, and `/api/accountant/export` enforce `organization_id` RLS multi-tenant data isolation.
- [ ] **AC 7.7**: Automated unit test suites in `scripts/test-runner.js` cover Facturapi, Accountant Export, Product Catalog, and WhatsApp Broadcast logic with 100% pass rate.
- [ ] **AC 7.8**: Quality gates (`npm run typecheck` and `npm test`) pass with 0 errors and 0 warnings.

### Should-Have (P1)
- [ ] **AC 7.9**: Search and filter input bar in Product Catalog for quick item selection by name or SAT code.
- [ ] **AC 7.10**: Visual toast feedback on 1-click CFDI invoice issuance and accountant package download.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: All action buttons (Stamping CFDI, Downloading Accountant ZIP, Adding Product, WhatsApp Broadcast) MUST have a minimum touch target height/width of **48px** (`min-h-[48px]`, `p-3`).
2. **1-Tap WhatsApp Links**: Provide pre-filled, status-aware 1-tap WhatsApp Click-to-Chat buttons for sending invoice notifications directly to client phone numbers.
3. **High-Contrast Badges**: Status indicators (`CFDI Emitido`, `Pendiente`, `Error SAT`, `ZIP Listo`) rendered with bold, high-contrast badges.
4. **Zero-Friction Accountant Export**: Single tap on "Descargar Paquete Mensual (ZIP/CSV)" compiles all monthly files instantly.

---

## 04 Technical Implementation & Files

### Exact Files to Create / Modify

#### Core Logic & Utilities
* `lib/facturapi.ts` / `lib/facturapi.js` — Facturapi SAT CFDI 4.0 PAC client payload builder & validator.
* `lib/accountantExport.ts` / `lib/accountantExport.js` — 1-Click monthly accountant export generator (CSV summary & ZIP package builder).
* `lib/products.ts` / `lib/products.js` — Pre-saved Product & Service catalog manager with SAT unit keys (`E48`) & codes (`84111506`).
* `lib/whatsappBroadcast.ts` / `lib/whatsappBroadcast.js` — Outbound automated WhatsApp reminder broadcast payload generator.
* `lib/hooks/useProducts.ts` — React hook for product catalog CRUD and selection state.
* `lib/hooks/useInvoices.ts` — React hook for invoice status management and accountant export actions.

#### UI Components & Views
* `components/products/ProductCatalogCard.tsx` — Product catalog management card with SAT code selector.
* `app/(dashboard)/products/page.tsx` — Product & Service catalog dashboard page.
* `components/invoices/InvoiceManagerCard.tsx` — CFDI 4.0 Invoicing & 1-Click Accountant Export Hub component.
* `app/(dashboard)/invoices/page.tsx` — Invoices & Accountant Export dashboard page.

#### Server API Handlers
* `app/api/products/route.ts` — GET/POST endpoint for multi-tenant product catalog.
* `app/api/invoices/issue/route.ts` — POST endpoint to stamp CFDI 4.0 invoice via Facturapi PAC.
* `app/api/accountant/export/route.ts` — GET endpoint for downloading monthly CSV/ZIP accountant bundle.

#### Tests & Roadmap Sync
* `scripts/test-runner.js` — Add Suites 18 (Facturapi SAT CFDI Engine), 19 (Accountant Export Engine), 20 (Product Catalog & SAT Keys), 21 (WhatsApp Outbound Broadcasts).
* `docs/03-product-specs/product-roadmap.md` — Update roadmap to mark Sprint 7 completed.

---

## 05 4-Phase Execution Checklist

- [ ] **Phase 1: Planning & Architecture**: Inspected schema, app architecture, user personas; updated `feature_implementation_spec.md` and created `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add failing unit tests to `scripts/test-runner.js` for Facturapi SAT CFDI 4.0, Accountant Export, Product Catalog, and WhatsApp Broadcasts. Verify Red phase.
- [ ] **Phase 3: Implementation & Security Review**: Implement core logic modules, custom hooks, API routes, and UI components adhering to RLS multi-tenant security and mobile UX rules.
- [ ] **Phase 4: Verification & Quality Gates**: Execute `npm run typecheck` and `npm test` (0 errors/warnings). Mark Sprint 7 complete in `product-roadmap.md` and commit code.
