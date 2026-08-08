# CLAUDE.md — Agent Operating Guide

This file is the **single operating authority** for AI agents working in this repo. Where it
conflicts with any other document, this file and the code win. Launch/completion **status** claims
live in one place only: [`docs/STATUS.md`](docs/STATUS.md) — read it before trusting any
"completed" claim anywhere in the doc set.

**The doc contract (enforced, not advisory).** `docs/STATUS.md` owns status: what is done, what is
blocked, priority (P0/P1/P2), the launch gate, test counts and coverage. Every other document owns
*mechanism* — how a thing works, what the env vars are, what the schema is — and must not assert
state. Any doc that mentions status carries `<!-- STATUS-AUTHORITY: docs/STATUS.md -->` and points
there. `tests/unit/docsStatusAuthority.test.ts` fails the build if that slips. Superseded status
dashboards live in `docs/99-archive/` and are never to be updated. Do not restate a test count or a
coverage figure outside `docs/STATUS.md` — those numbers have been wrong here five separate times.

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
- **A fresh clone has no `node_modules` — run `npm ci` first.** Without it `npm run typecheck` emits
  ~200 `TS2307: Cannot find module 'vitest'` / `'@testing-library/react'` errors that read exactly
  like your change broke the build. Nothing in the error text says "install your dependencies."
