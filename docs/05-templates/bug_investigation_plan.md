# Bug Investigation & Fix Plan: [Bug Title]

> **Engineering Bug Triage & Root Cause Analysis Template**
>
> Standard operating procedure for investigating, diagnosing, fixing, and verifying complex runtime errors or logic bugs in the **Business Helper** codebase.

---

## 01 Bug Summary

### Overview
* **Issue**: [Brief 1-2 sentence description of the broken behavior]
* **Severity**: `Critical` | `High` | `Medium` | `Low`
* **Affected Area**: Quotes / Receivables / RLS Policies / Auth / Invoicing / Mobile UI
* **First Observed**: [Date / Commit SHA]
* **Sentry / Log Link**: `[Link to Sentry or Vercel log trace]`

### Business Impact
* [Describe impact: e.g., "Users unable to convert quotes to contracts on mobile, blocking revenue collection."]

---

## 02 Reproduction Steps

1. Navigate to `[URL / Route]`
2. Log in as user with role `[Owner / Member]`
3. Perform action: `[Click / Input]`
4. Observe broken behavior: `[Description]`

### Environment Conditions
* **Browser/Device**: iOS Safari 17 / Android Chrome / Desktop Chrome
* **Data State**: Client with existing contract in status `client_signed`
* **Frequency**: `100% Reproducible` | `Intermittent`

---

## 03 Root Cause Analysis

### Investigation Trail
1. Checked `[Hypothesis A]` → Ruled out because `[Evidence]`
2. Checked `[Hypothesis B]` → Identified failure in file `[path/to/file.ts:line]`

### Root Cause
* **File**: `lib/[storageSupabase.ts / rfcValidator.ts / storageClient.ts]`
* **Code Path**: `[Trace function call sequence]`
* **Failure Logic**: `[Explain exact logic error, missing null check, or race condition]`

---

## 04 Proposed Fix & Verification

### Recommended Logic Change
* **Files to Modify**: `[file1.ts]`, `[file2.tsx]`
* **Fix Description**: `[Describe precise code change]`
* **Side-Effect Verification**: `[Verify RLS policies and multi-tenant scoping remain intact]`

### Automated Test Plan
- [ ] Add regression unit test in `scripts/test-runner.js` verifying the fix.
- [ ] Run Playwright E2E suite (`npm run test:e2e`) to ensure zero regressions.
- [ ] Verify ESLint and TypeScript compile with `--max-warnings=0`.
