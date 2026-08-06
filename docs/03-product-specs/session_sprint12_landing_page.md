# Single-Session Feature Spec: Sprint 12 / Pre-Launch Polish — Landing Page & Marketing Alignment

> **Active Execution Session Specification Document**
>
> Executing **Sprint 12 / Pre-Launch Polish (Item #1: Landing Page Final Polish)** of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**, @[docs/AGENTS-DOCS-GUIDE.md], and @[MASTER_PROMPT.md].

---

## 01 Feature Summary

* **Feature Name**: Sprint 12 / Pre-Launch Polish — Landing Page & Marketing Alignment
* **Target Module**: Landing Page (`app/page.tsx`), Landing Components (`components/landing/RoiCalculator.tsx`, `components/landing/FaqAccordion.tsx`), Onboarding CTA routes, and Test Suite (`scripts/test-runner.js`).
* **Primary User**: Traditional SMB Owners ("Don Roberto") & Tech-Forward Agency Managers ("Lic. Mariana").
* **Goal**: Elevate landing page visual hierarchy, conversion copy, mobile tap targets (>= 48px), dynamic ROI calculator, and Mexican B2B micro-SMB persona alignment prior to custom domain launch (`businesshelper.mx`).

### Scope Boundaries
* **In Scope**:
  1. **Landing Page Refresh (`app/page.tsx`)**:
     - Mobile-first responsiveness review ensuring all CTAs meet `>= 48px` minimum height and touch area.
     - Value proposition polish for Don Roberto (1-tap WhatsApp sharing, 5-sec receivables check, zero-SAT-friction Nota de Venta PDF) & Lic. Mariana (1-click accountant ZIP export, SAT CFDI 4.0 Pro addon).
     - Hero section visual hierarchy, ambient glows, social proof badges, and live demo link.
  2. **Landing Page Interactive Components (`components/landing/RoiCalculator.tsx` & `FaqAccordion.tsx`)**:
     - Verify ROI calculator interactive sliders, formula calculations, and responsive mobile rendering.
     - Update FAQ accordion items to address Nota de Venta PDF vs. SAT CFDI 4.0, SPEI verification, and WhatsApp integration.
  3. **Verification & Quality Suite (`scripts/test-runner.js`)**:
     - Ensure 100% passing rate across all unit test suites (`144/144`) and zero TypeScript linter warnings (`npm run typecheck`).

---

## 02 Acceptance Criteria (P0 / P1)

### Must-Have (P0 / P1)
- [ ] **AC 1.1**: All landing page interactive buttons and inputs (`app/page.tsx`) maintain `>= 48px` minimum tap targets for mobile usability (Don Roberto persona).
- [ ] **AC 1.2**: Value proposition copy clearly articulates WhatsApp quotes, SPEI receipt uploads, zero-SAT-friction Nota de Venta PDF default, and 1-click Accountant ZIP export.
- [ ] **AC 1.3**: ROI Calculator (`components/landing/RoiCalculator.tsx`) and FAQ Accordion (`components/landing/FaqAccordion.tsx`) render cleanly without hydration or console errors.
- [ ] **AC 1.4**: `npm run typecheck` and `npm test` execute with 100% passing tests (144/144) and zero warnings.

---

## 03 Mobile UX Rules (Don Roberto Persona Constraints)

1. **Touch Target Size**: Touch targets on interactive buttons, inputs, and controls MUST be >= **48px** (`min-h-[48px]`, `py-3`).
2. **Clear Error & Data Feedback**: Display friendly Spanish labels and error messages (*"Cotización enviada"*, *"Comprobante subido"*) instead of raw technical errors.
3. **1-Tap WhatsApp Actions**: Integrate context-specific `wa.me/` Click-to-Chat links for sharing and follow-ups.

---

## 04 Technical Implementation & Files

### Exact Files to Modify / Create

#### Landing Page & Components
* [MODIFY] [page.tsx](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/app/page.tsx) — Refresh hero copy, CTAs, feature showcase cards, pricing tiers, and mobile responsive layout.
* [MODIFY] [RoiCalculator.tsx](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/components/landing/RoiCalculator.tsx) — Verify ROI calculation logic and mobile slider accessibility.
* [MODIFY] [FaqAccordion.tsx](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/components/landing/FaqAccordion.tsx) — Verify FAQ items covering WhatsApp, SPEI, and Nota de Venta PDF invoicing.

#### Test Suite & Documentation
* [MODIFY] [product-roadmap.md](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/03-product-specs/product-roadmap.md) — Document Sprint 12 / Pre-Launch Polish completion status.
* [MODIFY] [scripts/test-runner.js](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/scripts/test-runner.js) — Verify pre-flight test runner compliance.

---

## 05 4-Phase Execution Checklist

- [x] **Phase 1: Planning & Spec**: Created `session_sprint12_landing_page.md` and `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Verify test suite runner readiness in `scripts/test-runner.js`.
- [ ] **Phase 3: Implementation & Security**: Apply landing page visual polish, responsive touch target enhancements, and persona messaging alignment in `app/page.tsx`.
- [ ] **Phase 4: Verification & Quality Gates**: Run `npm run typecheck` and `npm test` ensuring 0 errors/warnings and 100% pass rate.
