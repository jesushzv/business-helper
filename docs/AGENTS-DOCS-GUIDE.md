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
│   ├── product-roadmap.md               # Sprints 1-10 execution schedule & gates
│   ├── landing-page-brief.md            # Landing page brief for AI design tools
│   ├── product_spec_for_ai_agents.md    # Agent-executable problem & bet spec
│   └── feature_implementation_spec.md   # Single-session feature spec format
│
├── 04-execution-testing/                # Launch & Quality Assurance
│   ├── ecc-execution-playbook.md        # ECC Agent 4-phase sprint execution playbook
│   ├── product_launch_checklist.md      # T-4 weeks to Launch Day checklist
│   ├── product_readiness_snapshot.md    # Executive snapshot & pre-launch execution plan
│   ├── product_readiness_workback.md    # Post-expert-review workback schedule & gate framework (NEW)
│   ├── product_expert_review_aug2026.md # Independent product expert review archive (NEW)
│   ├── usability_test_plan.md           # Task testing with Don Roberto & Mariana
│   └── refactoring_plan.md              # Engineering refactoring blueprint
│
└── 05-templates/                        # Working Engineering Templates
    └── bug-investigation-plan.md        # Bug triage & root cause analysis template
```

---

## 🧭 Agent Navigation Decision Matrix: Which Doc to Read First?

| Task / Persona Goal | Primary Document to Read | Secondary Support |
|:---|:---|:---|
| **Executing a sprint task or building a feature with ECC** | [`ecc-execution-playbook.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/ecc-execution-playbook.md) | [`feature_implementation_spec.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/03-product-specs/feature_implementation_spec.md) |
| **Architecting a new feature or database table** | [`database-schema-design.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/02-architecture/database-schema-design.md) | [`app-architecture-plan.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/02-architecture/app-architecture-plan.md) |
| **Implementing a single feature or UI component** | [`feature_implementation_spec.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/03-product-specs/feature_implementation_spec.md) | [`user-personas.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/01-strategy/user-personas.md) |
| **Checking sprint schedule or launch gates** | [`product-roadmap.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/03-product-specs/product-roadmap.md) | [`product_readiness_snapshot.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/product_readiness_snapshot.md) |
| **Fixing a production bug or regression** | [`bug-investigation-plan.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/05-templates/bug-investigation-plan.md) | [`technical_design_document.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/02-architecture/technical_design_document.md) |
| **Building marketing landing pages or ads** | [`landing-page-brief.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/03-product-specs/landing-page-brief.md) | [`go-to-market-plan.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/01-strategy/go-to-market-plan.md) |
| **Preparing for Beta launch or deployment** | [`product_launch_checklist.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/product_launch_checklist.md) | [`product_readiness_snapshot.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/product_readiness_snapshot.md) |
| **Working on CFDI / invoicing / PAC integration** | [`cfdi_integration_architecture.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/02-architecture/cfdi_integration_architecture.md) | [`PRD-business-helper.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/01-strategy/PRD-business-helper.md) (Module 5) |
| **Responding to product expert reviews** | [`product_expert_review_aug2026.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/product_expert_review_aug2026.md) | [`product_readiness_workback.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/product_readiness_workback.md) |
| **Tracking workback progress or gate status** | [`product_readiness_workback.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/product_readiness_workback.md) | [`product_launch_checklist.md`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/04-execution-testing/product_launch_checklist.md) |

---

## ⚡ Mandatory Operating Rules for AI Agents

1. **Follow the 4-Phase ECC Loop**: Execute via `ecc-execution-playbook.md` (Planning → TDD → Execution/Security Review → Verification/E2E).
2. **Verify Database Field Names First**: Consult `02-architecture/database-schema-design.md` before writing SQL or Supabase JS calls.
3. **Respect Multi-Tenant Isolation**: Every database query MUST include RLS `organization_id` scoping.
4. **Align UI with User Personas**: Mobile screens must accommodate Don Roberto (48px+ tap targets, big monetary totals, 1-tap WhatsApp sharing).
5. **Preserve Coverage**: Every code modification MUST include corresponding unit tests in `scripts/test-runner.js` to maintain the **85% coverage gate**.
