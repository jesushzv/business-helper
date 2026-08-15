# CLAUDE.md — Agent Operating Guide

This file is the **single operating authority** for AI agents working in this repo. Where it
conflicts with any other document, this file and the code win.

**The doc contract (enforced, not advisory).** [`docs/STATUS.md`](docs/STATUS.md) is the *only*
document allowed to assert status — done, blocked, priority, the launch gate, test counts,
coverage. Read it before trusting any "completed" claim. Every other document owns *mechanism* and
must not assert state; any that mentions status carries
`<!-- STATUS-AUTHORITY: docs/STATUS.md -->` and points there.
`tests/unit/docsStatusAuthority.test.ts` fails the build if that slips, and enforces the size
budget below: a rule backed by a **scanning gate** states the rule and names the test, nothing more.
Never restate a test count or coverage figure outside `docs/STATUS.md` — those numbers have been
wrong five separate times. Superseded dashboards live in `docs/99-archive/`.

**This authority is two files.** [`docs/LESSONS.md`](docs/LESSONS.md) carries the catalogue of
defect classes this repo actually produces — the concrete forms of hard rule #1, the client/server
and migration traps, the tooling traps. It is imported below and read every session; **if your
harness did not inline it, open it now, before your first edit.** New lessons go *there*, never
here: this file's zero headroom is what made three concurrent PRs conflict on paragraphs none of
them meant to change, and made the cheap resolution silently drop a lesson (#135).

@docs/LESSONS.md

## What this project is

**Business Helper** ([businesshelper.app](https://businesshelper.app)) is a mobile-first B2B SaaS
for Mexican SMBs: an integrated **Quote → Contract (OTP e-signature) → Pay (SPEI) → Confirm**
cash-flow loop, with SAT CFDI 4.0 invoicing. All user-facing copy is Mexican Spanish. Solo-founder
project; agents author most PRs and the issue tracker doubles as the engineering journal.

## Stack (some docs still say "Next.js 16"; `package.json` pins 15)

- **Next.js 15** (App Router, RSC), React 19, Tailwind CSS v4, TypeScript strict
- **Supabase**: Postgres 16 + RLS, Auth (HTTP-only cookies), Storage
- **Third-party integrations are raw REST — Sentry is the only provider SDK installed:**
  - Stripe → `lib/stripeClient.ts`, `lib/stripeWebhook.ts`
  - Facturapi PAC (CFDI) → `lib/pacClient.ts`, `lib/facturapi.ts`
  - Resend (email OTP, launch channel) → `lib/otpDelivery.ts`; Twilio / Meta WhatsApp (OTP deprecated) → `lib/otpDelivery.ts`, `lib/whatsappOutbound.ts`
  - Gemini → `lib/geminiClient.ts` (prose only — `lib/aiAssistant.ts` rules compute every
    figure; answers label their `engine`)
- **Error monitoring runs on `@sentry/nextjs`** (the exception above): three root configs nothing
  imports, gated by `tests/unit/sentryRuntimeConfigs.test.ts`. Scrub in `beforeSend`
  (`lib/sentryScrub.ts`) — at a call site it covers only what someone routed through it.

## Commands

| Command | What it does |
|:---|:---|
| `npm run dev` | Dev server (turbo) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint --max-warnings=0` — any warning fails CI (`<img>`, unused vars) |
| `npx vitest run` | Unit + component tests only |
| `npm test` | ⚠️ `lint && typecheck && vitest run` — a "test" failure may be a lint failure |
| `npm run test:coverage` | The coverage gate; thresholds live in `vitest.config.ts` (#51) |
| `npm run test:e2e` | Playwright (not in CI — treat e2e claims as unverified) |
| `npm run db:migrate` / `:dry` | Apply `supabase/migrations/` — **manual, never automatic** |
| `npm run verify:otp` / `:stripe` / `:webhook` | Preflights calling the **real** provider — what satisfies hard rule #2. `:stripe` is read-only, safe against live; **`:webhook` sends real events — never at production.** Run the one matching your diff, say so |

- **Node 22 required** for the tests (Node 20 reports "no tests", not a failure).
- **A fresh clone has no `node_modules` — run `npm ci` first.** Without it `npm run typecheck` emits
  ~200 `TS2307: Cannot find module 'vitest'` errors that read like your change broke the build.
- **CI runs the coverage gate** (`vitest run --coverage`) against `vitest.config.ts`'s thresholds —
  a ratchet, never lowered to pass a red run (#51). Judge your change on the **delta** — but
  `git stash -u` covers only *uncommitted* work; once committed it measures the branch against
  itself. Baseline with `git worktree add /tmp/base origin/main` plus a `node_modules` symlink, and
  say which way it moved. Don't "fix" a red run you didn't cause.
- Quality gate before any commit: `npm run typecheck && npm run lint && npx vitest run` (plus
  `npm run build` for structural changes — Vitest strips TS annotations, so only `tsc`/`build`
  catch interface mismatches).

## Architecture map

- `app/` — routes: `(auth)`, `(dashboard)`, `api/*`, `q/[token]` (public quote signing), `pay/`, `invitacion/`, `onboarding/`, `pricing/`, `demo/`
- `lib/` — one module per domain concern (quote/tax calculators, OTP, PAC client, RBAC…). `lib/hooks/` = client data hooks. `lib/supabase/` = factories (`client`, `server`, `service`, `middleware`)
- `supabase/migrations/` — timestamped SQL, idempotent by convention (`IF NOT EXISTS` / `DROP … IF EXISTS`)
- `tests/unit/`, `tests/components/` (Vitest, jsdom), `tests/e2e/` (Playwright)
- `types/` — shared TS types incl. `database.ts`

### API route conventions (follow these exactly)

1. Call `requireOrgAccess()` from `lib/apiAuth.ts`; return its response verbatim on failure.
2. Error shape is always `{ error: { code, message } }` with a Spanish `message`.
3. **Scope every query by the returned `organizationId`.** RLS is a backstop, not the only
   control — by-id routes need the filter to 404 instead of revealing a row exists.
4. Gate privileged writes with `hasCapability(role, …)` from `lib/teamRBAC.ts` (#32 is what happens
   when a route skips it).
   **Corollary for the UI: never send a user to fix something they lack the write for.** Check who
   the write is scoped to *before* designing the prompt — `PATCH /api/organization` is scoped by
   `owner_id`, so a redirect sending every member to `/onboarding` traps them in a form that 404s
   (that fact decided #64's design). `/api/organization` GET returns `role` for exactly this.
5. Two failure worlds: Supabase unconfigured → demo deployment, 503 `BACKEND_NOT_CONFIGURED`;
   configured but no session → 401. Never demo data for an unauthenticated caller.
6. Never hardcode a domain or origin — use `getAppBaseUrl()` / `getAssetUrl()` from `lib/url.ts`.
   The domain is `businesshelper.app`; `.mx` was never registered (#36).
7. **Public routes** (`/api/quotes/public/*`, `/api/receivables/public/*`) build every error through
   `publicApiError()` — Spanish message safe to render verbatim, machine state in `code`, extras
   (`retry_after_seconds`, …) via its `extra` arg (#65). Consumers read `error.message` and branch on
   `error.code`. `tests/unit/publicErrorEnvelope.test.ts` fails the build on a bare-string body, a
   sibling `code`, or an English message.

## Hard rules — every change, any size

1. **Never simulate a third party silently.** If an integration can't complete, fail loudly: return
   an error, refuse in production, label placeholders as such. Never write a success state (ID, URL,
   status) the external service has not confirmed. The repo's dominant defect class — see
   **Fabricated success** in `docs/LESSONS.md` for the forms it keeps taking.
2. **Report status honestly.** A feature is "done" only once its outbound call has executed against
   the real service. A mocked `fetch` proves the code is correct, not that the integration works —
   always say which you verified.
3. **Fail closed on missing credentials.** Unset provider env vars → explicit 502/503, never a
   fabricated success (`lib/otpDelivery.ts` is the reference posture).
4. **Multi-tenant isolation**: every DB query scoped by `organization_id`.
5. **Production-first architecture**: build for Vercel + Supabase Cloud + live APIs, not
   local-only/mock-only setups, unless told otherwise.
6. **Migration ordering**: Vercel auto-deploys `main` and migrations are applied by hand, so the
   deploy can outrun the schema. A PR carrying one must have it applied **before or with** the merge
   (`npm run db:migrate:dry` first). CI's reminder is a requirement, not a note.
7. **Tests import the `.ts` sources** — never hand-maintained `.js` mirrors (retired in PR #21).
   Every code change ships with corresponding Vitest coverage; keep the gate green.
   **Before fixing a bug, grep the suite for the defect's shape — the test that should have caught
   it may be pinning it.** Three have: #72/#74 (a `/pay/` link built from a *milestone id*; a guard
   through a parameter the route could never set) and #95 (`toBe('inicial')`, pinning the fallback
   showing unpaid tenants a $299 plan). A green suite around a live defect means a test holds it in
   place, and that test is part of the fix.
   **An assertion of absence must be shown to fail.** "No literal origins", "no placeholder tokens"
   — one silently matching nothing is indistinguishable from one that passes. Plant a violation,
   watch it go red, remove it, then commit. **A plant that stays green indicts the test**: some
   layer laundered the difference (an assertion differing only in whitespace passed with the fix
   reverted — jsdom trims `<input type="url">`). A scan reading a **hand-maintained fixture** rather than
   the source it guards cannot catch the drift it names: derive the set from the file, and assert
   the parse matched a plausible count.
8. **Mexican Spanish, plain language** in user-facing copy — benefit claims
   ("Evidencia Legal Certificada"), never developer jargon (RLS, sha256, multitenant).

## Process — proportional to risk

- **Full ECC 4-phase loop** (`docs/04-execution-testing/ecc-execution-playbook.md`: plan → TDD red
  → implement + security review → verify + doc sync) for new features, schema/migration changes,
  and anything touching money, fiscal documents, auth, or OTP. Verify field names against the live
  catalog before writing SQL — `database-schema-design.md` has been wrong about columns (#96).
- **The `@agent` names in that playbook are not executable — the loop is.** The nine come from the
  third-party "Everything Claude Code" suite, never installed. Only two are real, in
  `.claude/agents/`, covering the defect classes this repo produces, and both earn their keep:
  - ✅ **`database-reviewer`** — any diff touching migrations, RLS, or query patterns.
  - ✅ **`money-path-reviewer`** — any diff touching payments, CFDI, Stripe, folios, receivables.
  - `@planner`/`@architect` → the `Plan` subagent; `@security-reviewer` → `/security-review`;
    `@code-reviewer` → `/code-review`; the rest → perform the step directly.
- **Light path** for small fixes, copy and docs: change, test, quality gate. No spec-doc ceremony.
- The hard rules and the quality gate are non-negotiable at every size.
- When your work changes what is true about the product, update `docs/STATUS.md` — not the roadmap
  dashboards — and state what you actually ran.

## UX constraints (full detail in `MASTER_PROMPT.md` §03 and `docs/01-strategy/user-personas.md`)

- **Don Roberto (primary, mobile-only)**: ≥48px touch targets (`min-h-[48px]`), ≥16px font on
  inputs (prevents iOS zoom), 375px-first, large bold MXN totals, pre-filled `wa.me/` links on
  client-facing actions, ≤3 taps per action.
- **Lic. Mariana (secondary, desktop admin)**: 1440px dashboards, CSV/ZIP exports, RBAC, audit.
- Brand: dark slate `#090D16` base, emerald/indigo accents (`docs/01-strategy/brand_guidelines_spec.md`).

## Mexican tax domain in 30 seconds

IVA 16%; ISR withholding and IVA retention for personas físicas; CFDI 4.0 stamped through a PAC
(Facturapi) — the tenant's **own** key only (BYOK, `docs/STATUS.md` §05; the platform never stamps
on its own key), sealed with `PAC_ENCRYPTION_KEY`; **PUE** (paid on issue) vs **PPD**
(installments — a *complemento de pago* per payment, `lib/complementoPago.ts`); payments arrive by
SPEI to the org's CLABE. Deep dive: `docs/02-architecture/cfdi_integration_architecture.md`.

**One token, two public pages.** `/q/[token]` (signing) and `/pay/[token]` (payment) both resolve
`quotes.public_token` — the payment route looks the quote up and walks to its contract and
milestones. So a `/pay/` link is **never** built from a milestone or contract id (#72 was that bug,
a 404 in front of a paying client). `getQuotePublicUrl()` / `getPaymentPublicUrl()` in `lib/url.ts`
are the only builders — never a literal origin (shipped four times: #36, #47, #73's pair plus one).
`tests/unit/url.test.ts` fails the build on a literal app origin in `lib/*.ts`.

**`milestones` has no `public_token` column** — reach one via `contract.quote_id →
quotes.public_token`, and that embed **needs the FK hint** `quotes!quote_id(...)`: two FKs join
`quotes`/`contracts`, so an unhinted embed gets `300 PGRST201` live (#79).
`tests/unit/postgrestEmbedHints.test.ts` scans every `.select()` and fails the build on one.
A share action whose row has no token offers **no link at all**.

## Docs router

| Need | Read |
|:---|:---|
| Is X done? Launch status, P0 stack, launch gate | `docs/STATUS.md` ★ **the only status authority** |
| Defect classes: what has gone wrong here and how | `docs/LESSONS.md` ★ **part of this authority** |
| Schema/column names before SQL | `docs/02-architecture/database-schema-design.md` |
| CFDI / invoicing / PAC | `docs/02-architecture/cfdi_integration_architecture.md` |
| System architecture, API patterns | `docs/02-architecture/app-architecture-plan.md` |
| Personas, brand, copy tone | `docs/01-strategy/user-personas.md`, `brand_guidelines_spec.md` |
| Deploy, secrets, env vars | `docs/deployment.md`, `.env.example` (annotated) |
| Security posture and history | `docs/security-p0-remediation.md` |
| Sprint/workback templates | `MASTER_PROMPT.md` (subordinate to this file) |
| Doc index | `docs/AGENTS-DOCS-GUIDE.md` |
| Superseded dashboards (read-only) | `docs/99-archive/` — never update these |

## GitHub conventions

- Branch → PR → CI → merge. Conventional commits (`feat(...)`, `fix(...)`, `docs(...)`).
- Follow-ups found mid-task are filed as issues with `file:line`, repro steps and a fix sketch
  (#36/#39/#40 are the house style). The tracker is the journal: write so a future session needs no
  other context.
- **An issue's enumeration is a starting point, not an inventory — re-run the search that produced
  it.** #73 listed two hardcoded-origin builders; there were three. Lists go stale the moment a PR
  moves code, and a fix scoped to the list leaves the rest *looking* closed. Re-derive the set with
  a grep you can paste into the PR, and if your count differs, **say so**. Same for any tally in a
  doc: count the output yourself.
- **`Closes #N` claims the *exit criteria* are met — not that you wrote the code.** Where those
  criteria name a deployed behaviour (a live PAC stamp, a code on a handset), the issue stays open
  after merge: write `Refs #N` and say what remains and who can do it (#48 was nearly auto-closed
  this way). Hard rule #2, applied to the tracker.
- **Before a PR closes an issue, re-read its body for residue.** Deferred work parked under "also
  worth fixing while in there" dies when the issue closes. File each leftover separately and link it
  *before* merging (#60/#61 were rescued from #39/#50 this way). Where the leftover is a judgment
  call rather than a defect, file it as a **decision with options**, not a fix in passing.
- **Closing an issue only partially? Comment to re-scope it** — what landed, in which PR, what is
  left; otherwise the next session redoes the fixed half.
