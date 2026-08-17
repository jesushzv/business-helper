<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# Status log — August 2026 (frozen)

> [!IMPORTANT]
> **This file is archived history and is never updated.** It is the chronological working log that
> accumulated inside `docs/STATUS.md` between 2026-08-07 and 2026-08-08, moved here on 2026-08-08 so
> the status authority states *current* state rather than a merge-by-merge narrative.
>
> **Every entry below is a snapshot written at the time.** Several describe their work as "drafted,
> pending merge" — all of those have since merged (see the *Recently landed* table in
> [`../STATUS.md`](../STATUS.md), which records the commit for each). Test counts quoted in these
> entries were correct on the day and are stale now.
>
> **For live status, read [`../STATUS.md`](../STATUS.md).** Nothing here should be treated as current.

The entries are kept because they record *why* each change was made and what was verified against
what — reasoning that the current-state summary necessarily compresses away.

---

### Update 2026-08-07 ~20:30 UTC — PR #57 (drafted, pending merge)

Six fail-loud fixes verified by `typecheck` + 569 vitest tests (76 files; suite grew from 494/64 with
this PR's coverage). **Verified by tests against mocked services, not by live round-trips:**

- **#58 (new finding, worst of the batch):** `/q/[token]` — the page a client opens to review and
  sign — never called the public API. It rendered one hardcoded demo quote for **any** token while
  the OTP flow signed the real row underneath. Now renders the real quote, real branding, real
  client name, and the stored seal when already signed.
- **#48:** `/auth/callback` now exists, so "Continuar con Google" can complete. *Still requires the
  Google provider + redirect URL configured in Supabase Auth before the issue can close — the
  deployed flow has not been exercised.*
- **#49:** onboarding no longer reports success (and strands the user on a 403 dashboard) when
  organization creation failed.
- **#50:** `createQuote` no longer falls back to a locally minted quote (browser-minted
  `public_token`, dead `/q/` link) on failure or a 1.5 s timeout; `fetchQuotes` no longer shows demo
  fixtures to a real tenant. `updateQuoteStatus` / `convertToContract` keep the old fire-and-forget
  shape — filed as **#59**, still open.
- **#39:** a failed OTP resend no longer invalidates the code already on the signer's handset.
- **#43:** `verify:webhook` refuses non-staging targets via allowlist; the stale `.mx` denylist is gone.
- **#44 (partial):** no more `8115551234` fallback on payment reminders; the hardcoded number on the
  public quote page is removed. The org-phone-backed "Solicitar Cambios" replacement still needs a
  migration — #44 stays open.

### Update 2026-08-07 ~21:00 UTC — P0 reconciliation and the two agent-closable items

The §03 P0 table was three rows stale within hours of being written: #33, #36 and #37 had all
closed, and #58 — worse than several listed items — was never on it. This pass re-derived the
list from the tracker and the source rather than from the memo, and made the mapping
one-to-one so the drift is visible next time.

**Tracker changes:** #14 split into #62 / #63 / #64 (it carried three P0s in one body, so none
could close independently); #59 promoted to P0; #65 and #66 filed for work found in passing.

