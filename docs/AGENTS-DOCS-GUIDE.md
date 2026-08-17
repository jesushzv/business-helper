# Business Helper Documentation & Agent Navigation Guide

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

> [!NOTE]
> **Live status lives in [`docs/STATUS.md`](STATUS.md) — not here.** This is the **map of the doc set**. It describes where things live, never whether they are done.

> **Central Documentation Index**
>
> This guide organizes the complete documentation suite for **Business Helper** into logical subdirectories and establishes exact protocols for when human developers and autonomous AI coding agents (AGY, Claude, Cursor) should read or update each document.
>
> **The agent operating rules live in [`CLAUDE.md`](../CLAUDE.md) at the repository root, together with [`docs/LESSONS.md`](LESSONS.md)** — `CLAUDE.md` is the authority for rules, `LESSONS.md` for the defect classes this repo produces; both are read at the start of every session. (`CLAUDE.md` was consolidated 2026-08-07 from this file's §"Mandatory Operating Rules", `.agents/AGENTS.md`, and parts of `MASTER_PROMPT.md`; the lesson catalogue was split out of it 2026-08-09 — see #135.) This guide remains the doc *index*; `CLAUDE.md` and `LESSONS.md` are the doc *authority*.

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
│   ├── app-architecture-plan.md         # Next.js 15 + Supabase system architecture
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
├── STATUS.md                            # ★★ THE SINGLE SOURCE OF TRUTH for status, priority
│                                        #    and the launch gate. No other doc may assert these.
│                                        #    Enforced by tests/unit/docsStatusAuthority.test.ts
│
├── LESSONS.md                           # ★★ PART OF THE AGENT OPERATING AUTHORITY, with
│                                        #    CLAUDE.md. The defect classes this repo produces.
│                                        #    New lessons go here, not in CLAUDE.md (#135).
│                                        #    Enforced by tests/unit/lessonsCatalogue.test.ts
│
├── 04-execution-testing/                # Launch & Quality Assurance
│   ├── ecc-execution-playbook.md        # ECC Agent 4-phase sprint execution playbook
│   ├── product_launch_checklist.md      # Go-live runbook (steps to perform, not a status record)
│   ├── live-verification-recipes.md     # How to check schema, grants, RLS and the deployed app from a session
│   ├── first-live-stamp-preflight.md    # Order of operations for the first real CFDI stamp, and what to read back
│   ├── ux_ui_audit_synthesis_aug2026.md # Dual UX/UI audit synthesis (WS-* workstreams)
│   └── usability_test_plan.md           # Task testing with Don Roberto & Mariana
│
├── 99-archive/                          # Superseded. Read-only history — never update these.
│   ├── product_readiness_snapshot.md    # Competing status dashboard; claimed 100% while simulated
│   ├── product_readiness_workback.md    # Gate scores predating the simulation findings
│   ├── status-log-2026-08.md            # Narrative moved out of STATUS.md as its budget filled
│   └── product_expert_review_aug2026.md # Point-in-time external review
│
├── 05-templates/                        # Working Engineering Templates
│   ├── bug_investigation_plan.md        # Bug triage & root cause analysis template
│   └── refactoring_plan.md              # Engineering refactoring blueprint template
│
├── deployment.md                        # Production deployment & secrets guide
└── security-p0-remediation.md           # P0 security findings & remediation record
```

> [!IMPORTANT]
> **Read [`docs/STATUS.md`](STATUS.md) before
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
| `MASTER_PROMPT_TEMP.md` | Spent UX/UI remediation prompt. Its tasks (A7–A10, C1, C6–C7, E8–E12, F6–F8) are all ☑ in the workback; 6 of its 8 target component files no longer exist; it asserted "Gate 1 RE-OPENED / FAILED" against the workback's "Gate 1 PASSED"; and **Mode D already lives verbatim in `MASTER_PROMPT.md`** |
| `04-execution-testing/sprint-execution-master-prompt.md` | Restated Modes A/B/C, which `MASTER_PROMPT.md` already carries verbatim. A second copy of an authoritative source is a drift vector, which is what happened to `MASTER_PROMPT_TEMP.md` |

> [!NOTE]
> **The rule applied: redundancy and spentness are grounds for deletion; inaccuracy is grounds for correction.**
> Wrong-but-load-bearing documents (`product_readiness_snapshot.md`, `product_launch_checklist.md`,
> `product-roadmap.md`, `MASTER_PROMPT.md`) were fixed in place rather than removed — deleting them would
> erase the record of what was believed and when, and leave whoever relied on them with nothing to replace it.

---

## 🧭 Agent Navigation Decision Matrix: Which Doc to Read First?

| Task / Persona Goal | Primary Document to Read | Secondary Support |
|:---|:---|:---|
| **★ Asking "is this ready to launch?" or "what is actually done?"** | [`docs/STATUS.md`](../docs/STATUS.md) | [`security-p0-remediation.md`](../docs/security-p0-remediation.md) |
| **★ Writing any code — what has already gone wrong here** | [`docs/LESSONS.md`](../docs/LESSONS.md) | [`CLAUDE.md`](../CLAUDE.md) |
| **Executing a sprint task or building a feature with ECC** | [`ecc-execution-playbook.md`](../docs/04-execution-testing/ecc-execution-playbook.md) | [`feature_implementation_spec.md`](../docs/03-product-specs/feature_implementation_spec.md) |
| **Verifying a claim against the live system ("needs a deployment")** | [`live-verification-recipes.md`](../docs/04-execution-testing/live-verification-recipes.md) | [`docs/LESSONS.md`](../docs/LESSONS.md) |
| **Issuing the first real CFDI against a tenant's own live PAC** | [`first-live-stamp-preflight.md`](../docs/04-execution-testing/first-live-stamp-preflight.md) | [`cfdi_integration_architecture.md`](../docs/02-architecture/cfdi_integration_architecture.md) |
| **Architecting a new feature or database table** | [`database-schema-design.md`](../docs/02-architecture/database-schema-design.md) | [`app-architecture-plan.md`](../docs/02-architecture/app-architecture-plan.md) |
| **Implementing a single feature or UI component** | [`feature_implementation_spec.md`](../docs/03-product-specs/feature_implementation_spec.md) | [`user-personas.md`](../docs/01-strategy/user-personas.md) |
| **Checking sprint schedule or launch gates** | [`product-roadmap.md`](../docs/03-product-specs/product-roadmap.md) | [`docs/STATUS.md`](../docs/STATUS.md) |
| **Fixing a production bug or regression** | [`bug_investigation_plan.md`](../docs/05-templates/bug_investigation_plan.md) | [`technical_design_document.md`](../docs/02-architecture/technical_design_document.md) |
| **Refactoring existing code** | [`refactoring_plan.md`](../docs/05-templates/refactoring_plan.md) | [`app-architecture-plan.md`](../docs/02-architecture/app-architecture-plan.md) |
| **Building marketing landing pages or ads** | [`landing-page-brief.md`](../docs/03-product-specs/landing-page-brief.md) | [`go-to-market-plan.md`](../docs/01-strategy/go-to-market-plan.md) |
| **Preparing for Beta launch or deployment** | [`product_launch_checklist.md`](../docs/04-execution-testing/product_launch_checklist.md) | [`docs/STATUS.md`](../docs/STATUS.md) |
| **Finding what a module does or where its code lives** | [`app-architecture-plan.md`](02-architecture/app-architecture-plan.md) | `CLAUDE.md`'s architecture map; the archived snapshot is history only |
| **Working on CFDI / invoicing / PAC integration** | [`cfdi_integration_architecture.md`](../docs/02-architecture/cfdi_integration_architecture.md) | [`PRD-business-helper.md`](../docs/01-strategy/PRD-business-helper.md) (Module 5) |
| **Responding to product expert reviews** | [`docs/STATUS.md`](STATUS.md) — the live priority stack | The archived review and workback are readable as history, never as the current plan |
| **Tracking progress or gate status** | [`docs/STATUS.md`](STATUS.md) — the only status authority | [`product_launch_checklist.md`](04-execution-testing/product_launch_checklist.md) as a go-live runbook |

---

## ⚡ Mandatory Operating Rules for AI Agents

**Moved to [`CLAUDE.md`](../CLAUDE.md) §"Hard rules" and §"Process"** on 2026-08-07, so the rules
have exactly one home. The consolidation preserved all seven rules that lived here (ECC loop,
schema-first, multi-tenant isolation, persona alignment, coverage, never-simulate, honest status
reporting) and added the operational knowledge from the 2026-08 launch reconciliation.
