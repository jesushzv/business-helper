<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# STATUS — Business Helper

> **The single source of truth for what is and is not done.**
>
> *Last verified: 2026-08-11 22:00Z. Suite re-run for this pass; merge state of every §02 row
> confirmed with `git log`; the P0 table re-derived from `is:issue is:open label:P0` rather than
> trusted (it was carrying a closed row); the launch-gate settlement query and the organization
> census run against the production catalog.*
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

A security review on 2026-08-06 found that features the roadmap marked **Completed** were
*simulated*: the UI and data model existed, but the third-party call underneath was faked. The worst
case fabricated an invoice id and two storage URLs and wrote `cfdi_status: 'issued'` — a business
owner could read their own dashboard, believe they had invoiced a client, and file accordingly.

The takeaway is procedural: **the sprint history is not a map of what is launch-safe**, and every
completion claim needs checking against source. That is what this file is for. The full 2026-08-06
findings are in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).

## 02 Verified State of `main`

### Merged and real

Seven changes (PRs #1, #11, #13, #16, #19, #21, #137) — the P0 money-path hardening, real outbound
WhatsApp, real checkout/invites/export, CI + migration tooling, the test-runner retirement and the
agent-authority split. Moved verbatim to
[`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md) on 2026-08-11; all merged
long ago and none of it is live state.

### Corrected baseline metrics

| Metric | Docs claimed | Actually verified (2026-08-07) |
|:---|:---|:---|
| Test suite | 182/182 via `scripts/test-runner.js` | **1602 tests / 166 files**, measured on this branch off `main` @ `3d0f975` (2026-08-11), `npx vitest run` — runner file no longer exists |
| Error monitoring | "Sentry Monitoring Live … instant alerts to founder's phone" | ~~**Not live.** `lib/sentry.ts` only called `console.error`.~~ **Code transmits since 2026-08-11** — envelope endpoint over raw `fetch`, no SDK; PII scrubbed; `dispatchedToSentry` no longer claims a dispatch that did not happen. Found on the way: the old DSN check (`includes('@sentry')`) matched **no** real Sentry DSN, so a configured deployment read as unconfigured. **Still not alerting**: no DSN is set anywhere, and every result is against a mocked `fetch` (this container has no egress). #52 stays open on that. |
| Stripe integration | "Install `stripe` package and call `stripe.checkout.sessions.create()`" | No `stripe` SDK dependency. Implemented as raw REST against `api.stripe.com/v1` in `lib/stripeClient.ts` — functionally fine, but not what the doc describes |
| Twilio / Gemini | SDK integrations | No SDK dependencies. Raw REST in `lib/otpDelivery.ts`, `lib/whatsappOutbound.ts`, `lib/whatsappAI.ts` |
| E2E | "14/14 Playwright scenarios passing" | `playwright.config.ts` and `tests/e2e/` exist; not run in this verification pass — treat as unverified |
| Zero-warning lint gate | "ESLint passes with `--max-warnings=0`" (5 docs) | ~~Gate was nominal — bare `next lint`, exit 0 with warnings.~~ **Enforced since 2026-08-08 (#46):** script is `next lint --max-warnings=0`, debt cleared to 0, failure verified with a planted warning. |

> [!IMPORTANT]
> **The Sentry finding matters disproportionately for a solo founder**: error monitoring is the only
> thing that reports a production 500 when nobody is watching. The code half landed 2026-08-11; what
> is left is a DSN on Vercel and one thrown error proving an alert arrives. P1 in §03.

### Open and blocking

*What remains here is configuration and one real transaction, not code. Cleared rows are collapsed
into one line; their reasoning is in the frozen log.*

| Item | State | Blocks launch? |
|:---|:---|:---|
| **Live PAC stamp** | **The one that matters.** PR #23 merged, so stamping is real code — but its coverage runs against a mocked `fetch`, and no invoice has been issued through a live Facturapi sandbox. Merging is not verification. | **Yes** — CFDI ships at launch |
| ~~**#2** — OTP provider configuration~~ | ✅ **Email channel live and verified end to end (2026-08-11)** — a real inbox signed a real quote, evidence read back from the live catalog; detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md). sms/whatsapp stay wired but deprecated. | Cleared |
| ~~**Stripe live mode**~~ | ✅ **A real card completed the loop (2026-08-11).** The `STRIPE_PRICE_*` variables held Stripe **Product** ids, so checkout answered `502 No such price: 'prod_…'` for every tier and the live account had never had a session; the founder set the Price ids, then subscribed and Ajustes showed "Activo". **Correction, same day, read back from Stripe and the catalog:** this row first said "$599, plan Negocio", founder-confirmed with no read-back — the account's full charge history shows **Plan Inicial, $299.00 MXN** (`price_1U0CxLDuvxyuzaREdO7Jsp3E`; one Mastercard success after three Amex declines — Amex is not accepted), the subscription's `metadata.tier_id` is `inicial`, and the organization row reads `inicial`/`active` with both Stripe ids stored (#115 working): the webhook wrote exactly what was bought. The charge was later **refunded**, but `sub_1U3L0tDuvxyuzaREpEbWl6eI` is still **active** and re-bills 2026-09-10 unless cancelled. If Ajustes really showed *Negocio*, that is a rendering defect only a browser can confirm. Code half in PR #166 (a non-price value now refuses with a 503 naming the variable) and #181 (plan CTAs stopped sending a signed-in owner into the registration form). | Cleared |
| ~~**Production migrations**~~ | ✅ Applied to production and confirmed by schema inspection (2026-08-08). #62's remaining ask is one live request per affected route. | Cleared |
| ~~Five more~~ | ✅ Cleared 2026-08-07→09, detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md): product analytics (#56); real CFDI via PAC (#3, PR #23); OTP per-phone rate limit (#17, PR #20); Complemento de Pago (#29); OTP escalating backoff + daily cap (#22, PR #112, carries migration `20260809120000`). | Cleared |

**One organization per owner is a schema invariant, applied to production 2026-08-11**
(`uq_organizations_owner_id`, `20260811150000` — #109 decided, #168 closed). Verified live: the
index reads back `indisunique`/`indisvalid`, and a probe INSERT of a second organization for an
existing owner was **refused** with `23505`. Two blocking rows were found first — one owner held two
`— BORRAR` test organizations, so #168's "0 duplicates" was stale — and the older was deleted with
its client and quote.

### Recently landed (2026-08-07 → 2026-08-08)

Eight merged changes moved to [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).
**What none of it changed:** every row was verified against **mocked** providers, so the §03 items
needing a real handset, card, PAC stamp or deployed database are untouched by all of it.

---

## 03 Priority Stack

### P0 — Blocking: money and compliance cannot be simulated

✅ **CFDI ships at launch** — decided. PR #23 is merged, so the code is real.

> [!NOTE]
> **One P0, one open issue.** Every row below maps to exactly one open issue and every open P0
> issue appears below. **Verify this table against `is:issue is:open label:P0` before trusting
> it** — rows drop off as they close, and the list is ordered by dependency, not just severity.
>
> That instruction has earned itself repeatedly — most sharply on 2026-08-11, when **two parallel
> PRs each re-derived this table an hour apart and both got it wrong**. One dropped #64's row
> (closed 20:44Z) and kept #63; the other dropped #63's row (last criterion met in production
> 21:30Z) and kept #64. Each was right about the issue it had just closed and stale about the
> other, and both wrote "3 open P0s". Merging them textually would have kept one number and lost
> the other's row — #138's failure exactly. **Re-derived from the tracker at merge time,
> 2026-08-11 22:30Z: 2 open P0s against the 2 rows below** — #62, #26.
>
> The lesson is not "run the query" but *run it at the moment you write the number*: it went stale
> inside an hour, twice, while two sessions were each being careful. Earlier disagreements
> (11 open against 7 rows on 2026-08-09) and the full re-derivation history are in
> [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).

| # | Item | Tracked |
|:--|:---|:---|
| 1 | **Schema is applied — one live request per route is what remains.** On 2026-08-08 the production schema was inspected directly: `20260807000000` and `20260807120000` were already live, `20260807170000` (complementos) was not and has since been applied, along with `20260808030000` (folio RPC grants) and `20260809000000` (organization phone). All confirmed present by inspection, not by an exit code. The root dependency is cleared; #62's last exit criterion is a real request against `POST /api/quotes/public/[token]/otp`, `POST /api/invoices/issue` and the complemento path. **The OTP route got its real request on 2026-08-11** (the email-channel verification, §02); the invoice and complemento paths remain. | [#62](https://github.com/jesushzv/business-helper/issues/62) |
| 2 | **Issue one CFDI through a live Facturapi sandbox, end to end.** Confirm a real SAT UUID returns and the stored XML and PDF open. Mocked `fetch` coverage proves the code is correct, not that the integration works — this is the last thing between "merged" and "trustworthy." | [#26](https://github.com/jesushzv/business-helper/issues/26) |

**The UX-audit trio is closed** (#93, #95, #96), each checked against production rather than argued
— transcripts in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md). Residue stays
open in #103/#99 and #113/#114/#123/#124, plus two gaps pinned by unit tests only: a non-owner's
read-only Ajustes, and `/pay`'s no-invented-bank path, which needs a tenant with a contract.

**Two of the three open `bug`-tagged issues are closed in code**, with #115 alongside them. (The third is #204, filed 2026-08-11 and untouched — see the note after this block.) #116: the webhook
no longer writes a Checkout Session's `'complete'` into `subscription_status` — a value
`chk_subscription_status` rejects, failing the write *after* the event is claimed — and an unknown
status is no longer badged "Cancelado" to someone who has just paid. #133: `requireOrgAccess`
resolves the tenant deterministically and logs the ambiguity instead of picking a row at random.
#115: `stripe_customer_id` and `stripe_subscription_id` are stored for the first time, so upgrades
stop minting duplicate Stripe customers and a subscription can be cancelled from the app at all.
Tests, lint and build only: **no live Stripe event, no second organization row**.

**#204's central claim is wrong, and the issue needs correcting before anyone writes SQL for it.**
It reports that `trial_ends_at` is a column production holds and no migration creates, citing
`git grep 'trial_ends_at' -- supabase/migrations` returning nothing at `aedf521`. Re-run at exactly
that commit, that grep returns **9 matches**: the column is declared in
`20260811150000_organization_trial.sql:27` and predates the issue. What *is* genuinely undeclared —
confirmed against `pg_indexes` on production 2026-08-11 — is the two **indexes**,
`idx_organizations_owner_id` and `idx_organizations_trial_ends_at`. So the fix is a decision about
two redundant indexes, not a column backfill. A migration written to the issue as filed would add a
column that already exists.

**UX-audit work landed 2026-08-11** across nine issues — #87/#100 (one accessible Modal),
#127 (one SAT régimen catalogue), #88/#90 (six 375px overflows), #99 (no double-fire on
convert-to-contract; destructive actions ask first), #114/#124 (demo flag yields to a real
session; an all-zero API answer is an answer), #89/#101 (48px floor, focus ring, labels;
gate `a11yBaseline.test.ts`), #103 (jargon out of rendered copy; gate `copyRules.test.ts`),
#104 (share actually shares; gate `flowPolish.test.ts`). Per-issue detail in
[`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).
**All verified by unit/component tests only** — none re-checked against production or a real
handset, which is the part no agent supplies.

**CFDI cancellation stays out of the app for launch** (#174, decided): the route ships with no UI
caller — it needs a motivo, the `01` replacement UUID, receptor refusal and an async SAT answer
(#30). Tenants cancel at their PAC portal; the stamping dialog says so, and
`tests/unit/cfdiCancelHasNoUiCaller.test.ts` fails the build if a caller appears.

The audit is closed. Deferred as decisions: #174 (CFDI cancel UI), #185 (plan naming).

**Resolved off this table** (2026-08-07→08, all verified closed): #79, #76, #59, #33, #36, #37, #58
— detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).

> [!NOTE]
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
> the hydrated page alone, confirmed in a browser the same day. **#64 followed the same day**: its server-side refusals were confirmed against the deployed
> app — 409 before a WhatsApp dispatch and on the public payer route, the gate then shown to open
> once a CLABE was saved. Its rendered-page half was waived by the founder rather than taken, the
> one criterion here closed by decision instead of by evidence.

> [!IMPORTANT]
> **The scope principle these items serve.** The founder's stated constraint is to launch fast without
> mistaking an incomplete product for weak product-market fit. That gives a sharper rule than "ship the
> MVP": **ship the minimum where a negative result is trustworthy.** Every P0 item above is one that,
> left undone, produces a false negative — users who wanted the product but could not sign a quote,
> could not be invoiced, or dropped out of a funnel nobody was measuring. Anything that cannot generate
> a false negative belongs in P2, however visible it is.

### P1 — Makes launch week survivable

- **Wire real error monitoring** ([#52](https://github.com/jesushzv/business-helper/issues/52)).
  **The code half landed 2026-08-11**: `lib/sentry.ts` posts a Sentry envelope over raw `fetch`
  (no SDK, matching every other integration here), scrubs email/RFC/CLABE/phone from messages,
  stack traces and extras while keeping `organization_id` and `route`, and reports a *started*
  send rather than a confirmed one. The existing boundaries in `app/global-error.tsx` and
  `app/(dashboard)/error.tsx` already called `captureException`, so they report with no change.
  A latent bug went with it: the old configured-check matched no DSN Sentry actually issues.
  **What remains is founder-only and is the whole exit criterion** — set `SENTRY_DSN` on Vercel,
  throw an error in a deployed route, confirm the alert arrives carrying its `organization_id`
  and route and no personal data. Until then nothing alerts, and `global-error.tsx` still tells
  users they were notified automatically.
- **Point the domain at Vercel.** `businesshelper.app` is the domain; `.mx` was never registered. Docs and
  `.env.example` are corrected; the source instance was #36, **now closed** (PR #47) — the remaining work
  here is DNS, not code. Confirm the apex resolves with SSL, then sync the Supabase Auth Site/Redirect
  URLs and the Stripe webhook endpoint to it. No issue tracks the DNS step; it is a founder action.
- **Require the `CI` check in branch protection** ([#38](https://github.com/jesushzv/business-helper/issues/38)).
  CI was silently absent on PR #28 for ten hours across four pushes while Vercel and GitGuardian reported
  green, so the PR looked checked. The cause is still unexplained — which is the argument for a rule that
  fails closed rather than one that depends on understanding it.
- ~~**OTP escalating backoff + daily cap** (#22).~~ **Merged 2026-08-09 (PR #112)** — per-phone
  doubling backoff, 15/day cap, and #60's decision: a provider failure throttles the phone but
  releases the quote's lifetime slot. Carries migration `20260809120000`; confirm it is applied
  before relying on OTP issuance (hard rule 6).
- **Register one client in the app, to close #146**
  ([#146](https://github.com/jesushzv/business-helper/issues/146)). Reported from real use on
  2026-08-10: registration could not be completed, and no message said which field was at fault.
  **The cause was RLS, not the form.** `user_organization_ids()` — the whole tenant check for nine
  policies — resolved membership from `organization_members` alone, and nothing creates a member row
  for an organization's *owner*. Both production organizations have none, so their owners were
  denied every write to `clients`, `quotes`, `contracts`, `milestones`, `products` and four more.
  `requireOrgAccess()` disagreed (it reads `organizations.owner_id` and returns `role: 'owner'`), so
  auth passed and only the INSERT was refused, as `42501`, reported as a generic 500. Confirmed by
  impersonating the founder's `auth.uid()` in production: 0 rows from the function, `42501` on
  `clients` and `quotes`.
  **Migration `20260811000000` was applied to production on 2026-08-11** and the new definition read
  back from `pg_get_functiondef` — the UNION over owned organizations, `SECURITY DEFINER`,
  `search_path` pinned. Its *behaviour* was proven pre-apply against the byte-identical definition in
  a rolled-back transaction (own-org INSERT succeeded; other-tenant INSERT still refused `42501`);
  the same probe **has not been re-run against the live function**, because the Supabase connector's
  tool approvals reset mid-session. PR #150 carries the migration file and tests. Landed separately
  in PR #147: every bad field reported at once keyed by column, a failed write naming its cause
  instead of one opaque 500, per-field messages in the form, and the RFC no longer gating
  registration. This row closes when a client is registered through the UI.
- ~~**A failed write must name its cause** ([#148](https://github.com/jesushzv/business-helper/issues/148)).~~
  **Done 2026-08-11** — the eleven routes classify the error instead of discarding it (503 naming
  the column, 400 pinned to its input, 403, 500) and log it. Scanning per *branch* found four more,
  plus a live defect: `constraintName()` read the relation, not the constraint, so no CHECK was ever
  attributed. Gate proven red on a planted revert.
- **One real production smoke test:** register → quote → WhatsApp send → OTP sign → SPEI upload → confirm.
- **CFDI folio billing.** Folio packs are advertised but cannot be bought ([#24](https://github.com/jesushzv/business-helper/issues/24)),
  and the Inicial tier's pay-per-folio pricing has no billing behind it ([#27](https://github.com/jesushzv/business-helper/issues/27)).
  CFDI ships at launch, so this is revenue the pricing page promises and the product cannot collect.

### P2 — Can trail launch by weeks

- Complemento de pago gaps: the request body has never reached a real PAC ([#34](https://github.com/jesushzv/business-helper/issues/34)),
  the accountant export omits complementos ([#31](https://github.com/jesushzv/business-helper/issues/31)),
  and one stamped in error cannot be cancelled ([#30](https://github.com/jesushzv/business-helper/issues/30)).
  *(Filing on PPD confirmation itself landed in #29.)*
- ~~Migrations never execute against a real Postgres in CI
  ([#35](https://github.com/jesushzv/business-helper/issues/35)).~~ **In the 2026-08-09 non-P0 bulk
  PR (pending merge):** CI's `migration-verify` job applies the full set twice to Postgres 16 under
  a faithful Supabase shim (including the default-privilege auto-grants — the #76 trap), seeds a
  tenant, and asserts anon isolation, service_role access, the OTP phone CHECK, SECURITY DEFINER
  grants via `aclexplode`, and RLS-on-every-table. Shown red against a planted anon leak. Making
  double-apply pass surfaced 16 non-idempotent statements, all fixed. Requiring the check in
  branch protection remains #38.
- `parseNaturalLanguageQuery` is keyword matching rather than a model. It now reports `engine: 'rules'`
  instead of implying otherwise, so it is honest but not intelligent. Degrades gracefully; does not gate launch.
- Animated demo video — storyboarded in [`demo_video_storyboard.md`](03-product-specs/demo_video_storyboard.md), not produced.

---

## 04 Launch Gate

Run top to bottom before announcing. Every P0 item above collapses into one of these.

### Money path integrity
- [ ] A CFDI issued in the app corresponds to a real SAT UUID ([#26](https://github.com/jesushzv/business-helper/issues/26)) — CFDI ships at launch, so this is required
- [x] Stripe checkout charges a real card in live mode ([#68](https://github.com/jesushzv/business-helper/issues/68), closed 2026-08-11 — Plan Inicial at $299.00 MXN; the §02 record first said $599 Negocio and was corrected from Stripe's charge history) with a verified webhook ([#63](https://github.com/jesushzv/business-helper/issues/63) — four rejection checks against a real runtime 2026-08-09; accept-and-apply and redelivery idempotency in production 2026-08-11). `npm run verify:stripe` stays the read-only pre-check for account and price-map failures
- [ ] Each tier's live Price ID bills the amount the pricing page advertises ([#68](https://github.com/jesushzv/business-helper/issues/68)) — a mismatched map charges the wrong amount and reports success everywhere; `npm run verify:stripe` is the check
- [ ] Every pilot organization has a real CLABE, and payment confirmation reflects a real transfer — an operational check on live rows, which closing #64 (the code gate) does not satisfy: since #164 the accounts live in `bank_accounts`, so the query is `select o.id, o.name from organizations o where not exists (select 1 from bank_accounts b where b.organization_id = o.id and b.archived_at is null);` — the older `organizations.bank_clabe is null` form now reads a legacy mirror column, not the source. It must return no row belonging to a pilot tenant who intends to be paid — since #163 a tenant may also have removed their account deliberately, so a row here is a question to ask, not automatically a defect. Run against production 2026-08-11 22:00Z it returned one, `QA #128 trial default — BORRAR`, a test row that should be deleted rather than filled in. **Only two organizations exist in production at all** — the founder's and that QA row — so there is no pilot cohort behind this gate yet
- [x] A failed confirmation write is reported as failed, not as `confirmed` (#33, PR #55)
- [ ] A failed quote→contract conversion is reported as failed, not announced as a payment schedule ([#59](https://github.com/jesushzv/business-helper/issues/59) — fixed in code, unexercised against a deployment)

### Signature & communications integrity
- [x] A signer receives a real OTP in a real inbox on the configured channel (#2; verified 2026-08-11 — send accepted 04:57:25Z, the quote was signed and sealed 24 seconds later)
- [x] The quote link a client receives resolves (#36, PR #47)
- [x] The page behind that link shows the client's real quote, not a fixture (#58, PR #57)
- [x] OTP issuance is capped per recipient contact (email or phone), not per quote (#20 merged; recipient key widened for email 2026-08-11)
- [x] Outbound WhatsApp reminders actually send (#13)

### Operational floor
- [x] Production Supabase migrations applied — all three from #20, #23 and #29, plus `20260808030000_folio_rpc_grants.sql`; confirmed by inspecting the live schema on 2026-08-08. One live request per affected route still owed ([#62](https://github.com/jesushzv/business-helper/issues/62))
- [ ] Error monitoring transmits and alerts reach the founder within minutes ([#52](https://github.com/jesushzv/business-helper/issues/52)) — the code transmits since 2026-08-11 but no DSN is configured, so nothing has alerted yet
- [x] The funnel is instrumented, so a weak result can be diagnosed (#37, PR #56) — wired, not yet read against real traffic
- [x] Lint, typecheck, and **1602** vitest tests / 166 files pass; CI runs on PRs (verified on #28 after ten hours of silent absence — see [#38](https://github.com/jesushzv/business-helper/issues/38))

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

These require the founder and are not resolvable from the codebase. **Still open:**

1. **Are there real CLABE account numbers for the pilot organizations?** Each pilot can now hold
   several (#164), so this is per-organization rather than one CLABE for the account.
2. **Ad budget and platform for pilot recruiting**, given pilots are being recruited cold rather
   than from a warm list.
3. **Realistic weekly hours**, given the founder holds a full-time job. This determines whether
   "1–2 focused weeks" is two calendar weeks or closer to a month.
4. **Preferred pivot path** if the kill criteria in [`okrs.md`](01-strategy/okrs.md) trigger:
   narrow to one module, freeze for a validation-only sprint, or wind down and redirect the time.
   Worth deciding while calm rather than mid-crisis.

**Resolved recently**, kept here because live work still references them. **Their issues are still
open on the tracker** — #123, #128 and #109 were each decided and implemented (a4ea82d, #188/#189)
but never closed, so `is:issue is:open label:decision` overstates what is undecided. Tracker
hygiene, not a status disagreement; closing them is a one-line comment each:

- ~~**Which roles may set a client's trade-credit line?**~~ **Owners and managers** (#123), via
  `manage_credit`; a change without it is a 403 per column. Whether the limit restrains a quote is
  #203.
- ~~**What does a never-subscribed org get?**~~ **A 30-day trial** (#128). Expiry blocks new
  quotes, contract conversion, CFDI stamping, complementos and outbound reminders (#195 widened
  this past quotes alone); collecting, correcting and every public `/q/` and `/pay/` page stay
  open. Both migrations applied and read back.
- ~~**Is one organization per owner the invariant?**~~ **Yes, and it is in the schema**
  (`uq_organizations_owner_id`, `20260811150000`; #109/#168). Multi-org ownership now needs that
  index dropped deliberately, rather than being permitted by omission.

> [!IMPORTANT]
> **The schedule has no relief valve left.** CFDI ships *and* the September date holds — both
> halves of the trade were taken (resolved 2026-08-07), so every P0 row in §03 must land and the
> only remaining variable is hours, decision 3 above. If the list slips, the next lever is not
> scope or date but pilot count: fewer pilots, longer and more closely watched.

Five older resolved decisions — CFDI ships at launch, email/Resend as the OTP channel, `.app` over
`.mx`, the September date, and the #20/#23 merge posture — are in
[`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md) with their reasoning, moved
on 2026-08-11 when this file reached its budget.

---

## 06 Verification Method

So this reconciliation can be repeated rather than trusted:

```bash
npm ci
npx vitest run                 # figure in the §02 metrics row; earlier counts
                               # are in 99-archive/status-log-2026-08.md
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
