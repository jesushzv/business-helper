# Launch Readiness Memo: Business Helper

> **Ground-Truth Reconciliation, Priority Stack & Launch Gate**
>
> *Prepared: 2026-08-07 | Verified against `main` @ `5c35719`*
> *Method: repo docs reconciled against actual source, dependency manifest, test run, and the live issue tracker (issues #2, #3, #14, #17, #22; PRs #1–#23).*

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
| Test suite | 182/182 via `scripts/test-runner.js` | **383 tests / 58 files**, `npx vitest run` — runner file no longer exists |
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

| Item | State | Blocks launch? |
|:---|:---|:---|
| **#3** / PR **#23** — real CFDI via PAC | Draft PR, unmerged. Code complete and well-tested against a mocked `fetch`; **never executed against a live Facturapi sandbox**. | Yes, if CFDI ships at launch |
| **#17** / PR **#20** — OTP rate limit per phone | Open PR, unmerged. Without it, one phone can be pumped across quotes — each quote carries its own cooldown. | Yes — must land before any OTP provider goes live |
| **#2** — OTP provider configuration | Code merged; credentials not in the environment. Never tested against a real handset. | Yes — the signature flow cannot function |
| **#14** — post-merge operational setup | Per-org CLABE configuration, Stripe webhook staging verification, deployment doc sign-off | Yes |
| **#22** — OTP escalating backoff + daily cap | Not started. Hardening on top of #17. | No — can trail launch |

Both open PRs carry pending migrations that **must be applied before the code deploys**:
`20260807000000_otp_send_rate_limit.sql` (#20) and `20260807120000_cfdi_pac_integration.sql` (#23).
Deploying either branch without its migration returns 500s from the affected routes.

---

## 03 Priority Stack

### P0 — Blocking: money and compliance cannot be simulated

1. **Decide whether CFDI invoicing ships at launch or becomes a fast-follow.** This is the single
   decision that most changes the critical path. See §05 Q1.
2. If it ships — obtain a live Facturapi sandbox key and execute PR #23's stamping flow end-to-end
   once, for real. Mocked `fetch` coverage is not evidence that the PAC integration works.
3. **Merge PR #20** (OTP per-phone rate limiting) before any provider is live.
4. **Configure one OTP channel** — Twilio SMS is the pragmatic default — set `OTP_DELIVERY_CHANNEL`,
   and verify a real code arrives on a real handset and cannot be replayed.
5. **Apply both pending migrations to production** before deploying the code that depends on them.
6. **Make CLABE a hard gate in onboarding.** Each organization supplies its own CLABE — that is correct
   and non-negotiable if they want to take payments, so this is an onboarding requirement rather than
   something to provision for them. What needs verifying is that the product *enforces* it: an org
   without a CLABE must not be able to send a payment link, and the 409 path must be exercised rather
   than falling back to anything. Confirm `components/settings/BankAccountCard.tsx` is reachable early
   in onboarding, not buried in settings.
7. **Wire product analytics before the first user arrives.** There is none today — no PostHog, Mixpanel,
   GA, or Vercel Analytics anywhere in the codebase, despite the GTM plan naming Mixpanel/PostHog.
   Without funnel instrumentation, a disappointing launch is uninterpretable: you cannot tell whether
   users did not want the product or could not finish signing up. Minimum viable set — signup started,
   signup completed, first client created, first quote created, quote sent, quote signed, payment
   confirmed. Roughly an hour of work with PostHog's free tier, and it is what makes every other number
   in this document mean something.
8. **Verify Stripe webhook signature enforcement** against a staging account — confirm unsigned
   requests are rejected and duplicate deliveries are idempotent. `npm run verify:webhook` exists for this.

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
- **Apply the domain decision end to end.** `businesshelper.app` is the domain; `.mx` was never registered.
  Docs are corrected. **Still outstanding in source:** `components/quotes/QuoteCard.tsx:26` falls back to a
  hardcoded `https://businesshelper.mx/q/...` when rendered server-side, so a quote link can be sent to a
  client pointing at a domain nobody owns; and `.env.example` needed the same fix. Confirm the apex is
  pointed at Vercel with SSL, then sync the Supabase Auth Site/Redirect URLs and the Stripe webhook endpoint.
- **OTP escalating backoff + daily cap** (#22) — without it, a pilot user legitimately signing several
  quotes in one sitting can lock themselves out against the flat 5/hour window.
- **One real production smoke test:** register → quote → WhatsApp send → OTP sign → SPEI upload → confirm.
- **CFDI folio-pack purchase route.** `createFolioPackCheckoutPayload` exists in `lib/stripe.ts` and the
  read path honours `cfdi_folios_purchased`, but no route creates the session and no webhook credits it.
- **Make the lint warning gate real.** Change the `lint` script to `next lint --max-warnings=0` and clear
  the existing warning in `components/layout/Header.tsx` (an `<img>` that should be `next/image`). Until
  then, five documents describe a gate that does not run. Cheap to fix and it stops the same drift recurring.

### P2 — Can trail launch by weeks

- Complemento de Pago for PPD milestones — `buildComplementoPagoPayload` is built but not wired to the
  payment-confirmation path.
- Animated demo video — storyboarded in [`demo_video_storyboard.md`](../03-product-specs/demo_video_storyboard.md), not produced.
- AI assistant live RAG grounding — partially mocked.

---

## 04 Launch Gate

Run top to bottom before announcing. Every P0 item above collapses into one of these.

### Money path integrity
- [ ] A CFDI issued in the app corresponds to a real SAT UUID — **or** CFDI is explicitly disabled for launch
- [ ] Stripe checkout charges a real card in live mode with a verified webhook
- [ ] Every pilot organization has a real CLABE, and payment confirmation reflects a real transfer

### Signature & communications integrity
- [ ] A signer receives a real OTP on a real handset within ~10s on the configured channel
- [ ] OTP issuance is capped per recipient phone, not per quote (PR #20 merged)
- [x] Outbound WhatsApp reminders actually send (#13)

### Operational floor
- [ ] Production Supabase migrations applied, including both pending ones
- [ ] Error monitoring transmits and alerts reach the founder within minutes
- [x] Lint, typecheck, and 383 vitest tests pass; CI runs on push

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

1. **Does CFDI invoicing ship at launch, or is it deferred?** PR #23 is code-complete but has never
   touched a live PAC. Deferring means launching with Quotes + AR + Client CRM only — which is closer
   to the PRD's own stated MVP ("start even leaner with just Quotes + Receivables") than the current scope.
2. **Which OTP channel — Twilio SMS, Twilio WhatsApp, or Meta Cloud API?** All three are implemented.
   Is an account provisioned, and is WhatsApp Business API approval (which takes days) already in motion?
3. **Are there real CLABE account numbers for the pilot organizations?**
4. **`businesshelper.app` or `businesshelper.app`?** Docs and commit history disagree.
5. **Does the September launch date hold?** The P0 list is roughly 1–2 focused weeks for one person —
   real work, not documentation cleanup. Hold the date by cutting CFDI, or slip and keep full scope?
6. **Ad budget and platform for pilot recruiting**, given pilots are being recruited cold rather than
   from a warm list.
7. **Realistic weekly hours**, given the founder holds a full-time job. This determines whether
   "1–2 focused weeks" is two calendar weeks or closer to a month.
8. **Merge posture on PRs #20 and #23** — review and merge, or founder reads them first?
9. **Preferred pivot path** if the kill criteria in [`okrs.md`](../01-strategy/okrs.md) trigger. Three
   candidates: narrow to a single module; freeze development for a validation-only sprint; or wind down
   cleanly and redirect the time. Worth deciding while calm rather than mid-crisis.

---

## 06 Verification Method

So this reconciliation can be repeated rather than trusted:

```bash
npm ci
npx vitest run                 # 383 tests / 58 files as of 5c35719
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
