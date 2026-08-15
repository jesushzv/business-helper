# Business Helper — Master Execution Prompt

> **Gold Template for AI Coding Assistants (AGY / Claude / Cursor / Antigravity)**
>
> Copy this prompt and substitute `[TASK_ID]` with the target Sprint or Workstream ID.
> This prompt maximizes context injection from the full documentation suite and enforces the ECC 4-Phase execution loop.
>
> **Subordinate to [`CLAUDE.md`](CLAUDE.md)** — the repo-root operating authority. Where this
> template and `CLAUDE.md` disagree (commands, hard rules, process weight), `CLAUDE.md` wins.
> This file remains the copy-paste template for sprint/workback/hotfix execution modes and the
> full persona constraint tables.

---

## 🎯 Execution Command (Copy-Paste)

### Mode A — Sprint Execution (Feature Development)

```
Please execute Sprint [N] following the full ECC protocol below.
```

### Mode B — Priority Stack Execution

```
Please execute [ITEM] from the priority stack in @[docs/STATUS.md] following the full ECC protocol below.
```

> Mode B used to name `product_readiness_workback.md`, which now lives in `docs/99-archive/` —
> so the injection resolved to nothing and the agent ran without the context it was promised
> (#318). The live priority stack is `docs/STATUS.md` §03, which is also the only document
> allowed to say what is done.

### Mode C — Bug Fix / Hotfix

```
Please investigate and fix [ISSUE_DESCRIPTION] following Phase 3 and Phase 4 of the ECC protocol below, using the bug triage template at @[docs/05-templates/bug_investigation_plan.md].
```

### Mode D — UX/UI Audit Remediation Execution

```
Please execute task [TASK_ID] from @[docs/04-execution-testing/ux_ui_audit_synthesis_aug2026.md] following the full ECC protocol below.
```

---

## 00 Project Identity & Context Primer

**Business Helper** is a mobile-first B2B SaaS platform for Mexican SMBs that replaces fragmented Excel sheets and WhatsApp chats with an integrated **Quote → Contract → Pay → Confirm** cash flow system. Built on **Next.js 15 + Supabase + PostgreSQL** with SAT CFDI 4.0 electronic invoicing via Facturapi PAC.

- **Domain**: [businesshelper.app](https://businesshelper.app)
- **Target Market**: Mexican SMBs ($800K–$5M MXN monthly revenue) in Monterrey, CDMX, Tijuana, and Guadalajara
- **Pricing**: $299 / $599 / $999 MXN/month + optional CFDI folio packs
- **Tech Stack**: Next.js 15 (RSC + Server Actions), Supabase Auth + PostgreSQL + Storage, Stripe Billing, Facturapi PAC, Vercel Edge
- **Current Status**: see @[docs/STATUS.md] — the source of truth for what is done and what blocks launch. (Test count, gate status and audit scores drift too fast to be trusted here; this line once claimed 175/175 while the suite had 494 tests.)

---

## 01 Mandatory Context Loading (Read Before Writing Code)

> [!IMPORTANT]
> **You MUST read these documents in order before writing any code.** This ensures architectural alignment, schema accuracy, and persona compliance. Do not skip this step.

### Tier 1 — Always Read (Every Execution)

| Priority | Document | Purpose |
|:---|:---|:---|
| 🔴 P0 | @[CLAUDE.md] | The operating authority: hard rules, commands, API conventions, gotchas |
| 🔴 P0 | @[docs/AGENTS-DOCS-GUIDE.md] | Doc index and navigation matrix |
| 🔴 P0 | @[docs/04-execution-testing/ecc-execution-playbook.md] | The 4-Phase ECC loop (Planning → TDD → Implementation → Verification) |
| 🔴 P0 | @[docs/02-architecture/database-schema-design.md] | PostgreSQL table schemas, indexes, RLS policies, and field names |
| 🔴 P0 | @[docs/02-architecture/app-architecture-plan.md] | Next.js 15 architecture, API conventions, file organization |
| 🔴 P0 | @[docs/01-strategy/user-personas.md] | Don Roberto & Lic. Mariana persona constraints (UX, mobile, WhatsApp) |

### Tier 2 — Read Based on Task Context

| Priority | Document | When to Read |
|:---|:---|:---|
| 🔴 P0 | @[docs/04-execution-testing/ux_ui_audit_synthesis_aug2026.md] | Any UI/UX, landing page, or onboarding remediation task |
| 🟡 P1 | @[docs/03-product-specs/product-roadmap.md] | Sprint execution (Mode A) — check sprint scope and Definition of Done |
| 🟡 P1 | @[docs/STATUS.md] | Mode B — the live priority stack, and the only document that may assert status |
| 🟡 P1 | @[docs/02-architecture/cfdi_integration_architecture.md] | Any CFDI, invoicing, or PAC-related work |
| 🟡 P1 | @[docs/01-strategy/brand_guidelines_spec.md] | Any UI, copy, or visual work — brand voice, colors, typography |
| 🟡 P1 | @[docs/02-architecture/technical_design_document.md] | Security audits, performance targets, deployment procedures |
| 🟡 P1 | @[docs/03-product-specs/landing-page-brief.md] | Landing page modifications or marketing copy changes |

### Tier 3 — Reference as Needed

| Priority | Document | When to Read |
|:---|:---|:---|
| 🟢 P2 | @[docs/01-strategy/competitive-analysis-report.md] | Competitive positioning, feature gap analysis |
| 🟢 P2 | @[docs/01-strategy/go-to-market-plan.md] | Distribution strategy, pilot onboarding |
| 🟢 P2 | @[docs/01-strategy/PRD-business-helper.md] | Master PRD, module definitions, strategic pivot history |
| 🟢 P2 | @[docs/01-strategy/okrs.md] | Q3/Q4 OKR alignment |
| 🟢 P2 | @[docs/04-execution-testing/product_launch_checklist.md] | Pre-launch gate verification |
| 🟢 P2 | @[docs/03-product-specs/demo_video_storyboard.md] | Demo video production tasks |

---

## 02 ECC 4-Phase Execution Protocol

> [!CAUTION]
> **Every task — sprint, workstream, or hotfix — MUST follow this 4-phase loop. Skipping phases creates technical debt and security gaps.**

### Phase 1: Planning & Architecture Spec

**Objective**: Define exact files, data models, acceptance criteria, and test plan before writing code.

1. **Load Context**: Read all Tier 1 documents (Section 01 above) plus relevant Tier 2 documents for the task.
2. **Verify Schema**: Cross-reference `database-schema-design.md` for exact column names, types, and RLS policies before writing any SQL or Supabase calls.
3. **Create Feature Spec**: Update @[docs/03-product-specs/feature_implementation_spec.md] with:
   - **Spec Metadata**: Task name, sprint/workstream ID, status
   - **Acceptance Criteria**: P0 (must-have) acceptance criteria written as falsifiable statements
   - **Persona Constraints**: Don Roberto mobile UX rules and Lic. Mariana multi-tenant rules (see Section 03)
   - **File Map**: Exact files to create, modify, or delete with descriptions
   - **Data Flow**: Input → Validation → Supabase → PostgreSQL → Response pattern
4. **Present Implementation Plan**: Present the plan for user review before proceeding to Phase 2.

### Phase 2: Test-Driven Development (TDD Red Phase)

**Objective**: Write failing tests before writing feature code to guarantee regression safety.

1. **Write Unit & Component Tests**: Add new test files under `tests/unit/` or `tests/components/` targeting:
   - Core business logic (tax calculations, RFC validation, health scores)
   - Data validators and transformers
   - React 19 Client components and UI touch target constraints
   - API route input/output contracts
2. **Verify Red State**: Run `npm run test` and confirm new tests fail as expected.
3. **Coverage Target**: Tests must collectively maintain `>= 85%` line/statement coverage via Vitest V8 reporter.

### Phase 3: Implementation & Security Review

**Objective**: Build clean, multi-tenant, mobile-first code enforced by security constraints.

1. **Build Code**: Implement UI components, custom hooks (`lib/hooks/`), server actions, and API routes (`app/api/`).
2. **Multi-Tenant Isolation**: Every database query MUST include RLS `organization_id` scoping. No exceptions.
3. **SAT/Tax Compliance**: Adhere to Mexican tax rules — IVA 16%, ISR withholding, IVA retention, CFDI 4.0 schemas.
4. **Mobile UX (Don Roberto Constraint)**:
   - All touch targets `>= 48px` (`min-h-[48px]`, `py-3`)
   - Pre-filled 1-tap WhatsApp `wa.me/` links for client communication
   - Large, readable monetary totals on mobile viewports
5. **Security Audit Checklist**:
   - [ ] RLS `organization_id` isolation verified on all queries
   - [ ] Input sanitization: HTML tags stripped, dangerous characters escaped
   - [ ] File uploads: Magic byte validation (`FF D8 FF` JPG, `89 50 4E 47` PNG, `%PDF-` PDF), size < 5MB
   - [ ] OTP brute-force protection: Max 3 failed attempts per session
   - [ ] No secrets or API keys in client-side bundles

### Phase 4: Verification & Quality Gates

**Objective**: Validate compilation, test coverage, E2E flows, and update tracking documents.

1. **TypeScript & Lint Gate**:
   ```bash
   npm run typecheck && npm run lint
   ```
   Zero errors, zero warnings. `npm run lint` runs `next lint --max-warnings=0` (enforced since #46), so a non-zero exit is authoritative — any warning fails the command.

2. **Unit Test & Coverage Gate**:
   ```bash
   npm run test:coverage
   ```
   Must achieve `>= 85%` statement/line coverage and 100% test pass rate.

3. **E2E Verification** (when applicable):
   ```bash
   npx playwright test
   ```
   Happy-path user flows must pass in headless browser.

4. **Documentation Sync**:
   - **Status goes in @[docs/STATUS.md] and nowhere else.** This step used to say "mark workstream
     tasks completed in `product_readiness_workback.md` with ☑" — a file that is now read-only
     archive, and a write that broke the doc contract `tests/unit/docsStatusAuthority.test.ts`
     enforces (#318). Record what changed *and what you actually ran*, per CLAUDE.md.
   - Update `feature_implementation_spec.md` status to `Completed`

5. **Git Commit**:
   ```bash
   git add -A && git commit -m "feat(sprint-[N]): complete Sprint [N] deliverables"
   # OR for workback:
   git add -A && git commit -m "fix(ws-[x]): complete Workstream [X] tasks"
   ```

---

## 03 Persona-Driven Design Constraints

> These constraints are non-negotiable and must be applied to every UI component and API endpoint.

### Don Roberto — "El Dueño Tradicional" (Primary User)

| Constraint | Rule | Rationale |
|:---|:---|:---|
| **Touch Targets** | `>= 48px` height on all interactive elements | Uses app on warehouse floor with one hand |
| **WhatsApp Integration** | Pre-filled `wa.me/` Click-to-Chat links on all client-facing actions | WhatsApp is his primary business communication channel |
| **Monetary Display** | Large, bold currency totals (`text-2xl` minimum) with MXN formatting | Needs instant "quién me debe" visibility |
| **Mobile-First** | Design for 375px viewport first, scale up | Uses iPhone/Android exclusively, never a desktop |
| **Language** | All user-facing copy in Mexican Spanish with authentic business tone | Not corporate Spanish, not Castilian |
| **Simplicity** | Maximum 3 taps to complete any core action | Zero-training onboarding requirement |

### Lic. Mariana — "La Directora Operativa" (Secondary User)

| Constraint | Rule | Rationale |
|:---|:---|:---|
| **Multi-Tenant RBAC** | All data scoped by `organization_id` via PostgreSQL RLS | Manages multiple business units |
| **Audit Trail** | Log who created/modified each record | Needs accountability for team actions |
| **Export & Reporting** | CSV/ZIP exports with CONTPAQi/Contalink compatibility | Interfaces with external accountants |
| **Desktop Support** | Full-width dashboard layouts for 1440px+ screens | Uses desktop for administrative tasks |

---

## 04 Current Priority Context

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

**Read @[docs/STATUS.md] §03.** This section used to restate the workback phase schedule and the
expert review's gap scores — timelines, gate thresholds and `3/10`-style figures — copied out of a
document that has since moved to `docs/99-archive/`, behind a reference that resolved to nothing
(#318). Every number in it was frozen at the moment it was pasted, which is precisely the drift
the doc contract exists to stop: a template asserting priorities is a second source of truth, and
the stale one always looks as authoritative as the live one.

Priorities, gates and scores live in `docs/STATUS.md`. The archived workback and expert review
remain readable in `docs/99-archive/` as history — never as instructions.

---

## 05 Tech Stack Quick Reference

| Layer | Technology | Key Files |
|:---|:---|:---|
| **Framework** | Next.js 15 (App Router, RSC, Server Actions) | `app/`, `next.config.ts` |
| **Database** | Supabase PostgreSQL + RLS | `supabase/`, `lib/supabase/` |
| **Auth** | Supabase Auth (HTTP-only cookies) | `middleware.ts`, `app/(auth)/` |
| **Billing** | Stripe (MXN pricing) | `lib/stripe.ts` |
| **Invoicing** | Facturapi PAC (SAT CFDI 4.0) | `lib/facturapi.ts` |
| **Styling** | Tailwind CSS + Brand dark slate theme (#090D16) | `app/globals.css` |
| **Testing** | Vitest (unit + component) + Playwright | `tests/unit/`, `tests/components/`, `tests/e2e/` |
| **Deployment** | Vercel Edge (businesshelper.app) | `vercel.json` |
| **Monitoring** | `@sentry/nextjs` across browser, Node and Edge; PII scrubbed in `beforeSend`. Whether an alert has been *observed* arriving is a status question — `docs/STATUS.md` | `sentry.*.config.ts`, `lib/sentryScrub.ts` |

---

## 06 ECC Agent Quick Reference

> [!WARNING]
> **Mostly not executable in this repo.** The ECC agent suite was never installed, so `@planner`,
> `@security-reviewer` and most names below do nothing when invoked. **Exception:**
> `@database-reviewer` is now real (`.claude/agents/database-reviewer.md`), joined by
> `money-path-reviewer` for payments/CFDI/Stripe diffs. See `CLAUDE.md` §"Process" for the full
> role-to-reality mapping (`Plan` subagent, `/security-review`, `/code-review`).

| Agent | When to Invoke | Business Helper Context |
|:---|:---|:---|
| `@planner` | Start of sprint or workstream | Decompose into single-session subtasks |
| `@architect` | New data models or API endpoints | Verify against `database-schema-design.md` |
| `@tdd-guide` | Before writing business logic | Target `tests/unit/` (Vitest, importing the `.ts` sources) |
| `@database-reviewer` | SQL migrations or RLS changes | Enforce `organization_id` scoping |
| `@security-reviewer` | Client-facing features | Audit file uploads, OTP, input sanitization |
| `@typescript-reviewer` | Components and hooks | Next.js 15 RSC/Client split, type safety |
| `@build-error-resolver` | When `npm run typecheck` fails | Fix TS errors and lint violations |
| `@e2e-runner` | Pre-merge verification | Run Playwright headless suite |
| `@code-reviewer` | Post-implementation polish | Code quality and type refinement |

---

## 07 Definition of Done Checklist

Every feature, sprint, and workstream task MUST pass ALL gates:

- [ ] **Spec**: `feature_implementation_spec.md` populated with P0 acceptance criteria and file map
- [ ] **TDD**: Unit tests written in `tests/unit/` and verified failing before implementation
- [ ] **Security**: PostgreSQL RLS `organization_id` isolation active on all queries
- [ ] **Mobile UX**: Touch targets `>= 48px`, WhatsApp links pre-filled, tested on mobile viewport
- [ ] **Brand**: UI follows dark slate theme (#090D16 base, emerald accents) per `brand_guidelines_spec.md`
- [ ] **TypeCheck**: `npm run typecheck` passes with 0 errors, 0 warnings
- [ ] **Lint**: `npm run lint` passes (`next lint --max-warnings=0` — the script fails on any warning since #46)
- [ ] **Coverage**: `npm run test:coverage` achieves `>= 85%` coverage, 100% pass rate
- [ ] **E2E**: Playwright happy-path flows pass (when applicable)
- [ ] **Docs**: Roadmap or workback schedule updated with completion status
- [ ] **Git**: Committed with conventional commit message (`feat(...)`, `fix(...)`)
