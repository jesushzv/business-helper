# CLAUDE.md — Agent Operating Guide

This file is the **single operating authority** for AI agents working in this repo. Where it
conflicts with any other document, this file and the code win.

**The doc contract (enforced, not advisory).** [`docs/STATUS.md`](docs/STATUS.md) is the *only*
document allowed to assert status — done, blocked, priority, the launch gate, test counts,
coverage. Read it before trusting any "completed" claim. Every other document owns *mechanism* and
must not assert state; any that mentions status carries
`<!-- STATUS-AUTHORITY: docs/STATUS.md -->` and points there.
`tests/unit/docsStatusAuthority.test.ts` fails the build if that slips — and enforces the size
budget below, whose guidance is: a rule backed by a **scanning gate** states the rule and names the
test, nothing more. Never restate a test count or coverage figure outside `docs/STATUS.md` — those
numbers have been wrong five separate times. Superseded dashboards live in `docs/99-archive/`.

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
| `npm run lint` | `next lint --max-warnings=0` — fails on any warning. New `<img>`/unused-var warnings break CI |
| `npx vitest run` | Unit + component tests only |
| `npm test` | ⚠️ Not just tests: `lint && typecheck && vitest run` — a "test" failure may be a lint failure |
| `npm run test:coverage` | Coverage gate: 85% lines/statements, 80% functions/branches |
| `npm run test:e2e` | Playwright (not run in CI — treat e2e claims as unverified) |
| `npm run db:migrate` / `db:migrate:dry` | Apply `supabase/migrations/` — **migrations are manual, never automatic** |
| `npm run verify:webhook` | Stripe webhook signature verification check |

- **Node 22 required** for the tests (jsdom 30 / undici 8; Node 20 reports "no tests", not a
  failure).
- **A fresh clone has no `node_modules` — run `npm ci` first.** Without it `npm run typecheck` emits
  ~200 `TS2307: Cannot find module 'vitest'` errors that read exactly like your change broke the
  build.