- **`npm run test:coverage` currently fails on `main`** — the 85/85/80/80 thresholds are aspirational
  and CI does not run them ([#51](https://github.com/jesushzv/business-helper/issues/51));
  `docs/STATUS.md` carries the live figures. So judge your change on the **delta**, not the absolute:
  measure on a stashed tree (`git stash -u`) and again with your work, and say which way it moved.
  Do not "fix" a red coverage run you did not cause, and do not report the gate as passing.
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
   **Corollary for the UI: never send a user to fix something they lack the write for.** Check who
   the write is scoped to before designing the prompt — `PATCH /api/organization` is scoped by
   `owner_id`, so a redirect that bounced every member to `/onboarding` would have trapped managers
   and members in a form that 404s. That single fact decided the whole design of #64. A prompt aimed
   at the wrong role is worse than no prompt: it reads as a bug in the product.
   `/api/organization` GET returns `role` alongside the organization for exactly this.
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

**One token, two public pages.** `/q/[token]` (signing) and `/pay/[token]` (payment) both resolve
`quotes.public_token` — the payment route looks the quote up and walks to its contract and
milestones. So a `/pay/` link is **never** built from a milestone or contract id, and a builder that
does produces a 404 in front of a paying client (#72 was that bug). Build both links through
`lib/url.ts` — `getQuotePublicUrl()` and `getPaymentPublicUrl()` are the only two builders — never
from a literal origin: the hardcoded-domain defect has now shipped four times (#36, #47, and #73's
pair, plus a third builder #73 did not list). `tests/unit/url.test.ts` fails the build if any
`lib/*.ts` module regains a literal app origin.

**`milestones` has no `public_token` column.** The token reaches a milestone through
`contract.quote_id → quotes.public_token`, so any query behind a share action must embed it —
and that embed **needs an FK hint**, `quotes!quote_id(...)`: `quotes` and `contracts` are joined by
*two* foreign keys (`contracts.quote_id` and `quotes.converted_contract_id`), which makes an
unhinted embed ambiguous. A share action whose row has no token must offer **no link at all**; the
placeholder tokens (`'demo'`, `'demo_token'`) that used to fill that gap rendered as live links to
`/pay/demo`.

## Docs router

| Need | Read |
|:---|:---|
| Is X actually done? Launch status, P0 stack, launch gate | `docs/STATUS.md` ★ **the only status authority** |
| Schema/column names before SQL | `docs/02-architecture/database-schema-design.md` |
| CFDI / invoicing / PAC | `docs/02-architecture/cfdi_integration_architecture.md` |
| System architecture, API patterns | `docs/02-architecture/app-architecture-plan.md` |
| Personas, brand, copy tone | `docs/01-strategy/user-personas.md`, `brand_guidelines_spec.md` |
| Deploy, secrets, env vars | `docs/deployment.md`, `.env.example` (heavily annotated — read it) |
| Security posture and history | `docs/security-p0-remediation.md` |
| Sprint/workback execution templates | `MASTER_PROMPT.md` (subordinate to this file) |
| Full doc index | `docs/AGENTS-DOCS-GUIDE.md` |
| Superseded dashboards (read-only history) | `docs/99-archive/` — never update these |

## Known gotchas

- The lint gate is nominal (see Commands) — tracked as
  [#46](https://github.com/jesushzv/business-helper/issues/46), where the full warning inventory
  lives: **22 warnings across 7 files** (14 × `no-img-element`, 8 × `no-unused-vars`, half of them
  in `app/page.tsx`) — re-measured 2026-08-07 against `a029809`; `docs/STATUS.md` is the authority
  if the two ever disagree. Clear them all before flipping the script to `--max-warnings=0`, or CI
  turns red on every PR. Cautionary note: this count has now been wrong **three** times (recorded
  as 1, then 3, then 23) — the first two from a truncated tail, the third from not re-measuring
  after a PR removed an unused import. **Count the whole output, and count it again yourself
  rather than quoting this line**: `npm run lint 2>&1 | grep -c "Warning:"`.
- CI has been **silently absent** on a draft PR for ten hours while Vercel showed green (#38).
  After opening a PR, verify the `CI` check actually ran; absence looks identical to passing.
- E2E exists but is not in CI; never cite Playwright results you didn't run.
- Docs drift is a known failure mode here (the roadmap once claimed 100% complete while core
  integrations were simulated). Where a doc contradicts the code, the code wins — fix the doc in
  the same PR when cheap.
- **Demo-mode detection differs by side.** Collection GET routes answer the demo deployment with
  200 + empty lists, so a client hook can NOT use `503 BACKEND_NOT_CONFIGURED` to decide when demo
  fixtures are legitimate — that code only appears on authenticated/mutating paths. Hooks must gate
  on the build-time signal instead — `isClientDemoMode()` in `lib/clientDemoMode.ts` (moved out of
  `lib/hooks/useQuotes.ts` in #64 once it had three callers; still re-exported there). Getting this
  wrong either blanks the marketing demo or shows fixtures to real tenants.
  **In Vitest this signal defaults to *on***: `NEXT_PUBLIC_SUPABASE_URL` is unset, so any code path
  behind it is skipped and a test meant to exercise the real-tenant branch silently asserts nothing.
  Stub it — `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co')` — and use
  `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')` for the demo case.
- **Optimistic-fallback hooks are this repo's most repeated defect** (#33 receivables, #50 quote
  creation, #58 the public signing page, #59 still open). When touching `lib/hooks/*` or a public
  page: every mutation applies the server row on success and throws/surfaces on failure; demo
  fixtures only behind `isClientDemoMode()`. Pin it with an `*Honesty.test.ts` suite —
  `tests/unit/useReceivablesHonesty.test.ts` is the template.
- **A hook that gates a warning or a disabled control needs three states, not two.** `true` /
  `false` / **`null` = unknown** (still loading, or the read failed). Collapsing unknown into
  `false` invents a fact — it warns a healthy tenant, or blocks an action, on the strength of a
  network blip; collapsing it into `true` re-opens whatever hole the gate was closing. Never let
  the client be the only enforcement: gate on the server too, then the permissive choice for
  unknown is safe. `lib/hooks/useSettlementAccount.ts` is the reference (#64).

## GitHub conventions

- Branch → PR → CI → merge. Conventional commits (`feat(...)`, `fix(...)`, `docs(...)`).
- Follow-ups discovered mid-task are filed as GitHub issues with `file:line` references, repro
  steps, and a fix sketch — see #36/#39/#40 for the house style. The tracker is the journal;
  write issues so a future session needs no other context.
- **`Closes #N` claims the issue's *exit criteria* are met — not that you wrote the code.** When
  those criteria name a deployed behaviour (a real OAuth round-trip, a live PAC stamp, a code on a
  real handset), the issue stays open after merge: write `Refs #N` instead and say in the PR what
  remains and who can do it. #48 was nearly auto-closed by a PR that could not satisfy it. This is
  hard rule #2 applied to the tracker.
- **Before a PR closes an issue, re-read that issue's body for residue.** Issues here routinely
  park deferred work under "also worth fixing while in there" or "worth deciding alongside", and
  that context dies the moment the issue closes. File each leftover as its own issue and link it
  from the PR *before* merging — #60 and #61 were rescued out of #39 and #50 this way. Where the
  leftover is a judgment call rather than a defect (loosening an abuse control, changing a
  lifecycle), file it as a decision with options rather than fixing it in passing.
- **Closing an issue only partially? Comment to re-scope it.** An issue whose body describes three
  broken call sites, two now fixed, sends the next session to redo the fixed half. Say what landed,
  in which PR, and what is left.
