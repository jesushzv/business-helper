<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# STATUS — Business Helper

> **The single source of truth for what is and is not done.**
>
> *Last verified: 2026-08-09 against `main` @ `4134e91` (post #119). Suite re-run for this pass;
> merge state of every row in §02 confirmed with `git log`; the P0 table below re-derived from
> `is:issue is:open label:P0` rather than trusted — it was short by three.*
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

| Change | PR | What it actually closed |
|:---|:---|:---|
| P0 money-path hardening | #1 | API auth enforcement across `app/api/*`; simulated writes relabelled so they cannot be mistaken for real ones |
| Outbound WhatsApp dispatch | #13 | Reminders now send via Twilio / Meta Cloud API instead of reporting fabricated success |
| Post-merge security setup | #16 | `lib/otpDelivery.ts` — real Twilio SMS, Twilio WhatsApp, and Meta Cloud API paths; per-org bank account (CLABE) UI; Stripe webhook signature verification |
| Real checkout, invites, export | #19 | `lib/stripeClient.ts`, `lib/teamInvitations.ts`, and `lib/accountantExport.ts` read real data instead of hardcoded fixtures |
| CI workflow + migration tooling | #11 | `.github/workflows/ci.yml`, `scripts/db-migrate.mjs`, `scripts/verify-stripe-webhook.mjs` |
| Test consolidation | #21 | `scripts/test-runner.js` (2,751 lines) retired; coverage folded into vitest |
| Agent authority split in two | #137 | The defect-class catalogue moved to `docs/LESSONS.md` under its own budget, with `tests/unit/lessonsCatalogue.test.ts` failing the build when a merge resolution drops a lesson (#135) |

### Corrected baseline metrics

| Metric | Docs claimed | Actually verified (2026-08-07) |
|:---|:---|:---|
| Test suite | 182/182 via `scripts/test-runner.js` | **943 tests / 106 files**, `npx vitest run` (2026-08-09, `main` @ `e51fa30`) — runner file no longer exists |
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

*What remains here is configuration and one real transaction, not code. Cleared rows are collapsed
into one line; their reasoning is in the frozen log.*

| Item | State | Blocks launch? |
|:---|:---|:---|
| **Live PAC stamp** | **The one that matters.** PR #23 merged, so stamping is real code — but its coverage runs against a mocked `fetch`, and no invoice has been issued through a live Facturapi sandbox. Merging is not verification. | **Yes** — CFDI ships at launch |
| ~~**#2** — OTP provider configuration~~ | ✅ **Email channel live and verified end to end (2026-08-11)** — a real inbox signed a real quote, evidence read back from the live catalog; detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md). sms/whatsapp stay wired but deprecated. | Cleared |
| ~~**Production migrations**~~ | ✅ Applied to production and confirmed by schema inspection (2026-08-08). #62's remaining ask is one live request per affected route. | Cleared |
| ~~Five more~~ | ✅ Cleared 2026-08-07→09, detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md): product analytics (#56); real CFDI via PAC (#3, PR #23); OTP per-phone rate limit (#17, PR #20); Complemento de Pago (#29); OTP escalating backoff + daily cap (#22, PR #112, carries migration `20260809120000`). | Cleared |

### Recently landed (2026-08-07 → 2026-08-08)

Moved to [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md) on 2026-08-09 —
eight merged changes with their issues, PRs and commits. Settled history, and this file was over
its 32 KB budget. **What none of it changed:** every row was verified by `typecheck` + `lint` +
vitest against **mocked** providers. Not one was a live third-party round-trip; the §03 items
needing a real handset, card, PAC stamp or deployed database are untouched by all of it.

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
> below** — #62, #26, #68, #64, #63.

| # | Item | Tracked |
|:--|:---|:---|
| 1 | **Schema is applied — one live request per route is what remains.** On 2026-08-08 the production schema was inspected directly: `20260807000000` and `20260807120000` were already live, `20260807170000` (complementos) was not and has since been applied, along with `20260808030000` (folio RPC grants) and `20260809000000` (organization phone). All confirmed present by inspection, not by an exit code. The root dependency is cleared; #62's last exit criterion is a real request against `POST /api/quotes/public/[token]/otp`, `POST /api/invoices/issue` and the complemento path. **The OTP route got its real request on 2026-08-11** (the email-channel verification, §02); the invoice and complemento paths remain. | [#62](https://github.com/jesushzv/business-helper/issues/62) |
| 2 | **Issue one CFDI through a live Facturapi sandbox, end to end.** Confirm a real SAT UUID returns and the stored XML and PDF open. Mocked `fetch` coverage proves the code is correct, not that the integration works — this is the last thing between "merged" and "trustworthy." | [#26](https://github.com/jesushzv/business-helper/issues/26) |
| 3 | **Enable Stripe live mode.** Live secret key, a live Price ID mapped per pricing-page tier, and one real card charged. `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` are marked "Launch Gate — P0" in the roadmap and were tracked **nowhere** until 2026-08-07; #63 covers only the webhook half of §04's "charges a real card in live mode with a verified webhook". Needed before the first trial converts rather than before the first user signs up, which is why it sits below the loop-blocking items. **Code side landed 2026-08-09** (PR #119): no invented price-id literals, no tier guessed from an unrecognised price, and `npm run verify:stripe` reads the account and every price back from Stripe, failing on an amount the pricing page does not advertise. **Checkout reaches Stripe for the first time, 2026-08-11.** It had never worked: probed as a real tenant against production, every tier answered `502` with `No such price: 'prod_…'` — all three `STRIPE_PRICE_*` in Vercel held Stripe **Product** ids, and the account had never had a Checkout Session. The founder set the Price ids and redeployed; the same probe now returns `200` and a `cs_live_…` URL for all three, billing 29900 / 59900 / 99900 MXN monthly against `price_1U0CxLDuvxyuzaREdO7Jsp3E`, `price_1U0CxlDuvxyuzaRElZ6Lswzt` and `price_1U0CySDuvxyuzaREHFoeCb08`, each session carrying the `organization_id` and `tier_id` the webhook attributes by. The three QA sessions were left unpaid and expire within 24h; the QA tenant is deleted. PR #166 also made a non-price value refuse with a 503 naming the variable rather than a 502 that reads as an outage, and cleared two walls behind it (a return URL that collided with itself; an idempotency key that turned a retry into a 400). **What is left is the money itself**: a real card charged end to end, and the webhook writing the tier onto the organization — this row's own exit criterion, and nothing above touches it. | [#68](https://github.com/jesushzv/business-helper/issues/68) |
| 4 | **Close the remaining holes in the CLABE gate.** Both holes are closed in code and merged as PR #75 (detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md)): a server-side 409 in front of every path that shares a `/pay/` link, a non-dismissable dashboard banner, disabled share actions, and an onboarding that resumes at the account step. What remains is the issue's third exit criterion — verification against a real deployment with a real organization row, which no PR can satisfy. Needs the founder now, not an agent. | [#64](https://github.com/jesushzv/business-helper/issues/64) |
| 5 | **Verify Stripe webhook signature enforcement** against a staging account — unsigned requests rejected, duplicate deliveries idempotent. **Six of the eight checks now pass against a real Next.js runtime** (`localhost`, 2026-08-09, commit `5331f9d`): signed-accepted, unsigned, wrong-secret, tampered, stale and future-dated. The two that remain — a signed event is applied to a real row, and its redelivery is not — need a database, so they need a staging deployment; `npm run verify:webhook` now exits non-zero and prints `INCOMPLETE` rather than reporting a pass without them. Also fixed in the same pass: the script scored a deployment with **no** `STRIPE_WEBHOOK_SECRET` as four passing checks, and the route would report `200 { processed }` for an UPDATE matching no row — narrow, since the FK on `stripe_webhook_events.organization_id` (verified live 2026-08-09) fails the claim insert first; what the guard closes is the deletion race. Least blocking of the P0s. | [#63](https://github.com/jesushzv/business-helper/issues/63) |

**The UX-audit trio is closed** (#93, #95, #96), each checked against production rather than argued
— transcripts in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md). Residue stays
open in #103/#99 and #113/#114/#123/#124, plus two gaps pinned by unit tests only: a non-owner's
read-only Ajustes, and `/pay`'s no-invented-bank path, which needs a tenant with a contract.

**Both open `bug`-tagged issues are closed in code**, with #115 alongside them. #116: the webhook
no longer writes a Checkout Session's `'complete'` into `subscription_status` — a value
`chk_subscription_status` rejects, failing the write *after* the event is claimed — and an unknown
status is no longer badged "Cancelado" to someone who has just paid. #133: `requireOrgAccess`
resolves the tenant deterministically and logs the ambiguity instead of picking a row at random.
#115: `stripe_customer_id` and `stripe_subscription_id` are stored for the first time, so upgrades
stop minting duplicate Stripe customers and a subscription can be cancelled from the app at all.
Tests, lint and build only: **no live Stripe event, no second organization row**.

**UX-audit work landed since 2026-08-11.** All verified by unit/component tests only — none
re-checked against production or a real handset, which is the part no agent supplies.

| Issues | What changed |
|:--|:--|
| #87, #100 | Every overlay is `components/shared/Modal.tsx`: `role="dialog"`, Escape, focus trap and return, a named ≥48px close, and the `max-h`/`overflow-y-auto` deciding whether the OTP submit is reachable at 375px with the keyboard open |
| #127 | One SAT régimen catalogue (`lib/satRegimenes.ts`) across all five screens; an unlisted stored code renders as itself instead of blanking |
| #88, #90 | Six 375px overflows closed (nowrap flex pairs, intrinsic-width selects, unbroken CLABE/clave/email); the header sticks below the demo banner via a measured `--bh-sticky-offset`; the cookie banner clears the bottom-pinned CTA |
| #99 | Convert-to-contract cannot double-fire (the route already 409s; the button now waits too); CFDI stamping and PAC disconnect ask first, naming the folio cost and the write-only key; native `confirm()`/`alert()` gone. Invoice cancellation split to #174 as a decision |
| #114, #124 | `isClientDemoMode()` stops honouring the never-expiring sandbox flag once a session cookie exists, synchronously; the dashboard treats an all-zero API answer as an answer, so a new tenant sees $0 rather than computed figures |

| #103 | Jargon out of rendered copy (RBAC, SHA-256/HMAC, RLS, TLS, "Sandbox", route templates); English badges translated; provider errors mapped to Spanish via `lib/errorCopy.ts`, original logged; one name per concept; one register (tú) across the client portals. Plan naming split to #185. Gate: `copyRules.test.ts` |

Still open from the audit: #89, #101, #103, #104 (plus #174, split from #99).

**Resolved off this table** (2026-08-07→08, all verified closed): #79, #76, #59, #33, #36, #37, #58
— detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).

> [!NOTE]
> **Most remaining rows need the founder — and the note that said *every* row did was wrong.**
> Rows 1–4 are credentials, accounts, a real handset and a real card; no agent supplies those.
> Rows 5, 6 and 7 were filed here too, and on 2026-08-09 three sessions took their "needs a
> deployment" criteria directly. #96's check **failed**, surfacing two live defects nobody had seen
> (a table missing three columns the code depended on; a write path dropping four fields, two of
> them required to stamp a CFDI). #95's passed, reaching `businesshelper.app` itself over the `http`
> extension from inside Postgres — the shell's egress is blocked, the database's is not. #63's
> signature half now passes against a real Next.js runtime; only its two database checks remain.
> **The rule: ask whether a step needs a *human* or only *reach*.** Schema, grants, constraints,
> PostgREST behaviour and the deployed API are all reachable from the connector. What genuinely
> needs a human is the browser session and the real credential — the rendered page, the code on a
> handset, the card that charges. #79 sat unverifiable for a day and #95 for three weeks for want
> of this distinction. **2026-08-11:** #93 went the same way and moved the line again — an owner's
> session mints from `auth.refresh_tokens` through GoTrue, so the *authenticated* deployed app is
> reachable, not just its public routes. What stayed human was smaller than the criterion implied:
> the hydrated page alone, confirmed in a browser the same day. #64 is next.

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
- **One real production smoke test:** register → quote → WhatsApp send → OTP sign → SPEI upload → confirm.
- **CFDI folio billing.** Folio packs are advertised but cannot be bought ([#24](https://github.com/jesushzv/business-helper/issues/24)),
  and the Inicial tier's pay-per-folio pricing has no billing behind it ([#27](https://github.com/jesushzv/business-helper/issues/27)).
  CFDI ships at launch, so this is revenue the pricing page promises and the product cannot collect.
- ~~**Make the lint warning gate real** ([#46](https://github.com/jesushzv/business-helper/issues/46)).~~
  **Done 2026-08-08** — `--max-warnings=0`, 22 warnings cleared, failure verified with a planted
  warning. (The count was recorded as 1, 3 and 23 before settling at 22 — a fail-open gate is how
  the debt grew unnoticed.) Follow-up: `next/image` for the PNG sites,
  [#82](https://github.com/jesushzv/business-helper/issues/82) (P2).

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
- [ ] Stripe checkout charges a real card in live mode ([#68](https://github.com/jesushzv/business-helper/issues/68)) with a verified webhook ([#63](https://github.com/jesushzv/business-helper/issues/63)) — two halves, tracked separately. Run `npm run verify:stripe` first: it is read-only, and it catches the account and price-map failures before a card is involved
- [ ] Each tier's live Price ID bills the amount the pricing page advertises ([#68](https://github.com/jesushzv/business-helper/issues/68)) — a mismatched map charges the wrong amount and reports success everywhere; `npm run verify:stripe` is the check
- [ ] Every pilot organization has a real CLABE, and payment confirmation reflects a real transfer ([#64](https://github.com/jesushzv/business-helper/issues/64))
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
- [ ] Error monitoring transmits and alerts reach the founder within minutes ([#52](https://github.com/jesushzv/business-helper/issues/52))
- [x] The funnel is instrumented, so a weak result can be diagnosed (#37, PR #56) — wired, not yet read against real traffic
- [x] Lint, typecheck, and **722** vitest tests / 87 files pass; CI runs on PRs (verified on #28 after ten hours of silent absence — see [#38](https://github.com/jesushzv/business-helper/issues/38))

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

1. ~~**Does CFDI invoicing ship at launch?**~~ **Resolved 2026-08-07 — it ships.** Deferral is off
   the table, so [#26](https://github.com/jesushzv/business-helper/issues/26) (one real stamp through
   a live Facturapi sandbox) is blocking, not negotiable.
2. ~~**Which OTP channel?**~~ **Re-resolved 2026-08-11 — email (Resend) at launch; sms/whatsapp
   deprecated but wired.** Supersedes 2026-08-10's "Twilio SMS at launch" (itself a same-day
   reversal: WhatsApp OTP needs a business-owned WABA plus the #42 template — Meta policy — and
   no WABA exists). Email needs one API key and a DNS-verified domain; no carrier registration,
   no per-message cost.
3. **Are there real CLABE account numbers for the pilot organizations?**
4. ~~**`businesshelper.app` or `businesshelper.mx`?**~~ Resolved — `.app`; `.mx` was never
   registered (#36).
5. ~~**Does the September launch date hold?**~~ **Resolved 2026-08-07 — the September date holds,
   at full scope.** Confirmed by the founder alongside decision 1.

   > [!IMPORTANT]
   > **Both halves of the trade were taken, so the schedule has no relief valve left.** The framing
   > offered a choice — hold the date by cutting CFDI, or keep scope and slip. Keeping both means
   > every P0 row in §03 must land, and the only remaining variable is hours (decision 7, open). If
   > the list slips, the next lever is not scope or date but pilot count: fewer pilots, longer and
   > more closely watched.
6. **Ad budget and platform for pilot recruiting**, given pilots are being recruited cold rather than
   from a warm list.
7. **Realistic weekly hours**, given the founder holds a full-time job. This determines whether
   "1–2 focused weeks" is two calendar weeks or closer to a month.
8. ~~**Merge posture on PRs #20 and #23.**~~ Moot — both merged 2026-08-07 (§02).
9. **Preferred pivot path** if the kill criteria in [`okrs.md`](01-strategy/okrs.md) trigger:
   narrow to one module, freeze for a validation-only sprint, or wind down and redirect the time.
   Worth deciding while calm rather than mid-crisis.

---

## 06 Verification Method

So this reconciliation can be repeated rather than trusted:

```bash
npm ci
npx vitest run                 # 910 tests / 104 files as of 2026-08-09
                               # (earlier counts, and what each pass verified, are in the frozen
                               #  log at docs/99-archive/status-log-2026-08.md)
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
