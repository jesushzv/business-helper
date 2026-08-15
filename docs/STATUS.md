<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# STATUS — Business Helper

> **The single source of truth for what is and is not done.**
>
> *Last verified: 2026-08-14 06:30Z for the `bug` set below (re-derived from
> `is:issue is:open label:bug`, with the `cfdi_stamp_claims` table, its grants and
> `uq_organizations_owner_id` read back from the production catalog); 2026-08-11 23:59Z for
> everything else. Suite re-run for this pass; the P0 table re-derived from
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

That test also holds this file to **32 KB** and — since the budget kept being discovered at 95%+
full — to a **7-day TTL on dates** (rule 5): a `YYYY-MM-DD` older than that fails the build,
because at this repo's PR cadence a date that old anchors settled history. Either way the fix is the same: move the narrative
to [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md) and keep the still-true
fact here, stated date-free — never raise the number. **State a number once.** A count restated in a second section drifts
from the first — this file carried `1576 tests / 165 files` in §02 and `722 tests / 87 files` in §04
simultaneously, and #138 tracks the conflict-on-every-parallel-PR problem that grows it.

Where this file and the code disagree, **the code wins** — fix this file in the same PR.

An HTML rendering is published at
<https://claude.ai/code/artifact/bce71e34-9298-436f-8dda-9e432ea9763a> (private to the owner).

---

## 01 Why This Document Exists

