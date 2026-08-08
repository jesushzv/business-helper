<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# STATUS — Business Helper

> **The single source of truth for what is and is not done.**
>
> *Last verified: 2026-08-07 against `main` @ `f652956` (post #57 / #67).*
> *Method in §06. Was `04-execution-testing/launch_readiness_memo_aug2026.md` until 2026-08-07 —
> renamed because a date-stamped filename reads as a snapshot, and a snapshot is exactly what a
> living status document must not be.*

## The doc contract

**This file owns status. No other document may assert it.**

| Claim type | Where it may appear |
|:---|:---|
| Is a feature done / blocked / simulated | **Here only** |
| Priority (P0/P1/P2) and the launch gate | **Here only** |
| Test counts, coverage numbers, % complete | **Here only** |
| How something works, why it was designed that way | Any reference doc |
| Runbooks, env var inventories, schema, personas | Any reference doc |

Every other document that mentions status must carry the marker
`<!-- STATUS-AUTHORITY: docs/STATUS.md -->` and point here. **This is enforced by
`tests/unit/docsStatusAuthority.test.ts`, which fails the build if a doc drifts** — the whole
reason this file exists is that five documents once claimed completion for work that was
simulated, and nothing checked them. A convention nobody executes is how that happened
(the same lesson as #46 and #38).

Where this file and the code disagree, **the code wins** — fix this file in the same PR.

An HTML rendering is published at
<https://claude.ai/code/artifact/bce71e34-9298-436f-8dda-9e432ea9763a> (private to the owner).

---

## 01 Why This Document Exists

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

## 02 Verified State of `main`

### Merged and real

| Change | PR | What it actually closed |
|:---|:---|:---|
| P0 money-path hardening | #1 | API auth enforcement across `app/api/*`; simulated writes relabelled so they cannot be mistaken for real ones |
| Outbound WhatsApp dispatch | #13 | Reminders now send via Twilio / Meta Cloud API instead of reporting fabricated success |
| Post-merge security setup | #16 | `lib/otpDelivery.ts` — real Twilio SMS, Twilio WhatsApp, and Meta Cloud API paths; per-org bank account (CLABE) UI; Stripe webhook signature verification |
| Real checkout, invites, export | #19 | `lib/stripeClient.ts`, `lib/teamInvitations.ts`, and `lib/accountantExport.ts` read real data instead of hardcoded fixtures |
| CI workflow + migration tooling | #11 | `.github/workflows/ci.yml`, `scripts/db-migrate.mjs`, `scripts/verify-stripe-webhook.mjs` |
| Test consolidation | #21 | `scripts/test-runner.js` (2,751 lines) retired; coverage folded into vitest |

### Corrected baseline metrics

| Metric | Docs claimed | Actually verified (2026-08-07) |
|:---|:---|:---|
| Test suite | 182/182 via `scripts/test-runner.js` | **494 tests / 64 files**, `npx vitest run` — runner file no longer exists |
| Error monitoring | "Sentry Monitoring Live … instant alerts to founder's phone" | **Not live.** No `@sentry/nextjs` dependency; `lib/sentry.ts` `captureException` only calls `console.error`. Nothing is transmitted anywhere. |
| Stripe integration | "Install `stripe` package and call `stripe.checkout.sessions.create()`" | No `stripe` SDK dependency. Implemented as raw REST against `api.stripe.com/v1` in `lib/stripeClient.ts` — functionally fine, but not what the doc describes |
| Twilio / Gemini | SDK integrations | No SDK dependencies. Raw REST in `lib/otpDelivery.ts`, `lib/whatsappOutbound.ts`, `lib/whatsappAI.ts` |
| E2E | "14/14 Playwright scenarios passing" | `playwright.config.ts` and `tests/e2e/` exist; not run in this verification pass — treat as unverified |
| Zero-warning lint gate | "ESLint passes with `--max-warnings=0`" (5 docs) | ~~Gate was nominal — bare `next lint`, exit 0 with warnings.~~ **Enforced since 2026-08-08 (#46):** script is `next lint --max-warnings=0`, debt cleared to 0, failure verified with a planted warning. |

> [!IMPORTANT]
> **The Sentry finding matters disproportionately for a solo founder.** Error monitoring is the only
> mechanism that reports a production 500 when nobody is watching the dashboard. It is currently a
> console shim. This is tracked as a P1 item in §03.

### Open and blocking

*Updated 2026-08-07 17:20 UTC — PRs #20, #23 and #29 merged to `main`, which clears three of the five rows
that were blocking. What remains is configuration and one real transaction, not code.*

| Item | State | Blocks launch? |
|:---|:---|:---|
| **Live PAC stamp** | **The one that matters.** PR #23 merged, so stamping is real code — but its coverage runs against a mocked `fetch`, and no invoice has been issued through a live Facturapi sandbox. Merging is not verification. | **Yes** — CFDI ships at launch |
| **#2** — OTP provider configuration | Code merged; no credentials in the environment. `OTP_DELIVERY_CHANNEL` unset means 502 and **no quote can be signed**. Never tested on a real handset. | **Yes** — the core loop is dead without it |
| ~~**Production migrations**~~ | ✅ All four are applied to the production project and confirmed by schema inspection (2026-08-08, see the update below). The routes are no longer blocked on schema. What #62 still wants is one live request against each affected route. | Cleared |
| ~~**Product analytics**~~ | ✅ Merged (#56) — the seven-event quote-to-cash funnel is wired. Not yet read against real traffic. | Cleared |
| **#14** — operational setup | Split on 2026-08-07 into #62 (migrations), #63 (Stripe webhook staging), #64 (CLABE gate) so each maps to one P0. #14 now holds the `security-p0-remediation.md` §5 checklist and deployment-doc sign-off. | Yes |
| ~~**#3** / PR #23 — real CFDI via PAC~~ | ✅ Merged. `lib/pacClient.ts` stamps for real; `simulateInvoiceStamping()` and its "graceful fallback" are both gone. | Cleared |
| ~~**#17** / PR #20 — OTP rate limit per phone~~ | ✅ Merged. Issuance is now capped on the recipient phone across quotes. | Cleared |
| ~~Complemento de Pago~~ | ✅ Merged (#29) — filed when a PPD milestone is confirmed. Was P2. | Cleared |
| **#22** — OTP escalating backoff + daily cap | Not started. Hardening on top of #17. | No — can trail launch |

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

---

## 03 Priority Stack

### P0 — Blocking: money and compliance cannot be simulated

✅ **CFDI ships at launch** — decided. PR #23 is merged, so the code is real.

> [!NOTE]
> **One P0, one open issue.** Every row below maps to exactly one open issue and every
> open P0 issue appears below. Rows 1, 4 and 6 were previously all "#14", which meant no
> single one could be closed without implying the others; #14 is now their parent and holds
> only the staging-checklist residue. Verify this table against
> `is:issue is:open label:P0` before trusting it — the list is ordered by dependency, not
> just severity, and rows drop off as they close.

| # | Item | Tracked |
|:--|:---|:---|
| 1 | **Schema is applied — one live request per route is what remains.** On 2026-08-08 the production schema was inspected directly: `20260807000000` and `20260807120000` were already live, `20260807170000` (complementos) was not and has since been applied, along with `20260808030000` (folio RPC grants). All four confirmed present by inspection, not by an exit code. The root dependency is cleared; #62's last exit criterion is a real request against `POST /api/quotes/public/[token]/otp`, `POST /api/invoices/issue` and the complemento path, which needs the founder. | [#62](https://github.com/jesushzv/business-helper/issues/62) |
| 2 | **Configure one OTP channel.** Twilio SMS: fastest to provision, no business-verification wait, and at pilot volume the premium over WhatsApp is a few dollars a month. Set `OTP_DELIVERY_CHANNEL=sms`, then verify a real code lands on a real handset and cannot be replayed. Per-recipient rate limiting is already in place (#20). Without this no quote can be signed at all, so it gates the end-to-end check for everything else. | [#2](https://github.com/jesushzv/business-helper/issues/2) |
| 3 | **Issue one CFDI through a live Facturapi sandbox, end to end.** Confirm a real SAT UUID returns and the stored XML and PDF open. Mocked `fetch` coverage proves the code is correct, not that the integration works — this is the last thing between "merged" and "trustworthy." | [#26](https://github.com/jesushzv/business-helper/issues/26) |
| 4 | **Enable Stripe live mode.** Live secret key, a live Price ID mapped per pricing-page tier, and one real card charged. `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` are marked "Launch Gate — P0" in the roadmap and were tracked **nowhere** until 2026-08-07; #63 covers only the webhook half of §04's "charges a real card in live mode with a verified webhook". Needed before the first trial converts rather than before the first user signs up, which is why it sits below the loop-blocking items. | [#68](https://github.com/jesushzv/business-helper/issues/68) |
| 5 | **Close the remaining holes in the CLABE gate.** Both holes are closed in code (see the 22:30 update): a server-side 409 in front of every path that shares a `/pay/` link, a non-dismissable dashboard banner, disabled share actions, and an onboarding that resumes at the account step. What remains is the issue's third exit criterion — verification against a real deployment with a real organization row, which no PR can satisfy. Needs the founder now, not an agent. | [#64](https://github.com/jesushzv/business-helper/issues/64) |
| 6 | **Verify whether the public `/pay/` route can resolve anything at all.** `quotes` and `contracts` are joined by two foreign keys, and both selects in `app/api/receivables/public/[token]/route.ts` embed `contracts` under `quotes` unhinted. If PostgREST answers PGRST201 there, `error` is truthy and every payment link 404s for every tenant — which would mean the page has never worked, consistent with row 5's live check never having been run. Ranked here, not lower, because it would invalidate rows 5 and the whole SPEI half of the loop; ranked below the credential rows because confirming it needs the deployed environment row 1 gates. A 5-minute curl settles it. | [#79](https://github.com/jesushzv/business-helper/issues/79) |
| 7 | **Stop `useQuotes` asserting a contract that was never created.** `convertToContract` flipped status locally and announced "convertida a contrato con 2 hitos de cobranza" whether or not the route succeeded — the #33 defect on the step that opens the receivable. Promoted from unranked on 2026-08-07. | [#59](https://github.com/jesushzv/business-helper/issues/59) |
| 8 | **Verify Stripe webhook signature enforcement** against a staging account — unsigned requests rejected, duplicate deliveries idempotent. `npm run verify:webhook` exists for this. Least blocking of the six: it protects a path a SPEI-first pilot may barely exercise, and it fails by rejecting a legitimate webhook rather than by fabricating a financial fact. | [#63](https://github.com/jesushzv/business-helper/issues/63) |

**Cleared since this section was first written** (2026-08-07, all verified closed on the tracker):
[#33](https://github.com/jesushzv/business-helper/issues/33) payment confirmation (PR #55) ·
[#36](https://github.com/jesushzv/business-helper/issues/36) `.mx` quote links (PR #47) ·
[#37](https://github.com/jesushzv/business-helper/issues/37) product analytics (PR #56) ·
[#58](https://github.com/jesushzv/business-helper/issues/58) the public signing page rendering a
fixture quote for every token (PR #57) — never listed as a P0 and worse than several that were.

> [!NOTE]
> **Rows 1–6 and 8 need the founder; row 7 needs an agent.** Row 5 moved across on
> 2026-08-07: its code half is done, and what is left is a live check. Row 6 (added 2026-08-08)
> is the same shape — an agent wrote the analysis and the fix, but only a deployed database can
> say whether the defect is real. The founder rows are credentials, accounts, a real handset and
> a real card — no PR can close them. They do not block the agent rows, so the two tracks run in
> parallel, which is most of the slack left in a September date that decision 5 fixed at full
> scope.

> [!IMPORTANT]
> **The scope principle these items serve.** The founder's stated constraint is to launch fast without
> mistaking an incomplete product for weak product-market fit. That gives a sharper rule than "ship the
> MVP": **ship the minimum where a negative result is trustworthy.** Every P0 item above is one that,
> left undone, produces a false negative — users who wanted the product but could not sign a quote,
> could not be invoiced, or dropped out of a funnel nobody was measuring. Anything that cannot generate
> a false negative belongs in P2, however visible it is.

### P1 — Makes launch week survivable

- **Wire real error monitoring** ([#52](https://github.com/jesushzv/business-helper/issues/52)).
  Add `@sentry/nextjs` (or an equivalent that actually transmits) and route alerts to your phone.
  Currently a console shim; you are solo and will not otherwise see a 500.
- **Point the domain at Vercel.** `businesshelper.app` is the domain; `.mx` was never registered. Docs and
  `.env.example` are corrected; the source instance was #36, **now closed** (PR #47) — the remaining work
  here is DNS, not code. Confirm the apex resolves with SSL, then sync the Supabase Auth Site/Redirect
  URLs and the Stripe webhook endpoint to it. No issue tracks the DNS step; it is a founder action.
- **Require the `CI` check in branch protection** ([#38](https://github.com/jesushzv/business-helper/issues/38)).
  CI was silently absent on PR #28 for ten hours across four pushes while Vercel and GitGuardian reported
  green, so the PR looked checked. The cause is still unexplained — which is the argument for a rule that
  fails closed rather than one that depends on understanding it.
- **OTP escalating backoff + daily cap** (#22) — without it, a pilot user legitimately signing several
  quotes in one sitting can lock themselves out against the flat 5/hour window.
- **One real production smoke test:** register → quote → WhatsApp send → OTP sign → SPEI upload → confirm.
- **CFDI folio billing.** Folio packs are advertised but cannot be bought ([#24](https://github.com/jesushzv/business-helper/issues/24)),
  and the Inicial tier's pay-per-folio pricing has no billing behind it ([#27](https://github.com/jesushzv/business-helper/issues/27)).
  CFDI ships at launch, so this is revenue the pricing page promises and the product cannot collect.
- ~~**Make the lint warning gate real** ([#46](https://github.com/jesushzv/business-helper/issues/46)).~~
  **Done 2026-08-08** — script is `next lint --max-warnings=0`, all 22 warnings cleared (the
  count settled at 22 after being recorded as 1, 3 and 23; the gate being fail-open is exactly
  why the debt grew unnoticed). Failure verified with a planted warning. Remaining follow-up is
  the `next/image` migration for the 8 PNG screenshot sites, tracked as
  [#82](https://github.com/jesushzv/business-helper/issues/82) (P2).

### P2 — Can trail launch by weeks

- Complemento de pago gaps: the request body has never reached a real PAC ([#34](https://github.com/jesushzv/business-helper/issues/34)),
  the accountant export omits complementos ([#31](https://github.com/jesushzv/business-helper/issues/31)),
  and one stamped in error cannot be cancelled ([#30](https://github.com/jesushzv/business-helper/issues/30)).
  *(Filing on PPD confirmation itself landed in #29.)*
- Migrations never execute against a real Postgres in CI, so RLS, grants and CHECK constraints are
  unverifiable ([#35](https://github.com/jesushzv/business-helper/issues/35)).
- `parseNaturalLanguageQuery` is keyword matching rather than a model. It now reports `engine: 'rules'`
  instead of implying otherwise, so it is honest but not intelligent. Degrades gracefully; does not gate launch.
- Animated demo video — storyboarded in [`demo_video_storyboard.md`](03-product-specs/demo_video_storyboard.md), not produced.

---

## 04 Launch Gate

Run top to bottom before announcing. Every P0 item above collapses into one of these.

### Money path integrity
- [ ] A CFDI issued in the app corresponds to a real SAT UUID ([#26](https://github.com/jesushzv/business-helper/issues/26)) — CFDI ships at launch, so this is required
- [ ] Stripe checkout charges a real card in live mode ([#68](https://github.com/jesushzv/business-helper/issues/68)) with a verified webhook ([#63](https://github.com/jesushzv/business-helper/issues/63)) — two halves, tracked separately
- [ ] Every pilot organization has a real CLABE, and payment confirmation reflects a real transfer ([#64](https://github.com/jesushzv/business-helper/issues/64))
- [x] A failed confirmation write is reported as failed, not as `confirmed` (#33, PR #55)
- [ ] A failed quote→contract conversion is reported as failed, not announced as a payment schedule ([#59](https://github.com/jesushzv/business-helper/issues/59) — fixed in code, unexercised against a deployment)

### Signature & communications integrity
- [ ] A signer receives a real OTP on a real handset within ~10s on the configured channel ([#2](https://github.com/jesushzv/business-helper/issues/2))
- [x] The quote link a client receives resolves (#36, PR #47)
- [x] The page behind that link shows the client's real quote, not a fixture (#58, PR #57)
- [x] OTP issuance is capped per recipient phone, not per quote (#20 merged)
- [x] Outbound WhatsApp reminders actually send (#13)

### Operational floor
- [x] Production Supabase migrations applied — all three from #20, #23 and #29, plus `20260808030000_folio_rpc_grants.sql`; confirmed by inspecting the live schema on 2026-08-08. One live request per affected route still owed ([#62](https://github.com/jesushzv/business-helper/issues/62))
- [ ] Error monitoring transmits and alerts reach the founder within minutes ([#52](https://github.com/jesushzv/business-helper/issues/52))
- [x] The funnel is instrumented, so a weak result can be diagnosed (#37, PR #56) — wired, not yet read against real traffic
- [x] Lint, typecheck, and **640** vitest tests / 79 files pass; CI runs on PRs (verified on #28 after ten hours of silent absence — see [#38](https://github.com/jesushzv/business-helper/issues/38))

### Commercial gate (inherited)
The [go-to-market plan](01-strategy/go-to-market-plan.md) sets a Gate 0 before paid acquisition:
Launch Readiness ≥ 7.0, Mobile ≥ 6.0, Credibility ≥ 7.0.

> [!NOTE]
> [`product_readiness_workback.md`](99-archive/product_readiness_workback.md) records Gate 1 as **passed at 7.5/10**,
> while the go-to-market plan still cites the original **5.35/10** and blocks paid spend. Both scores predate
> the simulation findings in §02 — they assessed the landing page and funnel, not whether the money path was
> real. Treat every score as stale-optimistic and re-score after the P0 items land.

---

## 05 Open Decisions

These require the founder and are not resolvable from the codebase.

1. ~~**Does CFDI invoicing ship at launch, or is it deferred?**~~ **Resolved 2026-08-07 — CFDI ships
   at launch.** Confirmed by the founder. The deferral option (Quotes + AR + Client CRM only, closer
   to the PRD's own leaner MVP) is off the table, so [#26](https://github.com/jesushzv/business-helper/issues/26)
   — one real stamp through a live Facturapi sandbox — is genuinely blocking rather than negotiable.
2. **Which OTP channel — Twilio SMS, Twilio WhatsApp, or Meta Cloud API?** All three are implemented.
   Is an account provisioned, and is WhatsApp Business API approval (which takes days) already in motion?
3. **Are there real CLABE account numbers for the pilot organizations?**
4. ~~**`businesshelper.app` or `businesshelper.mx`?** Docs and commit history disagree.~~
   Resolved — the domain is `businesshelper.app`; `.mx` was never registered (see P1 §03 and #36).
   *(This line originally read ".app or .app" — a typo that erased the question it was asking.)*
5. ~~**Does the September launch date hold?**~~ **Resolved 2026-08-07 — the September date holds,
   at full scope.** Confirmed by the founder alongside decision 1.

   > [!IMPORTANT]
   > **Both halves of the trade were taken, so the schedule has no relief valve left.** The original
   > framing offered a choice: hold the date by cutting CFDI, or keep scope and slip. Keeping both
   > means all eight P0 items in §03 must land, and the only remaining variable is hours —
   > which is decision 7, still open. If the P0 list starts slipping, the next lever is not scope
   > or date but pilot count: recruit fewer pilots for a longer, closer-watched first cohort.
6. **Ad budget and platform for pilot recruiting**, given pilots are being recruited cold rather than
   from a warm list.
7. **Realistic weekly hours**, given the founder holds a full-time job. This determines whether
   "1–2 focused weeks" is two calendar weeks or closer to a month.
8. ~~**Merge posture on PRs #20 and #23** — review and merge, or founder reads them first?~~
   Moot — both merged to `main` on 2026-08-07 (see §02).
9. **Preferred pivot path** if the kill criteria in [`okrs.md`](01-strategy/okrs.md) trigger. Three
   candidates: narrow to a single module; freeze development for a validation-only sprint; or wind down
   cleanly and redirect the time. Worth deciding while calm rather than mid-crisis.

---

## 06 Verification Method

So this reconciliation can be repeated rather than trusted:

```bash
npm ci
npx vitest run                 # 640 tests / 79 files as of the 2026-08-07 doc consolidation
                               # (494/64 at the #20/#23/#29 merge; 569/76 after #57; 594/78 after #67)
npm run typecheck
npm run lint
node -e "console.log(Object.keys(require('./package.json').dependencies))"
```

Claims about a third-party integration were checked by locating the actual outbound call
(`grep -rn "api.stripe.com\|api.twilio.com\|graph.facebook.com\|facturapi.io" lib app`) rather than by
reading the module name or the doc. A module named after a provider is not evidence that the provider
is contacted — that was precisely the failure mode in §01.

**Rule going forward:** a feature is "done" when its outbound call has executed against the real service
at least once. Passing tests against a mocked `fetch` mean the code is correct, not that the integration works.

---

*Single source of truth for status. Enforced by `tests/unit/docsStatusAuthority.test.ts`.
Doc map: [AGENTS-DOCS-GUIDE.md](AGENTS-DOCS-GUIDE.md).*
