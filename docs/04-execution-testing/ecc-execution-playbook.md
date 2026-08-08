# ECC Sprint & Feature Execution Playbook: Business Helper

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

> [!NOTE]
> **Live status lives in [`docs/STATUS.md`](../STATUS.md) — not here.** The checklists here are **steps an agent performs**, not a record of what has been done. Coverage thresholds quoted are policy targets.

> **Repeatable Workflow Protocol for AI Agents & Development Sprints**
>
> A step-by-step operating playbook for leveraging the **Everything Claude Code (ECC)** agent suite to plan, build, test, and verify every feature and sprint in **Business Helper**.

---

## 01 Overview of ECC Integration

The ECC framework equips AI assistants with 67 domain-specialized agents, 281 skills, and automated pre-commit quality gates. This playbook standardizes a **4-Phase Sprint Loop** ensuring zero technical debt, 85%+ test coverage, and 100% PostgreSQL RLS multi-tenant security compliance.

```mermaid
graph TD
    subgraph Phase 1: Planning & Architecture
        P1[User Story / Sprint Task] --> AgentPlanner[@planner / @architect]
        AgentPlanner --> ReadDocs[Read Architecture & Schema Docs]
        ReadDocs --> FeatureSpec[Create Feature Implementation Spec]
    end

    subgraph Phase 2: Test-Driven Development (TDD)
        FeatureSpec --> AgentTDD[@tdd-guide]
        AgentTDD --> WriteTests[Write Vitest Unit Tests in tests/unit/]
        WriteTests --> FailCheck[Verify Tests Fail (Red)]
    end

    subgraph Phase 3: Implementation & Review
        FailCheck --> AgentDev[@typescript-reviewer / @database-reviewer]
        AgentDev --> CodeImpl[Write Feature Code & RLS Policies]
        CodeImpl --> AgentSec[@security-reviewer]
        AgentSec --> SecAudit[Audit Input Sanitization & RLS]
    end

    subgraph Phase 4: Verification & E2E
        SecAudit --> AgentBuild[@build-error-resolver]
        AgentBuild --> TypeCheck[npm run typecheck && npm run lint]
        TypeCheck --> AgentE2E[@e2e-runner]
        AgentE2E --> Playwright[Playwright E2E Parallel Test Suite]
        Playwright --> Merge[Merge & Update Roadmap]
    end
```

---

## 02 The 4-Phase Execution Loop

### Phase 1: Planning & Architecture Phase

> **Objective**: Define exact files, data models, and acceptance criteria before writing a single line of code.

1. **Invoke Specialized Agents**:
   * Use `@planner` to decompose the roadmap sprint task into single-session subtasks.
   * Use `@architect` if the task introduces a new data model, API endpoint, or third-party service.
2. **Mandatory Document Reading**:
   * Inspect [`docs/02-architecture/database-schema-design.md`](../../docs/02-architecture/database-schema-design.md) for table schemas, indexes, and RLS constraints.
   * Inspect [`docs/02-architecture/app-architecture-plan.md`](../../docs/02-architecture/app-architecture-plan.md) for API conventions.
3. **Artifact Output**:
   * Create or update a [`docs/03-product-specs/feature_implementation_spec.md`](../../docs/03-product-specs/feature_implementation_spec.md) detailing:
     * P0 Acceptance Criteria (testable statements).
     * Exact files to create/modify.
     * Mobile edge cases and empty states.

---

### Phase 2: Test-Driven Development (TDD) Phase

> **Objective**: Write failing automated unit tests before writing feature code to guarantee regression safety.

1. **Invoke Specialized Agent**:
   * Delegate to `@tdd-guide` to write unit tests targeting core logic.
2. **Test File Target**:
   * Add modular unit and component tests to `tests/unit/` or `tests/components/` using Vitest + `@testing-library/react` covering tax calculations, Modulo 11 check digits, data transformers, or component rendering.
3. **Verify Red Phase**:
   * Run `npm run test` and confirm the new unit/component tests fail as expected prior to implementation.

---

### Phase 3: Implementation & Review Phase

> **Objective**: Build clean, multi-tenant UI components and API handlers, enforced by code and security reviewers.

