<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# STATUS — Business Helper

> **The single source of truth for what is and is not done.**
>
> *Last verified: 2026-08-08 against `main` @ `a378c7e` (post #102). Suite re-run for this pass;
> merge state of every row in §02 confirmed with `git log`.*
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
| Test suite | 182/182 via `scripts/test-runner.js` | **722 tests / 87 files**, `npx vitest run` (2026-08-08) — runner file no longer exists |
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
| ~~**Production migrations**~~ | ✅ All four are applied to the production project and confirmed by schema inspection (2026-08-08, detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md)). The routes are no longer blocked on schema. What #62 still wants is one live request against each affected route. | Cleared |
| ~~**Product analytics**~~ | ✅ Merged (#56) — the seven-event quote-to-cash funnel is wired. Not yet read against real traffic. | Cleared |
| **#14** — operational setup | Split on 2026-08-07 into #62 (migrations), #63 (Stripe webhook staging), #64 (CLABE gate) so each maps to one P0. #14 now holds the `security-p0-remediation.md` §5 checklist and deployment-doc sign-off. | Yes |
| ~~**#3** / PR #23 — real CFDI via PAC~~ | ✅ Merged. `lib/pacClient.ts` stamps for real; `simulateInvoiceStamping()` and its "graceful fallback" are both gone. | Cleared |
| ~~**#17** / PR #20 — OTP rate limit per phone~~ | ✅ Merged. Issuance is now capped on the recipient phone across quotes. | Cleared |
| ~~Complemento de Pago~~ | ✅ Merged (#29) — filed when a PPD milestone is confirmed. Was P2. | Cleared |
| **#22** — OTP escalating backoff + daily cap | Not started. Hardening on top of #17. | No — can trail launch |

### Recently landed (2026-08-07 → 2026-08-08)

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
| 1 | **Schema is applied — one live request per route is what remains.** On 2026-08-08 the production schema was inspected directly: `20260807000000` and `20260807120000` were already live, `20260807170000` (complementos) was not and has since been applied, along with `20260808030000` (folio RPC grants) and `20260809000000` (organization phone). All confirmed present by inspection, not by an exit code. The root dependency is cleared; #62's last exit criterion is a real request against `POST /api/quotes/public/[token]/otp`, `POST /api/invoices/issue` and the complemento path, which needs the founder. | [#62](https://github.com/jesushzv/business-helper/issues/62) |
| 2 | **Configure one OTP channel.** Twilio SMS: fastest to provision, no business-verification wait, and at pilot volume the premium over WhatsApp is a few dollars a month. Set `OTP_DELIVERY_CHANNEL=sms`, then verify a real code lands on a real handset and cannot be replayed. Per-recipient rate limiting is already in place (#20). Without this no quote can be signed at all, so it gates the end-to-end check for everything else. | [#2](https://github.com/jesushzv/business-helper/issues/2) |
| 3 | **Issue one CFDI through a live Facturapi sandbox, end to end.** Confirm a real SAT UUID returns and the stored XML and PDF open. Mocked `fetch` coverage proves the code is correct, not that the integration works — this is the last thing between "merged" and "trustworthy." | [#26](https://github.com/jesushzv/business-helper/issues/26) |
| 4 | **Enable Stripe live mode.** Live secret key, a live Price ID mapped per pricing-page tier, and one real card charged. `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` are marked "Launch Gate — P0" in the roadmap and were tracked **nowhere** until 2026-08-07; #63 covers only the webhook half of §04's "charges a real card in live mode with a verified webhook". Needed before the first trial converts rather than before the first user signs up, which is why it sits below the loop-blocking items. | [#68](https://github.com/jesushzv/business-helper/issues/68) |
| 5 | **Close the remaining holes in the CLABE gate.** Both holes are closed in code and merged as PR #75 (detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md)): a server-side 409 in front of every path that shares a `/pay/` link, a non-dismissable dashboard banner, disabled share actions, and an onboarding that resumes at the account step. What remains is the issue's third exit criterion — verification against a real deployment with a real organization row, which no PR can satisfy. Needs the founder now, not an agent. | [#64](https://github.com/jesushzv/business-helper/issues/64) |
| 6 | **The UX-audit trio: demo identity, fabricated settings save, fabricated client history.** All three fixed in code on 2026-08-08 (detail in [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md)): real org/user identity in chrome and outbound WhatsApp with a logout that finally exists (#93); Ajustes reads and writes the real organization row instead of localStorage + a 405 (#95); client detail derives its financial modules from real rows behind a three-state loading gate (#96). Each stays open on its deployed-verification exit criterion — one pass through a real tenant's dashboard, Ajustes save, and a client page covers all three. | [#93](https://github.com/jesushzv/business-helper/issues/93) · [#95](https://github.com/jesushzv/business-helper/issues/95) · [#96](https://github.com/jesushzv/business-helper/issues/96) |
| 7 | **Verify Stripe webhook signature enforcement** against a staging account — unsigned requests rejected, duplicate deliveries idempotent. `npm run verify:webhook` exists for this. Least blocking: it protects a path a SPEI-first pilot may barely exercise, and it fails by rejecting a legitimate webhook rather than by fabricating a financial fact. | [#63](https://github.com/jesushzv/business-helper/issues/63) |

**Resolved off this table on 2026-08-08:** [#79](https://github.com/jesushzv/business-helper/issues/79)
— the PGRST201 prediction was **confirmed against live PostgREST** (every `/pay/` link had 404'd
since the route existed) and both embeds are hinted, with a scan test pinning the pattern; closes
with the PR. [#76](https://github.com/jesushzv/business-helper/issues/76) — closed; live
`aclexplode` sweep ran clean. [#59](https://github.com/jesushzv/business-helper/issues/59) —
closed as already-done (PR #75).

**Cleared since this section was first written** (2026-08-07, all verified closed on the tracker):
[#33](https://github.com/jesushzv/business-helper/issues/33) payment confirmation (PR #55) ·
[#36](https://github.com/jesushzv/business-helper/issues/36) `.mx` quote links (PR #47) ·
[#37](https://github.com/jesushzv/business-helper/issues/37) product analytics (PR #56) ·
[#58](https://github.com/jesushzv/business-helper/issues/58) the public signing page rendering a
fixture quote for every token (PR #57) — never listed as a P0 and worse than several that were.

> [!NOTE]
> **Every remaining row needs the founder.** As of 2026-08-08 there is no open P0 whose next step
> an agent can take: rows 1–4 and 7 are credentials, accounts, a real handset and a real card;
> rows 5 and 6 are code that is done and waiting on one pass through a real deployment. The
> agent-closable items (#59, #76, #79, and the code halves of #93/#95/#96) have all been taken.
> The founder rows do not block each other, and row 6's walkthrough can piggyback on row 5's.

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
npx vitest run                 # 722 tests / 87 files as of 2026-08-08
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
