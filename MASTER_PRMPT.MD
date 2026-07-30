Please execute Sprint [N] of @[docs/03-product-specs/product-roadmap.md] following the guidelines in @[docs/AGENTS-DOCS-GUIDE.md] and @[docs/04-execution-testing/ecc-execution-playbook.md].

### Mandatory Execution Protocol:

1. **Phase 1: Planning & Spec**:
   - Inspect `docs/02-architecture/database-schema-design.md`, `docs/02-architecture/app-architecture-plan.md`, and `docs/01-strategy/user-personas.md`.
   - Update `docs/03-product-specs/feature_implementation_spec.md` for Sprint [N] with P0 acceptance criteria, mobile UX rules (>= 48px tap targets, 1-tap WhatsApp links for Don Roberto), exact files to create/modify, and data flow patterns.
   - Present an implementation plan for user review.

2. **Phase 2: Test-Driven Development (TDD)**:
   - Add new unit test suites to `scripts/test-runner.js` targeting core logic, validators, transformers, or state dispatchers.
   - Verify tests fail (Red) prior to feature code implementation.

3. **Phase 3: Implementation & Security**:
   - Build UI components, custom hooks, and server routes scoped to `organization_id` multi-tenancy.
   - Strictly adhere to SAT/Mexican tax compliance rules and Supabase RLS security policies.

4. **Phase 4: Verification & Quality Gates**:
   - Run `npm run typecheck` and `npm test` ensuring 100% passing tests and 0 warnings.
   - Mark Sprint [N] completed in `docs/03-product-specs/product-roadmap.md`.
   - Commit changes to git with conventional commit message `feat(sprint-[N]): complete Sprint [N] deliverables`.
