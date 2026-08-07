# CLAUDE.md — Agent Operating Guide

This file is the **single operating authority** for AI agents working in this repo. Where it
conflicts with any other document, this file and the code win. Launch/completion **status** claims
live in one place only: [`docs/04-execution-testing/launch_readiness_memo_aug2026.md`](docs/04-execution-testing/launch_readiness_memo_aug2026.md)
— read it before trusting any "completed" claim anywhere in the doc set.

## What this project is

**Business Helper** ([businesshelper.app](https://businesshelper.app)) is a mobile-first B2B SaaS
for Mexican SMBs: an integrated **Quote → Contract (OTP e-signature) → Pay (SPEI) → Confirm**
cash-flow loop, with SAT CFDI 4.0 electronic invoicing. All user-facing copy is Mexican Spanish.
This is a solo-founder project; agents author most PRs, and the issue tracker doubles as the
engineering journal.

## Stack (verified against `package.json` — some docs still say "Next.js 16"; 15 is what's pinned)

- **Next.js 15** (App Router, RSC), React 19, Tailwind CSS v4, TypeScript strict
- **Supabase**: Postgres 16 + RLS, Auth (HTTP-only cookies), Storage
- **Third-party integrations are raw REST — there are no provider SDKs installed:**
  - Stripe → `lib/stripeClient.ts`, `lib/stripeWebhook.ts`
  - Facturapi PAC (CFDI) → `lib/pacClient.ts`, `lib/facturapi.ts`
  - Twilio / Meta WhatsApp → `lib/otpDelivery.ts`, `lib/whatsappOutbound.ts`
  - Gemini → `lib/whatsappAI.ts` (the NL query parser is rules-based, `engine: 'rules'`)
- **Error monitoring is NOT live.** `lib/sentry.ts` is a console shim; nothing transmits anywhere.

## Commands

| Command | What it does |
|:---|:---|
| `npm run dev` | Dev server (turbo) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ⚠️ Bare `next lint` — **exits 0 even with warnings. Read the output**; the `--max-warnings=0` gate is not wired in |
| `npx vitest run` | Unit + component tests only |
| `npm test` | ⚠️ Not just tests: `lint && typecheck && vitest run` — a "test" failure may be a lint failure |
| `npm run test:coverage` | Coverage gate: 85% lines/statements, 80% functions/branches |
| `npm run test:e2e` | Playwright (not run in CI — treat e2e claims as unverified) |
| `npm run db:migrate` / `db:migrate:dry` | Apply `supabase/migrations/` — **migrations are manual, never automatic** |
| `npm run verify:webhook` | Stripe webhook signature verification check |

- **Node 22 required** for the test suite (jsdom 30 / undici 8; on Node 20 the suite reports "no tests" instead of failing).
- Quality gate before any commit: `npm run typecheck && npm run lint && npx vitest run` (and `npm run build` for structural changes — Vitest strips TS annotations, so only `tsc`/`build` catch interface mismatches).

## Architecture map

- `app/` — routes: `(auth)`, `(dashboard)`, `api/*`, `q/[token]` (public quote signing), `pay/`, `invitacion/`, `onboarding/`, `pricing/`, `demo/`
- `lib/` — one module per domain concern (quote calculator, tax calculator, OTP, PAC client, RBAC…). `lib/hooks/` = client data hooks. `lib/supabase/` = client factories (`client`, `server`, `service`, `middleware`)
- `supabase/migrations/` — timestamped SQL, idempotent by convention (`IF NOT EXISTS` / `DROP … IF EXISTS`)
- `tests/unit/`, `tests/components/` (Vitest, jsdom), `tests/e2e/` (Playwright)
- `types/` — shared TS types incl. `database.ts`

### API route conventions (follow these exactly)

1. Call `requireOrgAccess()` from `lib/apiAuth.ts` and return its response verbatim on failure.
2. Error shape is always `{ error: { code, message } }` with a Spanish `message`.
3. **Scope every query by the returned `organizationId` explicitly.** RLS is a backstop, not the
   only control — by-id routes need the filter so they 404 instead of revealing a row exists.
4. Gate privileged writes with `hasCapability(role, …)` from `lib/teamRBAC.ts` (see issue #32 for
   what happens when a route skips this).
5. Distinguish the two failure worlds: Supabase unconfigured → demo deployment, 503
   `BACKEND_NOT_CONFIGURED`; configured but no session → 401. Never demo data for an
   unauthenticated caller.
6. Never hardcode a domain or origin — use `getAppBaseUrl()` / `getAssetUrl()` from `lib/url.ts`.
   The domain is `businesshelper.app`; `.mx` was never registered (issue #36 is the cautionary tale).

## Hard rules — every change, any size

1. **Never simulate a third party silently.** If an integration can't complete, fail loudly:
   return an error, refuse in production, label placeholder records as such. Never write a success
   state (ID, URL, status) the external service has not confirmed. A stub that fabricates a stamp
   is the defect class that produced the CFDI compliance incident (memo §01) and the
   `useReceivables` bug (#33).
2. **Report status honestly.** A feature is "done" only when its outbound call has executed against
   the real service at least once. Tests passing against a mocked `fetch` prove the code is
   correct, not that the integration works — always say which one you verified.
3. **Fail closed on missing credentials.** Unset provider env vars → explicit 502/503, never a
   fabricated success (see `lib/otpDelivery.ts` for the reference posture).
4. **Multi-tenant isolation**: every DB query scoped by `organization_id`.
5. **Production-first architecture**: build for Vercel + Supabase Cloud + live APIs, not
   local-only/mock-only setups, unless explicitly told otherwise.
6. **Migration ordering**: Vercel auto-deploys `main` and migrations are applied by hand, so the
   deploy can outrun the schema. A PR carrying a migration must have it applied **before or with**
   the merge (`npm run db:migrate:dry` first). CI posts a reminder; treat it as a requirement.
7. **Tests import the `.ts` sources** — never hand-maintained `.js` mirrors (retired in PR #21).
   Every code change ships with corresponding Vitest coverage; keep the 85% gate.
8. **Mexican Spanish, plain language** in all user-facing copy — benefit claims
   ("Evidencia Legal Certificada"), never developer jargon (RLS, sha256, multitenant).

## Process — proportional to risk

- **Full ECC 4-phase loop** (`docs/04-execution-testing/ecc-execution-playbook.md`: plan → TDD red
  → implement + security review → verify + doc sync) for: new features, schema/migration changes,
  and anything touching money, fiscal documents, auth, or OTP. Before writing SQL or Supabase
  calls, verify field names against `docs/02-architecture/database-schema-design.md`.

  > **Most `@agent` names in the playbook are not executable — the loop itself is.**
  > `ecc-execution-playbook.md` §03 and `MASTER_PROMPT.md` §06 reference nine agents from the
  > third-party "Everything Claude Code" suite, which was never installed. Two of those roles are
  > now defined for real in `.claude/agents/` (2026-08-07) — chosen because they cover the two
  > defect classes this repo has actually produced (#35 unverified migrations; the CFDI simulation
  > incident and #33). The rest map to built-ins or to doing the step directly:
  >
  > | Playbook name | What actually exists |
  > |:---|:---|
  > | `@database-reviewer` | ✅ **`database-reviewer` subagent** (`.claude/agents/database-reviewer.md`) — run it on any diff touching migrations, RLS, or query patterns |
  > | *(no ECC name)* | ✅ **`money-path-reviewer` subagent** (`.claude/agents/money-path-reviewer.md`) — run it on any diff touching payments, CFDI, Stripe, folios, receivables |
  > | `@planner`, `@architect` | the `Plan` subagent |
  > | `@security-reviewer` | the `/security-review` skill |
  > | `@code-reviewer` | the `/code-review` skill |
  > | `@tdd-guide`, `@build-error-resolver`, `@e2e-runner` | no equivalent — perform the step directly |
- **Light path** for small fixes, copy, and docs: make the change, add/update a test, run the
  quality gate. No spec-doc ceremony required.
- The hard rules above and the quality gate are non-negotiable at every size.
- When you finish work that changes what is true about the product, update the launch memo — not
  the roadmap dashboards — and state what you actually ran.

## UX constraints (summary — full detail in `MASTER_PROMPT.md` §03 and `docs/01-strategy/user-personas.md`)

- **Don Roberto (primary, mobile-only)**: ≥48px touch targets (`min-h-[48px]`), ≥16px font on
  inputs (prevents iOS zoom), design 375px-first, large bold MXN totals, pre-filled `wa.me/` links
  on client-facing actions, ≤3 taps per core action.
- **Lic. Mariana (secondary, desktop admin)**: full-width 1440px dashboards, CSV/ZIP accountant
  exports, RBAC, audit trail.
- Brand: dark slate `#090D16` base, emerald/indigo accents (`docs/01-strategy/brand_guidelines_spec.md`).

## Mexican tax domain in 30 seconds

IVA 16%; ISR withholding and IVA retention for personas físicas; CFDI 4.0 stamped through a PAC
(Facturapi) — platform key or tenant-connected key sealed with `PAC_ENCRYPTION_KEY`; folio ledger
on `organizations` with a 402 `FOLIOS_EXHAUSTED` when spent; **PUE** (paid on issue) vs **PPD**
(payment in installments — requires a *complemento de pago* filed per payment, `lib/complementoPago.ts`);
payments arrive by SPEI transfer to the org's CLABE. Deep dive:
`docs/02-architecture/cfdi_integration_architecture.md`.

## Docs router

| Need | Read |
|:---|:---|
| Is X actually done? Launch status | `docs/04-execution-testing/launch_readiness_memo_aug2026.md` ★ |
| Schema/column names before SQL | `docs/02-architecture/database-schema-design.md` |
| CFDI / invoicing / PAC | `docs/02-architecture/cfdi_integration_architecture.md` |
| System architecture, API patterns | `docs/02-architecture/app-architecture-plan.md` |
| Personas, brand, copy tone | `docs/01-strategy/user-personas.md`, `brand_guidelines_spec.md` |
| Deploy, secrets, env vars | `docs/deployment.md`, `.env.example` (heavily annotated — read it) |
| Security posture and history | `docs/security-p0-remediation.md` |
| Sprint/workback execution templates | `MASTER_PROMPT.md` (subordinate to this file) |
| Full doc index | `docs/AGENTS-DOCS-GUIDE.md` |

## Known gotchas

- The lint gate is nominal (see Commands) — tracked as
  [#46](https://github.com/jesushzv/business-helper/issues/46), where the full warning inventory
  lives: **23 warnings across 8 files** (14 × `no-img-element`, 9 × `no-unused-vars`, half of them
  in `app/page.tsx`). Clear them all before flipping the script to `--max-warnings=0`, or CI turns
  red on every PR. Cautionary note: this count was wrong twice (recorded as 1, then 3) because both
  readings came from a truncated tail of the output — **when counting lint warnings, read the whole
  output**, `npm run lint 2>&1 | grep -c "Warning:"`.
- CI has been **silently absent** on a draft PR for ten hours while Vercel showed green (#38).
  After opening a PR, verify the `CI` check actually ran; absence looks identical to passing.
- E2E exists but is not in CI; never cite Playwright results you didn't run.
- Docs drift is a known failure mode here (the roadmap once claimed 100% complete while core
  integrations were simulated). Where a doc contradicts the code, the code wins — fix the doc in
  the same PR when cheap.
- **Demo-mode detection differs by side.** Collection GET routes answer the demo deployment with
  200 + empty lists, so a client hook can NOT use `503 BACKEND_NOT_CONFIGURED` to decide when demo
  fixtures are legitimate — that code only appears on authenticated/mutating paths. Hooks must gate
  on the build-time signal instead (`isClientDemoMode()` in `lib/hooks/useQuotes.ts` is the
  reference). Getting this wrong either blanks the marketing demo or shows fixtures to real tenants.
- **Optimistic-fallback hooks are this repo's most repeated defect** (#33 receivables, #50 quote
  creation, #58 the public signing page, #59 still open). When touching `lib/hooks/*` or a public
  page: every mutation applies the server row on success and throws/surfaces on failure; demo
  fixtures only behind `isClientDemoMode()`. Pin it with an `*Honesty.test.ts` suite —
  `tests/unit/useReceivablesHonesty.test.ts` is the template.

## GitHub conventions

- Branch → PR → CI → merge. Conventional commits (`feat(...)`, `fix(...)`, `docs(...)`).
- Follow-ups discovered mid-task are filed as GitHub issues with `file:line` references, repro
  steps, and a fix sketch — see #36/#39/#40 for the house style. The tracker is the journal;
  write issues so a future session needs no other context.
