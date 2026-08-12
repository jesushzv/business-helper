<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# STATUS — Business Helper

> **The single source of truth for what is and is not done.**
>
> *Last verified: 2026-08-11 23:59Z. Suite re-run for this pass; the P0 table re-derived from
> `is:issue is:open label:P0` rather than trusted — which is what caught the #64 row outliving its
> issue; the launch-gate settlement query, the organization census and the `decision` label run
> against the production catalog and the tracker. Method in §06.*

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

That test also holds this file to **32 KB**, and the budget is what forces the archive step: when it
trips, move settled history to [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md)
rather than raising the number. **State a number once.** A count restated in a second section drifts
from the first — this file carried `1576 tests / 165 files` in §02 and `722 tests / 87 files` in §04
simultaneously, and #138 tracks the conflict-on-every-parallel-PR problem that grows it.

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
completion claim needs checking against source. The full findings are in
[`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).

## 02 Verified State of `main`

### Live metrics

| Metric | State |
|:---|:---|
| Test suite | **1637 tests / 168 files**, `npx vitest run` on `main` @ `719ec20` plus the Sentry SDK branch (2026-08-12). The `scripts/test-runner.js` that reported "182/182" no longer exists |
| Coverage gate | 85/85/80/80 is configured and **fails**; CI does not run it ([#51](https://github.com/jesushzv/business-helper/issues/51)). Judge a change on the delta, not the absolute |
| Error monitoring | ~~Not live — `lib/sentry.ts` only called `console.error`.~~ ~~Code transmits since 2026-08-11 over a raw `fetch` envelope.~~ **On `@sentry/nextjs` since 2026-08-12**, across browser, Node and Edge, with tracing, masked session replay, logs and profiling. Coverage was the reason: the hand-rolled transport could not see an unhandled Server Component, render or Edge error. PII scrubbing is `beforeSend`; `sendDefaultPii` is off. **DSN configured on Vercel 2026-08-12** and #52 closed on that basis; no session has observed an alert arriving, so the delivery half is founder-confirmed setup rather than evidence ([#52](https://github.com/jesushzv/business-helper/issues/52)) |
| E2E | `playwright.config.ts` and `tests/e2e/` exist; **never executed in any verification pass** ([#69](https://github.com/jesushzv/business-helper/issues/69)) and 8 of 10 scenarios are stale, two asserting defects since remediated ([#91](https://github.com/jesushzv/business-helper/issues/91)). Treat every Playwright claim as unverified |

> [!IMPORTANT]
> **The Sentry finding matters disproportionately for a solo founder**: error monitoring is the only
> thing that reports a production 500 when nobody is watching. The code half landed 2026-08-11; what
> is left is a DSN on Vercel and one thrown error proving an alert arrives. P1 in §03.

### Open and blocking

*One row left. Everything cleared — OTP provider config (#2), Stripe live mode (#68), the production
migrations — is in the archive with its reasoning.*

| Item | State | Blocks launch? |
|:---|:---|:---|
| **Live PAC stamp** | **The one that matters.** PR #23 merged, so stamping is real code — but its coverage runs against a mocked `fetch`, and no invoice has been issued through a live Facturapi sandbox. Merging is not verification. | **Yes** — CFDI ships at launch |

**Everything verified before 2026-08-09 was verified against mocked providers.** The items in §03
that need a real handset, card, PAC stamp or deployed database are untouched by any of it.

### Schema state

**One organization per owner is a schema invariant, applied to production 2026-08-11**
(`uq_organizations_owner_id`, `20260811150000`). Verified live: the index reads back
`indisunique`/`indisvalid`, and a probe INSERT of a second organization for an existing owner was
**refused** with `23505`. Two blocking rows were found first — one owner held two `— BORRAR` test
organizations, so #168's "0 duplicates" was stale — and the older was deleted with its client and
quote. The decision behind it is recorded; [#109](https://github.com/jesushzv/business-helper/issues/109)
is still open on the tracker.

**Production holds schema no migration creates** ([#204](https://github.com/jesushzv/business-helper/issues/204),
open): `idx_organizations_owner_id` and `idx_organizations_trial_ends_at` — and therefore the
`trial_ends_at` **column** — are in the live catalog and in no file under `supabase/migrations/`.
This is #96's defect with the arrow reversed, and it means a fresh database (including CI's) does not
match production. Nothing depending on `trial_ends_at` can be trusted to behave the same in both.

---

## 03 Priority Stack

### P0 — Blocking: money and compliance cannot be simulated

✅ **CFDI ships at launch** — decided. PR #23 is merged, so the code is real.

> [!NOTE]
> **One P0, one open issue.** Every row below maps to exactly one open issue and every open P0 issue
> appears below. **Re-derive from `is:issue is:open label:P0` before trusting this table** — rows
> drop off as issues close, and the list is ordered by dependency, not severity.
> **Re-derived 2026-08-11 23:59Z: 2 open P0s against the 2 rows below** — #62, #26. The tally's
> history is in the archive.
>
> That instruction has earned itself repeatedly, and most sharply on 2026-08-11, when **three
> sessions edited this table within two hours and each wrote a number that was already stale**. One
> dropped #64's row and kept #63; another dropped #63's and kept #64 — each right about the issue it
> had just closed, both writing "3 open P0s", and a textual merge would have kept one number and
> lost the other's row. The lesson is not "run the query" — every one of them did — but *run it at
> the moment you write the number*, and re-run it when you merge.
>
> #14 is the parent of the P0s split out of it and holds only the staging-checklist residue.

| # | Item | Tracked |
|:--|:---|:---|
| 1 | **Schema is applied — one live request per route is what remains.** On 2026-08-08 the production schema was inspected directly: `20260807000000` and `20260807120000` were already live, `20260807170000` (complementos) was not and has since been applied, along with `20260808030000` (folio RPC grants) and `20260809000000` (organization phone). All confirmed present by inspection, not by an exit code. The root dependency is cleared; #62's last exit criterion is a real request against `POST /api/quotes/public/[token]/otp`, `POST /api/invoices/issue` and the complemento path. **The OTP route got its real request on 2026-08-11** (the email-channel verification); the invoice and complemento paths remain. | [#62](https://github.com/jesushzv/business-helper/issues/62) |
| 2 | **Issue one CFDI through a live Facturapi sandbox, end to end.** Confirm a real SAT UUID returns and the stored XML and PDF open. Mocked `fetch` coverage proves the code is correct, not that the integration works — this is the last thing between "merged" and "trustworthy." | [#26](https://github.com/jesushzv/business-helper/issues/26) |

**The UX audit is closed** (#87/#88/#89/#90/#93/#95/#96/#99/#100/#101/#103/#104/#114/#124/#127), the
row-by-row detail in the archive. Three things carry forward:

- **All of it was verified by unit and component tests only** — none re-checked against production or
  a real handset, which is the part no agent supplies.
- **Residue stays open** in #103/#99's follow-ups and #113/#114/#123/#124, plus two gaps pinned by
  unit tests only: a non-owner's read-only Ajustes, and `/pay`'s no-invented-bank path, which needs a
  tenant with a contract.
- **Deferred as decisions:** #174 (CFDI cancel UI), #185 (plan naming).

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

**CFDI cancellation stays out of the app for launch** (#174, decided): the route ships with no UI
caller — it needs a motivo, the `01` replacement UUID, receptor refusal and an async SAT answer
(#30). Tenants cancel at their PAC portal; the stamping dialog says so, and
`tests/unit/cfdiCancelHasNoUiCaller.test.ts` fails the build if a caller appears.

**Three open `bug`-tagged issues.** Two are fixed in code and await a live check; the third is new
and unaddressed:

- [#116](https://github.com/jesushzv/business-helper/issues/116) — the webhook no longer writes a
  Checkout Session's `'complete'` into `subscription_status`, a value `chk_subscription_status`
  rejects (the write failed the CHECK *after* the event was claimed), and an unknown status is no
  longer badged "Cancelado" to someone who has just paid.
- [#133](https://github.com/jesushzv/business-helper/issues/133) — `requireOrgAccess` resolves the
  tenant deterministically and logs the ambiguity instead of picking a row at random.
- [#204](https://github.com/jesushzv/business-helper/issues/204) — the migration/production
  divergence in §02. **No code change yet.**

#115 (`stripe_customer_id` and `stripe_subscription_id` stored, so upgrades stop minting duplicate
customers and a subscription can be cancelled from the app at all) is fixed alongside the first two
and also still open. For all four: **tests, lint and build only** — no live Stripe event, no second
organization row.

> [!IMPORTANT]
> **The scope principle these items serve.** The founder's stated constraint is to launch fast without
> mistaking an incomplete product for weak product-market fit. That gives a sharper rule than "ship the
> MVP": **ship the minimum where a negative result is trustworthy.** Every P0 item above is one that,
> left undone, produces a false negative — users who wanted the product but could not sign a quote,
> could not be invoiced, or dropped out of a funnel nobody was measuring. Anything that cannot generate
> a false negative belongs in P2, however visible it is.

> [!NOTE]
> **Ask whether a criterion needs a *human* or only *reach*** ([#129](https://github.com/jesushzv/business-helper/issues/129)).
> Schema, grants, constraints, RLS, PostgREST, GoTrue and the deployed app — public *and*
> authenticated, since an owner's session mints from `auth.refresh_tokens` — are all reachable from a
> session with the Supabase connector. What genuinely needs a human is the browser session and the
> real credential: the rendered page, the code on a handset, the card that charges. #79 sat
> unverifiable for a day and #95 for three weeks for want of this distinction, and when #96's
> "needs a deployment" check was finally taken it **failed**, surfacing two live defects nobody had
> seen. Don't park a reachable check on the founder. Evidence in the archive.

### P1 — Makes launch week survivable

- **Wire real error monitoring** ([#52](https://github.com/jesushzv/business-helper/issues/52)).
  **The code half landed 2026-08-11** as a raw-`fetch` envelope client, and **moved to
  `@sentry/nextjs` on 2026-08-12** following Sentry's official setup skill. The reason for the
  swap is coverage, not style: a hand-written transport only sees errors someone handed it, and
  never an unhandled Server Component error, a React render error or an Edge middleware throw —
  most of what a production 500 is. `instrumentation.ts`'s `onRequestError` sees all of them.
  Configured across browser, Node and Edge with tracing, session replay (all text, inputs and
  media masked), logs and profiling; `sendDefaultPii` is off, and email/RFC/CLABE/phone are
  scrubbed in `beforeSend` — now also out of stack-frame locals, breadcrumbs, headers and cookies
  — while `organization_id` and `route` survive. Call sites did not change: `lib/sentry.ts` keeps
  its signature as an adapter, so `app/global-error.tsx` and `app/(dashboard)/error.tsx` report as
  before.
  **The DSN was configured on Vercel by the founder on 2026-08-12, and #52 closed on that basis.**
  What no session has observed is the criterion's second half: that an alert *arrives* carrying
  `organization_id` and route with no personal data in it. An agent container has no outbound
  network access, so every result in this repo is against a mocked transport — the code is correct,
  which is not the same as the integration working. Worth one glance at any event in the Sentry
  dashboard; reopen #52 if it disagrees. `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` remain
  optional, for readable stack traces.
- **Point the domain at Vercel.** `businesshelper.app` is the domain; `.mx` was never registered. Docs and
  `.env.example` are corrected; the source instance was #36, **now closed** (PR #47) — the remaining work
  here is DNS, not code. Confirm the apex resolves with SSL, then sync the Supabase Auth Site/Redirect
  URLs and the Stripe webhook endpoint to it. No issue tracks the DNS step; it is a founder action.
- **Require the `CI` check in branch protection** ([#38](https://github.com/jesushzv/business-helper/issues/38)).
  CI was silently absent on PR #28 for ten hours across four pushes while Vercel and GitGuardian reported
  green, so the PR looked checked. The cause is still unexplained — which is the argument for a rule that
  fails closed rather than one that depends on understanding it. It has since missed again, three times
  on one PR ([#132](https://github.com/jesushzv/business-helper/issues/132)): compare a run's head SHA
  to the PR's, because absence looks identical to passing.
- **One real production smoke test** ([#70](https://github.com/jesushzv/business-helper/issues/70)):
  register → quote → WhatsApp send → OTP sign → SPEI upload → confirm. Two legs are now covered
  independently — a client registered through the UI (#146, with a US phone number, so #94's
  international path ran live) and a real inbox signing a real quote (#2) — but the loop has never
  been walked end to end on the deployment, and `/api/health` has never been called against it.
- **CFDI folio billing.** Folio packs are advertised but cannot be bought ([#24](https://github.com/jesushzv/business-helper/issues/24)),
  and the Inicial tier's pay-per-folio pricing has no billing behind it ([#27](https://github.com/jesushzv/business-helper/issues/27)).
  CFDI ships at launch, so this is revenue the pricing page promises and the product cannot collect.

### P2 — Can trail launch by weeks

- Complemento de pago gaps: the request body has never reached a real PAC ([#34](https://github.com/jesushzv/business-helper/issues/34)),
  the accountant export omits complementos ([#31](https://github.com/jesushzv/business-helper/issues/31)),
  and one stamped in error cannot be cancelled ([#30](https://github.com/jesushzv/business-helper/issues/30)).
  *(Filing on PPD confirmation itself landed in #29.)*
- ~~Migrations never execute against a real Postgres in CI (#35).~~ **Merged 2026-08-09:** CI's
  `migration-verify` job applies the full set twice to Postgres 16 under a faithful Supabase shim
  (including the default-privilege auto-grants — the #76 trap), seeds a tenant, and asserts anon
  isolation, service_role access, the OTP phone CHECK, SECURITY DEFINER grants via `aclexplode`, and
  RLS-on-every-table. Shown red against a planted anon leak; making double-apply pass surfaced 16
  non-idempotent statements, all fixed. **It builds from the migration files, so #204's divergence is
  invisible to it.** Requiring the check in branch protection remains #38.
- `parseNaturalLanguageQuery` is keyword matching rather than a model. It now reports `engine: 'rules'`
  instead of implying otherwise, so it is honest but not intelligent. Degrades gracefully; does not gate launch.
- Animated demo video — storyboarded in [`demo_video_storyboard.md`](03-product-specs/demo_video_storyboard.md), not produced.

---

## 04 Launch Gate

Run top to bottom before announcing. Every P0 item above collapses into one of these.

### Money path integrity
- [ ] A CFDI issued in the app corresponds to a real SAT UUID ([#26](https://github.com/jesushzv/business-helper/issues/26)) — CFDI ships at launch, so this is required
- [x] Stripe checkout charges a real card in live mode ([#68](https://github.com/jesushzv/business-helper/issues/68), closed 2026-08-11 — Plan Inicial at $299.00 MXN, read back from Stripe's charge history) with a verified webhook ([#63](https://github.com/jesushzv/business-helper/issues/63) — four rejection checks against a real runtime; accept-and-apply and redelivery idempotency in production). `npm run verify:stripe` stays the read-only pre-check
- [ ] Each tier's live Price ID bills the amount the pricing page advertises — a mismatched map charges the wrong amount and reports success everywhere. Only Inicial has been exercised live; #68 closed with this box unticked, so **no open issue tracks the other tiers**. `npm run verify:stripe` is the check
- [ ] Every pilot organization has a real CLABE, and payment confirmation reflects a real transfer — an operational check on live rows, which closing #64 (the code gate) does not satisfy. Since #164 the accounts live in `bank_accounts`, so the query is `select o.id, o.name from organizations o where not exists (select 1 from bank_accounts b where b.organization_id = o.id and b.archived_at is null);` — the older `organizations.bank_clabe is null` form reads a legacy mirror column, not the source. It must return no row belonging to a pilot tenant who intends to be paid; since #163 a tenant may also have removed their account deliberately, so a row is a question to ask, not automatically a defect. Run 2026-08-11 it returned one, `QA #128 trial default — BORRAR`, a test row to delete rather than fill in. **Only two organizations exist in production at all** — the founder's and that QA row — so there is no pilot cohort behind this gate yet
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
- [ ] `supabase/migrations/` and the live catalog agree ([#204](https://github.com/jesushzv/business-helper/issues/204)) — production holds two indexes no migration creates, so a fresh environment is not reproducible. (The issue also names a *column*; that half is wrong, see §03)
- [ ] Error monitoring transmits and alerts reach the founder within minutes ([#52](https://github.com/jesushzv/business-helper/issues/52), closed 2026-08-12) — on `@sentry/nextjs` and the DSN is configured on Vercel. Unticked deliberately: no session has seen an alert arrive, so the transmit half is founder-confirmed setup rather than observed behaviour
- [x] The funnel is instrumented, so a weak result can be diagnosed (#37, PR #56) — wired, not yet read against real traffic
- [x] Lint, typecheck and the vitest suite pass (figures in §02); CI runs on PRs, but not reliably — see [#38](https://github.com/jesushzv/business-helper/issues/38) and [#132](https://github.com/jesushzv/business-helper/issues/132)

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

Decisions resolved and no longer constraining live work — the trade-credit roles (#123), the
never-subscribed trial (#128), CFDI at launch, email/Resend as the OTP channel, `.app` over `.mx`,
the September date, the #20/#23 merge posture — are in
[`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md) with their reasoning.

**`is:issue is:open label:decision` returns four: #203, #185, #128, #123** — but #128 and #123 were
decided *and implemented* (a4ea82d, #188/#189) and simply never closed, so the label overstates what
is undecided by half. Closing them is a one-line comment each. Three more are decisions by shape and
carry no label: #196, #197 (settlement-account blast radius) and #94 (foreign phone numbers).

> [!IMPORTANT]
> **The schedule has no relief valve left.** CFDI ships *and* the September date holds — both
> halves of the trade were taken (resolved 2026-08-07), so every P0 row in §03 must land and the
> only remaining variable is hours, decision 3 above. If the list slips, the next lever is not
> scope or date but pilot count: fewer pilots, longer and more closely watched.

---

## 06 Verification Method

So this reconciliation can be repeated rather than trusted:

```bash
npm ci                         # a fresh clone has no node_modules; without this,
                               # typecheck emits ~200 phantom TS2307 errors
npx vitest run                 # the figure in §02; Node 22 required
npm run typecheck
npm run lint
node -e "console.log(Object.keys(require('./package.json').dependencies))"
```

The P0 table is re-derived from `is:issue is:open label:P0` and the count compared to the number of
rows, every time this file is edited. Reading the table and editing around it is how a closed issue
keeps a row.

Claims about a third-party integration were checked by locating the actual outbound call
(`grep -rn "api.stripe.com\|api.twilio.com\|graph.facebook.com\|facturapi.io" lib app`) rather than by
reading the module name or the doc. A module named after a provider is not evidence that the provider
is contacted — that was precisely the failure mode in §01.

**Rule going forward:** a feature is "done" when its outbound call has executed against the real service
at least once. Passing tests against a mocked `fetch` mean the code is correct, not that the integration works.

---

*Single source of truth for status. Enforced by `tests/unit/docsStatusAuthority.test.ts`.
Doc map: [AGENTS-DOCS-GUIDE.md](AGENTS-DOCS-GUIDE.md).*
