# Business Helper Documentation & Agent Navigation Guide

> **Central Documentation Index & Agent Operating System**
>
> This guide organizes the complete documentation suite for **Business Helper** into logical subdirectories and establishes exact protocols for when human developers and autonomous AI coding agents (AGY, Claude, Cursor) should read or update each document.

---

## 📁 Directory Structure Overview

All project documentation is organized under `business-helper/docs/` in 5 distinct categories:

```
business-helper/docs/
├── 01-strategy/                         # Executive & Commercial Strategy
│   ├── PRD-business-helper.md           # Master PRD & pivot strategy
│   ├── product_strategy_document.md     # 5-year vision & strategic bets
│   ├── brand_guidelines_spec.md         # Brand identity, naming & marketing strategy
│   ├── user-personas.md                 # Don Roberto & Lic. Mariana profiles
│   ├── competitive-analysis-report.md   # Business Helper vs Odoo/CONTPAQi/Alegra
│   ├── go-to-market-plan.md             # 90-day launch & distribution strategy
│   └── okrs.md                          # Q3/Q4 Objectives & Key Results
│
├── 02-architecture/                     # Technical & Database Architecture
│   ├── app-architecture-plan.md         # Next.js 16 + Supabase system architecture
│   ├── database-schema-design.md        # PostgreSQL tables, RLS & check constraints
│   ├── cfdi_integration_architecture.md  # CFDI 4.0 PAC integration models & trust-forward strategy (NEW)
│   └── technical_design_document.md     # Engineering specs, algorithms & testing
│
├── 03-product-specs/                    # Product Planning & Roadmaps
│   ├── product-roadmap.md               # Sprint execution schedule & gates
│   ├── landing-page-brief.md            # Landing page brief for AI design tools
│   ├── product_spec_for_ai_agents.md    # Agent-executable problem & bet spec
│   ├── feature_implementation_spec.md   # Single-session feature spec format
│   └── demo_video_storyboard.md         # Animated demo video scene breakdown
│
├── 04-execution-testing/                # Launch & Quality Assurance
│   ├── launch_readiness_memo_aug2026.md # ★ CURRENT SOURCE OF TRUTH for launch status
│   ├── ecc-execution-playbook.md        # ECC Agent 4-phase sprint execution playbook
│   ├── sprint-execution-master-prompt.md# Sprint execution prompt template
│   ├── product_launch_checklist.md      # Go-live technical & operational checklist
│   ├── product_readiness_snapshot.md    # Executive snapshot (status corrected 2026-08-07)
│   ├── product_readiness_workback.md    # Post-expert-review workback schedule & gate framework
│   ├── product_expert_review_aug2026.md # Independent product expert review archive
│   ├── ux_ui_audit_synthesis_aug2026.md # Dual UX/UI audit synthesis
│   └── usability_test_plan.md           # Task testing with Don Roberto & Mariana
│
├── 05-templates/                        # Working Engineering Templates
│   ├── bug_investigation_plan.md        # Bug triage & root cause analysis template
│   └── refactoring_plan.md              # Engineering refactoring blueprint template
│
├── deployment.md                        # Production deployment & secrets guide
└── security-p0-remediation.md           # P0 security findings & remediation record
```

> [!IMPORTANT]
> **Read [`launch_readiness_memo_aug2026.md`](04-execution-testing/launch_readiness_memo_aug2026.md) before
> trusting any completion claim in this documentation set.** A 2026-08-06 security review found that several
> features recorded as complete were simulated — the UI and data model shipped while the third-party call
> underneath was faked. The memo reconciles the docs against verified code state and supersedes the status
> dashboards elsewhere.

### Removed 2026-08-07

These were deleted as redundant or spent; git history retains them.

| Removed | Reason |
|:---|:---|
| `03-product-specs/product_launch_checklist.md` | Orphan duplicate of the `04-execution-testing` copy, never indexed here, strictly older |
| `04-execution-testing/session_pre_launch_readiness.md` | Strictly older duplicate of `product_readiness_snapshot.md` |
| `03-product-specs/session_sprint12_landing_page.md` | Spent one-off session spec; referenced the deleted `scripts/test-runner.js` |
| `03-product-specs/session_workstream2_custom_domain.md` | Spent one-off session spec; work landed in `lib/url.ts` |
| `03-product-specs/session_workstream3_marketing_deliverables.md` | Spent one-off session spec for `lib/marketingCopy.ts`, which was never created |
| `04-execution-testing/refactoring_plan.md` | Moved to `05-templates/` — it is a template with `[placeholder]` fields, not a plan |

