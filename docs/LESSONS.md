# LESSONS.md — the defect-class catalogue

**Part of the operating authority.** [`CLAUDE.md`](../CLAUDE.md) is the authority for *rules*;
this file is the authority for *the defects this repo actually produces*. Both are read at the
start of every session — if your harness did not inline this file, open it before your first edit.
Where this file and the code disagree, the code wins: fix this file in the same PR.

**Why it is a separate file.** `CLAUDE.md` had ~30 bytes of headroom, so every session that learned
something compressed unrelated prose to pay for it — and the cheap resolution of the resulting
conflicts drops one side's lesson under a green build (#135, in Tooling below). The churn is
concentrated here, with its own budget.

**How to add one.** New lessons go in this file, not `CLAUDE.md`; append to the section that fits
rather than re-flowing its neighbours, so conflicts stay append-vs-append. A lesson backed by a
**scanning gate** (a test that fails on the next occurrence anywhere in the tree) states the rule
and names the test, nothing more — the test does the convincing. A lesson with only a regression
test, or none, keeps its full narrative, because there the prose is the only thing standing between
an agent and the defect. Cite the issue number: it is the lesson's identity.

**How it is protected.** `tests/unit/lessonsCatalogue.test.ts` inventories every issue number cited
below and fails the build when one disappears, turning a lossy merge resolution into a red build.
Retiring one is deliberate: delete it, remove its numbers from `LESSON_REFS`, record why in
`RETIRED`. `tests/unit/docsStatusAuthority.test.ts` holds the size budget; when it trips, retire
lessons a scanning gate now covers or move settled history to `docs/99-archive/`.

## Fabricated success — hard rule #1's recurring disguises

Every item below is the same defect: showing a user a success, a value, or a link the system has
not earned. It has shipped here at least eight times.

