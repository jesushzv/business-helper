# Launch Readiness Memo: Business Helper

> **Ground-Truth Reconciliation, Priority Stack & Launch Gate**
>
> *Prepared: 2026-08-07 | Verified against `main` @ `c67f229` (post #20 / #23 / #29)*
> *Method: repo docs reconciled against actual source, dependency manifest, test run, and the live issue tracker (PRs #1–#29; issues #2, #14, #22, #24, #26, #27, #30–#38).*

This document is the source of truth for launch status. It supersedes the completion claims in
[`product-roadmap.md`](../03-product-specs/product-roadmap.md) wherever they conflict — where a doc says a
feature is done and the code says otherwise, **the code wins.** (`product_readiness_snapshot.md` carried a
competing status dashboard; it was collapsed to a module capabilities reference on 2026-08-07.)

An HTML rendering of this memo is published at
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
| **Product analytics** | None exist. Launching without a funnel makes a weak result uninterpretable. | **Yes** — see P0 §03 |
| **#14** — operational setup | CLABE enforcement in onboarding, Stripe webhook staging verification, deployment doc sign-off. | Yes |
| ~~**#3** / PR #23 — real CFDI via PAC~~ | ✅ Merged. `lib/pacClient.ts` stamps for real; `simulateInvoiceStamping()` and its "graceful fallback" are both gone. | Cleared |
| ~~**#17** / PR #20 — OTP rate limit per phone~~ | ✅ Merged. Issuance is now capped on the recipient phone across quotes. | Cleared |
| ~~Complemento de Pago~~ | ✅ Merged (#29) — filed when a PPD milestone is confirmed. Was P2. | Cleared |
| **#22** — OTP escalating backoff + daily cap | Not started. Hardening on top of #17. | No — can trail launch |

---

## 03 Priority Stack

### P0 — Blocking: money and compliance cannot be simulated

✅ **CFDI ships at launch** — decided. PR #23 is merged, so the code is real.

| # | Item | Tracked |
|:--|:---|:---|
| 1 | **Issue one CFDI through a live Facturapi sandbox, end to end.** Confirm a real SAT UUID returns and the stored XML and PDF open. Mocked `fetch` coverage proves the code is correct, not that the integration works — this is the last thing between "merged" and "trustworthy." | [#26](https://github.com/jesushzv/business-helper/issues/26) |
| 2 | **Configure one OTP channel.** Twilio SMS: fastest to provision, no business-verification wait, and at pilot volume the premium over WhatsApp is a few dollars a month. Set `OTP_DELIVERY_CHANNEL=sms`, then verify a real code lands on a real handset and cannot be replayed. Per-recipient rate limiting is already in place (#20). | [#2](https://github.com/jesushzv/business-helper/issues/2) |
| 3 | **Stop reporting payments as confirmed when the write failed.** `useReceivables` fires the request and discards the outcome, so a 401/403/500 still shows `confirmed`, persists to `localStorage`, and moves the "cobrado este mes" total. This is the CFDI defect one layer up — the product asserting a financial fact that never happened — and it sits on the step that closes the core loop. | [#33](https://github.com/jesushzv/business-helper/issues/33) |
| 4 | **Fix quote links falling back to `businesshelper.mx`.** Server-rendered quote URLs point at a domain nobody owns, embedded in the WhatsApp message sent to the client. Same component hardcodes a stranger's phone number when a client has none. | [#36](https://github.com/jesushzv/business-helper/issues/36) |
| 5 | **Wire product analytics before the first user arrives.** None exists. Without a funnel, a disappointing launch cannot be read: no way to separate "did not want it" from "could not finish signing up." Seven events cover the loop. ~1 hour on PostHog's free tier, and it is what makes every other number here mean something. | [#37](https://github.com/jesushzv/business-helper/issues/37) |
| 6 | **Apply both migrations to production before the deploy that carries them.** They are on `main` now and Vercel auto-deploys `main`, so the code can outrun the schema. `npm run db:migrate:dry` first. | [#14](https://github.com/jesushzv/business-helper/issues/14) |
| 7 | **Make CLABE a hard gate in onboarding.** Each organization supplies its own — correct and non-negotiable for taking payments, so this is an onboarding requirement, not something to provision for them. Verify the product *enforces* it: no payment link without a CLABE, 409 exercised rather than falling back, and `BankAccountCard` reachable early rather than buried in settings. | [#14](https://github.com/jesushzv/business-helper/issues/14) |
| 8 | **Verify Stripe webhook signature enforcement** against a staging account — unsigned requests rejected, duplicate deliveries idempotent. `npm run verify:webhook` exists for this. | [#14](https://github.com/jesushzv/business-helper/issues/14) |

> [!IMPORTANT]
> **The scope principle these items serve.** The founder's stated constraint is to launch fast without
> mistaking an incomplete product for weak product-market fit. That gives a sharper rule than "ship the
> MVP": **ship the minimum where a negative result is trustworthy.** Every P0 item above is one that,
> left undone, produces a false negative — users who wanted the product but could not sign a quote,
> could not be invoiced, or dropped out of a funnel nobody was measuring. Anything that cannot generate
> a false negative belongs in P2, however visible it is.

### P1 — Makes launch week survivable

- **Wire real error monitoring.** Add `@sentry/nextjs` (or an equivalent that actually transmits) and
  route alerts to your phone. Currently a console shim; you are solo and will not otherwise see a 500.
- **Point the domain at Vercel.** `businesshelper.app` is the domain; `.mx` was never registered. Docs and
  `.env.example` are corrected; the source instance is [#36](https://github.com/jesushzv/business-helper/issues/36) (P0 above).
  Confirm the apex resolves with SSL, then sync the Supabase Auth Site/Redirect URLs and the Stripe
  webhook endpoint to it.
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
  Change the `lint` script to `next lint --max-warnings=0` and clear the `<img>`-should-be-`next/image`
  warnings first. **There are three, not one** — `AppShell.tsx:76`, `Footer.tsx:18`, `Header.tsx:30`
  (verified 2026-08-07; this line and #38 previously recorded only `Header.tsx`). Until then, five
  documents describe a gate that does not run. Cheap to fix and it stops the same drift recurring.

### P2 — Can trail launch by weeks

- Complemento de pago gaps: the request body has never reached a real PAC ([#34](https://github.com/jesushzv/business-helper/issues/34)),
  the accountant export omits complementos ([#31](https://github.com/jesushzv/business-helper/issues/31)),
  and one stamped in error cannot be cancelled ([#30](https://github.com/jesushzv/business-helper/issues/30)).
  *(Filing on PPD confirmation itself landed in #29.)*
- Migrations never execute against a real Postgres in CI, so RLS, grants and CHECK constraints are
  unverifiable ([#35](https://github.com/jesushzv/business-helper/issues/35)).
- `parseNaturalLanguageQuery` is keyword matching rather than a model. It now reports `engine: 'rules'`
  instead of implying otherwise, so it is honest but not intelligent. Degrades gracefully; does not gate launch.
- Animated demo video — storyboarded in [`demo_video_storyboard.md`](../03-product-specs/demo_video_storyboard.md), not produced.

---

## 04 Launch Gate

Run top to bottom before announcing. Every P0 item above collapses into one of these.

### Money path integrity
- [ ] A CFDI issued in the app corresponds to a real SAT UUID ([#26](https://github.com/jesushzv/business-helper/issues/26)) — CFDI ships at launch, so this is required
- [ ] Stripe checkout charges a real card in live mode with a verified webhook
- [ ] Every pilot organization has a real CLABE, and payment confirmation reflects a real transfer
- [ ] A failed confirmation write is reported as failed, not as `confirmed` ([#33](https://github.com/jesushzv/business-helper/issues/33))

### Signature & communications integrity
- [ ] A signer receives a real OTP on a real handset within ~10s on the configured channel ([#2](https://github.com/jesushzv/business-helper/issues/2))
- [ ] The quote link a client receives resolves ([#36](https://github.com/jesushzv/business-helper/issues/36))
- [x] OTP issuance is capped per recipient phone, not per quote (#20 merged)
- [x] Outbound WhatsApp reminders actually send (#13)

### Operational floor
- [ ] Production Supabase migrations applied, including the two from #20 and #23
- [ ] Error monitoring transmits and alerts reach the founder within minutes
- [ ] The funnel is instrumented, so a weak result can be diagnosed ([#37](https://github.com/jesushzv/business-helper/issues/37))
- [x] Lint, typecheck, and **494** vitest tests pass; CI runs on PRs (verified on #28 after ten hours of silent absence — see [#38](https://github.com/jesushzv/business-helper/issues/38))

### Commercial gate (inherited)
The [go-to-market plan](../01-strategy/go-to-market-plan.md) sets a Gate 0 before paid acquisition:
Launch Readiness ≥ 7.0, Mobile ≥ 6.0, Credibility ≥ 7.0.

> [!NOTE]
> [`product_readiness_workback.md`](product_readiness_workback.md) records Gate 1 as **passed at 7.5/10**,
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
9. **Preferred pivot path** if the kill criteria in [`okrs.md`](../01-strategy/okrs.md) trigger. Three
   candidates: narrow to a single module; freeze development for a validation-only sprint; or wind down
   cleanly and redirect the time. Worth deciding while calm rather than mid-crisis.

---

## 06 Verification Method

So this reconciliation can be repeated rather than trusted:

```bash
npm ci
npx vitest run                 # 494 tests / 64 files as of the #20/#23/#29 merge
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

*Document maintained under `docs/04-execution-testing/launch_readiness_memo_aug2026.md` per [AGENTS-DOCS-GUIDE.md](../AGENTS-DOCS-GUIDE.md).*
