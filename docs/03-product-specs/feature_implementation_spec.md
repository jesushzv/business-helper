# Feature Implementation Spec: Sprint 1 — Architecture & Repo Setup

> **Single-Session AI & Engineering Implementation Spec**
>
> A focused specification for executing Sprint 1 of **Business Helper** following the **Everything Claude Code (ECC) 4-Phase Execution Playbook**.

---

## 01 Feature Summary

* **Feature Name**: Sprint 1 — Architecture, Multi-Tenant Database Schema & Repo Setup
* **Target Module**: Infrastructure, Supabase Migrations, Data Layer (`/supabase`, `/lib`, `/types`, `/scripts`)
* **Primary User**: System / Developer / All Roles (Foundation for SMB Owners and Clients)
* **Goal**: Establish the Next.js 16 + React 19 + TypeScript codebase structure, complete 100% of the PostgreSQL relational database schema with Supabase migrations, implement multi-tenant Row-Level Security (RLS) policies scoped by `organization_id`, and establish test runner & quality gates (`npm run typecheck`, `npm run lint`, `npm run test`).

### Scope Boundaries
* **In Scope**:
  * Project configuration (`package.json`, `tsconfig.json`, Next.js 16 config, Tailwind CSS v4, ESLint).
  * Supabase Client & Server helper module setup (`lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`).
  * TypeScript type definitions (`types/database.ts`, `types/index.ts`) for all 8 core entities (`organizations`, `organization_members`, `clients`, `products`, `quotes`, `contracts`, `milestones`, `csd_credentials`, `audit_logs`).
  * Supabase SQL Schema Migrations (`supabase/migrations/20260803000000_initial_schema.sql`):
    * `organizations`, `organization_members`, `clients`, `products`, `quotes`, `contracts`, `milestones`, `csd_credentials`, `audit_logs`.
    * PostgreSQL Functions: `auth.user_organization_ids()`, `update_updated_at_column()`.
    * Constraints: Check constraints (`chk_milestone_amount_positive`, `chk_client_health_score_range`, `chk_otp_attempts_limit`, `chk_quote_currency`, `chk_contract_currency`, `chk_subscription_tier`).
    * Indexes: `idx_org_members_lookup`, `idx_milestones_due_status`, `idx_clients_org_rfc`, `idx_quotes_org_status_date`, `idx_contracts_hash`, `idx_clients_name_trgm`.
    * RLS Policies: Multi-tenant `organization_id` isolation for authenticated users + public token read policy for quotes (`quotes_public_token_key`).
  * TDD Unit Test Suite in `scripts/test-runner.js` testing schema validity, RLS helpers, tax calculation helpers (IVA 16%, ISR withholding, IVA withholding), and RFC check-digit logic.
  * Quality gate integration (`npm run typecheck`, `npm run lint`, `npm run test`).
* **Out of Scope**:
  * Client UI pages (Sprint 2+).
  * Third-party live external API keys for Stripe/Facturapi (configured via env variables, mockable in unit tests).

---

## 02 Acceptance Criteria (P0 / P1 / P2)

### Must-Have (P0)
- [ ] **AC 1.1**: Repository contains complete Next.js 16 + TypeScript project scaffold with `package.json`, `tsconfig.json`, and dependency definitions.
- [ ] **AC 1.2**: Supabase SQL migration script `20260803000000_initial_schema.sql` creates all 8 core tables with exact column types, primary keys, foreign key cascading rules, check constraints, and performance indexes.
- [ ] **AC 1.3**: PostgreSQL RLS is enabled on all 8 tables with multi-tenant isolation via `organization_id IN (SELECT auth.user_organization_ids())` and public token access policy for quotes.
- [ ] **AC 1.4**: TypeScript type definitions accurately mirror the database schema with zero `any` types.
- [ ] **AC 1.5**: TDD unit test runner (`scripts/test-runner.js`) includes automated tests for tax calculations, Modulo 11 check digits, and multi-tenant RLS logic.
- [ ] **AC 1.6**: Quality gates `npm run typecheck`, `npm run lint`, and `npm run test` pass with 0 errors and 0 warnings.

### Should-Have (P1)
- [ ] **AC 2.1**: Seed script `supabase/seed.sql` provided for local development testing.

---

## 03 Technical Implementation & Files

### Files to Create / Modify
* `package.json` — Workspace manifest, script commands, dependencies
* `tsconfig.json` — Strict TypeScript configuration
* `next.config.ts` — Next.js 16 configuration
* `lib/supabase/client.ts` — Supabase browser client wrapper
* `lib/supabase/server.ts` — Supabase server client wrapper for RSC & API routes
* `lib/supabase/middleware.ts` — Auth session refresh middleware
* `types/database.ts` — Complete Supabase Database TypeScript definitions
* `types/index.ts` — Domain model interfaces (`Organization`, `Client`, `Quote`, `Contract`, `Milestone`, etc.)
* `lib/taxCalculator.ts` — Mexican tax calculation helpers (IVA 16%, ISR withholding 10%, IVA withholding 10.6667%)
* `lib/rfcValidator.ts` — live validation of Mexican RFC syntax & check-digit verification
* `supabase/migrations/20260803000000_initial_schema.sql` — Complete SQL DDL with tables, indexes, constraints, RLS policies, and triggers
* `supabase/seed.sql` — Development seed data
* `scripts/test-runner.js` — Comprehensive test suite for tax calculator, RFC validator, schema mapping, and RLS policies
* `docs/03-product-specs/product-roadmap.md` — Sync Sprint 1 completion status

---

## 04 4-Phase Execution Checklist

- [x] **Phase 1: Planning & Architecture**: Decomposed Sprint 1, read schema & architecture TDD specs, created `feature_implementation_spec.md`.
- [ ] **Phase 2: TDD (Test-Driven Development)**: Create `scripts/test-runner.js` with failing unit tests for tax calculation, RFC verification, and multi-tenant scoping.
- [ ] **Phase 3: Implementation & Review**: Write database migrations, TypeScript types, Supabase client abstractions, tax calculation helpers, and security RLS definitions.
- [ ] **Phase 4: Verification & Quality Gates**: Run `npm run typecheck`, `npm run lint`, and `npm run test`. Update `product-roadmap.md` Sprint 1 status.