- **Hooks and mutations** (#33, #50, #59): every mutation applies the **server row** on success and
  throws/surfaces on failure — never an optimistic local object. Demo fixtures only
  behind `isClientDemoMode()`. Pin with an `*Honesty.test.ts`; `useReceivablesHonesty.test.ts` is
  the template. **Fixing the hook does not fix the form above it** (#95): `useState(prop)` that
  never re-syncs keeps the typed text after the server row lands, and the server normalizes
  (`'81 1234 5678'` stores as `'8112345678'`) — a banner beside a value the DB does not hold.
  Re-sync on the prop (`OrgProfileCard`).
- **Public pages may simulate a mutation only behind `isClientDemoMode()`, short-circuited *before*
  the fetch — never as a `catch` fallback** (#58, #86). A catch-fallback turns a real tenant's
  network failure into a fake confirmation: `/pay/[token]` told a payer "Comprobante enviado
  correctamente" for a declaration the API had rejected.
- **Placeholder identifiers are the same rule in a UI costume** (#44, #78, #96): `token || 'demo'`,
  `regimen_fiscal || '601'` render as a live control or a settled fact. Absent is absent — render
  the **disabled** control and **name the record** to fix; a missing CLABE reported as missing phone
  sends the tenant to the wrong form.
- **A verification script's exit code is a claim.** `verify:webhook` printed "All 4 checks passed"
  for a run that skipped the two protecting money — and those four passed against an endpoint with
  *no* secret, which rejects everything (#63; #118 is `verify:otp`'s). An incomplete run exits
  non-zero naming what it skipped, no opt-out; negative checks carry a positive control.
- **An all-optional interface cannot tell a mapping is missing** (#78). `MilestoneWithClient`
  declared every field optional, so assigning raw API rows into it was no type error, only the demo
  fixtures ever populated them, and real tenants got `undefined` throughout. Two habits close it: a
  flattening is a **named exported function with its own test** (`toMilestoneWithClient`), and where
  fixtures and server rows share a type, assert against a **server-shaped** row.

## Client/server state

- **Demo-mode detection differs by side.** Collection GET routes answer the demo deployment with
  200 + empty lists, so a client hook can NOT use `503 BACKEND_NOT_CONFIGURED` to decide when demo
  fixtures are legitimate — that code appears only on authenticated/mutating paths. Hooks gate on
  the build-time signal: `isClientDemoMode()` in `lib/clientDemoMode.ts`. Wrong either way: a blank
  marketing demo, or fixtures for real tenants.
  **In Vitest this signal defaults to *on*** — `NEXT_PUBLIC_SUPABASE_URL` is unset, so any path
  behind it is skipped and a test meant to exercise the real-tenant branch silently asserts nothing.
  Stub it: `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co')`, and
  `vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')` for the demo case.
- **A hook gating a warning or a disabled control needs three states**: `true` /
  `false` / **`null` = unknown** (still loading, or the read failed). Collapsing unknown into `false`
  invents a fact — warning a healthy tenant on a network blip; into `true` re-opens the hole the
  gate closed. Never let the client be the only enforcement: gate on the server too, and the
  permissive choice for unknown becomes safe. `lib/hooks/useSettlementAccount.ts` is the reference
  (#64). **Any figure derived from a fetched list needs the same treatment** — the client detail
  page rendered "Crédito Utilizado $0 / Disponible $50,000" from a failed read (#96).

## Database and migrations

- **`REVOKE … FROM PUBLIC` does not lock down a `SECURITY DEFINER` function** (#76 — unlimited
  folio minting). Supabase grants `EXECUTE` to `anon`/`authenticated` as *named roles*, so
  PostgREST keeps serving `/rest/v1/rpc/<name>` outside RLS. Always
  `REVOKE EXECUTE ON FUNCTION public.f(<sig>) FROM anon, authenticated;`.
  `tests/unit/securityDefinerGrants.test.ts` is the gate and holds the one exemption; it reads
  migration *files*, so live grants still need #76's `aclexplode` query.
- **Never edit a migration after it has been applied anywhere.** `ADD COLUMN IF NOT EXISTS` is
  idempotent but not convergent, and `db:migrate` skips files the ledger lists — an edited file
  leaves repo and production silently disagreeing. Reconcile the live DB explicitly (an `ALTER`
  through the connector, read back) or add a new migration, saying which in the PR. New money
  columns are `numeric(12,2)`; new CHECKs take the `chk_` prefix.
- **A column the code reads is not a column that exists.** `types/database.ts` declared three
  `clients.credit_*` columns that four modules used and no migration created, so `Number(x) || 0`
  rendered "$0 límite, Activo" for every client in production (#96). Types are a claim;
  `supabase/migrations/` and the live catalog are evidence.
  A doc specifying a column *with a default* is the same trap. **So is a TS union narrower than the
  column's CHECK**: `subscription_status` kept three values after a migration widened it to seven,
  so `unpaid`/`incomplete` read as **Activo** (#95). Check `pg_get_constraintdef` before narrowing,
  and map an unrecognised value to `null`, never the nearest listed — `'free'` mapped to `'inicial'`
  showed a $299 plan nobody bought and disabled its own subscribe button.
- **When the app and RLS each decide "which tenants may this user act on", they will disagree**
  (#146). `requireOrgAccess()` read `organizations.owner_id`; `user_organization_ids()` — the check
  behind nine policies — read `organization_members`, which has no row for an owner. Auth passed and
  every INSERT came back `42501`. Derive both from the same fact, and prove access by impersonating
  a real `auth.uid()` (`set_config('request.jwt.claims', …)` then INSERT): it must **succeed for the
  caller's org and be refused for another's**. `tests/unit/orgOwnerAccess.test.ts` pins the
  definition; only the catalog proves the deployment.
- **Nullable-with-no-default is a decision.** Where the UI must tell "never set" from "set to zero",
  refuse `DEFAULT 0`/`'active'` — the #64 tri-state rule at the column — and keep such columns
  independent in the form: coupling `credit_status` to `credit_limit` discarded an owner blocking a
  defaulting client.
- **`LIMIT 1` with no `ORDER BY` is a coin flip; on a tenancy lookup it is the worst kind** (#133).
  `requireOrgAccess` chose the caller's organization that way and every route scopes by the id it
  returns, so a user owning two sees another company's data, no error. Order it and select `n+1`:
  the ambiguity must be fetched before it can be logged.
- **A vocabulary the database enforces exists once in code, with `null` for everything else**
  (#116). The Stripe webhook wrote `obj.status` off whatever object the event carried, and
  `checkout.session.completed` carries a **Checkout Session**, whose status field holds
  `'complete'` — which `chk_subscription_status` rejects: the write failed the CHECK *after* the
  event was claimed, and the display read the unknown word as "Cancelado" to a customer who had just
  paid. Export the union and a `normalize*` returning `null`; write only what the event established.
  It survived because the tests fed one object shape — feed the others the event can carry.

## Client and API wiring

- **A client `fetch` calling a method its route does not export fails the build**
  (`tests/unit/clientFetchMethods.test.ts`) — a PUT against a GET/PATCH/POST route made every save a
  405, swallowed by `.catch(() => {})` and reported as success (#95). **The key *names* fail the
  same way**: camelCase destructured off a snake_case body wrote four fields NULL, two of them
  needed to stamp a CFDI (#96). Read bodies through `pickFields(body, <ENTITY>_WRITABLE_FIELDS)`;
  `tests/unit/clientWritePath.test.ts` is the gate. Assert on what reaches the DB layer, never on
  what `fetch` got — a mocked `fetch` cannot see either defect.
- **The demo persona lives behind `isClientDemoMode()` and nowhere else** (#93). Chrome identity
  comes from `useCurrentOrg()`; outbound greetings from `buildClientGreeting()` in
  `lib/whatsappLink.ts`. `tests/unit/demoIdentityLeak.test.ts` fails the build on a leak.
- **A modal is `components/shared/Modal.tsx`** — `tests/unit/modalShell.test.ts` is the gate.
- **A form the user cannot get past is usually validation that returns at the first failure and
  names no field** (#146). Both clients routes checked name → RFC → crédito → teléfono in sequence
  and 400'd at the first, so each submit revealed one more problem; the envelope carried prose with
  no field attached; and the form put it in one banner atop a modal taller than a 375px viewport, so
  tapping *Guardar* at the bottom looked like nothing happened. Validate everything, key each
  message by **column** in `error.fields`, and pin it under its own input with focus moved there — a
  message the tenant must scroll to find is not a message. Corollary: **a validation gate belongs
  where the value is load-bearing.** The RFC gate cost the whole client record for a field only CFDI
  stamping needs, which `lib/facturapi.ts` already refuses loudly on its own.
- **A layer-by-layer suite cannot see a defect between the layers** (#146). Ask the tenant's
  question, not the function's — *can I complete this?* A form component gets a test that fills the
  minimum and submits; `tests/unit/formComponentsAreTested.test.ts` fails the build on a new one.
- **One `catch`-all 500 on a write is a diagnosis you threw away** (#146) — a missing column, a
  CHECK, an RLS denial and an outage, identical on screen *and* in the logs. Map the code to a
  Spanish cause naming the column and `captureException` the original: `lib/dbWriteError.ts` is the
  reference, `tests/unit/writeErrorLegibility.test.ts` the gate.
- **localStorage is demo-sandbox state, never a real tenant's store.** Real tenants read the API
  (an empty list is a real answer), see errors as errors, and their mutations apply the server row
  or throw. Seeding fixtures on a failed fetch is how a new tenant's directory opened with three
  invented companies (#93/#96; same class as #33/#50/#58).
  **The bare `catch` around the fetch is where it hides**: `useReceivables` fell through to fixtures
  on any network error, so one dropped request filled Cobranza with ~$145,000 owed by companies that
  do not exist, `error` left null (#96). Copy `useClients` — `if (!isClientDemoMode()) { …fetch, set
  error, return }` before any localStorage path — and audit all four surfaces: read, write mirror,
  `resetDemo*`, mutations. Writes too: a local "confirmed" keyed off `BACKEND_NOT_CONFIGURED` had a
  misconfigured production reporting payments nobody received.

## Tooling and process traps

- The lint gate is real: `next lint --max-warnings=0`, debt at zero — a bare `<img>` or an unused
  var fails `npm run lint`, `npm test` and CI. Don't widen an existing scoped disable.
- CI has been **silently absent** on a draft PR for ten hours while Vercel showed green (#38), and
  it skips the odd later push. Compare the run's head SHA to the PR's — absence looks identical to
  passing; a merge commit re-triggers it.
- E2E is not in CI: never cite Playwright results you didn't run.
- Docs drift is a known failure mode (the roadmap once claimed 100% while integrations were
  simulated). Where a doc contradicts the code, the code wins — fix it same-PR.
- **In a remote session, local `main` can be stale — cut branches from `origin/main` after an
  explicit `git fetch origin main`.** A fresh container's local `main` once pointed at a commit from
  *before the issue tracker existed*; a branch cut from it silently rebuilds weeks-old code.
- **Commit before planting a violation to verify a red test.** `git checkout <file>` to remove the
  plant restores the *last commit*, wiping every uncommitted change with it. Reverse the exact edit
  instead, or plant only in already-committed files.
- **A session with the Supabase connector can run "needs a deployment" checks itself — don't park
  them on the founder.** Live schema/grants come from `execute_sql` against `pg_catalog` /
  `information_schema`; migrations via `apply_migration` (keeping the ledger); PostgREST from inside
  the database — `CREATE EXTENSION http`, call the project's own `/rest/v1/` with `http_get()` (anon
  key as an `apikey=` param), `DROP EXTENSION` after, since the shell cannot reach `*.supabase.co`.
  Confirm every claim by reading the catalog back, never by exit code, and prove a constraint by
  making it *reject* something. **Run the check especially when it is the only thing left on an
  issue**: #96 was merged and reviewed with just its deployed check outstanding, and running it
  found a table missing three columns the shipped code read. Only the browser session and the real
  credential are out of reach; schema, grants, constraints, PostgREST **and the deployed app
  itself** are not — send an `@supabase/ssr` cookie on `extensions.http(('PATCH','https://…'))`
  (recipe in #129). The shell's `403` on the app domain is not the last word: #95 sat three weeks
  on that. **Nor is GoTrue** — `/auth/v1/settings?apikey=<anon>` returns the `external` provider
  map, `/auth/v1/authorize?provider=…` the user's error, and `auth.identities` who has *ever*
  signed in that way; #48 sat two days on it.
- **A shared always-read document with no headroom manufactures merge conflicts** (#135): two
  sessions compress the same paragraph two ways and the cheap resolution drops one side's lesson
  under a green build. Lessons live here, not in `CLAUDE.md`; append rather than re-flow; and where
  a doc is load-bearing for correctness, give the loss a gate (`lessonsCatalogue.test.ts`).
