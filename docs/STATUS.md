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
| Zero-warning lint gate | "ESLint passes with `--max-warnings=0`" (5 docs) | **Gate is nominal.** `npm run lint` is bare `next lint` — it exits 0 while emitting warnings, and there is a live one in `components/layout/Header.tsx`. Nothing enforces the threshold. |

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
| **Production migrations** | `20260807000000_otp_send_rate_limit.sql` (#20) and `20260807120000_cfdi_pac_integration.sql` (#23) are on `main` now. Applying them is manual and Vercel auto-deploys `main`, so **the deploy can outrun the schema** — the OTP and invoice routes return 500 until they land. | **Yes** |
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
| 1 | **Apply the three pending migrations before the deploy that carries them.** Vercel auto-deploys `main` and migrations are manual, so the code outruns the schema. Note: **three**, not two — the complementos migration from #29 landed after the earlier wording here. This is the root dependency; every P0 below that needs a deployed environment runs through a route it blocks. `npm run db:migrate:dry` first. | [#62](https://github.com/jesushzv/business-helper/issues/62) |
| 2 | **Configure one OTP channel.** Twilio SMS: fastest to provision, no business-verification wait, and at pilot volume the premium over WhatsApp is a few dollars a month. Set `OTP_DELIVERY_CHANNEL=sms`, then verify a real code lands on a real handset and cannot be replayed. Per-recipient rate limiting is already in place (#20). Without this no quote can be signed at all, so it gates the end-to-end check for everything else. | [#2](https://github.com/jesushzv/business-helper/issues/2) |
| 3 | **Issue one CFDI through a live Facturapi sandbox, end to end.** Confirm a real SAT UUID returns and the stored XML and PDF open. Mocked `fetch` coverage proves the code is correct, not that the integration works — this is the last thing between "merged" and "trustworthy." | [#26](https://github.com/jesushzv/business-helper/issues/26) |
| 4 | **Enable Stripe live mode.** Live secret key, a live Price ID mapped per pricing-page tier, and one real card charged. `STRIPE_SECRET_KEY` and `STRIPE_PRICE_*` are marked "Launch Gate — P0" in the roadmap and were tracked **nowhere** until 2026-08-07; #63 covers only the webhook half of §04's "charges a real card in live mode with a verified webhook". Needed before the first trial converts rather than before the first user signs up, which is why it sits below the loop-blocking items. | [#68](https://github.com/jesushzv/business-helper/issues/68) |
| 5 | **Close the remaining holes in the CLABE gate.** Onboarding now collects the settlement account and the 409 refusal has behavioural coverage. Still open: an organization created before that step, or one that abandons it between the `POST` and the `PATCH`, has no CLABE and is never asked again — the 409 then fires in front of the paying client. | [#64](https://github.com/jesushzv/business-helper/issues/64) |
| 6 | **Stop `useQuotes` asserting a contract that was never created.** `convertToContract` flipped status locally and announced "convertida a contrato con 2 hitos de cobranza" whether or not the route succeeded — the #33 defect on the step that opens the receivable. Promoted from unranked on 2026-08-07. | [#59](https://github.com/jesushzv/business-helper/issues/59) |
| 7 | **Verify Stripe webhook signature enforcement** against a staging account — unsigned requests rejected, duplicate deliveries idempotent. `npm run verify:webhook` exists for this. Least blocking of the six: it protects a path a SPEI-first pilot may barely exercise, and it fails by rejecting a legitimate webhook rather than by fabricating a financial fact. | [#63](https://github.com/jesushzv/business-helper/issues/63) |

**Cleared since this section was first written** (2026-08-07, all verified closed on the tracker):
[#33](https://github.com/jesushzv/business-helper/issues/33) payment confirmation (PR #55) ·
[#36](https://github.com/jesushzv/business-helper/issues/36) `.mx` quote links (PR #47) ·
[#37](https://github.com/jesushzv/business-helper/issues/37) product analytics (PR #56) ·
[#58](https://github.com/jesushzv/business-helper/issues/58) the public signing page rendering a
fixture quote for every token (PR #57) — never listed as a P0 and worse than several that were.

> [!NOTE]
> **Rows 1–4 and 7 need the founder; rows 5–6 need an agent.** The founder rows are
> credentials, accounts, a real handset and a real card — no PR can close them. They do not
> block the agent rows, so the two tracks run in parallel, which is most of the slack left in
> a September date that decision 5 fixed at full scope.

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
- **Make the lint warning gate real** ([#46](https://github.com/jesushzv/business-helper/issues/46)).
  Change the `lint` script to `next lint --max-warnings=0` and clear the existing warnings first.
  **There are 23, not one** — 14 × `no-img-element` and 9 × unused imports across 8 files, half in
  `app/page.tsx`; the full inventory is in #46. (This line originally said `Header.tsx` only, was
  "corrected" to three, and both counts came from reading a truncated tail of the lint output —
  the gate being fail-open is exactly why the debt grew unnoticed.) Until the script enforces the
  threshold, five documents describe a gate that does not run.

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
- [ ] Production Supabase migrations applied — **all three** from #20, #23 and #29 ([#62](https://github.com/jesushzv/business-helper/issues/62))
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
