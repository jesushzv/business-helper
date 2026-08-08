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