---

## 🧭 Agent Navigation Decision Matrix: Which Doc to Read First?

| Task / Persona Goal | Primary Document to Read | Secondary Support |
|:---|:---|:---|
| **★ Asking "is this ready to launch?" or "what is actually done?"** | [`launch_readiness_memo_aug2026.md`](../docs/04-execution-testing/launch_readiness_memo_aug2026.md) | [`security-p0-remediation.md`](../docs/security-p0-remediation.md) |
| **Executing a sprint task or building a feature with ECC** | [`ecc-execution-playbook.md`](../docs/04-execution-testing/ecc-execution-playbook.md) | [`feature_implementation_spec.md`](../docs/03-product-specs/feature_implementation_spec.md) |
| **Architecting a new feature or database table** | [`database-schema-design.md`](../docs/02-architecture/database-schema-design.md) | [`app-architecture-plan.md`](../docs/02-architecture/app-architecture-plan.md) |
| **Implementing a single feature or UI component** | [`feature_implementation_spec.md`](../docs/03-product-specs/feature_implementation_spec.md) | [`user-personas.md`](../docs/01-strategy/user-personas.md) |
| **Checking sprint schedule or launch gates** | [`product-roadmap.md`](../docs/03-product-specs/product-roadmap.md) | [`launch_readiness_memo_aug2026.md`](../docs/04-execution-testing/launch_readiness_memo_aug2026.md) |
| **Fixing a production bug or regression** | [`bug_investigation_plan.md`](../docs/05-templates/bug_investigation_plan.md) | [`technical_design_document.md`](../docs/02-architecture/technical_design_document.md) |
| **Refactoring existing code** | [`refactoring_plan.md`](../docs/05-templates/refactoring_plan.md) | [`app-architecture-plan.md`](../docs/02-architecture/app-architecture-plan.md) |
| **Building marketing landing pages or ads** | [`landing-page-brief.md`](../docs/03-product-specs/landing-page-brief.md) | [`go-to-market-plan.md`](../docs/01-strategy/go-to-market-plan.md) |
| **Preparing for Beta launch or deployment** | [`product_launch_checklist.md`](../docs/04-execution-testing/product_launch_checklist.md) | [`product_readiness_snapshot.md`](../docs/04-execution-testing/product_readiness_snapshot.md) |
| **Working on CFDI / invoicing / PAC integration** | [`cfdi_integration_architecture.md`](../docs/02-architecture/cfdi_integration_architecture.md) | [`PRD-business-helper.md`](../docs/01-strategy/PRD-business-helper.md) (Module 5) |
| **Responding to product expert reviews** | [`product_expert_review_aug2026.md`](../docs/04-execution-testing/product_expert_review_aug2026.md) | [`product_readiness_workback.md`](../docs/04-execution-testing/product_readiness_workback.md) |
| **Tracking workback progress or gate status** | [`product_readiness_workback.md`](../docs/04-execution-testing/product_readiness_workback.md) | [`product_launch_checklist.md`](../docs/04-execution-testing/product_launch_checklist.md) |

---

## ⚡ Mandatory Operating Rules for AI Agents

1. **Follow the 4-Phase ECC Loop**: Execute via `ecc-execution-playbook.md` (Planning → TDD → Execution/Security Review → Verification/E2E).
2. **Verify Database Field Names First**: Consult `02-architecture/database-schema-design.md` before writing SQL or Supabase JS calls.
3. **Respect Multi-Tenant Isolation**: Every database query MUST include RLS `organization_id` scoping.
4. **Align UI with User Personas**: Mobile screens must accommodate Don Roberto (48px+ tap targets, big monetary totals, 1-tap WhatsApp sharing).
5. **Preserve Coverage**: Every code modification MUST include corresponding Vitest unit tests in `tests/unit/` — importing the `.ts` source, never a hand-maintained copy of it — to maintain the **85% coverage gate**.
6. **Never Simulate a Third Party Silently**: If an integration cannot be completed, it MUST fail loudly — return an error, refuse in production, and label any placeholder record as such in the database. **Never write a success state the external service has not confirmed.** A stub that fabricates an ID, a URL, or a status is the defect that produced the CFDI compliance issue in #3.
7. **Report Status Honestly**: Mark a feature complete only when its outbound call has executed against the real service at least once. Tests passing against a mocked `fetch` mean the code is correct, not that the integration works — say which one you verified. When updating a status doc, state what you actually ran.
