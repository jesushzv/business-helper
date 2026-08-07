# Product Analytics: The Seven-Event Funnel

> **What is instrumented, where each event fires, and how to read the result**
>
> *Added 2026-08-07 for [issue #37](https://github.com/jesushzv/business-helper/issues/37) — P0 item 5 in
> [`launch_readiness_memo_aug2026.md`](launch_readiness_memo_aug2026.md) §03.*

---

## 01 Why This Exists

The launch is meant to answer one question: do Mexican SMBs want this product? A disappointing
result has three explanations that look identical in the absence of a funnel.

| What happened | What it means | What to do |
|:---|:---|:---|
| They understood the product and did not want it | Real signal | Act on it — pivot or reposition |
| They wanted it but never got through onboarding | Broken funnel | Fix a small thing and retry |
| They created a quote and the client never received it | A bug | Fix the bug |

Guessing wrong is expensive in both directions: pivoting away from a product that worked, or
grinding on one nobody wanted. `okrs.md` also commits to KR 1.2 (trial-to-paid > 25%) and KR 1.3
(onboarding completion > 80%); neither is measurable without this.

---

## 02 The Events

Seven events cover the loop from landing page to money received. Nothing else is captured —
`PRODUCT_EVENTS` in [`lib/analytics.ts`](../../lib/analytics.ts) is the complete list, and any name
outside it is refused rather than recorded.

| Event | Fires at | Where | Question it answers |
|:---|:---|:---|:---|
| `signup_started` | Registration form mounts | `app/(auth)/register/page.tsx` | Is the landing page converting? |
| `signup_completed` | Supabase returns a user | `app/(auth)/register/page.tsx` | Where does registration lose people? |
| `client_created` | Client row inserted | `app/api/clients/route.ts` | Did they get past the empty state? |
| `quote_created` | Quote row inserted | `app/api/quotes/route.ts` | **Activation** — the "aha" moment per the PRD |
| `quote_sent` | WhatsApp share clicked | `components/quotes/QuoteCard.tsx` | Did they trust it enough to send to a real client? |
| `quote_signed` | OTP verified, signature written | `app/api/quotes/public/[token]/route.ts` | Does the OTP flow work for *their* clients? |
| `payment_confirmed` | Milestone marked confirmed | `app/api/receivables/[id]/confirm/route.ts` | Did the loop close? |

Two placement decisions are load-bearing:

- **Server events fire after the write returned a row**, not when the request arrived. An event
  recorded on intent measures intent; the funnel needs outcomes. This is the same defect class the
  memo catalogues elsewhere — a product asserting something that never happened — applied to
  measurement instead of money.
- **`quote_sent` is the WhatsApp click, not the `sent` status.** Quotes are stored as `sent` from
  creation (`useQuotes.createQuote`), so the stored status cannot distinguish "made a quote to try
  the product" from "put it in front of a paying client." The `wa.me` hand-off is the only moment
  the product observes that decision.

Every event carries `organization_id`, so any funnel can be segmented per tenant. That is what makes
KR 1.2 and KR 1.3 readable as rates rather than raw counts.

---

## 03 How It Is Wired

```
browser ──POST /api/analytics/event──► our server ──POST /i/v0/e/──► PostHog
route handler ──trackServerEvent()──► after() ──────────────────────► PostHog
```

- **[`lib/analytics.ts`](../../lib/analytics.ts)** — the event set, property sanitization, payload
  construction, and the capture call itself. Isomorphic and dependency-free.
- **[`lib/analyticsServer.ts`](../../lib/analyticsServer.ts)** — `trackServerEvent()` for route
  handlers. Runs the capture inside Next's `after()`, so it costs the response no latency and still
  completes; an un-awaited promise is frozen the moment a serverless response is sent, which is how
  fire-and-forget analytics quietly loses most of its events.
- **[`lib/analyticsClient.ts`](../../lib/analyticsClient.ts)** — `trackClientEvent()` for the three
  events that only the browser sees.
- **[`app/api/analytics/event/route.ts`](../../app/api/analytics/event/route.ts)** — validates the
  event name, resolves identity from the session cookie, forwards.

**No vendor SDK.** Every third party in this codebase — Twilio, Facturapi, Stripe — is called over
its HTTP API with `fetch`, and none appears in `package.json`. PostHog's capture endpoint is one
POST, so analytics follows the same shape. The browser never contacts PostHog: there is no tracking
script in the bundle, the project key stays server-side, and an ad blocker cannot delete the top of
the funnel. The cost is that autocapture, pageviews and session replay are unavailable. The seven
events are what the funnel needs; if session replay becomes worth its own trade-off later, that is a
separate decision.

**Identity.** `signup_started` happens before an account exists, so it is recorded against an
anonymous id minted in the browser. When a session appears, `/api/analytics/event` sends PostHog's
`$identify` alias to merge that visitor into the user id every later event uses. Without the alias
the funnel would drop 100% at step two by construction.

---

## 04 Personal Data

Event properties reach a third party that the organization's own data-processing arrangements do not
cover, so RFCs, CLABEs, phone numbers, emails and personal names must not appear in them.
`sanitizeEventProperties()` enforces this two ways, so a mistake at a call site fails closed:

- **By property name** — tokens like `name`, `rfc`, `clabe`, `phone`, `email`, `postal`, `ip`, `otp`.
  Matching is on tokens, not substrings, so `quote_id` survives and `contact_name` does not.
- **By value shape** — an email, an RFC-shaped string, or a 10–18 digit run with no letters is
  dropped whatever it was called. Dates, ISO timestamps and UUIDs are not mistaken for it.

Booleans are always kept: `has_rfc` says whether a client can be invoiced, and one bit cannot
identify anyone. That is the intended pattern — derive the flag at the call site, never send the
value. Objects and arrays are dropped rather than serialized, since a nested payload is exactly how
a whole client record ends up in an analytics property.

**Consent.** The cookie notice offers "Aceptar Todo" and "Solo Esenciales" and declares essential
cookies plus *anonymous* navigation analytics, per the LFPDPPP. The client module honours that
literally: with full consent the anonymous id is persisted in `localStorage`, so a returning visitor
is the same person in the funnel; with essential-only consent the id lives in memory for the current
page and nothing is written to the device. Events are recorded in both cases — that is the anonymous
analytics the notice declares — but only one of them creates a persistent identifier.

---

## 05 Turning It On

1. Create a PostHog project (the free tier covers 1M events/month, far beyond pilot volume).
2. Set `POSTHOG_API_KEY` (the `phc_...` project key) in the Vercel environment. Set `POSTHOG_HOST`
   only for the EU region or a self-hosted instance.
3. Redeploy. Without the key every capture is a no-op, which is why local development and the demo
   deployment send nothing and no call site has to check first.
4. In PostHog, build one funnel: `signup_started → signup_completed → client_created →
   quote_created → quote_sent → quote_signed → payment_confirmed`, breakdown by `organization_id`.

**Exit criterion for #37:** that funnel is visible, and for any drop-off it is possible to say
whether users chose to stop or were prevented from continuing.

---

## 06 Known Limits

- **Google OAuth signups do not record `signup_completed`.** The flow redirects away and returns to
  `/auth/callback`, a route that does not exist yet ([#48](https://github.com/jesushzv/business-helper/issues/48)).
  When that route lands, the event belongs in it.
- **`signup_started` is open to an unauthenticated caller** — that is inherent in an event that
  precedes the account. `quote_sent` requires a session and the other four cannot be reported from a
  browser at all, so the only forgeable number is the top of the funnel. Watch for an implausible
  ratio against `signup_completed` rather than treating volume alone as signal.
- **No pageviews, autocapture or session replay**, by the choice recorded in §03. Drop-off is visible
  between the seven steps, not within a single screen.
- **Onboarding completion (KR 1.3) is measured as `signup_completed → client_created`**, since
  organization creation has no event of its own. If that proxy proves too coarse, an
  `onboarding_completed` event at `POST /api/organization` is the smallest addition that fixes it.
