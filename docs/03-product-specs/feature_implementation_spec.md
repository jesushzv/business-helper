# Feature Implementation Spec: WS-F Demo & Trust Assets

> **Single-Session AI & Engineering Feature Implementation Spec**
>
> **Workstream**: WS-F (Demo & Trust Assets)
> **Owner / Agent Role**: @planner / @typescript-reviewer / @security-reviewer
> **Status**: `Completed`
> **Target Launch / Phase**: Phase 2 Conversion Optimization (Week 3–4: Aug 18–31)

---

## 00 Spec Metadata

| Field | Value |
|:---|:---|
| **Feature / Task Name** | WS-F Demo & Trust Assets |
| **Sprint / Workstream ID** | Workstream F (Phase 2 Conversion Optimization) |
| **Owner / Agent Role** | Lead Engineering / @planner |
| **Status** | `Completed` |
| **Target Launch / Phase** | Phase 2 Conversion Gate 2 (Target: Mobile Responsiveness ≥ 6.0 & Launch Score ≥ 7.0) |

---

## 01 Feature Summary & Goal

* **Feature Name**: Demo & Trust Assets (Device-Framed Phone Mockups, Live Demo Scheduler Modal, Side-by-Side Comparison Matrix, Customer Health Score Explainer)
* **Target Area**:
  - **Device-Framed Phone Mockup (`components/landing/PhoneFrameMockup.tsx`)**:
    - Build a CSS/SVG mobile device wrapper (iPhone 15 Pro dark slate bezel, island notch, status bar, glass reflection) to enclose app preview UI cards.
  - **Live Demo Scheduler Modal (`components/landing/DemoSchedulerModal.tsx`)**:
    - Interactive 1-on-1 demo scheduling modal triggered by "Ver Demostración en Vivo" CTAs across header and hero sections.
    - Slot selector (time/date), business name input, WhatsApp phone input, and confirmation feedback.
  - **Side-by-Side Comparison Matrix (`components/landing/ComparisonSection.tsx`)**:
    - Direct comparison section contrasting Business Helper vs Excel/WhatsApp manual vs Traditional ERP systems (CONTPAQi, Aspel, Prayser).
  - **Customer Health Score Explainer (`components/landing/HealthScoreExplainer.tsx`)**:
    - Dedicated landing page section breaking down the 0–100 risk algorithm (Payment Punctuality, Volume, Communication Speed) and cash flow impact.
  - **Landing Page Integration (`app/page.tsx` & `components/landing/DemoVideoPlayer.tsx`)**:
    - Connect demo modal triggers, embed comparison and health score sections, and wrap video/hero previews inside device mockups.
* **Primary User Persona**: Don Roberto (visual mobile mockups confirm platform fits his phone workflow) & Lic. Mariana (comparison matrix and health score algorithm demonstrate clear operational ROI).
* **Strategic Goal**: Close expert review conversion gaps (raising credibility to ≥ 7.0/10) and complete Phase 2 Conversion Optimization.

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0 / P1)
- [ ] **AC-F1 (P0)**: Interactive step-by-step video demo player (`DemoVideoPlayer.tsx`) is rendered inside a realistic mobile device frame (`PhoneFrameMockup.tsx`).
- [ ] **AC-F2 (P0)**: Clicking "Ver Demostración en Vivo" CTAs opens `DemoSchedulerModal` offering 1-on-1 demo scheduling or instant walkthrough viewing.
- [ ] **AC-F3 (P0)**: Landing page includes side-by-side comparison section (`ComparisonSection.tsx`) contrasting Business Helper vs Excel vs Traditional ERPs across speed, WhatsApp, SPEI, and CFDI 4.0.
- [ ] **AC-F4 (P0)**: Landing page includes Customer Health Score explainer (`HealthScoreExplainer.tsx`) detailing the 0–100 score ranges, color indicators, and business recommendations.
- [ ] **AC-F5 (P0)**: Hero visual mockup right column is enclosed inside `<PhoneFrameMockup />`.
- [ ] **AC-F6 (P0)**: Vitest component and unit tests created and passing for `PhoneFrameMockup`, `DemoSchedulerModal`, `ComparisonSection`, and `HealthScoreExplainer`.

---

## 03 Persona & System UX Constraints

1. **Don Roberto Mobile Vision**: Device-framed app mockups visually prove to Don Roberto that the entire system runs on his smartphone.
2. **Lic. Mariana ROI & Risk Transparency**: Health score breakdown and competitor comparison table give operational directors immediate clarity on time saved and bad debt reduction.
3. **Touch Targets & Speed**: All scheduler modal buttons enforce `min-h-[48px]` touch targets.

---

## 04 Technical Implementation & File Map

### Exact Files to Modify / Create

#### Components & Pages (`components/landing/` & `app/`)
* `components/landing/PhoneFrameMockup.tsx` — [NEW] Mobile phone bezel wrapper with notch, status bar, and glass reflection.
* `components/landing/DemoSchedulerModal.tsx` — [NEW] 1-on-1 live demo booking modal.
* `components/landing/ComparisonSection.tsx` — [NEW] Side-by-side comparison table (Business Helper vs Excel vs CONTPAQi/Aspel).
* `components/landing/HealthScoreExplainer.tsx` — [NEW] Customer Health Score 0–100 algorithm and risk tier explainer.
* `components/landing/DemoVideoPlayer.tsx` — [MODIFY] Wrap interactive walkthrough screen in `<PhoneFrameMockup />`.
* `app/page.tsx` — [MODIFY] Connect demo modal state, embed comparison and health score sections, wrap hero mockup in phone frame.

#### Automated Test Suite (`tests/`)
* `tests/components/DemoSchedulerModal.test.tsx` — [NEW] Component test suite for demo booking modal.
* `tests/components/ComparisonSection.test.tsx` — [NEW] Component test suite for comparison section.
* `tests/components/HealthScoreExplainer.test.tsx` — [NEW] Component test suite for health score section.

#### Documentation & Workback Schedule (`docs/`)
* `docs/04-execution-testing/product_readiness_workback.md` — [MODIFY] Mark WS-F tasks (F1-F5) as completed ☑.
* `docs/03-product-specs/feature_implementation_spec.md` — [MODIFY] Complete feature spec.

---