A security review in early August 2026 found that features the roadmap marked **Completed** were
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
| Test suite | **2033 tests / 190 files**, `npx vitest run` on the deletion-semantics branch cut from `main` (2026-08-14). The `scripts/test-runner.js` that reported "182/182" no longer exists |
| Coverage gate | **Enforced in CI since #51** — `npx vitest run --coverage` on every pull request, against the thresholds in `vitest.config.ts` (the only statement of them). Measured on the branch that wired it up: statements 82.73%, branches 75.73%, functions 78.93%, lines 84.67%. The thresholds sit just under each, so the gate is a ratchet — raise it as coverage rises, never lower it to make a red run pass. The gap to the old aspirational 85/85/80/80 is concentrated in untested `app/` route handlers and `lib/hooks/` |
| Error monitoring | **On `@sentry/nextjs` since 2026-08-12**, across browser, Node and Edge, with tracing, masked session replay, logs and profiling (why it replaced the hand-rolled transport: archive). PII scrubbing is `beforeSend`; `sendDefaultPii` is off. **DSN configured on Vercel 2026-08-12** and #52 closed on that basis; no session has observed an alert arriving, so the delivery half is founder-confirmed setup rather than evidence ([#52](https://github.com/jesushzv/business-helper/issues/52)) |
| E2E | **Rewritten and executed 2026-08-13** ([#69](https://github.com/jesushzv/business-helper/issues/69)/[#91](https://github.com/jesushzv/business-helper/issues/91)): **18 passed, 0 skipped, 0 failed** — 9 scenarios × desktop + mobile chromium, production build, demo posture. Scenarios pinning remediated defects (P0-4 CLABE, pre-#57 OTP) now assert the opposite; suite joined CI. It caught a live wizard defect (`docs/LESSONS.md` #91). Scenario 10 (deployed health) left for the row below — it had never run |
| Deployed smoke test | **Running against production on its 6-hour cron** ([#70](https://github.com/jesushzv/business-helper/issues/70)): `.github/workflows/deployed-smoke.yml`, outside the PR gate; 4 checks in `docs/deployment.md` §05.1. **8 runs, all green** — 7 scheduled since the day after it was built, plus one dispatched — each asserting all four checks on desktop *and* mobile. So checks 02–04 are executed evidence, not unproven code: the qualifier this row carried was written before the cron had fired and outlived its own truth. Check 04 is the load-bearing one — a 200 on an unknown quote token would mean the deployment had lost its service-role key and was serving the built-in demo quote to real visitors. **The manual loop (§05.2) is unwalked**; record its date and URL here |

> [!IMPORTANT]
> **The Sentry finding matters disproportionately for a solo founder**: error monitoring is the only
> thing that reports a production 500 when nobody is watching. The code half landed 2026-08-11; what
> is left is a DSN on Vercel and one thrown error proving an alert arrives. P1 in §03.

### Open and blocking

*One row left. Everything cleared — OTP provider config (#2), Stripe live mode (#68), the production
migrations — is in the archive with its reasoning.*

| Item | State | Blocks launch? |
|:---|:---|:---|
| **Live PAC stamp** | The direct sandbox half is done: the integration was exercised live, found entirely broken (`/v1` = 410 since 2023, four payload defects — mocked-`fetch` coverage had kept it all green), fixed, and re-verified end to end against the live sandbox — real SAT UUIDs, documents, cancellation (02/03), correct totals with and without retenciones. Forensics in the archive. **Re-scoped by the BYOK decision (§05): the platform does not stamp on behalf of tenants**, so the remaining criterion is a **tenant-connected live PAC**: an `sk_live_` key with CSDs connected in Ajustes, one stamp through `POST /api/invoices/issue`, the UUID verifying at the SAT portal. A sandbox key cannot meet it — sandbox documents have no fiscal validity, and the route refuses them in production by design (`PAC_SANDBOX_KEY`). The `cfdi_stamp_claims` guard (#213, PR #241) is **applied to production and refused a duplicate claim `23505` live**; the guard's own live exercise (a deliberate double-submit) rides with this row's stamp. | **Yes** — CFDI ships at launch |

**Verification done before the live-provider passes began was against mocked providers.** The items
in §03 that need a real handset, card, PAC stamp or deployed database are untouched by any of it.

### Schema state

**One organization per owner is a schema invariant, applied to production**
(`uq_organizations_owner_id`, `20260811150000`). Verified live: the index reads back
`indisunique`/`indisvalid`, and a probe INSERT of a second organization for an existing owner was
**refused** with `23505`. Two stale test rows had to be cleared first (detail in the archive); the
decision behind the invariant is recorded, and
[#109](https://github.com/jesushzv/business-helper/issues/109) is still open on the tracker.

**Schema/catalog divergence (#204) is resolved** — every index on `organizations` matches a
migration, verified against `pg_indexes`; the full account is in the archive.

### Deletion semantics

**Record deletion is capability-gated, and the invariants are in the database** (#327/#336).
`delete_records` (owner + manager) fronts the DELETE routes; a signed or `converted` quote and a
stamped or claimed milestone are refused. Both FK RESTRICTs and both restrictive `FOR DELETE`
policies are **applied to production and proven by rejection** — each refusal paired with a
permitted case, so nothing passes against a rule that refuses everything. How the guards behave
and why: the archive.

### Founder admin surface

`/admin` + `/api/admin/*` (metrics, trial extension with audit row) exist behind the
`PLATFORM_ADMIN_USER_IDS` allowlist — fail closed: unset, every caller gets 404, so the surface is
**off in production until the variable is set on Vercel**. Verified with Vitest doubles only; no
live pass yet.

---

## 03 Priority Stack

### P0 — Blocking: money and compliance cannot be simulated

✅ **CFDI ships at launch** — decided. PR #23 is merged, so the code is real.

> [!NOTE]
> **One P0, one open issue.** Every row below maps to exactly one open issue and every open P0 issue
> appears below. **Re-derive from `is:issue is:open label:P0` before trusting this table** — rows
> drop off as issues close, and the list is ordered by dependency, not severity.
> **Re-derived 2026-08-11 23:59Z: 2 open P0s against the 2 rows below** — #62, #26. Run the query
> *at the moment you write the number*, and re-run it when you merge: three concurrent sessions
> once each wrote an already-stale tally into this table within two hours (the incident, and the
> tally's history, are in the archive).
>
> #14 is the parent of the P0s split out of it and holds only the staging-checklist residue.

| # | Item | Tracked |
|:--|:---|:---|
| 1 | **Schema is applied — one live request per route is what remains.** The production schema was inspected directly: `20260807000000` and `20260807120000` were already live, `20260807170000` (complementos) was not and has since been applied, along with `20260808030000` (folio RPC grants) and `20260809000000` (organization phone). All confirmed present by inspection, not by an exit code. The root dependency is cleared; #62's last exit criterion is a real request against `POST /api/quotes/public/[token]/otp`, `POST /api/invoices/issue` and the complemento path. **The OTP route got its real request on 2026-08-11** (the email-channel verification); the invoice and complemento paths remain. | [#62](https://github.com/jesushzv/business-helper/issues/62) |
| 2 | **Issue one CFDI through the app, end to end.** The *direct* sandbox half was done 2026-08-12 — real SAT UUIDs, XML/PDF, cancellations, totals, evidence in §02 and on the issue — and it found the integration dead (`/v1` = 410) plus three payload defects, all fixed in this PR. What remains, re-scoped by the BYOK decision (§05): **an organization's own `sk_live_` PAC connected in Ajustes and one stamp through `POST /api/invoices/issue`**, the UUID verifying at the SAT portal. Needs the founder's live Facturapi account + CSD certificates; no test key can meet it. Closes #62's invoice-path criterion too. | [#26](https://github.com/jesushzv/business-helper/issues/26) |

**The UX audit is closed** (#87/#88/#89/#90/#93/#95/#96/#99/#100/#101/#103/#104/#114/#124/#127), the
row-by-row detail in the archive. Three things carry forward:

- **All of it was verified by unit and component tests only** — none re-checked against production or
  a real handset, which is the part no agent supplies.
- **Residue stays open** in #103/#99's follow-ups and #113/#114/#123/#124, plus two gaps pinned by
  unit tests only: a non-owner's read-only Ajustes, and `/pay`'s no-invented-bank path, which needs a
  tenant with a contract.
- **Deferred as decisions:** #174 (CFDI cancel UI), #185 (plan naming).

**CFDI cancellation stays out of the app for launch** (#174, decided): the route ships with no UI
caller — it needs a motivo, the `01` replacement UUID, receptor refusal and an async SAT answer
(#30). Tenants cancel at their PAC portal; the stamping dialog says so, and
`tests/unit/cfdiCancelHasNoUiCaller.test.ts` fails the build if a caller appears.

**The `bug`-tagged set, re-derived from the tracker this pass.** Nine were open; three were already
fixed in code and are now closed against live evidence, five are fixed by the stacked PRs #342 →
#343 → #344 → #345, and one remains open on a credential:

- **Closed after live verification.** [#115](https://github.com/jesushzv/business-helper/issues/115)
  (both Stripe ids written by the webhook; `organizations_stripe_customer_id_key` and
  `…_subscription_id_key` confirmed UNIQUE in the production catalog, so a cross-tenant collision
  surfaces as a 500 rather than being swallowed) · [#117](https://github.com/jesushzv/business-helper/issues/117)
  (the chosen plan survives `/upgrade` → register → onboarding → Ajustes; no path writes
  `subscription_tier`) · [#133](https://github.com/jesushzv/business-helper/issues/133) (deterministic
  tenant, ambiguity logged; `uq_organizations_owner_id` confirmed live). #115's Billing Portal
  residue was filed as #346 before closing, not dropped.
- **Fixed in the stack, pending merge.** #334 (server "today" is `America/Mexico_City`, not UTC) ·
  #151 (money inputs hold text — five sites, one more than the issue listed) · #281 (the chrome
  follows a rename) · #269 (a second invitation says plainly that the app will keep showing the
  other company) · #116 (an unknown subscription status reads as unknown, not "Activo").
- **Open:** [#213](https://github.com/jesushzv/business-helper/issues/213) — the claim mechanism is
  built *and* applied in production (see §04's Live PAC stamp row), so the race is closed; what
  remains is the empty-`taxes` sandbox probe, which needs a real Facturapi credential.
- [#204](https://github.com/jesushzv/business-helper/issues/204) — resolved 2026-08-12, §02.

For the five in the stack: **tests, lint and build only** — no live Stripe event, no live PAC stamp.
The database claims above were read back from the production catalog, and the `cfdi_stamp_claims`
primary key was proven by making it *reject* a second claim (`23505`) inside a rolled-back probe.

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
>
> **Test the connector; never inherit a previous session's failure.** Two sessions recorded
> Supabase and Stripe as `MCP error -32003` and parked work accordingly; both answered normally when
> retried, and one re-test then applied #242's REVOKE, proved #336 by rejection, and ran #70's
> read-only checks against the deployment.
>
> | Reachable | Needs a human |
> |:---|:---|
> | Catalog, grants, RLS, migrations (Supabase) | A live Facturapi key + CSDs (#26/#34/#347/#62) |
> | The deployed app — container egress is blocked, the **Vercel connector fetches it** | An inbox, for a recovery or OTP link (#245) |
> | Stripe *reads* | Stripe dashboard *writes* — no portal-config POST (#346) |
> | Issues, PRs, Actions conclusions | Repo settings — no branch-protection op (#38) |
>
> When a check is refused, name the call and its error, so the next session re-tests.

### P1 — Makes launch week survivable

- **Wire real error monitoring** ([#52](https://github.com/jesushzv/business-helper/issues/52)).
  **On `@sentry/nextjs`** across browser, Node and Edge (state and scrub posture: the §02 row; why
  it replaced the hand-rolled transport: archive). **The DSN is configured on Vercel and #52
  closed on that basis.** What no session has observed is the criterion's second half: that an
  alert *arrives* carrying `organization_id` and route with no personal data in it — every result
  in this repo is against a mocked transport. Worth one glance at any event in the Sentry
  dashboard; reopen #52 if it disagrees. `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` remain
  optional, for readable stack traces.
- **Point the domain at Vercel.** `businesshelper.app` is the domain; `.mx` was never registered. Docs and
  `.env.example` are corrected; the source instance was #36, **now closed** (PR #47) — the remaining work
  here is DNS, not code. Confirm the apex resolves with SSL, then sync the Supabase Auth Site/Redirect
  URLs and the Stripe webhook endpoint to it. No issue tracks the DNS step; it is a founder action.
- **Password recovery and the signup/login seams**
  ([#245](https://github.com/jesushzv/business-helper/issues/245)–#249). Recovery emails linked
  to `/reset-password`, which did not exist (a lockout). The page now exists; register keys
  "signed in" on `data.session` (#246); login maps errors via `authErrorMessage` (#247); the
  middleware guards the app shell (#248); OAuth carries `?next=` (#249). Mock-verified only —
  **a live recovery pass closes #245.**
  CI has been silently absent on green-looking PRs, repeatedly and still unexplained
  ([#132](https://github.com/jesushzv/business-helper/issues/132); narrative in the archive):
  compare a run's head SHA to the PR's, because absence looks identical to passing.
- **One real production smoke test** ([#70](https://github.com/jesushzv/business-helper/issues/70)):
  register → quote → WhatsApp send → OTP sign → SPEI upload → confirm. Two legs are now covered
  independently — a client registered through the UI (#146, with a US phone number, so #94's
  international path ran live) and a real inbox signing a real quote (#2) — but the loop has never
  been walked end to end on the deployment, and `/api/health` has never been called against it.
- ~~**CFDI folio billing** (#24, #27).~~ **Superseded by the BYOK decision (§05, 2026-08-12)** —
  no billable event, both closed as not planned. The copy sweep (#221), the folio-machinery
  removal, the production `cfdi_folio_ledger` drop (#224, applied and read back live) and #226 all
  landed 2026-08-12; the full account is in the archive.

### P2 — Can trail launch by weeks

- Complemento de pago gaps: the request body has never reached a real PAC ([#34](https://github.com/jesushzv/business-helper/issues/34)),
  the accountant export omits complementos ([#31](https://github.com/jesushzv/business-helper/issues/31)),
  and one stamped in error cannot be cancelled ([#30](https://github.com/jesushzv/business-helper/issues/30)).
  *(Filing on PPD confirmation itself landed in #29.)*
- ~~Migrations never execute against a real Postgres in CI (#35).~~ **Merged:** CI's
  `migration-verify` job applies the full set twice to Postgres 16 under a faithful Supabase shim
  and asserts tenant isolation plus the #76 grant posture (what it checks and how it was shown red:
  archive). **It builds from the migration files, so a #204-style divergence is invisible to it.**
  Requiring the check in branch protection remains #38.
- ~~`parseNaturalLanguageQuery` is keyword matching rather than a model.~~ **Gemini is wired**
  (`lib/geminiClient.ts`, raw REST): with `GEMINI_API_KEY` set — the founder configured it on Vercel —
  the assistant routes have the model write the answer prose around figures the rules engine computed
  from the tenant's rows; each answer is labeled `engine: 'gemini' | 'rules'` for whichever wrote it,
  and any Gemini failure degrades to the labeled rules answer (reported to Sentry and `console.warn`ed
  into Vercel logs). The founder's "assistant not working" report was **root-caused live**: Google
  retired the pinned `gemini-2.5-flash` id for new API keys, so every call 404'd and answers silently
  degraded to rules (forensics in the archive). The client and `verify:gemini` now default to the
  rolling `gemini-flash-latest` alias (`GEMINI_MODEL` pins), with a per-generation thinking cap.
  **The new model id has never been called live — `npm run verify:gemini` where the key exists is
  what closes this.** Does not gate launch.
  **The model allowance is server-derived** (#228): tier from `organizations.subscription_tier`,
  usage in `ai_usage_monthly` (migration `20260812210000`, **applied to production and read back** —
  RLS deny-all held, the atomic increment returned 1 then 2 live). The body's self-reported
  `tierKey`/`currentUsage` are ignored; only model-written answers count, and an exhausted or
  unknown budget answers from the rules engine, labeled.
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
- [x] Production Supabase migrations applied — all three from #20, #23 and #29, plus `20260808030000_folio_rpc_grants.sql`; confirmed by inspecting the live schema, not by an exit code. One live request per affected route still owed ([#62](https://github.com/jesushzv/business-helper/issues/62))
- [x] `supabase/migrations/` and the live catalog agree ([#204](https://github.com/jesushzv/business-helper/issues/204)) — `20260812060000` applied 2026-08-12 and `pg_indexes` read back: every index on `organizations` matches a migration
- [x] **No migration in the repo is unapplied in production.** Vercel auto-deploys `main` and migrations are manual, so this row is the gap between the two (hard rule #6). Read it back from the live catalog, never from the ledger — the ledger does not list hand-applied work, which is why an earlier revision of this row was wrong in both directions:
  - `20260815000000` (`stripe_webhook_events` by-name REVOKE, [#242](https://github.com/jesushzv/business-helper/issues/242)) — **applied.** `aclexplode` returns only `postgres` and `service_role`; the `anon`/`authenticated` grants, TRUNCATE included, are gone from that table.
  - `20260814210000` + `20260814210100` (deletion invariants, #336) — **applied.** `contracts_quote_id_fkey` and `cfdi_stamp_claims_milestone_id_fkey` both read back `confdeltype = 'r'` (RESTRICT), and both restrictive `FOR DELETE` policies exist with their intended predicates (`quotes`: draft/sent/rejected/expired; `milestones`: `pending` + `cfdi_status = 'none'`).
  - `20260813010000` (`cfdi_stamp_claims` grants) — **applied.** No `anon`/`authenticated` grant remains on that table, nor on `otp_send_log` or `ai_usage_monthly`.
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

**Decided 2026-08-12 — tenants bring their own PAC; the platform never stamps on their behalf.**
The `FACTURAPI_SECRET_KEY` fallback in `lib/pacConnection.ts` is deprecated and the variable comes
out of Vercel: with it unset, a tenant without a connected PAC gets the designed "conecta tu llave"
refusal, and Ajustes flips to the BYOK message automatically (`platformFallbackAvailable` is
server-driven). Folio metering ships no revenue path (#24/#27 closed as not planned); each tenant's
PAC bills them directly and keeps their CSDs. Verified: PAC tests green with the variable unset;
the only regression is advertising copy, filed separately.

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
> halves of the trade were taken (the resolution is recorded in the archive), so every P0 row in §03 must land and the
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