- **`npm run test:coverage` currently fails on `main`** — the 85/85/80/80 thresholds are
  aspirational and CI does not run them (#51); `docs/STATUS.md` carries the live figures. Judge your
  change on the **delta**: measure on a stashed tree (`git stash -u`) and again with your work, and
  say which way it moved. Don't "fix" a red run you didn't cause, or report the gate as passing.
- Quality gate before any commit: `npm run typecheck && npm run lint && npx vitest run` (plus
  `npm run build` for structural changes — Vitest strips TS annotations, so only `tsc`/`build`
  catch interface mismatches).


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
4. Gate privileged writes with `hasCapability(role, …)` from `lib/teamRBAC.ts` (#32 is what happens
   when a route skips this).
   **Corollary for the UI: never send a user to fix something they lack the write for.** Check who
   the write is scoped to *before* designing the prompt — `PATCH /api/organization` is scoped by
   `owner_id`, so a redirect sending every member to `/onboarding` traps managers and members in a
   form that 404s (that fact decided #64's design). `/api/organization` GET returns `role` for
   exactly this.
5. Distinguish the two failure worlds: Supabase unconfigured → demo deployment, 503
   `BACKEND_NOT_CONFIGURED`; configured but no session → 401. Never demo data for an
   unauthenticated caller.
6. Never hardcode a domain or origin — use `getAppBaseUrl()` / `getAssetUrl()` from `lib/url.ts`.
   The domain is `businesshelper.app`; `.mx` was never registered (#36 is the cautionary tale).
7. **Public routes** (`/api/quotes/public/*`, `/api/receivables/public/*`) build every error through
   `publicApiError()` from `lib/publicApiError.ts` — same `{ error: { code, message } }` envelope,
   Spanish message safe to render verbatim, machine state in `code`, body siblings
   (`retry_after_seconds`, `attempts`, `remaining`, `expired`) passed via its `extra` arg.
   Consumers read `error.message` and branch on `error.code`; `data?.error || fallback` renders
   `[object Object]` against the envelope (#65). `tests/unit/publicErrorEnvelope.test.ts` fails the
   build on a bare-string body, a sibling `code`, or an English message.

## Hard rules — every change, any size

1. **Never simulate a third party silently.** If an integration can't complete, fail loudly: return
   an error, refuse in production, label placeholder records as such. Never write a success state
   (ID, URL, status) the external service has not confirmed. This is the repo's dominant defect
   class — see **Fabricated success** under Known gotchas for the forms it keeps taking.
2. **Report status honestly.** A feature is "done" only when its outbound call has executed against
   the real service at least once. Tests passing against a mocked `fetch` prove the code is correct,
   not that the integration works — always say which one you verified.
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
   **Before fixing a bug, grep the suite for the defect's shape — the test that should have caught
   it may be pinning it.** Two did in #72/#74 (one asserted a `/pay/` link built from a *milestone
   id*; one asserted a guard through a parameter the route could never set). A green suite around a
   live defect means a test is holding it in place, and that test is part of the fix.
   **An assertion of absence must be shown to fail.** "No literal origins", "no placeholder tokens"
   — one that silently matches nothing is indistinguishable from one that passes. Plant a violation,
   watch it go red, remove it, then commit. A scan reading a **hand-maintained fixture** rather than
   the source it guards cannot catch the drift it names: derive the set from the file, and assert
   the parse matched a plausible count.
8. **Mexican Spanish, plain language** in all user-facing copy — benefit claims
   ("Evidencia Legal Certificada"), never developer jargon (RLS, sha256, multitenant).

## Process — proportional to risk

- **Full ECC 4-phase loop** (`docs/04-execution-testing/ecc-execution-playbook.md`: plan → TDD red
  → implement + security review → verify + doc sync) for new features, schema/migration changes,
  and anything touching money, fiscal documents, auth, or OTP. Verify field names against the live
  catalog before writing SQL — `database-schema-design.md` has been wrong about columns (#96).
- **The `@agent` names in that playbook are mostly not executable — the loop itself is.** They come
  from the third-party "Everything Claude Code" suite, never installed. Only two are real, in
  `.claude/agents/`, and both earn their keep (on #96 they caught a discarded credit block and a
  $0-utilization-on-failed-read):
  - ✅ **`database-reviewer`** — any diff touching migrations, RLS, or query patterns.
  - ✅ **`money-path-reviewer`** — payments, CFDI, Stripe, folios, receivables.
  - `@planner`/`@architect` → the `Plan` subagent; `@security-reviewer` → `/security-review`;
    `@code-reviewer` → `/code-review`; the rest → perform the step directly.
- **Light path** for small fixes, copy and docs: make the change, add/update a test, run the
  quality gate. No spec-doc ceremony.
- The hard rules above and the quality gate are non-negotiable at every size.
- When you finish work that changes what is true about the product, update the launch memo — not
  the roadmap dashboards — and state what you actually ran.

## UX constraints (full detail in `MASTER_PROMPT.md` §03 and `docs/01-strategy/user-personas.md`)

- **Don Roberto (primary, mobile-only)**: ≥48px touch targets (`min-h-[48px]`), ≥16px font on
  inputs (prevents iOS zoom), 375px-first, large bold MXN totals, pre-filled `wa.me/` links on
  client-facing actions, ≤3 taps per core action.
- **Lic. Mariana (secondary, desktop admin)**: 1440px dashboards, CSV/ZIP accountant exports,
  RBAC, audit trail.
- Brand: dark slate `#090D16` base, emerald/indigo accents (`docs/01-strategy/brand_guidelines_spec.md`).

## Mexican tax domain in 30 seconds

IVA 16%; ISR withholding and IVA retention for personas físicas; CFDI 4.0 stamped through a PAC
(Facturapi) — platform or tenant key sealed with `PAC_ENCRYPTION_KEY`; folio ledger on
`organizations` with a 402 `FOLIOS_EXHAUSTED` when spent; **PUE** (paid on issue) vs **PPD**
(installments — a *complemento de pago* per payment, `lib/complementoPago.ts`); payments arrive by
SPEI to the org's CLABE. Deep dive: `docs/02-architecture/cfdi_integration_architecture.md`.

**One token, two public pages.** `/q/[token]` (signing) and `/pay/[token]` (payment) both resolve
`quotes.public_token` — the payment route looks the quote up and walks to its contract and
milestones. So a `/pay/` link is **never** built from a milestone or contract id (#72 was that bug,
a 404 in front of a paying client). `getQuotePublicUrl()` / `getPaymentPublicUrl()` in `lib/url.ts`
are the only two builders — never a literal origin, a defect that has shipped four times (#36, #47,
#73 ×2). `tests/unit/url.test.ts` fails the build on a literal app origin in any `lib/*.ts`.

**`milestones` has no `public_token` column.** It reaches a milestone via
`contract.quote_id → quotes.public_token`, and that embed **needs the FK hint**
`quotes!quote_id(...)` — two FKs join `quotes` and `contracts`, so an unhinted embed gets
`300 PGRST201` live, which 404'd every `/pay/` link from the day the route shipped (#79).
`tests/unit/postgrestEmbedHints.test.ts` scans every `.select()` and fails the build on one. A
share action whose row has no token offers **no link at all**.

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

### Fabricated success — hard rule #1's recurring disguises

Every item below is the same defect: showing a user a success, a value, or a link the system has
not earned. It has shipped here at least eight times.

- **Hooks and mutations** (#33, #50, #59): every mutation applies the **server row** on success and
  throws/surfaces on failure — never an optimistic local object left in place. Demo fixtures only
  behind `isClientDemoMode()`. Pin with an `*Honesty.test.ts`; `useReceivablesHonesty.test.ts` is
  the template.
- **Public pages may simulate a mutation only behind `isClientDemoMode()`, short-circuited *before*
  the fetch — never as a fallback in a `catch`** (#58, #86). A catch-fallback turns every real
  tenant's network failure into a fake confirmation: `/pay/[token]` showed a payer "Comprobante
  enviado correctamente" for a declaration the API had rejected.
- **Placeholder identifiers are the same rule in a UI costume** (#44, #78, #96): `token || 'demo'`,
  `regimen_fiscal || '601'` render as a live control or a settled fact. Absent is absent — render
  the **disabled** control and **name the record** to fix; a missing CLABE reported as a missing
  phone sends the tenant to edit the wrong thing.
- **An all-optional interface cannot tell you a mapping is missing** (#78). `MilestoneWithClient`
  declared every field optional, so assigning raw API rows into it was not a type error — and only
  the demo fixtures ever populated them, so every real tenant got `undefined` throughout. Two
  habits close it: a flattening is a **named exported function with its own test**
  (`toMilestoneWithClient`); and where fixtures and server rows share a type, assert against a
  **server-shaped** row. Required fields beat optional-everything.

### Client/server state

- **Demo-mode detection differs by side.** Collection GET routes answer the demo deployment with
  200 + empty lists, so a client hook can NOT use `503 BACKEND_NOT_CONFIGURED` to decide when demo
  fixtures are legitimate — that code only appears on authenticated/mutating paths. Hooks gate on
  the build-time signal instead: `isClientDemoMode()` in `lib/clientDemoMode.ts`. Getting this wrong
  either blanks the marketing demo or shows fixtures to real tenants.
  **In Vitest this signal defaults to *on*** — `NEXT_PUBLIC_SUPABASE_URL` is unset, so any path
  behind it is skipped and a test meant to exercise the real-tenant branch silently asserts nothing.
  Stub it: `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co')`, and
  `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')` for the demo case.
- **A hook that gates a warning or a disabled control needs three states, not two**: `true` /
  `false` / **`null` = unknown** (still loading, or the read failed). Collapsing unknown into `false`
  invents a fact — warning a healthy tenant on a network blip; into `true` re-opens the hole the
  gate closed. Never let the client be the only enforcement: gate on the server too, and the
  permissive choice for unknown becomes safe. `lib/hooks/useSettlementAccount.ts` is the reference
  (#64). **Any figure derived from a fetched list needs the same treatment** — the client detail
  page rendered "Crédito Utilizado $0 / Disponible $50,000" from a failed read (#96).

### Database and migrations

- **`REVOKE … FROM PUBLIC` does not lock down a `SECURITY DEFINER` function.** Supabase grants
  `EXECUTE` to `anon` and `authenticated` as *named roles*; revoking the implicit `PUBLIC` grant
  leaves those standing, and PostgREST serves the function at
  `/rest/v1/rpc/<name>` outside RLS (#76 — unlimited folio minting). Always
  `REVOKE EXECUTE ON FUNCTION public.f(<signature>) FROM anon, authenticated;`.
  `tests/unit/securityDefinerGrants.test.ts` fails the build on a new one without it and holds the
  one exemption. It reads migration *files*; live grants still need #76's `aclexplode` query.

### Tooling and process traps

- The lint gate is real: `next lint --max-warnings=0`, debt at zero. Any new warning fails
  `npm run lint`, `npm test` and CI. The 14 `<img>` sites carry scoped per-site disables with
  reasons (SVG logos permanent; PNGs until the `next/image` migration, #82). Don't add a bare
  `<img>`; don't widen a scoped disable to file level.
- CI has been **silently absent** on a draft PR for ten hours while Vercel showed green (#38).
  After opening a PR, verify the `CI` check ran; absence looks identical to passing. Recurred on
  #130; a later push fired it, so push again rather than wait.
- E2E is not in CI; never cite Playwright results you didn't run.
- Docs drift is a known failure mode (the roadmap once claimed 100% complete while core
  integrations were simulated). Where a doc contradicts the code, the code wins — fix it same-PR.
- **In a remote session, local `main` can be stale — cut branches from `origin/main` after an
  explicit `git fetch origin main`.** A fresh container's local `main` once pointed at a commit from
  *before the issue tracker existed*; a branch cut from it silently rebuilds weeks-old code.
- **Commit (or copy to scratch) before planting a violation to verify a red test.** `git checkout
  <file>` to remove the plant restores the *last commit*, wiping every uncommitted change with it.
  Reverse the exact edit instead, or plant only in already-committed files.
- **A session with the Supabase connector can run "needs a deployment" checks itself — don't park
  them on the founder.** Live schema/grants come from `execute_sql` against `pg_catalog` /
  `information_schema`; migrations apply via `apply_migration` (which keeps the ledger); and even
  PostgREST behavior is reachable from inside the database — `CREATE EXTENSION http`, call the
  project's own `/rest/v1/` with `http_get()` (anon key as an `apikey=` param), `DROP EXTENSION`
  after — the shell cannot reach `*.supabase.co`. #79 sat "unverifiable" for a day of sessions that
  had this the whole time. Confirm every claim by reading the catalog back, never by exit code —
  and prove a constraint by making it *reject* something (`DO $$` with
  `EXCEPTION WHEN check_violation`, plus a NULL insert, probes deleted in the same statement).
  **Run the check especially when it is the only thing left on an issue**: #96 was merged and
  reviewed with just its deployed check outstanding, and running it found a table missing three
  columns the shipped code read from. Ask which *layer* a claim lives in before calling it
  founder-blocked — schema, grants, constraints and PostgREST are all reachable here; only the
  browser session and the real credential are not.
  **GoTrue too — "is provider X enabled?" is not a dashboard question.**
  `http_get('<project>/auth/v1/settings?apikey=<anon>')` returns the `external` map;
  `/auth/v1/authorize?provider=…` returns the error the user would hit; `auth.identities` says
  whether anyone has *ever* signed in that way. #48 item 1 sat unanswered two days — the answer
  turned it from founder-blocked into a live UI defect fixed that session, and found #122.
- **Never edit a migration after it has been applied anywhere.** `ADD COLUMN IF NOT EXISTS` is
  idempotent but not convergent, and `db:migrate` skips files the ledger lists — an edited file
  leaves repo and production silently disagreeing. Reconcile the live DB explicitly (an `ALTER`
  through the connector, read back) or add a new migration, and say which in the PR. New money
  columns are `numeric(12,2)`; new CHECKs take the house `chk_` prefix.
- **Before writing a client `fetch`, grep the route file for the export of that HTTP method.**
  `useOrganizationSettings` PUT against a route exporting only GET/PATCH/POST — every save a 405,
  swallowed by `.catch(() => {})`, reported as success (#95). A method mismatch is the quietest
  fabricated-success there is: no test that mocks `fetch` can see it. The same grep takes seconds:
  `grep "export async function" app/api/<route>/route.ts`. **The key *names* fail the same way:**
  both clients routes destructured camelCase off a snake_case body, so four fields — two of them
  required to stamp a CFDI — were written as NULL and reported as saved (#96). Read bodies through
  `pickFields(body, <ENTITY>_WRITABLE_FIELDS)`; `tests/unit/clientWritePath.test.ts` invokes the
  handlers and checks the modal's own keys against the allowlist. It hides wherever no test invokes
  the handler: assert on what reaches the DB layer, not on what `fetch` got.
- **A column the code reads is not a column that exists.** `types/database.ts` declared three
  `clients.credit_*` columns that four modules used and no migration ever created, so every read was
  `undefined` and `Number(x) || 0` / `x || 'active'` rendered "$0 límite, Activo" for every client
  in production (#96). Types are a claim; `supabase/migrations/` and the live catalog are evidence.
  A doc specifying a column *with a default* is the same trap.
- **Nullable-with-no-default is a decision.** Where the UI must tell "never set" from "set to zero",
  refuse `DEFAULT 0`/`'active'` — the #64 tri-state rule at the column — and keep such columns
  independent in the form: coupling `credit_status` to `credit_limit` silently discarded an owner
  blocking a defaulting client.
- **The demo persona lives behind `isClientDemoMode()` and nowhere else** (#93). Identity in chrome
  comes from `useCurrentOrg()`; outbound greetings from `buildClientGreeting()` in
  `lib/whatsappLink.ts` (org name as a parameter, signature omitted when unknown).
  `tests/unit/demoIdentityLeak.test.ts` fails the build on a leak and keeps the allowlist.
- **localStorage is demo-sandbox state, never a real tenant's store.** An empty list is a real
  answer. Seeding fixtures into localStorage on a failed fetch is how a new tenant's directory
  opened with three invented companies (#93/#96 audit; same class as #33/#50/#58).
  **The bare `catch` around the fetch is where it hides**: `useReceivables` fell through to the
  fixtures on any network error, so one dropped request filled Cobranza with ~$145,000 owed by
  companies that do not exist, `error` left null (#96). Copy `useClients` —
  `if (!isClientDemoMode()) { …fetch, set error, return }` before any localStorage path — and audit
  all four surfaces: read, write mirror, `resetDemo*`, mutations. The 503 rule above applies to
  writes too: a local "confirmed" keyed off `BACKEND_NOT_CONFIGURED` meant a misconfigured
  production reported payments nobody had received.

## GitHub conventions

- Branch → PR → CI → merge. Conventional commits (`feat(...)`, `fix(...)`, `docs(...)`).
- Follow-ups found mid-task are filed as issues with `file:line`, repro steps and a fix sketch
  (#36/#39/#40 are the house style). The tracker is the journal: write so a future session needs
  no other context.
- **An issue's enumeration is a starting point, not an inventory — re-run the search that produced
  it.** #73 listed two hardcoded-origin builders; there were three. #46's lint count was wrong three
  times. Lists go stale the moment a PR moves code, and a fix scoped to the list leaves the rest
  *looking* closed. Re-derive the set with a grep you can paste into the PR, and if your count
  differs, **say so**. Same for any tally quoted in a doc: count the output yourself.
- **`Closes #N` claims the *exit criteria* are met — not that you wrote the code.** Where those
  criteria name a deployed behaviour (a live PAC stamp, a code on a real handset), the issue stays
  open after merge: write `Refs #N` and say what remains and who can do it (#48 was nearly
  auto-closed this way). Hard rule #2, applied to the tracker.
- **Before a PR closes an issue, re-read its body for residue.** Issues here park deferred work
  under "also worth fixing while in there", and that context dies when the issue closes. File each
  leftover as its own issue and link it *before* merging (#60/#61 were rescued from #39/#50 this
  way). Where the leftover is a judgment call rather than a defect, file it as a **decision with
  options** rather than fixing it in passing.
- **Closing an issue only partially? Comment to re-scope it** — say what landed, in which PR, and
  what is left, or the next session redoes the fixed half.