**Second pass — the map extended past this memo.** The one-to-one check initially covered §03
only. Widening it to the whole doc set found three launch-gate items tracked nowhere, now filed:
**#68** (Stripe live secret key + per-tier Price IDs + one real card charge — a P0, and the only
one that had no issue of any kind), **#69** (the Playwright suite has never been executed; the
"14/14 passing" claim corresponds to no run), **#70** (no production smoke test, including
`/api/health` against the deployed URL). #69 and #70 are deliberately **not** labelled P0: the
`(P0)` headings in `product_launch_checklist.md` are domain labels, and the memo ranks the smoke
test P1 and E2E lower. `product-roadmap.md` and `product_launch_checklist.md` were refreshed —
the checklist recorded PR #20 as unmerged, two migrations instead of three, Stripe live mode
pointing at the now-split #14, 383/58 tests, and a "coverage exceeds 85%" claim resting on a
threshold CI does not run (#51).

**Code, verified by `typecheck` + `lint` (22 warnings, 0 errors) + 640 vitest tests / 79 files
+ `next build`. Against mocked services — no deployment was exercised:**

- **#59:** `updateQuoteStatus` and `convertToContract` now apply the server outcome. The
  conversion previously derived a contract client-side, flipped the quote to `converted`, and
  announced two milestones regardless of whether the route succeeded. The route already
  created the contract, its milestones and the status flip, so the local copy could only
  disagree with the database. Also normalized the quote routes to the `{ error: { code,
  message } }` Spanish envelope — they answered bare English, which the hook rendered verbatim.
- **#14 / #64:** onboarding gained a third step for the SPEI settlement account, and the 409
  refusal finally has behavioural coverage (`tests/unit/publicPaymentClabe.test.ts`). The only
  prior test naming `bank_clabe` asserted that a *migration file contained the string* — it
  would have passed just as well if the route had regained a fallback. The gate is not yet
  closed for organizations that predate the step or abandon it (#64).
- `lib/clabe.ts` consolidates the 18-digit rule that was duplicated across the onboarding form,
  the settings card and the organization API, and adds check-digit validation — advisory in the
  UI only, because tightening a live API contract is a decision (#66), not a side effect.

**Lint debt is 22, not 23** (#46): an unused import went with the onboarding change.

### Update 2026-08-07 ~22:30 UTC — the CLABE gate (#64), drafted, pending merge

The gate held only for a user who completed onboarding in one sitting. Two populations walked
around it: an organization created before onboarding collected a settlement account, and one
abandoned between the step-2 `POST` that creates the organization and the step-3 `PATCH` that
saves the account. Both end up with `bank_clabe IS NULL`, a usable dashboard, and no path back —
so the 409 fired in front of the paying client instead of in front of the tenant.

**The decision the issue asked for was made deliberately: server gate + banner, not a login
redirect.** A redirect closes the hole for owners and breaks it for everyone else — `PATCH
/api/organization` is scoped by `owner_id`, so a manager or member bounced to onboarding lands in
a form they cannot save and a redirect they cannot exit. The chosen shape is strictly stronger on
the exit criterion that matters: it refuses on the server, where a redirect only nags in the UI.

**Code, verified by `typecheck` + `lint` (22 warnings, 0 errors) + 668 vitest tests / 82 files
+ `next build`. Against mocked services — no deployment was exercised:**

- **`lib/settlementAccount.ts`** — the gate. `requireSettlementAccount()` refuses with 409
  `ORG_BANK_DETAILS_MISSING` before any server path hands a `/pay/` link to a client, and treats
  a failed or empty lookup as *not ready*: letting a link out on a query that did not run is the
  fail-open half. `hasSettlementAccount()` applies the 18-digit rule rather than a truthiness
  check, so a partial CLABE written directly to the column reads as missing.
- **`POST /api/whatsapp/broadcast`** moved from `requireUser` to `requireOrgAccess` and refuses
  before dispatch. The reminder carries the `/pay/` link, so a 409 after dispatch would already
  have put a dead link in front of the client.
- **A non-dismissable dashboard banner** (`SettlementAccountBanner`) is the prompt these
  organizations were never given, and the Cobranza and Facturación share actions render disabled
  with the CLABE named as the blocker — a missing account reported as a missing phone number
  sends the owner to edit the wrong record.
- **Onboarding resumes.** An existing organization opens straight at the account step with what
  is known prefilled. This also stops the step-2 `POST` from creating a *second* organization for
  an owner who reopens `/onboarding`, which it would previously have done.
- **`useSettlementAccount` is tri-state** (`true` / `false` / `null`), pinned by
  `tests/unit/useSettlementAccountHonesty.test.ts`. Only a server answer warns or disables:
  claiming an account exists would leave the hole open, and claiming one is missing on a failed
  request would paste "nobody can pay you" across a healthy tenant's dashboard.
- `isClientDemoMode()` moved out of `lib/hooks/useQuotes.ts` into `lib/clientDemoMode.ts` (still
  re-exported there) now that it has a second and third caller.

**#64 stays open after merge.** Its third exit criterion is a real deployment with a real
organization row; everything above is verified against mocked `fetch`. The PR says `Refs #64`.

**Coverage moved up but is still under the threshold**, which it was before this change too:
lines 80.35% → 80.88%, statements 78.77% → 79.13%, branches 69.37% → 69.71%, functions
79.67% → 79.69%, against a gate of 85/85/80/80 that CI does not run (#51).

**Filed in passing**, all three from auditing every surface that hands a `/pay/` link to a client:
**#72** (the Facturación reminder builds `/pay/<milestone.id>` where the route resolves by quote
`public_token` — a 404 sent to a real client), **#73** (two hardcoded origins in the WhatsApp
reminder builders, one of them a domain nobody owns — the #36/#47 defect class again), **#74**
(the route's `isSandbox` flag is unreachable, so a guard the tests exercise directly cannot fire
in the deployed path). All three are addressed in the 2026-08-08 update below.

### Update 2026-08-08 — the `/pay/` link itself (#72, #73, #74, #78), drafted, pending merge

#64 closed the question of *when* a payment link may be shared. This closes *what* gets shared:
the gate was protecting a link that, for a real tenant, did not resolve.

**The largest defect was not one of the three filed issues.** `lib/hooks/useReceivables.ts`
assigned raw `/api/receivables` rows straight into `MilestoneWithClient`, whose flat
`client_name` / `client_phone` / `contract_title` / `public_token` fields existed only on the
demo fixtures in that same file — the API nests them under `contracts`, and never returned
`public_token` at all, because it is a column on `quotes`, not `milestones`. Every field is
optional, so the missing mapping was not a type error. Against a real tenant, Cobranza therefore
showed "Cliente no asignado" for named clients, disabled the WhatsApp reminder as though no phone
were on file, and — filling the gap with `public_token || 'demo'` — pointed **"Portal SPEI" at
`/pay/demo`**. Filed as **#78** and fixed here.

**Code, verified by `typecheck` + `lint` (22 warnings, 0 errors — no delta) + 687 vitest tests /
84 files + `next build`. Against mocked services — no deployment was exercised:**

- **`getPaymentPublicUrl()`** joins `getQuotePublicUrl()` in `lib/url.ts`, so the payment link has
  one builder the way the quote link does. Both resolve the browser origin first and
  `getAppBaseUrl()` otherwise.
- **#78** — `/api/receivables` embeds `quotes!quote_id(public_token)`; a new exported
  `toMilestoneWithClient()` flattens the row; `ReceivableCard` drops both placeholder fallbacks
  and renders a disabled control naming the real blocker when there is no token.
- **#72** — `BroadcastMilestone` now carries `publicToken` as a field distinct from `id`, so the
  substitution that caused the bug is a compile error rather than an invisible one. `InvoiceItem`
  carries the token through `useInvoices`, and the aviso is disabled without it.
- **#73** — three builders, not the two the issue listed: `whatsappBroadcast.ts`,
  `whatsappOutbound.ts` and **`whatsappReminder.ts:38`**, which #73's table missed. All resolve
  through `lib/url.ts` now.
- **#74** — `isSandbox` removed from the route and from `WhatsAppReminderOptions`.
  `getWhatsAppDispatchMode` keeps its `env.IS_SANDBOX` check for callers not behind the 503.

**Two tests were pinning defects rather than catching them**, which is why both shipped:
`whatsappLinks.test.ts` asserted `/pay/m42` — the milestone id — and passed; `whatsappDispatch.test.ts`
asserted a sandbox guard through the parameter that could never be true in the route. Both now
assert the corrected behaviour. A new scan in `tests/unit/url.test.ts` fails the build if any
`lib/*.ts` module regains a literal app origin; it was confirmed to fail against a planted literal
rather than assumed to work.

**Coverage moved up on all four axes**, measured against a stashed tree at `870090e`:
statements 79.13% → 79.22%, branches 69.71% → 70.11%, functions 79.69% → 79.82%,
lines 80.88% → 80.96%. Still under the 85/85/80/80 gate that CI does not run (#51).

**Filed, not fixed: #79.** `quotes` and `contracts` are joined by two foreign keys, and the two
selects in `app/api/receivables/public/[token]/route.ts` embed `contracts` under `quotes` with no
disambiguating hint. If PostgREST answers PGRST201 there, both handlers take their `error` branch
and **every** `/pay/` link 404s for every tenant — a P0, and consistent with the fact that #64's
live check has never been run. This could not be verified without a database, so the PR hints only
the embed it adds and leaves those two alone. #79 carries the 5-minute curl repro.

### Update 2026-08-08 ~02:15 UTC — the pending migrations (#62), applied and inspected

**Applied against the production Supabase project through the Supabase connector, then confirmed
by querying the live catalog — not by a script's exit code.** The migrations are idempotent by
convention, so a no-op and a success are indistinguishable from the outside; every claim below
was read back out of `information_schema` / `pg_catalog`.

**The issue's premise was half wrong, which is the point of inspecting.** #62 lists three pending
migrations. Two were **already applied** — `20260807000000_otp_send_rate_limit.sql` (`otp_send_log`,
both indexes, RLS on with zero policies, no `anon`/`authenticated` grants) and
`20260807120000_cfdi_pac_integration.sql` (`pac_connections` + owner policy, folio columns and
both functions, all constraints, the private `cfdi-documents` bucket, `csd_credentials` dropped).
Only `20260807170000_cfdi_payment_complements.sql` was actually missing. It is now applied:
`milestones.cfdi_payment_method` / `cfdi_total`, `chk_milestone_cfdi_payment_method`, the
`cfdi_payment_complements` table with all four indexes, RLS on, the tenant policy, no `anon`
grants. `milestones` has 0 rows, so migration `20260807120000`'s quarantine of fabricated stamps
had nothing to demote.

**One live security hole found in the process, fixed, and filed as
[#76](https://github.com/jesushzv/business-helper/issues/76).** `reserve_cfdi_folio` and
`release_cfdi_folio` were executable by `anon` and `authenticated`: `REVOKE … FROM PUBLIC` in
`20260807120000` does not remove Supabase's default per-role grants. Both are `SECURITY DEFINER`
and update `organizations` directly, so any signed-in user could call
`/rest/v1/rpc/release_cfdi_folio` against their own org and mint unlimited folios — stamps billed
to the platform PAC account. `20260808030000_folio_rpc_grants.sql` revokes the named roles;
production now shows `postgres, service_role` only. Both callers already use the service-role
client, so nothing in the app lost access.

**The migration ledger did not exist.** `supabase_migrations.schema_migrations` had never been
created — every migration to date was applied by hand — so `npm run db:migrate` (`supabase db
push`) would have tried to replay all of them and failed on the non-idempotent `CREATE POLICY`
statements in the older files. The ledger is now seeded with all seven versions, so `db push` is
usable going forward. Two of the migration files carry a bare `CREATE POLICY`; new ones should
precede it with `DROP POLICY IF EXISTS`, as `20260808030000` does for its own statements.

**What #62 still wants:** its fourth exit criterion is one live request against each affected
route. Schema is no longer the blocker; the routes have not been exercised.

### Update 2026-08-08 — the lint gate is real (#46), drafted, pending merge

**Lint debt is 0 and the script now enforces it.** All 22 warnings cleared: the 8
`no-unused-vars` deleted (7 dead imports in `app/page.tsx`, the unused `screenshotOnly` prop in
`SmartVideoPlayer`), and the 14 `no-img-element` sites resolved with scoped, per-site
`eslint-disable-next-line` comments — 6 SVG-logo sites permanently (next/image does not optimize
SVGs), 8 PNG-screenshot sites until the `next/image` migration filed as
[#82](https://github.com/jesushzv/business-helper/issues/82) (blocked on `images.remotePatterns`
for the env-configured CDN origin `getAssetUrl()` can return — converting today would trade a
warning for a runtime crash on CDN deployments).

`package.json` lint script is now `next lint --max-warnings=0`. **The gate was shown to fail
before being trusted**: a planted unused import made `npm run lint` exit 1; removing it restored
exit 0. Since `npm test` chains lint first and CI runs it, a new warning now fails the PR. The
five documents that described the gate as nominal (CLAUDE.md, MASTER_PROMPT.md §07, the ECC
playbook §04, the roadmap sprint-16 gate, the launch checklist) were updated in the same PR.

**Code + lint config, verified by `typecheck` + `lint` (0 warnings, 0 errors) + vitest + `next
build`. No deployment was exercised; nothing here touches runtime behavior beyond deleted dead
imports.**

### Update 2026-08-08 — public error envelopes (#65), drafted, pending merge

**The three public routes now answer one shape: `{ error: { code, message } }`, Spanish.**
Before this, `app/api/quotes/public/[token]`, its `/otp` sibling and
`app/api/receivables/public/[token]` used four shapes between them, several in English ("Quote
not found", "Failed to issue verification code") — served to the tenant's *client* mid-signature
or mid-payment. All error bodies now flow through `lib/publicApiError.ts`; body siblings the
consumers read as data (`retry_after_seconds`, `attempts`, `remaining`, `expired`) survive
unchanged. `ORG_BANK_DETAILS_MISSING` moved inside the envelope, and `/pay/[token]` now branches
on it to tell the payer the truth (business has no CLABE yet) instead of "el enlace no existe".

**Two consumer defects fixed in the same PR.** `OtpSignatureModal` read `data?.error` as a string
(would have rendered `[object Object]`); the pay page's submit handler ignored the POST response
entirely and reported success even from its `catch` — a payer could see a confirmation for a
declaration the API rejected (#33's shape). It now surfaces `error.message`, and the simulated
demo submission sits behind `isClientDemoMode()` only. The remaining honesty gap — the receipt
file itself is never uploaded, a `blob:` URL is stored — is filed as
[#85](https://github.com/jesushzv/business-helper/issues/85).

**Code, verified by `typecheck` + `lint` (22 pre-existing warnings, 0 errors, no delta — the
debt clears in #83) + 700 vitest tests / 85 files + `next build`. Against mocked services; the
new `tests/unit/publicErrorEnvelope.test.ts` scans were shown to fail on planted violations
before being trusted.**

### Update 2026-08-08 — #76's generalizable half, and the first-ever E2E execution

**The `SECURITY DEFINER` grant defect is now build-enforced.** #76 fixed two functions and asked
for two follow-ups: a check that flags the next occurrence, and a sweep for existing ones.
`tests/unit/securityDefinerGrants.test.ts` is both — it parses `supabase/migrations/*.sql`, finds
every `SECURITY DEFINER` function in `public`, and fails unless a migration revokes `EXECUTE` from
`anon` and `authenticated` **by name**. Verified by planting a migration with only the ineffective
`FROM PUBLIC` revoke (red, with the fix in the message) and removing it (green).

**The sweep found one more, and it must stay as it is.** `user_organization_ids()`
(`20260803000000_initial_schema.sql:245`) is `SECURITY DEFINER` with no revoke at all. Revoking it
would be a serious regression, not a fix: RLS policy expressions are evaluated as the *querying*
role and twelve policies call `SELECT public.user_organization_ids()`, so removing `authenticated`
would make every authenticated read fail with `permission denied for function`. It is also the safe
shape — parameterless, filtered on `auth.uid()`. It is an explicit, documented exemption in the
test. **Caveat this test cannot escape:** it reads migration files, not the database. Confirming
live grants still needs the `aclexplode` query in #76.

**The Playwright suite has been run for the first time: 2 passed, 8 failed** (`scenarios.spec.ts`,
desktop-chromium, production build, no Supabase). The "14/14 passing" claim corresponds to no run,
as #69 suspected. Worse than staleness: **two scenarios assert defects that were remediated** —
scenario 05 requires the page to render `012180001234567890`, the P0-4 hardcoded CLABE that
`tests/unit/securityHardening.test.ts:213` asserts appears nowhere, and scenario 04 encodes the
pre-#57 client-side OTP flow. The two suites are in direct contradiction; only one of them runs.
Filed as [#91](https://github.com/jesushzv/business-helper/issues/91). Also required before CI can
run it at all: an explicit `npx playwright install --with-deps chromium` step — the pinned
`@playwright/test` expects a browser build nothing downloads, and all 40 tests fail in ~2ms in a way
that reads as a product failure.

**#59 closed as already-done** — `updateQuoteStatus` and `convertToContract` were made honest in
`870090e` (PR #75) and the quotes routes already answer the coded Spanish envelope; the issue was
open only because no PR title referenced it.

**Verified by `typecheck` + `lint` + vitest + `next build`; the E2E numbers above are a real local
run, and no deployment was exercised.**

### Update 2026-08-08 — client phone validated on write (#40), drafted, pending merge

**`clients.phone` is validated server-side for the first time.** `POST /api/clients` and
`PATCH /api/clients/[id]` ran `.trim()` and nothing else, so `"llamar a la oficina"`, a 7-digit
local number or an extension persisted into the column an e-signature is later delivered to, and
surfaced days later as a 502 from the OTP route phrased as a provider failure. Both routes now call
`normalizeClientPhone()` (new, in `lib/phoneValidator.ts`), answer `400 INVALID_PHONE` with a
Spanish message that says what the number is for, and store one canonical 10-digit form. The phone
stays optional; PATCH only validates when the caller is actually setting it.

**`formatE164MexicanPhone` now fails closed.** It returned `+${digits}` for any digit count, so an
unusable number reached the provider prefixed with a plus, and `normalizeOtpRecipient`'s
`\+[0-9]{10,15}` test waved through everything in that range. Unrecognized shapes now return `''`,
which every caller already treats as "número inválido". It also normalizes the legacy `+521` mobile
form, which `lib/whatsappLink.ts` has always handled — the same stored number previously produced a
working wa.me link and a malformed provider recipient.

**A live defect found while doing it:** `dispatchWhatsAppReminder` checked `!payload.recipient`
*below* the `wa_me_link` branch, so the guard only ever ran in the two API modes. In link mode — the
default, with no credentials configured — an unusable number produced `https://wa.me/?text=…`, a
link with no recipient, returned as `success: true`. Guard moved above the branch, with tests for
both link-mode cases.

**Not closed, by design:** a 10-digit *foreign* number is indistinguishable from a Mexican one and
is still dialed as +52. #40 called that out as a decision rather than a fix; filed as
[#94](https://github.com/jesushzv/business-helper/issues/94) with three options.

**Code, verified by `typecheck` + `lint` + 703 vitest tests / 86 files + `next build`. Against
mocked providers — no message was sent to a real handset.**

### Update 2026-08-08 ~22:00 UTC — #79 confirmed live and fixed; the UX-audit P0 trio (#93/#95/#96); #76 closed

**#79 is no longer a prediction.** This session had the Supabase connector, so the live check the
issue was parked on finally ran — from *inside* the database (`CREATE EXTENSION http`, four
`http_get()` calls against the project's own PostgREST endpoint, `DROP EXTENSION`, zero residue),
because the sandbox's network policy blocks shell HTTP to `*.supabase.co`. Result: **both unhinted
embeds answer `300 PGRST201`**, naming exactly the two predicted FKs. Every `/pay/[token]` GET and
POST has taken the 404 branch since the route existed — the payment page has never worked for any
tenant. The fix (hint by FK column, `contracts!quote_id`) was verified to resolve past embed
parsing against the same live PostgREST, and `tests/unit/postgrestEmbedHints.test.ts` now scans
every `.select()` in `app/` and `lib/` for an unhinted quotes↔contracts embed (shown red on a
plant). The `clients/[id]` embeds were checked in the same pass: unambiguous, no change needed.

**#76 closed.** The remaining item was the live `aclexplode` sweep; it ran against production.
Folio RPCs show `postgres, service_role` only; `user_organization_ids` is the documented
exemption; the one new hit (`rls_auto_enable`) returns `event_trigger` and cannot be invoked
through PostgREST — inert, Supabase-managed.

**The UX-audit trio (#93/#95/#96) — all three fixed in code:**

- **#95:** `useOrganizationSettings` seeded the demo tenant into every visitor's localStorage,
  never called `GET /api/organization`, and saved with a **PUT the route does not implement** —
  every save this hook ever made was a silent 405 converted into "guardado correctamente". It now
  fetches on mount, saves via PATCH (extended to accept the profile fields; still owner-scoped),
  applies the server row, and surfaces failures. `regimen_fiscal` is stored as the SAT code, not
  the display label. `organizations.phone` exists now (`20260809000000_organization_phone.sql` —
  **applied to production and confirmed in `information_schema`**; also the column #44 needs).
  Branding fields with no column (color, tagline, currency) are disabled as "muy pronto" instead
  of fabricating a save — the persistence feature is filed as
  [#107](https://github.com/jesushzv/business-helper/issues/107).
- **#93:** `useCurrentOrg` (new) feeds Header, AppShell, the dashboard greeting and the WhatsApp
  greeting builders with the real org + auth user; demo identity only behind `isClientDemoMode()`.
  One `buildClientGreeting()` replaces three disagreeing hardcoded greetings. The profile badge is
  now a menu with **Cerrar sesión** (there was no logout anywhere); the dead notifications bell is
  removed. The quote wizard starts with an empty line item; the pay page no longer invents
  "BBVA México" or "Business Helper Demo". `tests/unit/demoIdentityLeak.test.ts` pins the identity
  strings to demo-gated files (shown red on a plant).
- **#96:** the client detail page has a three-state loading gate (no more false "Cliente no
  encontrado" on every cold load) and derives the activity timeline, health meter and credit
  summary from the tenant's real quotes/receivables instead of an unconditional $45,000 fixture.
  `useClients` was the enabler and got the honesty pass: demo fixtures/localStorage only behind
  `isClientDemoMode()`, an empty list is a real answer, mutations apply the server row or throw,
  and `error` is finally assigned (#97 item 4 — the page-level halves of #97 remain open).

**Post-review hardening in the same PR.** The `database-reviewer` and `money-path-reviewer`
subagents ran on the full diff. Applied from their findings: a non-empty régimen that yields no SAT
code (or a four-digit one) now 400s instead of silently nulling/truncating a CFDI field; logo URLs
must be https; the PATCH response returns an explicit column list instead of `*`; the public payment
route's GET and POST now share one earliest-payable-milestone predicate, answer 409
`PAYMENT_ALREADY_RECORDED` when nothing is payable, and the guarded write can never move a
`confirmed` milestone backwards (that logic had never run — it was unreachable behind the #79 404);
and `calculateClientCreditSummary` keeps counting a payer-declared `marked_paid` as owed, so a
client cannot free their own credit line by declaring transfers the owner never confirmed. Filed
rather than fixed: #107 (branding fields with no columns), #108 (health-score prop shadows the real
milestones; unknown renders as 100), #109 (decision: unique `owner_id` or true multi-org).

**Verified by `typecheck` + `lint` (0 warnings) + 774 vitest tests / 94 files + `next build`, and
by the live PostgREST/catalog checks described above. The UI fixes are against mocked `fetch` — the
three issues stay open on their deployed-verification exit criteria (`Refs`), while #79's exit
criterion was the live check itself, which ran (`Closes`). Coverage moved **down** against
`origin/main` (statements 79.52% → 76.71%, branches 70.44% → 67.91%, functions 80.12% → 73.40%,
lines 81.20% → 78.41%): the branch adds ~750 statements of chrome/UI whose presentational branches
are not individually asserted; the honesty-critical paths all are. Still under the 85/85/80/80 gate
CI does not run (#51).**

### Update 2026-08-09 — the non-P0 bulk pass (#22/#60, #35, #44, #66, #97, #98, #106, #108), drafted, pending merge

Same method as the P0 pass the day before: re-derive the open set from the tracker, take everything
agent-actionable, leave decisions as decisions. Two were decision-gated and the founder chose live
in-session: **#60** (a provider failure releases the quote's lifetime OTP slot while keeping the
hourly/daily throttle — option 1) and **#66** (the CLABE check digit is enforced server-side).

- **#22 + #60 (OTP):** per-phone doubling backoff (30s → 60s → 120s…, 15-min ceiling) replaces the
  flat per-quote cooldown; a 15/day rolling cap layers over 5/hour; `otp_send_log.delivery_failed`
  flags provider failures so the lifetime cap counts only delivered codes. **The migration is NOT
  yet applied to production** — the Supabase connector began requiring approval mid-session — and
  without the column OTP issuance fails closed, so it must be applied before or with the merge.
- **#35 (CI):** the `migration-verify` job applies every migration twice to a real Postgres 16
  under a faithful Supabase shim (API roles, `auth.uid()`, `storage.buckets`, and the
  default-privilege auto-grants that were #76's trap), seeds a tenant, and asserts: anon denied or
  zero rows on every tenant table, service_role functional, the OTP phone CHECK, `aclexplode`
  grant posture on a live catalog, RLS enabled everywhere. Verified locally on a throwaway
  cluster; shown red against a planted anon-leak migration. Double-apply surfaced 16
  non-idempotent statements (bare `CREATE POLICY`/`CREATE TRIGGER`, an unguarded `ADD CONSTRAINT`,
  an `UPDATE` on a dropped column) — all guarded now, so the idempotency convention is finally a
  tested property.
- **#97:** failed reads render as failures — error states with retry on the quotes and receivables
  pages, a warning strip over the dashboard KPIs, `useDashboardAnalytics` finally assigns `error`
  and its skeleton holds until every source answers.
- **#98:** the product catalog reads and writes `/api/products` (new org-scoped DELETE route);
  demo fixtures/localStorage behind `isClientDemoMode()`; two-step delete confirmation, submit
  guard, the stock input, split empty states; rows stranded in localStorage from the pre-server
  era get a one-tap import instead of silent loss.
- **#44 (final third):** the public quote page's "Solicitar Cambios" button returns, aimed at the
  vendor's own `organizations.phone`; no phone → no button. Re-derived the `8115551234` set: only
  demo-gated fixtures, a placeholder and comments remain.
- **#108:** the health meter prefers the milestone-derived score, and unknown renders "Sin
  historial de pagos" — never 100 "Excelente" — on the credit-decision surface.
- **#106:** the placeholder-identifier scanner joins the FK-hint scanner (#110); it caught and
  cleared two latent hits on arrival. Both halves of #106 now exist.

**Verified by `typecheck` + `lint` (0 warnings) + 813 vitest tests / 98 files + `next build`, plus
the local Postgres runs above. Coverage vs `main`: statements 76.71% → 74.73%, branches
67.91% → 66.22%, functions 73.40% → 67.87%, lines 78.41% → 76.55% — down again, same shape as the
P0 pass: new UI surface (error states, catalog card, health-meter states) with behavior-level
tests but unasserted presentational branches. Still under the 85/85/80/80 gate CI does not run
(#51, which grows more relevant with each pass).**

---

## Recently landed (2026-08-07 → 2026-08-08) — moved here from `docs/STATUS.md`

*Moved 2026-08-09 when `docs/STATUS.md` hit its 32 KB budget. Every row was settled history by
then; it is reproduced verbatim because five of its six commit SHAs are recorded nowhere else.*


*Every row below is merged to `main` — the commit is the verification, checked with `git log` on
2026-08-08. The reasoning for each change, and what was checked against what, is preserved in the
frozen log at [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).*

| What landed | Issues | PR | Commit |
|:---|:---|:---|:---|
| Five fail-loud fixes across auth, onboarding, quotes, OTP and tooling — including `/q/[token]` rendering the client's real quote instead of one hardcoded fixture for every token | #39 #43 #44 #48 #49 #50 #58 | #57 | `4c565ff` |
| Payment links refused before a CLABE exists — server-side 409, non-dismissable banner, disabled share actions | #64 | #75 | `870090e` |
| Every `/pay/` link resolvable or none offered — the token comes from `quotes.public_token`, never a milestone or contract id | #72 #73 #74 #78 | #80 | `0a4ddad` |
| Zero-warning lint gate made real — 22 warnings cleared, `--max-warnings=0` enforced, failure confirmed with a planted warning | #46 | #83 | `64deeef` |
| One Spanish coded error envelope across the three public routes | #65 | #86 | `c671ce5` |
| Build fails on a `SECURITY DEFINER` function without a per-role revoke | #76 | #92 | `7d4617d` |
| `clients.phone` validated server-side on write, failing closed when it cannot be dialed | #40 | #102 | `a378c7e` |
| Production migrations applied and confirmed by inspecting the live schema (an ops action, no commit) | #62 | — | 2026-08-08 |

> [!IMPORTANT]
> **What none of the above changed.** Every row was verified by `typecheck` + `lint` + the vitest
> suite against **mocked** providers. Not one constitutes a live third-party round-trip. The P0 items
> in §03 that need a real handset, a real card, a real PAC stamp or a deployed database are untouched
> by all of it — merging is not verification.

---

## #95's production verification (2026-08-09)

*Moved from `docs/STATUS.md` on 2026-08-09 (PR #137) when the file hit its 32 KB budget. #95 is
closed and the checks are settled; reproduced verbatim because the transcript is recorded nowhere
else. For live status read [`../STATUS.md`](../STATUS.md).*

**#95's save verified against production on 2026-08-09.** The shell in a remote session cannot
reach `businesshelper.app` (egress policy), so the checks ran from inside the database over the
`http` extension — the same in-Postgres route CLAUDE.md documents for `*.supabase.co`. Against
`https://businesshelper.app`: `PUT /api/organization` → **405** (the method the old hook used, so
every save in its history was exactly this), `PATCH` → **401** unauthenticated, `GET` → **401**
unauthenticated with no demo fallback. Then a throwaway tenant was created, signed in through
GoTrue, and its cookie used for a real round trip: `POST` created the organization, `GET` returned
that row plus `role: "owner"`, `PATCH` with `{"phone":"81 1234 5678", …}` returned **200** and the
`organizations` row read back as `phone = 8112345678` — normalized, persisted, in production
Postgres. Invalid input surfaced as an error, not a success: `INVALID_RFC` and `INVALID_PHONE`,
both 400 with Spanish messages. The throwaway user and organization were deleted; the account is
back to its single real user and organization. Not covered: a non-owner's read-only view, which
needs a second account and stays pinned by unit tests only.

---

## #93's production walkthrough (2026-08-11)

*Moved from `docs/STATUS.md` on 2026-08-11 (PR #162) when the UX-audit trio's row closed with the
last of its three issues. Reproduced here because the transcript is recorded nowhere else. For live
status read [`../STATUS.md`](../STATUS.md).*

**The trio** — demo identity in the chrome and outbound WhatsApp (#93), a settings save that was a
405 reported as success (#95), a client detail page built from fixtures (#96) — was found in a
single UX audit on 2026-08-08 and fixed in code the same day. #95 closed 2026-08-09 (PR #125, its
production check above), #96 on 2026-08-11 after a live check that **failed** and surfaced two
further defects: three `clients.credit_*` columns the code read that no migration had created, and
both clients routes dropping four snake_case fields on every write. Migration `20260809180000`
applied and confirmed; residue tracked in #103/#99 and #113/#114/#123/#124.

**#93's last exit criterion — a real deployment with a real organization row — was taken from the
connector on 2026-08-11**, against production `d3d7cde` as the owner of the `Hector test`
organization. The shell cannot reach `businesshelper.app` (egress policy) and neither can the
preview URL or a local Chromium, so the checks ran from inside the database over the `http`
extension. What made the *authenticated* app reachable, which #95's throwaway-tenant run had not
established: an owner's session mints from a dormant `auth.refresh_tokens` row through GoTrue
(`grant_type=refresh_token`), and the session JSON encodes to the `@supabase/ssr` cookie the app
reads — `base64-` prefix, base64url, chunked at 3180 into `sb-<ref>-auth-token.0/.1`.

- `GET /api/organization` with that cookie → **200**, `{"name":"Hector test", …, "role":"owner"}`.
  The one source the header, sidebar, greeting and WhatsApp builders read.
- The same route without it → **401 `UNAUTHENTICATED`**; no demo data for an unauthenticated caller.
- `GET /api/quotes/public/<token>`, the surface the tenant's *client* sees → **200** carrying
  `organizations.name: "Hector test"`.
- `GET /dashboard` with the cookie → **200**, containing no `Distribuidora del Norte`, no
  `Don Roberto`, no `DNO850101`, and greeting a neutral `¡Hola!` before hydration.

The `http` extension was dropped again afterwards. `tests/components/ChromeIdentityRealTenant.test.tsx`
pins the render over that exact response body. The hydrated page — the *Cerrar sesión* click, the
org name after hydration — was confirmed by the founder in a browser on 2026-08-11, which closed
the issue. Not covered: `/pay/[token]`, which this tenant has no contract to render, so its
no-invented-bank path stays pinned by unit tests until a first real payment.

---

## #64's CLABE gate — production verification and closure (2026-08-11)

*Moved from `docs/STATUS.md` on 2026-08-11 when the file hit its 32 KB budget again. #64 is closed
and the checks are settled; reproduced here because the transcript is recorded nowhere else outside
the issue. For live status read [`../STATUS.md`](../STATUS.md).*

**The code half** merged as PR #75 (detail earlier in this log): a server-side 409 in front of every
path that shares a `/pay/` link, a non-dismissable dashboard banner, disabled share actions, and an
onboarding that resumes at the settlement-account step.

**The third exit criterion — "verified against a real deployment with a real organization row" —
split per #129 into *reach* and *eyes*.**

*Reach half, passed live 2026-08-11*, from inside Postgres over the `http` extension against
`https://businesshelper.app`, with every claim confirmed by reading the row back rather than by
response body. A throwaway tenant was created through the deployed `POST /api/organization`, leaving
`bank_clabe` NULL — the exact state hole 2 of the issue describes. Then: `GET /api/organization` →
200 with `bank_clabe: null` and `role: "owner"` (the shape the banner reads); `POST
/api/whatsapp/broadcast` with a fully valid reminder body → **409 `ORG_BANK_DETAILS_MISSING`**,
refused before `dispatchWhatsAppReminder`, so nothing could send; the public, sessionless `GET
/api/receivables/public/<token>` on a seeded quote → contract → pending milestone → **409
`ORG_BANK_DETAILS_MISSING`** in the public envelope with no fallback account. As a positive control
the gate was then shown to open: `PATCH /api/organization` with a valid CLABE → 200, the row read
back holding `646180157012345676`, and the *same token* now serving payment instructions carrying
exactly that CLABE. All QA rows, the QA user, the scratch schema and the `http` extension were
removed afterwards, every count read back zero. Not run deliberately: a positive-path broadcast
(with credentials configured it would dispatch a real WhatsApp message).

*Eyes half, waived by the founder 2026-08-11.* The three rendered-page checks in
`../security-p0-remediation.md` §5 — banner shows and clears, Cobranza/Facturación share buttons
visibly disabled, member view without the "Agregar mi CLABE" link — were never performed. The
founder accepted the component tests in their place and directed the issue closed on merge.
**Recorded as a decision, not a pass:** if the banner is invisible for a reason the tests cannot see
(a layout or z-index fault, a shell that never mounts it), this gate is blind to it. The server-side
refusals are unaffected — those are verified above and are what actually protects a paying client.

**Found while doing this**, both raised by the founder and filed separately: **#163** (a saved CLABE
could be replaced but never removed, so the only route back to "no account" was a hand edit against
production — fixed in the same PR that closed #64) and **#164** (one organization settles at one
account). #164 was first recorded as a deliberate boundary and then **reversed the same day**: the
founder chose option C — several accounts, one named per quote — and its schema and server side were
built in the same PR. The superseded "deferred" paragraph never reached `main`.

---

## The P0 tally, re-derived (2026-08-09 → 2026-08-11)

*Moved from `docs/STATUS.md` on 2026-08-11 when the file hit its 32 KB budget. The rule this
history justifies — re-derive the count from `is:issue is:open label:P0` rather than trusting the
table — stays there. For live status read [`../STATUS.md`](../STATUS.md).*

- **2026-08-09**: the live query returned **11** open P0s against **7** rows. #122, #135 and #48
  were added. Re-run after PR #137 merged the same day: **10 against 9 rows** (one row carried two,
  #93 and #96); #135's row dropped with its issue.
- **2026-08-10**: #122 resolved by decision — phone login removed, the product is email/OAuth only
  (outbound WhatsApp stays; OTP moved to email 2026-08-11). Its row dropped.
- **2026-08-11**: #2 closed at founder request with its criterion then unmet, tracked by a row with
  no backing issue — and later the same day the criterion was met (a real code to a real inbox, a
  quote signed and sealed), so that row dropped too. **6 against 6** after #48 and #96 closed;
  **5 against 5** after #93 closed on its walkthrough, taking the UX-audit trio's row; **4 against
  4** as #64 closed with PR #161.

Each step was counted from the query output rather than from the previous line's arithmetic, which
is the only reason the invariant survived seven closures in three days.

---
---

## Moved out of STATUS §03 P1 on 2026-08-11 (settled; §02's metrics row carries the live state)

- ~~**Make the lint warning gate real** ([#46](https://github.com/jesushzv/business-helper/issues/46)).~~
  **Done 2026-08-08** — `--max-warnings=0`, 22 warnings cleared, failure verified with a planted
  warning. (The count was recorded as 1, 3 and 23 before settling at 22 — a fail-open gate is how
  the debt grew unnoticed.) Follow-up: `next/image` for the PNG sites,
  [#82](https://github.com/jesushzv/business-helper/issues/82) (P2).


## P0 rows cleared 2026-08-07, moved from `docs/STATUS.md` 2026-08-11

Settled history: all four verified closed on the tracker at the time, moved here verbatim when
`STATUS.md` reached its size budget.

| Issue | What it was | Closed by |
|:--|:--|:--|
| [#33](https://github.com/jesushzv/business-helper/issues/33) | Payment confirmation | PR #55 |
| [#36](https://github.com/jesushzv/business-helper/issues/36) | `.mx` quote links | PR #47 |
| [#37](https://github.com/jesushzv/business-helper/issues/37) | Product analytics | PR #56 |
| [#58](https://github.com/jesushzv/business-helper/issues/58) | The public signing page rendering a fixture quote for every token — never listed as a P0 and worse than several that were | PR #57 |


## Rows resolved off `docs/STATUS.md` on 2026-08-08, moved here 2026-08-11

| Issue | Resolution |
|:--|:--|
| [#79](https://github.com/jesushzv/business-helper/issues/79) | The PGRST201 prediction confirmed against live PostgREST; both embeds hinted, scan test pinning the pattern |
| [#76](https://github.com/jesushzv/business-helper/issues/76) | Live `aclexplode` sweep ran clean |
| [#59](https://github.com/jesushzv/business-helper/issues/59) | Closed as already-done (PR #75) |


## "Merged and real", moved from `docs/STATUS.md` 2026-08-11

Settled history: work merged well before this date, kept for provenance.

| Change | PR | What it actually closed |
|:---|:---|:---|
| P0 money-path hardening | #1 | API auth enforcement across `app/api/*`; simulated writes relabelled so they cannot be mistaken for real ones |
| Outbound WhatsApp dispatch | #13 | Reminders now send via Twilio / Meta Cloud API instead of reporting fabricated success |
| Post-merge security setup | #16 | `lib/otpDelivery.ts` — real Twilio SMS, Twilio WhatsApp, and Meta Cloud API paths; per-org bank account (CLABE) UI; Stripe webhook signature verification |
| Real checkout, invites, export | #19 | `lib/stripeClient.ts`, `lib/teamInvitations.ts`, and `lib/accountantExport.ts` read real data instead of hardcoded fixtures |
| CI workflow + migration tooling | #11 | `.github/workflows/ci.yml`, `scripts/db-migrate.mjs`, `scripts/verify-stripe-webhook.mjs` |
| Test consolidation | #21 | `scripts/test-runner.js` (2,751 lines) retired; coverage folded into vitest |
| Agent authority split in two | #137 | The defect-class catalogue moved to `docs/LESSONS.md` under its own budget, with `tests/unit/lessonsCatalogue.test.ts` failing the build when a merge resolution drops a lesson (#135) |

---

## OTP email-channel verification, moved off `docs/STATUS.md` (2026-08-11)

Verbatim from the §02 row, collapsed there to one line when the file reached its size budget.

| ~~**#2** — OTP provider configuration~~ | ✅ **Email channel live and verified end to end (2026-08-11).** Resend configured in Vercel; migration `20260811120000` applied to production and its constraint proven by making it reject and accept. Evidence read back from the live catalog, not claimed: an `otp_send_log` email row at 04:57:25Z (delivered), and 24 seconds later that quote `client_otp_verified`, `accepted`, and sealed — the founder signed it from a real inbox. Replay-refusal is server-enforced and unit-pinned, not separately exercised live. sms/whatsapp stay wired but deprecated. | Cleared |

---

## Resolved open decisions, moved from `docs/STATUS.md` §05 (2026-08-11)

*Settled: each was resolved by the founder and the resolution is now reflected in the code and the
priority stack. Moved here verbatim when `STATUS.md` reached its 32 KB budget while recording
#164's UI. For live status read [`../STATUS.md`](../STATUS.md).*

1. ~~**Does CFDI invoicing ship at launch?**~~ **Resolved 2026-08-07 — it ships.** Deferral is off
   the table, so [#26](https://github.com/jesushzv/business-helper/issues/26) (one real stamp through
   a live Facturapi sandbox) is blocking, not negotiable.
2. ~~**Which OTP channel?**~~ **Re-resolved 2026-08-11 — email (Resend) at launch; sms/whatsapp
   deprecated but wired.** Supersedes 2026-08-10's "Twilio SMS at launch" (itself a same-day
   reversal: WhatsApp OTP needs a business-owned WABA plus the #42 template — Meta policy — and
   no WABA exists). Email needs one API key and a DNS-verified domain; no carrier registration,
   no per-message cost.
3. ~~**`businesshelper.app` or `businesshelper.mx`?**~~ Resolved — `.app`; `.mx` was never
   registered (#36).
4. ~~**Does the September launch date hold?**~~ **Resolved 2026-08-07 — the September date holds,
   at full scope.** Confirmed by the founder alongside decision 1. The consequence — both halves of
   the trade taken, so no relief valve remains — stays in `STATUS.md` §05, because it still
   constrains what can be promised.
5. ~~**Merge posture on PRs #20 and #23.**~~ Moot — both merged 2026-08-07.

---

## §01's original account of the simulated features, moved off `docs/STATUS.md` (2026-08-11)

Verbatim; the summary that replaced it points here.

The most serious instance: `POST /api/invoices/issue` called `simulateInvoiceStamping()`, which
fabricated an invoice ID and two `storage.businesshelper.mx` URLs, then wrote `cfdi_status: 'issued'`
onto the milestone. No PAC was contacted and no tax document existed. A business owner could read
their own dashboard, believe they had invoiced a client, and file accordingly. For a product whose
core promise is Mexican tax compliance, that is a compliance defect, not a missing feature.

The same pattern applied to Stripe checkout, team invitations, the accountant ZIP export, and
outbound WhatsApp dispatch — all since remediated (see §02).



## P0 table re-derivation history (moved from `docs/STATUS.md` 2026-08-11)

Kept for provenance; STATUS carries only the current count and the rule.

> [!NOTE]
> **One P0, one open issue.** Every row below maps to exactly one open issue and every
> open P0 issue appears below. Rows 1, 4 and 6 were previously all "#14", which meant no
> single one could be closed without implying the others; #14 is now their parent and holds
> only the staging-checklist residue. Verify this table against
> `is:issue is:open label:P0` before trusting it — the list is ordered by dependency, not
> just severity, and rows drop off as they close.
>
> **That instruction earned itself on 2026-08-09**: the live query returned **11** open P0s
> against **7** rows. #122, #135 and #48 were added below. The invariant is only true because
> someone ran the query — a rule nobody executes is how five documents once claimed completion
> for simulated work (§01). **Re-run after PR #137 merged the same day: 10 open P0s against the
> nine rows below** (row 6 carries two, #93 and #96). #135's row dropped off with its issue.
> **2026-08-10:** #122 resolved by decision — phone login removed, the product is email/OAuth
> only (outbound WhatsApp stays; OTP moved to email 2026-08-11). Its row dropped. **2026-08-11:** #2 closed at
> founder request, criterion then unmet, its steps tracked by a row with no backing issue —
> and **later the same day the criterion was met**: a real code to a real inbox, quote signed and
> sealed, evidence in §02. That row dropped too. **Re-derived: 6 open P0s against the 6 rows
> below** (#48 and #96 closed earlier the same day, dropping theirs). **Re-derived again after #93
> closed on its walkthrough, taking the UX-audit trio's row with it: 5 open P0s against the 5 rows
> below** — #62, #26, #68, #64, #63. **Re-derived after #68 closed on a real card the
> same day: 4 open P0s against the 4 rows below** — #62, #26, #64, #63.
> **Re-derived again 2026-08-11 22:00Z: 3 open P0s against the 3 rows below** — #62, #26, #63.
> #64 closed at 20:44Z on PR #161, and the table still carried its row an hour later — the
> invariant held only because the query was run again.


## Settled rows moved off `docs/STATUS.md` (2026-08-11, second budget pass)

*The authority hit its 32 KB budget again — 31,915 of 32,000 bytes, 85 bytes of headroom. Everything
below described work that had **already landed and closed**, so it was history occupying the space
the current-state sections need. Moved verbatim; the summaries that replaced each block point here.
For live status read [`../STATUS.md`](../STATUS.md).*

### §02's baseline-metrics rows that had stopped being status

The table's purpose was to correct five documents that claimed completion for simulated work. Three
of its rows describe *mechanism* that `CLAUDE.md` now states directly (raw REST, no provider SDKs),
and one recorded a gate that has since been made real — none of them assert live state any more.

| Metric | Docs claimed | Actually verified (2026-08-07) |
|:---|:---|:---|
| Stripe integration | "Install `stripe` package and call `stripe.checkout.sessions.create()`" | No `stripe` SDK dependency. Implemented as raw REST against `api.stripe.com/v1` in `lib/stripeClient.ts` — functionally fine, but not what the doc describes |
| Twilio / Gemini | SDK integrations | No SDK dependencies. Raw REST in `lib/otpDelivery.ts`, `lib/whatsappOutbound.ts`, `lib/whatsappAI.ts` |
| Zero-warning lint gate | "ESLint passes with `--max-warnings=0`" (5 docs) | ~~Gate was nominal — bare `next lint`, exit 0 with warnings.~~ **Enforced since 2026-08-08 (#46):** script is `next lint --max-warnings=0`, debt cleared to 0, failure verified with a planted warning. |

### §02's cleared "Open and blocking" rows

All four were struck through and marked Cleared. The Stripe row is kept in full because its
correction is the record of how a founder-confirmed figure was wrong.

| Item | State |
|:---|:---|
| ~~**#2** — OTP provider configuration~~ | ✅ **Email channel live and verified end to end (2026-08-11)** — a real inbox signed a real quote, evidence read back from the live catalog; detail above. sms/whatsapp stay wired but deprecated. |
| ~~**Stripe live mode**~~ | ✅ **A real card completed the loop (2026-08-11).** The `STRIPE_PRICE_*` variables held Stripe **Product** ids, so checkout answered `502 No such price: 'prod_…'` for every tier and the live account had never had a session; the founder set the Price ids, then subscribed and Ajustes showed "Activo". **Correction, same day, read back from Stripe and the catalog:** this row first said "$599, plan Negocio", founder-confirmed with no read-back — the account's full charge history shows **Plan Inicial, $299.00 MXN** (`price_1U0CxLDuvxyuzaREdO7Jsp3E`; one Mastercard success after three Amex declines — Amex is not accepted), the subscription's `metadata.tier_id` is `inicial`, and the organization row reads `inicial`/`active` with both Stripe ids stored (#115 working): the webhook wrote exactly what was bought. The charge was later **refunded**, but `sub_1U3L0tDuvxyuzaREpEbWl6eI` is still **active** and re-bills 2026-09-10 unless cancelled. If Ajustes really showed *Negocio*, that is a rendering defect only a browser can confirm. Code half in PR #166 (a non-price value now refuses with a 503 naming the variable) and #181 (plan CTAs stopped sending a signed-in owner into the registration form). |
| ~~**Production migrations**~~ | ✅ Applied to production and confirmed by schema inspection (2026-08-08). #62's remaining ask is one live request per affected route. |
| ~~Five more~~ | ✅ Cleared 2026-08-07→09: product analytics (#56); real CFDI via PAC (#3, PR #23); OTP per-phone rate limit (#17, PR #20); Complemento de Pago (#29); OTP escalating backoff + daily cap (#22, PR #112, carries migration `20260809120000`). |

### The P0 tally's last two steps

Continuing the re-derivation above, from the same `is:issue is:open label:P0` query:

- **2026-08-11, later:** #63's last criterion was met in production — a Dashboard resend of
  `evt_1U3L0wDuvxyuzaRE2m9tHsi1` answered 200 at 21:30:08Z (Vercel log) while the catalog held one
  claim row, `processed_at` unchanged and the organization row untouched: deduplicated, not
  re-applied. All five criteria met, so its row dropped — **3 against 3** (#62, #26, #64).
- **2026-08-11, 20:44Z:** #64 closed with PR #161 (settlement accounts), its transcript recorded
  above. **2 against 2** (#62, #26). The authority carried the #64 row for ~1.5 hours after the
  issue closed, because the commit that dropped #63's row was written from the table rather than
  from a fresh query — the same failure the rule exists to prevent, at a smaller scale.

### §03's UX-audit landing table

Every issue below is closed and every change merged; all of it was verified by unit and component
tests only, never against production or a real handset. The authority keeps that caveat and the two
deferred decisions (#174, #185); the row-by-row detail is here.

| Issues | What changed |
|:--|:--|
| #87, #100 | Every overlay is `components/shared/Modal.tsx`: dialog role, Escape, focus trap and return, a named ≥48px close, and the `max-h`/`overflow-y-auto` deciding whether the OTP submit is reachable at 375px |
| #127 | One SAT régimen catalogue (`lib/satRegimenes.ts`) across all five screens; an unlisted stored code renders as itself instead of blanking |
| #88, #90 | Six 375px overflows closed (nowrap flex pairs, intrinsic-width selects, unbroken CLABE/clave/email); the header sticks below the demo banner via a measured `--bh-sticky-offset`; the cookie banner clears the bottom-pinned CTA |
| #99 | Convert-to-contract cannot double-fire (the route already 409s; the button now waits too); CFDI stamping and PAC disconnect ask first, naming the folio cost and the write-only key; native `confirm()`/`alert()` gone. Invoice cancellation split to #174 as a decision |
| #114, #124 | `isClientDemoMode()` stops honouring the never-expiring sandbox flag once a session cookie exists, synchronously; the dashboard treats an all-zero API answer as an answer, so a new tenant sees $0 rather than computed figures |
| #89, #101 | 48px floor enforced (46 declarations); one global `:focus-visible` ring replacing zero; 43 labels associated, 6 inputs named; gating `slate-500` raised, light-theme islands restyled; credit status gains an icon; 15 error containers announce. Gate: `a11yBaseline.test.ts` |
| #103 | Jargon out of rendered copy (RBAC, SHA-256/HMAC, RLS, TLS, "Sandbox", route templates); English badges translated; provider errors mapped to Spanish via `lib/errorCopy.ts`, original logged; one name per concept; one register (tú) across the client portals. Plan naming split to #185. Gate: `copyRules.test.ts` |
| #104 | Create-a-quote loses its navigation-only tap; "Generar y Compartir" now shares; invites get the WhatsApp link their copy promised; dirty-form guard; empty-vs-filtered split; skeletons unified; OTP resend cooldown. Gate: `flowPolish.test.ts` |

### §03's note on which criteria need a human

The rule this justifies — ask whether a step needs a *human* or only *reach* — is now stated
compactly in the authority and tracked as #129. The evidence that produced it:

> **Most remaining rows need the founder — and the note that said *every* row did was wrong.**
> The credential rows (#62, #26, #68) are accounts, keys and a real card; no agent supplies those.
> The "needs a deployment" criteria (#96, #95, #63) were filed here too, and on 2026-08-09 three
> sessions took them directly. #96's check **failed**, surfacing two live defects nobody had seen
> (a table missing three columns the code depended on; a write path dropping four fields, two of
> them required to stamp a CFDI). #95's passed, reaching `businesshelper.app` itself over the `http`
> extension from inside Postgres — the shell's egress is blocked, the database's is not. #63's
> signature half passed against a real Next.js runtime, and on 2026-08-11 its two database checks
> completed in production: the live subscription event applied, and a Dashboard resend proved
> redelivery idempotent — the founder pressed the button, a session read the evidence back.
> **The rule: ask whether a step needs a *human* or only *reach*.** Schema, grants, constraints,
> PostgREST behaviour and the deployed API are all reachable from the connector. What genuinely
> needs a human is the browser session and the real credential — the rendered page, the code on a
> handset, the card that charges. #79 sat unverifiable for a day and #95 for three weeks for want
> of this distinction. **2026-08-11:** #93 went the same way and moved the line again — an owner's
> session mints from `auth.refresh_tokens` through GoTrue, so the *authenticated* deployed app is
> reachable, not just its public routes. What stayed human was smaller than the criterion implied:
> the hydrated page alone, confirmed in a browser the same day. **#64 followed the same day**: its
> server-side refusals were confirmed against the deployed app — 409 before a WhatsApp dispatch and
> on the public payer route, the gate then shown to open once a CLABE was saved. Its rendered-page
> half was waived by the founder rather than taken, the one criterion here closed by decision
> instead of by evidence.

### §03 P1 rows that had closed

- ~~**OTP escalating backoff + daily cap** (#22).~~ **Merged 2026-08-09 (PR #112)** — per-phone
  doubling backoff, 15/day cap, and #60's decision: a provider failure throttles the phone but
  releases the quote's lifetime slot. Carries migration `20260809120000`, since applied.
- ~~**A failed write must name its cause** (#148).~~ **Done 2026-08-11** — the eleven routes
  classify the error instead of discarding it (503 naming the column, 400 pinned to its input, 403,
  500) and log it. Scanning per *branch* found four more, plus a live defect: `constraintName()` read
  the relation, not the constraint, so no CHECK was ever attributed. Gate proven red on a planted
  revert.
- ~~**Register one client in the app, to close #146**.~~ **Done 2026-08-11, confirmed by the
  reporter**: a client was registered successfully through the UI after #150's migration went live —
  with a **US phone number**, so #94's international path was exercised live as well. That also
  closed #150's one evidence gap (the impersonated probe had not been re-run against the live
  function; a real registration through the app is the stronger check). The full diagnosis, kept
  because it is the reference case for the app/RLS disagreement in `LESSONS.md`:
  registration could not be completed and no message said which field was at fault. **The cause was
  RLS, not the form.** `user_organization_ids()` — the whole tenant check for nine policies —
  resolved membership from `organization_members` alone, and nothing creates a member row for an
  organization's *owner*. Both production organizations had none, so their owners were denied every
  write to `clients`, `quotes`, `contracts`, `milestones`, `products` and four more.
  `requireOrgAccess()` disagreed (it reads `organizations.owner_id` and returns `role: 'owner'`), so
  auth passed and only the INSERT was refused, as `42501`, reported as a generic 500. Confirmed by
  impersonating the founder's `auth.uid()` in production: 0 rows from the function, `42501` on
  `clients` and `quotes`. Migration `20260811000000` was applied to production on 2026-08-11 and the
  new definition read back from `pg_get_functiondef` — the UNION over owned organizations,
  `SECURITY DEFINER`, `search_path` pinned. PR #150 carried the migration and tests; PR #147 landed
  every bad field reported at once keyed by column, a failed write naming its cause, per-field
  messages in the form, and the RFC no longer gating registration.

### §05's resolved decisions

Moved once live work stopped referencing them; the authority keeps only what still constrains a
choice.

- ~~**Which roles may set a client's trade-credit line?**~~ **Owners and managers** (#123), via
  `manage_credit`; a change without it is a 403 per column. Whether the limit restrains a quote is
  #203.
- ~~**What does a never-subscribed org get?**~~ **A 30-day trial** (#128). Expiry blocks new
  quotes, contract conversion, CFDI stamping, complementos and outbound reminders (#195 widened
  this past quotes alone); collecting, correcting and every public `/q/` and `/pay/` page stay
  open. Both migrations applied and read back.

## #204 — production held schema no migration creates (resolved 2026-08-12; moved from STATUS §02 on 2026-08-13 for the size budget)

Migration `20260812060000` drops the redundant `idx_organizations_owner_id` and declares
`idx_organizations_trial_ends_at`; applied to production and the catalog read back — every index on
`organizations` now matches a migration. (The issue's *column* claim was wrong; `trial_ends_at` was
declared all along in `20260811150000_organization_trial.sql`.) Before resolution this was #96's
defect with the arrow reversed: a fresh database (including CI's) did not match production, so
nothing depending on `trial_ends_at` could be trusted to behave the same in both.

---

## Entries moved 2026-08-13 (STATUS.md budget trim)

*Moved verbatim from `docs/STATUS.md` when the file went over its 32,000-byte budget. Everything
below describes work that had merged (and, where noted, been verified live) by 2026-08-12; the
compressed pointers remain in STATUS.md §03.*

### From §03 — the superseded bug-issue paragraph (its #204 diagnosis, since resolved)

**Two of the three open `bug`-tagged issues are closed in code**, with #115 alongside them — #116
(the webhook no longer writes a Checkout Session's `'complete'` into `subscription_status`, and an
unknown status is no longer badged "Cancelado" to someone who has just paid), #133
(`requireOrgAccess` resolves the tenant deterministically) and #115 (`stripe_customer_id` and
`stripe_subscription_id` stored at last). Tests, lint and build only. The third is **#204, and its
central claim is wrong** — it reports `trial_ends_at` as a column no migration creates, citing
`git grep 'trial_ends_at' -- supabase/migrations` returning nothing at `aedf521`; re-run at exactly
that commit it returns **9 matches**, the column being declared in
`20260811150000_organization_trial.sql:27`. What *is* undeclared, confirmed against `pg_indexes` on
production, is the two **indexes**. A migration written to the issue as filed would add a column
that already exists.

*(#204 was subsequently resolved 2026-08-12 — `20260812060000` applied and `pg_indexes` read back —
which is why this diagnostic paragraph became history; the surviving bullet list in STATUS.md §03 is
the current record.)*

### From §03 P1 — CFDI folio billing → BYOK (all landed 2026-08-12)

- ~~**CFDI folio billing** (#24, #27).~~ **Superseded by the BYOK decision (§05, 2026-08-12)** —
  the platform does not stamp on behalf of tenants, so folio packs and per-folio metering have no
  billable event; both issues closed as not planned. The copy sweep that replaced them (**#221**)
  landed 2026-08-12: every folio-inclusion/$-per-folio claim replaced with the founder-approved
  BYOK line across pricing, landing, FAQ, comparison tables and Ajustes; the platform-key fallback
  (`FACTURAPI_SECRET_KEY`, `source: 'platform'`, folio metering, `lib/cfdiFolios.ts`) removed from
  the code. Verified by `npx vitest run` + `tsc` + `next build` (copy pinned by
  `tests/unit/copyRules.test.ts`, shown red first). The money-path review of the PR then found
  `STRIPE_PLANS.features` still selling folios **live on the Ajustes billing card** — fixed in the
  same PR along with the folio-pack machinery, `verify:stripe`'s pack stage, and the stale
  deployment docs still instructing `FACTURAPI_SECRET_KEY`. The last residue fell 2026-08-12: the
  founder chose **drop** on #224, and `20260812182430_drop_cfdi_folio_ledger.sql` removed the
  `cfdi_folios_*` columns and both folio RPCs — measured first (1 org, all counters zero, nothing
  discarded), applied to production via the connector, and verified by reading the catalog back
  (columns and functions absent). #226 (copy promised PACs the form refuses) closed with the same
  PR: rendered copy names Facturapi only, pinned by `tests/unit/copyRules.test.ts` (shown red on a
  plant).

### From §02 — why the hand-rolled Sentry transport was replaced (settled 2026-08-12)

Coverage was the reason for moving to `@sentry/nextjs`: the hand-rolled `fetch` envelope could not
see an unhandled Server Component, render or Edge error. The live state of error monitoring stays in
[`../STATUS.md`](../STATUS.md).

---

## Entries moved 2026-08-14 (STATUS.md budget trim — the pass that introduced the date TTL)

*`tests/unit/docsStatusAuthority.test.ts` gained rule 5 on 2026-08-14: no `YYYY-MM-DD` date in
`docs/STATUS.md` may outlive the TTL the test sets (7 days at introduction, sized to the measured
~2 KB/day growth), so settled narrative now rolls out continuously instead of piling up against
the 32 KB budget. The entries below were moved in the same PR to restore
headroom; each one's surviving current-state fact stays in [`../STATUS.md`](../STATUS.md).*

### From §02 — how the live PAC integration was found dead (2026-08-12)

**Half fell on 2026-08-12.** The founder supplied a sandbox key and the integration was exercised
live from a session — which found it **entirely broken**: every call targeted `/v1`, which answers
410 for everything since April 2023, and v2 refuses the payload on four fields. Mocked-`fetch`
coverage had kept all of it green. Fixed and re-verified against the live sandbox end to end: real
SAT UUIDs, documents, cancellation (02/03), totals landing on the milestone amount with and without
retenciones. Re-scoped by the BYOK decision (§05, 2026-08-12): the platform does not stamp on
behalf of tenants, so the sandbox `FACTURAPI_SECRET_KEY` briefly set on Vercel comes back out. Also
live-observed: `external_id` deduplicates nothing (#213) — the DB-side claim guard landed
2026-08-13 (PR #241): `cfdi_stamp_claims` applied to production, duplicate claim refused `23505`
live.

### From §02 — the one-organization-per-owner probe detail (2026-08-11)

The invariant was applied to production 2026-08-11 (`uq_organizations_owner_id`, `20260811150000`).
Two blocking rows were found first — one owner held two `— BORRAR` test organizations, so #168's
"0 duplicates" was stale — and the older was deleted with its client and quote. Verified live: the
index reads back `indisunique`/`indisvalid`, and a probe INSERT of a second organization for an
existing owner was refused with `23505`.

### From §03 — the three-sessions-in-two-hours P0 tally incident (2026-08-11)

The re-derive instruction has earned itself repeatedly, and most sharply on 2026-08-11, when three
sessions edited the P0 table within two hours and each wrote a number that was already stale. One
dropped #64's row and kept #63; another dropped #63's and kept #64 — each right about the issue it
had just closed, both writing "3 open P0s", and a textual merge would have kept one number and lost
the other's row. The lesson is not "run the query" — every one of them did — but *run it at the
moment you write the number*, and re-run it when you merge.

### From §03 P1 — error monitoring's road to @sentry/nextjs (settled 2026-08-12)

**The code half landed 2026-08-11** as a raw-`fetch` envelope client, and **moved to
`@sentry/nextjs` on 2026-08-12** following Sentry's official setup skill. The reason for the swap
is coverage, not style: a hand-written transport only sees errors someone handed it, and never an
unhandled Server Component error, a React render error or an Edge middleware throw — most of what a
production 500 is. `instrumentation.ts`'s `onRequestError` sees all of them. Configured across
browser, Node and Edge with tracing, session replay (all text, inputs and media masked), logs and
profiling; `sendDefaultPii` is off, and email/RFC/CLABE/phone are scrubbed in `beforeSend` — now
also out of stack-frame locals, breadcrumbs, headers and cookies — while `organization_id` and
`route` survive. Call sites did not change: `lib/sentry.ts` keeps its signature as an adapter, so
`app/global-error.tsx` and `app/(dashboard)/error.tsx` report as before. **The DSN was configured
on Vercel by the founder on 2026-08-12, and #52 closed on that basis.**

### From §03 P1 — the CI-absence narrative (PR #28, then #132)

CI was silently absent on PR #28 for ten hours across four pushes while Vercel and GitGuardian
reported green, so the PR looked checked. The cause is still unexplained — which is the argument
for a rule that fails closed rather than one that depends on understanding it. It has since missed
again, three times on one PR (#132).

### From §03 P2 — migrations verified in CI (merged 2026-08-09)

CI's `migration-verify` job applies the full set twice to Postgres 16 under a faithful Supabase
shim (including the default-privilege auto-grants — the #76 trap), seeds a tenant, and asserts anon
isolation, service_role access, the OTP phone CHECK, SECURITY DEFINER grants via `aclexplode`, and
RLS-on-every-table. Shown red against a planted anon leak; making double-apply pass surfaced 16
non-idempotent statements, all fixed.

### From §03 P2 — the Gemini wiring and the 2026-08-13 "assistant not working" forensics

**Gemini wired 2026-08-12** (`lib/geminiClient.ts`, raw REST). **Verified against a mocked `fetch`
only — no session held the key, so no live call had run** (the #26 lesson says to exercise it
once). **2026-08-13, "assistant not working" — root cause confirmed live:** Sentry event
7669023728 shows `Gemini respondió 404` on `models/gemini-2.5-flash` — Google retired that id for
new API keys in July 2026, so every call from the founder's (new) key 404s and answers degrade to
the labeled rules engine. Supabase edge logs prove the rest of the chain works (key set,
service-role budget reads 200, tier `inicial` allowed). Fix: client and `verify:gemini` default to
the rolling `gemini-flash-latest` alias (`GEMINI_MODEL` pins), with a per-generation thinking cap —
`thinkingBudget: 0` for 2.5-era flash (the MAX_TOKENS defect, real but secondary),
`thinkingLevel: 'low'` for Gemini 3+/aliases — and both AI routes `console.warn` a Gemini failure
into Vercel logs beside the Sentry capture. The model allowance became server-derived on 2026-08-12
(#228): migration `20260812210000` applied to production and read back — RLS deny-all held against
`anon`/`authenticated` probes, and the atomic increment returned 1 then 2 live.


## Deletion semantics — the app-layer guards (#327), August 2026

Moved from `docs/STATUS.md` when its 32 KB budget filled; the still-true fact stays there.

`delete_records` (owner + manager) fronts the clientes/cotizaciones/productos/cobros DELETE
routes, which previously had **no role check at all**. The guards, as shipped:

- a signed (`accepted`) or `converted` quote is not deletable — 409, because its token anchors the
  live `/q/`–`/pay/` link a client may already hold;
- a milestone is deletable only while `pending` with no CFDI, since its complementos would
  `CASCADE` away with it;
- a client with quotes or contracts is refused by the database's `ON DELETE RESTRICT` and now told
  so in those words, replacing the old wrong-direction "ya no existe, recarga";
- the confirm dialog no longer promises that deletion succeeds.

Cotizaciones gained their first UI delete (draft/sent/rejected/expired, confirm-guarded).

Verified at the time with the Vitest suite only — route handlers against Supabase doubles, hooks
against a mocked `fetch` — with no live-database pass, because RLS itself was not yet changed.
#336 later moved the invariants into the schema and proved them against production by rejection.


## The `bug`-tagged sweep — nine issues to zero, 2026-08-14

Moved from `docs/STATUS.md` when its 32 KB budget filled; the still-true fact (the label is empty,
plus the two filed leftovers) stays there.

Nine issues carried the `bug` label. Three were already fixed in code and had simply never been
closed; five were fixed in a stack; one closed once its leftover was split out.

| # | What was wrong | Landed as |
|:--|:---|:---|
| #334 | Server "today" ran on UTC — a quote "válida hasta hoy" refused all evening, `due_today` listed tomorrow, the Inicial quota month rolled over six hours early | `d5e9547` (#342) |
| #151 | `type="number"` bound to numeric models — a caret left of a prefilled amount multiplied it by ten, and the field blanked itself mid-decimal | `aa91140` (#343) |
| #281 | `useCurrentOrg`'s cache was write-once, so a rename in Ajustes never reached the header, sidebar or the WhatsApp greetings clients receive | `aa91140` (#344) |
| #269 | Accepting a second invitation succeeded and showed the other company's data, with no signal but a `console.error` | `aa91140` (#344) |
| #116 | An absent subscription status defaulted to `'active'` in three places — "Activo" for a subscription nothing had established | `aa91140` (#345) |
| #115 | Stripe customer/subscription ids were never stored | already fixed; closed on evidence |
| #117 | The plan chosen on `/pricing` was dropped at `/register` | already fixed; closed on evidence |
| #133 | `requireOrgAccess` picked an arbitrary organization | already fixed; closed on evidence |
| #213 | A retried stamp could issue a second CFDI — `external_id` deduplicates nothing | claim table, applied live |

**What was verified live, and what was not.** The five that landed had tests, lint and build only —
no live Stripe event, no live PAC stamp. The database claims were read back from the production
catalog rather than assumed: both `organizations.stripe_*_id` columns confirmed UNIQUE (so a
cross-tenant collision surfaces as a 500 rather than being swallowed), `uq_organizations_owner_id`
present, and `cfdi_stamp_claims` applied with `anon`/`authenticated` holding no privileges at all.
The claim table's primary key was proven by making it **reject** a second claim (`23505`) inside a
deliberately-aborted probe, with the table read back at 0 rows afterwards.

**Two lessons the sweep produced, both about tests.** Three tests were pinning the very defects
they sat next to: `quoteQuota` asserted the UTC month start, `SpeiConfirmModal` selected its input
*by* `input[type="number"]` — the attribute the fix removes — and `aiAssistant` built its due-today
fixture with `toISOString()`, which made the suite go red every evening and green every morning.
The last one failed during the session that fixed it, at 23:5x Mexico City time.

And two issue enumerations were stale in both directions: #151 named four input sites (there were
five — the client credit limit was missing) and one that no longer existed, while `STATUS.md`
itself claimed three open `bug` issues when the tracker held nine.

## Production migration ledger, reconciled 2026-08-15/16

Every migration in the repo was confirmed applied by reading the live catalog rather than the
ledger — the ledger does not list hand-applied work, which is why an earlier revision of the
`STATUS.md` row was wrong in both directions.

| Migration | What was read back |
|:---|:---|
| `20260815200000` `record_owner_payment` (#394) | Shipped to the deployment a day ahead of the database: `main` carried the calling code while the function did not exist, so every owner confirmation and every "Registrar pago" failed `42P01`. It failed *honestly* — a Spanish error, no fabricated `confirmed` — which is hard rule #1 doing its job, but the confirm step of the cash-flow loop was down for a day. Applied 2026-08-16: `prosecdef = false`, EXECUTE only `postgres`/`service_role`, and both guards proven by rejection (zero amount → `22023`, unknown milestone → NULL, ledger row count unchanged by either). The connector stamped its own ledger version, restamped to the file's `20260815200000` so `supabase db push` skips it |
| `20260814080000` `clients.archived_at` (#337) | Column and `idx_clients_org_active` both present. The migration's own header still says "NOT yet applied to production" — the comment is stale, not the schema |
| `20260815120000` `milestone_payments` + `record_milestone_payment` (#381) | Table and function carry `postgres`/`service_role` only, `prosecdef = false`, backfill 0 rows against 0 eligible milestones, every CHECK proven by making it reject |
| `20260815000000` `stripe_webhook_events` by-name REVOKE (#242) | `aclexplode` returns only `postgres` and `service_role`; the `anon`/`authenticated` grants, TRUNCATE included, are gone |
| `20260814210000` + `20260814210100` deletion invariants (#336) | Both FKs read back `confdeltype = 'r'`, both restrictive `FOR DELETE` policies exist with their intended predicates |
| `20260813010000` `cfdi_stamp_claims` grants | No `anon`/`authenticated` grant remains there, nor on `otp_send_log` or `ai_usage_monthly` |

**The conversion invariants behind #59** were proven the same way, in a transaction aborted by a
final `RAISE` with the row counts read back afterwards to confirm the rollback: a second contract
for the same quote is refused `23505` (`contracts_quote_id_key`), and a repeated
`conversion_position` is refused `23505`
(`uq_milestones_contract_conversion_position`) — each paired with a permitted insert, so neither
passed against a rule that refuses everything.
## `record_owner_payment` deployed unapplied — the confirm step down for a day, 2026-08-16

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

Moved out of `STATUS.md` §04 once the migration was applied and proven. The still-true fact — applied,
read back, both guards proven by rejection — stays there; this is the account of how it happened.

`20260815200000_record_owner_payment.sql` merged with PR #400 and Vercel deployed `main` before
anyone applied it. For roughly a day production ran `POST /api/receivables/[id]/payments` and the
confirm path against a function that did not exist: every owner confirmation and every
*Registrar pago* failed `42P01`.

Two things are worth separating in that.

**The failure was honest.** `recordOwnerPayment` reads the PostgREST error rather than swallowing it,
so the tenant saw a Spanish message and nothing wrote a `confirmed` the database had refused — hard
rule #1 doing exactly its job, and the reason this was an outage rather than a fabricated-success
incident. The route's `42P01` handling was written for this case specifically, on the reasoning that
it is *the single most likely failure the day this ships*. It was.

**The outage was real anyway.** The confirm step of the quote → sign → pay → confirm loop was down,
and no session noticed for a day because the deployed behaviour was never checked — only the merge.
The migration-ordering reminder in CI is a requirement, not a note (hard rule #6), and three PRs in
the #394 stack merged past it.

What caught it was a routine live-catalog pass (#405), not an alert. The lesson is the one #129
already carries: a session with the Supabase connector can check this itself, and "needs a
deployment" is not a reason to park it on the founder. The specific habit that would have caught it
sooner is reading the migration ledger against the live catalog *at merge*, not at the next audit.

## `20260816150000` merged and deployed unapplied — the second in two days, 2026-08-17

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

PR #406 merged `record_milestone_payment`'s widened status filter (#382/#371) and Vercel deployed
the code; the migration was not applied. The same gap as `record_owner_payment` the day before, and
milder only by luck of direction: the widening *admits* rows the old filter refused, so a client
returning to pay a remainder got a 409 rather than anything false being written.

**A cheap check would have said it was applied.** `pg_get_functiondef(...) LIKE '%marked_paid%'`
returns true whether or not the widening landed, because the original function hardcodes
`status = 'marked_paid'` in its UPDATE. Only matching the filter itself separates them:

```sql
substring(pg_get_functiondef(p.oid) from 'AND status IN[^)]*\)')
```

which read back `AND status IN ('pending', 'requested')` — the old filter.

Applied 2026-08-17 and proven by exercising it, in a transaction aborted by a final `RAISE` with the
row counts read back afterwards (2 quotes / 1 contract / 2 milestones, 0 ledger rows, no probe rows
left):

| Step | Result |
|:---|:---|
| First declaration against a `pending` cobro | total 20,000.00, status `marked_paid` |
| **The widening** — second declaration against the `marked_paid` cobro | accepted, total 48,720.00 (the $20,000 + $28,720 case the migration's own comment describes) |
| **Negative control** — declaration against a `confirmed` cobro | refused (NULL), so the backwards-move guard the original filter existed for survived the widening |
| Ledger rows after the refusal | 2, not 3 — the refused call left nothing behind |

Filter, `prosecdef = false` and EXECUTE limited to `postgres`/`service_role` all read back.

**The habit this keeps asking for**, now twice in two days: reconcile the migration ledger against
the live catalog *at merge*, not at the next audit. Both incidents were found by an audit that
happened to run, not by anything that watches.
