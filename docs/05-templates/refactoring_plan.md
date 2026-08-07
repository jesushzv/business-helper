# Refactoring Plan: [Refactor Target]

> **Pragmatic Engineering Refactoring Blueprint**
>
> A timeboxed, step-by-step engineering plan for refactoring legacy code patterns, improving performance, or migrating architecture in **Business Helper** without breaking live production features.

---

## 01 Current State & Quantified Pain

### Problem Description
* **Target Area**: `[e.g., Migrating single-user freelancer_id logic to multi-tenant organization_id scoping in storageClient.ts]`
* **Specific Issue**: Three different helper modules use direct `freelancerId` params, requiring duplication when supporting multi-user organization accounts.
* **Quantified Pain**: 14 duplicate database queries; 4 regression incidents during Sprint 5; developer confusion on auth scoping.

---

## 02 Target State & Completion Criteria

### Objective Completion Checklist
- [ ] All database queries in `lib/storageSupabase.ts` scope explicitly to `organization_id`.
- [ ] Zero instances of legacy `freelancer_id` params remain in active API handlers.
- [ ] Multi-tenant RLS policies verified across all 9 PostgreSQL tables.
- [ ] Test suite coverage maintained above **85%**.

---

## 03 Migration Strategy & Incremental Steps

### Migration Strategy: Strangler-Fig Pattern
1. **Step 1 (New Helper)**: Implement `auth.user_organization_ids()` RLS function in Postgres.
2. **Step 2 (Coexistence)**: Add optional `organization_id` column to `contracts` and `milestones`.
3. **Step 3 (Backfill)**: Run SQL migration script to populate `organization_id` for existing records.
4. **Step 4 (Enforce)**: Make `organization_id` `NOT NULL` and update client storage dispatchers.
5. **Step 5 (Cleanup)**: Deprecate legacy `freelancer_id` parameters and dead code paths.
