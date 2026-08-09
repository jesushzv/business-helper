# CLAUDE.md — Agent Operating Guide

This file is the **single operating authority** for AI agents working in this repo. Where it
conflicts with any other document, this file and the code win.

**The doc contract (enforced, not advisory).** [`docs/STATUS.md`](docs/STATUS.md) is the *only*
document allowed to assert status — what is done, what is blocked, priority (P0/P1/P2), the launch
gate, test counts, coverage. Read it before trusting any "completed" claim anywhere in the doc set.
Every other document owns *mechanism* — how a thing works, what the env vars are, what the schema
is — and must not assert state; any that mentions status carries
`<!-- STATUS-AUTHORITY: docs/STATUS.md -->` and points there.
`tests/unit/docsStatusAuthority.test.ts` fails the build if that slips. Never restate a test count
or a coverage figure outside `docs/STATUS.md` — those numbers have been wrong here five separate
times. Superseded dashboards live in `docs/99-archive/` and are never updated.

## What this project is

**Business Helper** ([businesshelper.app](https://businesshelper.app)) is a mobile-first B2B SaaS
for Mexican SMBs: an integrated **Quote → Contract (OTP e-signature) → Pay (SPEI) → Confirm**
cash-flow loop, with SAT CFDI 4.0 electronic invoicing. All user-facing copy is Mexican Spanish.
Solo-founder project; agents author most PRs and the issue tracker doubles as the engineering
journal.

## Stack (verified against `package.json` — some docs still say "Next.js 16"; 15 is what's pinned)

- **Next.js 15** (App Router, RSC), React 19, Tailwind CSS v4, TypeScript strict
- **Supabase**: Postgres 16 + RLS, Auth (HTTP-only cookies), Storage
- **Third-party integrations are raw REST — there are no provider SDKs installed:**
  - Stripe → `lib/stripeClient.ts`, `lib/stripeWebhook.ts`
  - Facturapi PAC (CFDI) → `lib/pacClient.ts`, `lib/facturapi.ts`
  - Twilio / Meta WhatsApp → `lib/otpDelivery.ts`, `lib/whatsappOutbound.ts`
  - Gemini → `lib/whatsappAI.ts` (the NL query parser is rules-based, `engine: 'rules'`)
- **Error monitoring is NOT live.** `lib/sentry.ts` is a console shim; nothing transmits.

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

- **Node 22 required** for the test suite (on Node 20 it reports "no tests" instead of failing).
- **A fresh clone has no `node_modules` — run `npm ci` first.** Without it `npm run typecheck` emits
  ~200 `TS2307: Cannot find module 'vitest'` errors that read exactly like your change broke the
  build. Nothing in the text says "install your dependencies."
- **`npm run test:coverage` currently fails on `main`** — the 85/85/80/80 thresholds are aspirational
  and CI does not run them ([#51](https://github.com/jesushzv/business-helper/issues/51));
  `docs/STATUS.md` carries the live figures. Judge your change on the **delta**, not the absolute:
  measure on a stashed tree (`git stash -u`) and again with your work, and say which way it moved.
  Do not "fix" a red coverage run you did not cause, and do not report the gate as passing.
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
   form that 404s (that fact decided #64's design). A prompt aimed at the wrong role reads as a
   product bug. `/api/organization` GET returns `role` for exactly this.
5. Distinguish the two failure worlds: Supabase unconfigured → demo deployment, 503
   `BACKEND_NOT_CONFIGURED`; configured but no session → 401. Never demo data for an
   unauthenticated caller.
6. Never hardcode a domain or origin — use `getAppBaseUrl()` / `getAssetUrl()` from `lib/url.ts`.
   The domain is `businesshelper.app`; `.mx` was never registered (#36 is the cautionary tale).
7. **Public routes** (`/api/quotes/public/*`, `/api/receivables/public/*`) build every error through
   `publicApiError()` from `lib/publicApiError.ts` — same `{ error: { code, message } }` envelope,
   Spanish message safe to render verbatim, machine state in `code`, body siblings
   (`retry_after_seconds`, `attempts`, `remaining`, `expired`) via its `extra` arg. Consumers read
   `error.message` and branch on `error.code`; `data?.error || fallback` renders `[object Object]`.
   Before #65 these three routes had four shapes between them, several in English, shown to the
   tenant's *client* mid-signature. `tests/unit/publicErrorEnvelope.test.ts` fails the build on a
   bare-string body, a sibling `code`, or an English message.

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
   it may be asserting it.** Two did in #72/#74: `whatsappLinks.test.ts` asserted the reminder
   contained `/pay/m42`, the *milestone id*, and passed; `whatsappDispatch.test.ts` asserted a
   sandbox guard through a parameter the route could never set to true. A green suite around a live
   defect means a test is pinning it, and that test is part of the fix.
   **An assertion of absence must be shown to fail.** A test claiming "no literal origins", "no
   fabricated ids", "no placeholder tokens" that silently matches nothing is indistinguishable from
   one that passes. Plant a violation, watch it go red, remove it — then commit. The origin scan in
   `tests/unit/url.test.ts` was confirmed this way and names the offending `file: line`.
   **A plant that stays green indicts the test** — something laundered the difference (an assertion
   differing only in whitespace passed with the fix reverted: jsdom trims `<input type="url">`).
   **A grep this file asks you to remember wants to be a test**: `url`, `postgrestEmbedHints`,
   `securityDefinerGrants`, `demoIdentityLeak`, `placeholderIdentifiers`, `publicErrorEnvelope`,
   `docsStatusAuthority`, `clientFetchMethods`. Catch a scannable defect class, add the scanner.
8. **Mexican Spanish, plain language** in all user-facing copy — benefit claims
   ("Evidencia Legal Certificada"), never developer jargon (RLS, sha256, multitenant).

## Process — proportional to risk

- **Full ECC 4-phase loop** (`docs/04-execution-testing/ecc-execution-playbook.md`: plan → TDD red
  → implement + security review → verify + doc sync) for: new features, schema/migration changes,
  and anything touching money, fiscal documents, auth, or OTP. Before writing SQL or Supabase
  calls, verify field names against `docs/02-architecture/database-schema-design.md`.
- **The `@agent` names in that playbook are not executable — the loop itself is.** The nine come
  from the third-party "Everything Claude Code" suite, never installed. Real, in `.claude/agents/`,
  covering the two defect classes this repo actually produces (#35 unverified migrations; the CFDI
  simulation incident and #33 fabricated state): **`database-reviewer`** on any diff touching
  migrations, RLS or query patterns, **`money-path-reviewer`** on payments, CFDI, Stripe, folios,
  receivables. Otherwise: `@planner`/`@architect` → `Plan`; `@security-reviewer` →
  `/security-review`; `@code-reviewer` → `/code-review`; the rest, do the step directly.
- **Light path** for small fixes, copy and docs: make the change, add/update a test, run the
  quality gate. No spec-doc ceremony.
- The hard rules and the quality gate are non-negotiable at every size.
- When your work changes what is true about the product, update `docs/STATUS.md` — not the roadmap
  dashboards — and state what you actually ran.

## UX constraints (full detail in `MASTER_PROMPT.md` §03 and `docs/01-strategy/user-personas.md`)

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
milestones. So a `/pay/` link is **never** built from a milestone or contract id; a builder that
does produces a 404 in front of a paying client (#72 was that bug). Build both links through
`lib/url.ts` — `getQuotePublicUrl()` and `getPaymentPublicUrl()` are the only two builders — never
from a literal origin: the hardcoded-domain defect has now shipped four times (#36, #47, and #73's
pair, plus a third builder #73 did not list). `tests/unit/url.test.ts` fails the build if any
`lib/*.ts` module regains a literal app origin.

**`milestones` has no `public_token` column.** The token reaches a milestone through
`contract.quote_id → quotes.public_token`, so any query behind a share action must embed it —
and that embed **needs an FK hint**, `quotes!quote_id(...)`: `quotes` and `contracts` are joined by
*two* foreign keys (`contracts.quote_id` and `quotes.converted_contract_id`), which makes an
unhinted embed ambiguous. This is not theoretical: production PostgREST answers the unhinted form
with `300 PGRST201`, which is how **every `/pay/` link 404'd from the day the route shipped**
(#79, confirmed live 2026-08-08). `tests/unit/postgrestEmbedHints.test.ts` scans every
`.select()` in `app/` and `lib/` and fails the build on an unhinted quotes↔contracts embed, in
either direction. A share action whose row has no token must offer **no link at all**; the
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

### Fabricated success — hard rule #1's recurring disguises

Every item below is the same defect: showing a user a success, a value, or a link the system has
not actually earned. It has shipped here at least ten times.

- **Hooks and mutations** (#33, #50, #59): every mutation applies the **server row** on success and
  throws/surfaces on failure — never an optimistic local object left in place. Demo fixtures only
  behind `isClientDemoMode()`. Pin with an `*Honesty.test.ts`; `useReceivablesHonesty` is the
  template.
- **Public pages may simulate a mutation only behind `isClientDemoMode()`, short-circuited *before*
  the fetch — never as a `catch` fallback** (#58, #86). A catch-fallback turns every real tenant's
  network failure into a fake confirmation: `/pay/[token]` told a payer "Comprobante enviado
  correctamente" for a declaration the API had rejected.
- **Placeholder identifiers are the same rule in a UI costume** (#44, #78): `token || 'demo'`,
  `phone || '8115551234'` each render as a live, tappable control. Absent is absent — render the
  **disabled** control and **name the record** the tenant must fix; a missing CLABE reported as a
  missing phone sends them to edit the wrong thing.
- **An all-optional interface cannot tell you a mapping is missing** (#78). Every field of
  `MilestoneWithClient` was optional, so `useReceivables` assigning raw API rows into it was not a
  type error — and only the demo fixtures in the same file ever populated them, so real tenants got
  `undefined` across the board. Two habits: when a hook's shape is flatter than the API's, the
  flattening is a **named exported function with its own test** (`toMilestoneWithClient`); and when
  fixtures and server rows share a type, assert against a **server-shaped** row. Required fields
  beat optional-everything.
- **Fixing the hook does not fix the form above it** (#95's tail). `useState(prop)` that never
  re-syncs keeps the typed text after the hook applied the server row — and the server normalizes
  (`'81 1234 5678'` is stored as `'8112345678'`), so "se guardaron correctamente" sits next to a
  value the database does not hold. Re-sync on the prop; `OrgProfileCard` is the reference.
- **A TS union narrower than the column's CHECK rewrites real states into the nearest one you did
  list.** `subscription_status` kept three values after `20260806120000` widened the constraint to
  seven, so `unpaid`/`incomplete`/`trialing` all read as **Activo**. Check `pg_get_constraintdef`
  before narrowing, and again when a migration widens. Converse: `subscription_tier` defaults to
  `'free'`, which has no plan — mapping it to `'inicial'` billed nobody and disabled that plan's
  own subscribe button. Unrecognised is `null`, never the nearest option.

### Client/server state

- **Demo-mode detection differs by side.** Collection GET routes answer the demo deployment with
  200 + empty lists, so a client hook can NOT use `503 BACKEND_NOT_CONFIGURED` to decide when demo
  fixtures are legitimate — that code appears only on authenticated/mutating paths. Hooks gate on
  the build-time signal instead: `isClientDemoMode()` in `lib/clientDemoMode.ts` (still re-exported
  from `useQuotes.ts`). Wrong either way: a blank marketing demo, or fixtures for real tenants.
  **In Vitest this signal defaults to *on*** — `NEXT_PUBLIC_SUPABASE_URL` is unset, so any path
  behind it is skipped and a test meant to exercise the real-tenant branch silently asserts nothing.
  Stub it: `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co')`, and
  `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')` for the demo case.
- **A hook gating a warning or a disabled control needs three states**: `true` / `false` /
  **`null` = unknown** (loading, or the read failed). Collapsing unknown into `false` invents a fact
  — it warns a healthy tenant on a network blip; into `true` re-opens the hole the gate closed.
  Never let the client be the only enforcement: gate on the server too, and the permissive choice
  for unknown becomes safe. `lib/hooks/useSettlementAccount.ts` is the reference (#64).

### Database and migrations

- **`REVOKE … FROM PUBLIC` does not lock down a `SECURITY DEFINER` function.** Supabase grants
  `EXECUTE` on `public` functions to `anon` and `authenticated` as *named roles*; revoking the
  implicit `PUBLIC` grant leaves those standing and PostgREST serves the function at
  `/rest/v1/rpc/<name>` outside RLS (#76 — unlimited folio minting). Always
  `REVOKE EXECUTE ON FUNCTION public.f(<signature>) FROM anon, authenticated;`.
  `tests/unit/securityDefinerGrants.test.ts` fails the build on a new one without it, and holds the
  single deliberate exemption (`user_organization_ids()` — RLS policies call it as the querying
  role, so revoking it breaks every policy). That test reads migration *files*; the live grants
  still need the `aclexplode` query in #76.

### Tooling and process traps

- The lint gate is real: `next lint --max-warnings=0`, debt cleared to zero. Any new warning fails
  `npm run lint`, and therefore `npm test` and CI. Existing `<img>` sites carry scoped, per-site
  `eslint-disable-next-line` comments with reasons (SVG logos permanent; PNG screenshots until
  [#82](https://github.com/jesushzv/business-helper/issues/82)). Don't add a bare `<img>`; don't
  widen a scoped disable to file level.
- CI was **silently absent** on a draft PR for ten hours while Vercel showed green (#38). After
  opening a PR, verify the `CI` check actually ran; absence looks identical to passing.
- E2E is not in CI; never cite Playwright results you didn't run.
- Docs drift is a known failure mode (the roadmap once claimed 100% complete while core
  integrations were simulated). Where a doc contradicts the code the code wins — fix it same-PR.
- **In a remote session local `main` can be stale — `git fetch origin main` before cutting a
  branch.** A fresh container's `main` once pointed at a commit from *before the issue tracker
  existed*. Check `git log --oneline -1` first.
- **Commit before planting a violation to verify a red test.** `git checkout <file>` to remove the
  plant restores the *last commit*, wiping every uncommitted change to that file. Reverse the exact
  edit instead, or plant only where the real changes are already committed.
- **A session with the Supabase connector can run "needs a deployment" checks itself — don't park
  them on the founder.** Live schema/grants come from `execute_sql` against `pg_catalog` /
  `information_schema`; migrations apply via `apply_migration` (which keeps the ledger); and even
  PostgREST behavior is reachable from inside the database — `CREATE EXTENSION http`, call the
  project's own `/rest/v1/` with `http_get()` (pass the anon key as an `apikey=` query param),
  `DROP EXTENSION` after. The shell cannot reach `*.supabase.co` (network policy), which is why
  the in-database route exists. Confirm every claim by reading the catalog back, not by exit code.
  **It also reaches the deployment**, cookie and all, so most "verify against a real deployment"
  criteria are agent-takeable: ask whether one needs a **human** (handset, card, vendor account,
  eyes on a rendered page) or only **reach** — only the first is founder work, and the shell's `403`
  on `businesshelper.app` is not the last word. Recipe and traps: #129. It cannot see
  client-rendered UI, so say which half you checked. #79 sat "unverifiable" a day and #95 three
  weeks in sessions that had this all along.
- **A client `fetch` whose method the route does not export now fails the build**
  (`clientFetchMethods.test.ts`). `useOrganizationSettings` PUT against a GET/PATCH/POST-only route
  made every save a 405, swallowed and reported as success (#95) — the quietest fabricated-success
  there is, since a mocked `fetch` answers whatever the test says. Still grep first:
  `grep "export async function" app/api/<route>/route.ts`.
- **The demo persona lives behind `isClientDemoMode()` and nowhere else.** "Don Roberto" /
  "Distribuidora del Norte" / RFC `DNO850101…` shipped hardcoded in the header, sidebar, dashboard
  greeting and three client-facing WhatsApp builders (#93). Identity in chrome comes from
  `useCurrentOrg()`; outbound greetings from `buildClientGreeting()` in `lib/whatsappLink.ts`
  (org name as a parameter — never a literal, and omit the signature when unknown).
  `tests/unit/demoIdentityLeak.test.ts` fails the build on a leak and keeps the file allowlist;
  extending the allowlist requires the string to actually sit behind a demo gate.
- **localStorage is demo-sandbox state, never a real tenant's store.** Real tenants read the API
  (an empty list is a real answer), see errors as errors, and their mutations apply the server row
  or throw. Seeding fixtures into localStorage on a failed fetch is how a new tenant's directory
  opened with three invented companies (#93/#96 audit; same class as #33/#50/#58).

## GitHub conventions

- Branch → PR → CI → merge. Conventional commits.
- Follow-ups found mid-task are filed as issues with `file:line`, repro steps and a fix sketch
  (#36/#39/#40 are the house style). The tracker is the journal — write so a future session needs
  no other context.
- **An issue's enumeration is a starting point, not an inventory — re-run the search that produced
  it.** #73 listed two hardcoded-origin builders; there were three. #46's lint count was wrong three
  times; #64's body described two holes and its comment a third. These lists go stale the moment a
  PR moves code, and a fix scoped to the list leaves the rest *looking* closed. Re-derive the set
  with a grep you can paste into the PR, and if your count differs, **say so**. Same for any tally
  quoted in a doc: count the whole output yourself.
- **`Closes #N` claims the issue's *exit criteria* are met — not that you wrote the code.** When
  those criteria name a deployed behaviour (a real OAuth round-trip, a live PAC stamp, a code on a
  real handset), the issue stays open after merge: write `Refs #N` instead and say in the PR what
  remains and who can do it. #48 was nearly auto-closed by a PR that could not satisfy it. This is
  hard rule #2 applied to the tracker.
- **Before a PR closes an issue, re-read its body for residue.** Deferred work parked under "also
  worth fixing while in there" dies with the issue. File each leftover separately and link it from
  the PR *before* merging — #60/#61 were rescued out of #39/#50 this way. Where the leftover is a
  judgment call, not a defect, file it as a decision with options rather than fixing it in passing.
- **Closing an issue only partially? Comment to re-scope it.** A body describing three broken call
  sites, two now fixed, sends the next session to redo the fixed half. Say what landed, in which
  PR, and what is left.
