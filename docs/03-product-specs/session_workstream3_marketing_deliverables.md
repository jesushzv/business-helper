# Single-Session Feature Spec: Workstream 3 — Marketing Deliverables & Product Demo Video

> **Active Execution Session Specification Document**
>
> Executing **Workstream 3: Marketing Deliverables & Product Demo Video** of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**, @[docs/AGENTS-DOCS-GUIDE.md], and @[MASTER_PROMPT.md].

---

## 01 Feature Summary

* **Feature Name**: Workstream 3 — Marketing Deliverables & Product Demo Video
* **Target Module**: Marketing Copy Engine (`lib/marketingCopy.ts`, `lib/marketingCopy.js`), Demo Video Script, Launch Announcements, Accountant Network Collateral, and Test Suite (`scripts/test-runner.js`).
* **Primary User**: Founder, Growth Lead, Partner Accountants & Prospective SMB Clients.
* **Goal**: Provide a production-ready marketing copy engine, 60-second video demo storyboard script, founder social media release announcement, and accountant partner network pitch collateral to drive commercial launch acquisitions.

### Scope Boundaries
* **In Scope**:
  1. **Marketing Copy & Collateral Module (`lib/marketingCopy.ts` & `lib/marketingCopy.js`)**:
     - Build `lib/marketingCopy.ts` exporting `getFounderReleasePost()`, `getAccountantPartnerPitch()`, `getDemoVideoScript()`, and `getSalesBattlecard()`.
  2. **60-Second Product Demo Video Storyboard Script**:
     - Scene-by-scene timing (0:00 to 1:00) covering *Problem → Quote Creation → WhatsApp Link → OTP Cryptoseal → Banxico SPEI Upload → 1-Click Accountant ZIP Export*.
  3. **Unit & Integration Test Suite Expansion (`scripts/test-runner.js`)**:
     - Add Suite 43 asserting marketing copy module exports, social post formatting, and video script scene counts.

---

## 02 Acceptance Criteria (P0 / P1)

### Must-Have (P0 / P1)
- [ ] **AC 1.1**: `lib/marketingCopy.ts` exports `getFounderReleasePost()`, `getAccountantPartnerPitch()`, `getDemoVideoScript()`, and `getSalesBattlecard()`.
- [ ] **AC 1.2**: `getDemoVideoScript()` includes a structured 5-scene storyboard covering quote creation, WhatsApp sharing, OTP cryptoseal, SPEI upload, and accountant export.
- [ ] **AC 1.3**: `getFounderReleasePost()` formats founder announcement copy tailored for Mexican SMB owners (*Don Roberto* persona).
- [ ] **AC 1.4**: All test suites in `scripts/test-runner.js` pass with 100% success rate (Suite 43 added).
- [ ] **AC 1.5**: `npm run typecheck` and `npm test` execute with 0 errors and 0 warnings.

---

## 03 Technical Implementation & Files

### Exact Files to Modify / Create

#### Marketing Copy Engine
* `lib/marketingCopy.ts` — [NEW] Marketing copy, launch posts, accountant pitches & video script module.
* `lib/marketingCopy.js` — [NEW] CommonJS mirror for Node test runner.

#### Test Suite
* `scripts/test-runner.js` — [MODIFY] Add Suite 43 assertions for marketing copy engine.

---

## 04 4-Phase Execution Checklist

- [x] **Phase 1: Planning & Spec**: Created `session_workstream3_marketing_deliverables.md` and `implementation_plan.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Add Suite 43 assertions in `scripts/test-runner.js`. Verify Red/Green phase.
- [ ] **Phase 3: Implementation & Security**: Build `lib/marketingCopy.ts` and `lib/marketingCopy.js`.
- [ ] **Phase 4: Verification & Quality Gates**: Run `npm run typecheck` and `npm test` ensuring 0 errors/warnings.
