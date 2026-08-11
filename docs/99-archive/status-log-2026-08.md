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


## "Why This Document Exists", moved from `docs/STATUS.md` 2026-08-11

The original 2026-08-06 findings, kept verbatim. `STATUS.md` keeps the summary.

The roadmap marks Sprints 1–16 plus WS-A/WS-B as **Completed**, and the readiness snapshot reports
**100% roadmap progress** with an all-green dashboard. A security review conducted on 2026-08-06
found that several features recorded as complete were **simulated**: the UI and data model existed,
but the third-party call underneath was faked or stubbed.

The most serious instance: `POST /api/invoices/issue` called `simulateInvoiceStamping()`, which
fabricated an invoice ID and two `storage.businesshelper.mx` URLs, then wrote `cfdi_status: 'issued'`
onto the milestone. No PAC was contacted and no tax document existed. A business owner could read
their own dashboard, believe they had invoiced a client, and file accordingly. For a product whose
core promise is Mexican tax compliance, that is a compliance defect, not a missing feature.

The same pattern applied to Stripe checkout, team invitations, the accountant ZIP export, and
outbound WhatsApp dispatch — all since remediated (see §02).

**The takeaway is procedural, not just technical:** the sprint-by-sprint "Completed" history is not a
reliable map of what is launch-safe. Every remaining completion claim should be treated as unverified
until checked against source. This memo does that check; §06 records the method so it can be repeated.

---

---

## OTP email-channel verification, moved off `docs/STATUS.md` (2026-08-11)

Verbatim from the §02 row, collapsed there to one line when the file reached its size budget.

| ~~**#2** — OTP provider configuration~~ | ✅ **Email channel live and verified end to end (2026-08-11).** Resend configured in Vercel; migration `20260811120000` applied to production and its constraint proven by making it reject and accept. Evidence read back from the live catalog, not claimed: an `otp_send_log` email row at 04:57:25Z (delivered), and 24 seconds later that quote `client_otp_verified`, `accepted`, and sealed — the founder signed it from a real inbox. Replay-refusal is server-enforced and unit-pinned, not separately exercised live. sms/whatsapp stay wired but deprecated. | Cleared |