1. **Invoke Domain Reviewers**:
   * Delegate to `@typescript-reviewer` for Next.js 15 RSC/Client components and custom hooks (`useQuotes.ts`, `useReceivables.ts`).
   * Delegate to `@database-reviewer` for SQL migrations and PostgreSQL RLS policies (`organization_id` scoping).
2. **Mobile UX Rules (Don Roberto Constraint)**:
   * Ensure touch targets are `>= 48px`.
   * Include pre-filled 1-tap WhatsApp Click-to-Chat buttons.
3. **Security Audit**:
   * Delegate to `@security-reviewer` to audit:
     * RLS `organization_id` multi-tenant isolation.
     * File upload magic byte validation for SPEI receipts (`FF D8 FF` / `89 50 4E 47` / `%PDF-`).
     * OTP brute-force attempt throttling (max 3 failed attempts).

---

### Phase 4: Verification & Quality Gate Phase

> **Objective**: Validate build compilation, test coverage thresholds, and end-to-end user flows.

1. **Build & Lint Verification**:
   * If TypeScript or ESLint errors occur, invoke `@build-error-resolver`.
   * Command: `npm run typecheck && npm run lint`. Both must exit clean. `npm run lint` runs `next lint --max-warnings=0` (enforced since #46), so its exit code is authoritative — any warning fails it.
2. **Coverage Gate Verification**:
   * Command: `npm run test:coverage` (Must achieve `>= 85%` line/statement coverage via Vitest V8 reporter).
3. **End-to-End Verification**:
   * Delegate to `@e2e-runner` to run Playwright E2E browser tests.
   * Command: `npx playwright test`
4. **Roadmap & Audit Log Sync**:
   * Mark sprint task completed in [`docs/03-product-specs/product-roadmap.md`](../../docs/03-product-specs/product-roadmap.md).

---

## 03 Agent Command Quick Reference

> [!WARNING]
> **Most of these agent names are aspirational, not executable.** The ECC suite is a third-party
> framework that was never installed here, so invoking `@planner` or `@security-reviewer` in
> Claude Code does nothing and gives no error. **Two exceptions, defined for real in
> `.claude/agents/` on 2026-08-07:** `database-reviewer` (the `@database-reviewer` role below)
> and `money-path-reviewer` (no ECC counterpart — reviews payments/CFDI/Stripe diffs). The
> 4-Phase loop itself requires no setup and should be run directly. For the full role-to-reality
> mapping, see `CLAUDE.md` §"Process".

| ECC Agent | Primary Command / Trigger | When to Use in Business Helper |
|:---|:---|:---|
| `@planner` | `"Decompose Sprint [N] into subtasks"` | Start of every sprint or new epic |
| `@architect` | `"Review data flow for [Feature]"` | Adding new tables or third-party APIs |
| `@tdd-guide` | `"Write unit tests for [Function]"` | Before writing business logic |
| `@database-reviewer` | `"Audit RLS policies for [Table]"` | Modifying SQL schemas or migrations |
| `@security-reviewer` | `"Review security of file uploads & OTP"` | Before committing client-facing features |
| `@build-error-resolver` | `"Fix build and linting errors"` | When `npm run typecheck` fails |
| `@e2e-runner` | `"Run Playwright E2E suite"` | Before merging feature branches |
| `@code-reviewer` | `"Review code quality and types"` | Post-implementation code polish |

---

## 04 Sprint Definition of Done Checklist

Every feature and sprint MUST pass this checklist before being considered complete:

- [ ] **Planning**: `feature_implementation_spec.md` updated with files and P0 acceptance criteria.
- [ ] **TDD**: Unit tests written and verified failing before implementation.
- [ ] **Security**: PostgreSQL RLS policies active for `organization_id` multi-tenancy.
- [ ] **Mobile UX**: Tested on mobile viewport; WhatsApp links pre-filled and functional.
- [ ] **Typecheck & Lint**: `npm run typecheck` and `npm run lint` pass with 0 warnings.
- [ ] **Coverage Gate**: `npm run test` verifies line/branch coverage `>= 85%`.
- [ ] **E2E Tests**: Playwright happy-path user flows pass cleanly in headless browser.
- [ ] **Roadmap**: [`product-roadmap.md`](../../docs/03-product-specs/product-roadmap.md) updated with checked task boxes.
