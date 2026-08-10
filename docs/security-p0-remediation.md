# P0 Security Remediation — Deployment Notes

Four critical findings in the money paths, with the code changes that close
them and what must be configured before this ships.

**These fixes are not self-activating.** Three of the four depend on
environment variables and a database migration. Deploying the code without the
steps in §2 and §3 will take the affected flows from *insecure* to *broken* —
signing and public payment pages fail closed by design rather than falling back
to the old behaviour.

---

## 1. What was wrong, and what changed

### P0-1 — The OTP e-signature was forgeable

`POST /api/quotes/public/[token]` read the expected code (`serverOtp`) from the
same request body as the submitted code and compared the two. A single request
with both fields set to the same value signed any quote:

```
curl -X POST /api/quotes/public/<token> \
  -d '{"otpCode":"111111","serverOtp":"111111"}'
```

The browser also generated the code, held it in React state, and verified it
locally, so nothing about the flow proved a signer's identity.

Now: the server issues the code (`POST /api/quotes/public/[token]/otp`), stores
only a keyed HMAC-SHA256 digest of it, and verifies submissions against that
digest. Codes are generated with `crypto.randomInt` (not `Math.random`), bound
to one quote, expire after 5 minutes, and burn a server-side attempt on each
failure. Digital seals are HMAC-keyed rather than plain SHA-256, so they cannot
be recomputed from values the client already knows. The modal no longer
performs any cryptography.

### P0-2 — The Stripe webhook accepted unsigned requests

`POST /api/stripe/webhook` parsed the body and applied whatever subscription
change it described. Anyone who knew an organization's UUID could grant
themselves the top tier or cancel another tenant.

Now: `Stripe-Signature` is verified (HMAC-SHA256 over `${timestamp}.${body}`,
constant-time compare, 5-minute replay tolerance) before the payload is parsed.
Events are recorded in a `stripe_webhook_events` ledger keyed by Stripe's event
id, so a redelivery is a no-op. Tier resolution prefers exact matches against
configured price ids instead of substring matching. Failed writes now return
500 so Stripe retries, rather than reporting success.

### P0-3 — RLS policies exposed every tenant

```sql
CREATE POLICY "Public read quotes via public_token"
ON public.quotes FOR SELECT TO anon
USING (public_token IS NOT NULL);
```

`public_token` is `NOT NULL DEFAULT encode(gen_random_bytes(16),'hex')`, so the
predicate held for every row. The publishable anon key dumped all tenants'
quotes — and, via the equally unscoped `contracts` policy, their plaintext OTP
codes — from a browser console. Both policies are dropped, the anon role's
table grants are revoked, and public token access moves to a service-role
client (`lib/supabase/service.ts`) that filters by the exact token server-side.

### P0-4 — One hardcoded CLABE for every tenant

The public payment page served a fixed CLABE regardless of which organization
was owed, directing every tenant's customers to the same bank account.
Organizations now carry their own `bank_name` / `bank_clabe` /
`bank_account_holder`, settable via `PATCH /api/organization`. When an
organization has not configured an account the payment page returns 409 and
renders no payment instructions — it never falls back to a default account.

That refusal is the backstop, and on its own it fires in front of the paying
client. The same refusal now also runs one step earlier, before a payment link
is shared at all (`lib/settlementAccount.ts`):

- `requireSettlementAccount(supabase, organizationId)` answers 409
  `ORG_BANK_DETAILS_MISSING` on any server path that hands a `/pay/` link to a
  client — today `POST /api/whatsapp/broadcast`. A failed or empty lookup counts
  as *not ready*; the gate does not release a link on a query that did not run.
- The dashboard carries a non-dismissable banner while `bank_clabe IS NULL`, and
  the share actions on Cobranza and Facturación render disabled. Only an owner is
  offered the form — `PATCH /api/organization` is scoped by `owner_id`, so a
  member pointed at it could not save.
- `/onboarding` resumes at the settlement-account step when an organization
  already exists, which is the way back for a tenant who abandoned it or predates
  it.

### Also fixed in passing

- `organizations.subscription_tier` still constrained to `emprendedor` while the
  application had renamed the tier to `inicial`; every webhook write of that
  tier failed at the database while the route returned 200. The constraint now
  accepts both, plus the Stripe statuses (`trialing`, `unpaid`, `incomplete`)
  the original `CHECK` rejected.
- The public SPEI declaration endpoint returned `{success: true}`
  unconditionally, including when the lookup found nothing or the write failed.

---

## 2. Required environment variables

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only. Public token routes and the webhook fail closed without it. **Must not** be prefixed `NEXT_PUBLIC_`. |
| `STRIPE_WEBHOOK_SECRET` | Yes | `whsec_…` from the Stripe dashboard endpoint. All webhooks are rejected without it. |
| `OTP_SECRET` | Yes | ≥32 chars, random. Keys OTP digests and seals. In production the app throws if unset. |
| `STRIPE_PRICE_INICIAL` | Recommended | Exact price id. Falls back to substring matching if unset. |
| `STRIPE_PRICE_NEGOCIO` | Recommended | As above. |
| `STRIPE_PRICE_EMPRESA` | Recommended | As above. |
| `OTP_DELIVERY_CHANNEL` | Yes (production) | `whatsapp` — the only channel; `sms` was retired and fails closed. See §4 for the provider variables. Unset fails closed in production. |

Rotating `OTP_SECRET` invalidates outstanding OTP codes and makes previously
stored seals unverifiable against a recomputation. Treat it as long-lived and
store it alongside the other secrets, not in the repo.

## 3. Migration

`supabase/migrations/20260806120000_security_hardening.sql` must run before or
with this deploy. It drops the two anon policies, adds the hashed-OTP and
signature columns, adds the organization bank fields, creates the webhook
ledger, and relaxes the two stale `CHECK` constraints.

It also **drops `contracts.client_otp_code`**, clearing any plaintext codes
first. Those values cannot be converted to digests, so any in-flight signature
using one must be re-issued. Run when no signature is mid-flight.

After migrating, each organization must set its bank details before its
payment links work. Tenants do this themselves under **Ajustes → Cuenta
Bancaria para Cobros SPEI**, which writes through:

```
PATCH /api/organization
{ "bankName": "BBVA México", "bankClabe": "0121800012345678 90", "bankAccountHolder": "…" }
```

Existing tenants have no CLABE and their payment pages will 409 until they do.
This is intentional — the alternative is continuing to route their customers'
money to the wrong account. Such a tenant now meets a banner on the dashboard
and disabled share actions rather than discovering it through a client, so the
comms plan is a backstop rather than the only warning. To find who still needs
to act:

```sql
select id, name from organizations where bank_clabe is null;
```

## 4. OTP delivery

`lib/otpDelivery.ts` sends the code over WhatsApp, selected by
`OTP_DELIVERY_CHANNEL` (the `sms` channel was retired along with phone-number
login; a deployment still holding `sms` resolves to console and fails closed):

| `OTP_DELIVERY_CHANNEL` | Provider | Required variables |
|---|---|---|
| `whatsapp` | Twilio, else Meta Cloud API | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` — or `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID` |
| unset | console (development only) | — |

On `whatsapp`, Twilio is used when `TWILIO_WHATSAPP_NUMBER` is set; otherwise
the Meta Cloud API is used. A provider that rejects the send, times out, or is
missing credentials produces a failure — `POST /api/quotes/public/[token]/otp`
then returns 502 rather than reporting a code that never arrived.

With the variable unset outside production, codes are logged to the server
console and returned as `dev_code`. In production an unset channel fails closed:
echoing the code back would hand every signature to whoever asked for one.

### Verifying the channel

Credentials that are absent, misspelled, or belong to the wrong account produce
exactly the same 502 as an unset channel — and by default the first person to
discover it is a signer. Check before enabling:

```
OTP_DELIVERY_CHANNEL=whatsapp \
TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… TWILIO_WHATSAPP_NUMBER=+1… \
npm run verify:otp
```

It resolves which provider the environment selects, names any variable that
provider still needs, and makes an authenticated read against Twilio or Meta —
without sending anything. Adding `OTP_TEST_PHONE=+52…` sends one real message
to that handset; it is a fixed sample string, not an OTP, and the script never
touches a quote.

`describeDeliveryConfig()` in `lib/otpDelivery.ts` applies the same rules
in-process, and a failed send is now logged server-side (provider and reason,
never the code or the recipient) so a misconfiguration is visible in the
platform log rather than only as a 502.

A provider accepting a message is also not the same as a handset receiving one —
a number can be unreachable, or the account can have no WhatsApp — so the
end-to-end check below is what settles it.

### The `whatsapp` channel needs an approved template

WhatsApp permits free-form business-initiated messages only inside the 24-hour
customer service window, i.e. to someone who messaged the business first.
Outside it, an OTP must go out as a pre-approved template in the authentication
category.

`lib/otpDelivery.ts` currently sends free-form text on both WhatsApp providers,
so a send to a signer who has not messaged the business recently is rejected —
Meta error 131047, Twilio error 63016 — and the signing flow returns 502. That
is the normal case for a client who was just sent a quote link, so the channel
does not yet work for cold recipients. Tracked in #42 — and with `sms` retired,
the approved template is now on the signing flow's critical path.

## 5. Staging verification

Everything here is a property of a running deployment rather than of the code,
so unit tests cannot stand in for it. Run against staging, never production.

### Webhook checks — scripted

```
WEBHOOK_URL=https://staging.example.com/api/stripe/webhook \
STRIPE_WEBHOOK_SECRET=whsec_… \
ORG_ID=<a real organization uuid> \
npm run verify:webhook
```

Covers the four rejection cases and, with `ORG_ID` set, that a valid event is
applied and its redelivery is deduplicated. Without `ORG_ID` the route stops at
the organization check before reaching the ledger, so those two are skipped.

- [ ] `npm run verify:webhook` passes all six checks against staging.

### OTP delivery checks — scripted

```
OTP_DELIVERY_CHANNEL=whatsapp \
TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… TWILIO_WHATSAPP_NUMBER=+1… \
OTP_TEST_PHONE=+52… \
npm run verify:otp
```

- [ ] `npm run verify:otp` reports the intended provider with no missing variables.
- [ ] The credential stage passes against the account that will serve production.
- [ ] With `OTP_TEST_PHONE` set, the sample message arrives on that handset.

### By hand

- [ ] Migration applies cleanly against a copy of production data.
- [ ] With the anon key, `select * from quotes` from a browser console returns
      zero rows (previously: every tenant's).
- [ ] `POST /api/quotes/public/<token>` with `{"otpCode":"111111","serverOtp":"111111"}`
      returns 400, not a signature.
- [ ] A code issued via `/otp` arrives on the configured channel (§4) and signs
      successfully; the same code replayed a second time does not.
- [ ] A code fails after 3 wrong attempts, and after 5 minutes.
- [ ] With `OTP_DELIVERY_CHANNEL` unset in a production build, `/otp` returns
      502 and the response contains no `dev_code`.
- [ ] Two organizations with different CLABEs each see their own on `/pay/<token>`.
- [ ] An organization with no CLABE gets 409, not a fallback account.
- [ ] Saving a CLABE under **Ajustes → Cuenta Bancaria** makes that org's
      payment page render instructions.
- [ ] An organization row with `bank_clabe` set to NULL shows the dashboard
      banner, disables the Cobranza and Facturación share actions, and gets 409
      from `POST /api/whatsapp/broadcast` — with no reminder actually sent.
- [ ] Opening `/onboarding` as that organization's owner lands on the settlement
      account step, and saving there clears the banner without creating a second
      organization row (`select count(*) from organizations where owner_id = …`).
- [ ] A member (not the owner) of that organization sees the banner without the
      "Agregar mi CLABE" link.

Every line above checks a **refusal**. None of them checks that a healthy
organization's payment link actually opens, which is how #78 (the share action
built `/pay/demo`) and #79 (the route's embed may not resolve at all) stayed
invisible through two rounds of this list. Walk the positive path too:

- [ ] On **Cobranza**, a cobro belonging to an org *with* a CLABE shows the real
      client name and contract title — not "Cliente no asignado" / "Contrato sin
      título", which is what a row that lost its nested embed renders as.
- [ ] **Portal SPEI** on that cobro is an enabled link whose href is
      `/pay/<the quote's public_token>` — compare it against
      `select public_token from quotes where id = <the contract's quote_id>`.
      Anything shaped like `/pay/demo` or `/pay/<a milestone uuid>` is the #78/#72
      defect back.
- [ ] Open that URL as an anonymous visitor (private window). It must render the
      CLABE and beneficiary — **not** `Cobro no encontrado`. A 404 here on a
      token that exists is #79: check the API directly,
      `curl -s "$APP_URL/api/receivables/public/<token>"`, and look for `PGRST201`
      from PostgREST behind it.
- [ ] Submit a tracking reference from that page and confirm the milestone flips
      to `marked_paid` in the database — the POST handler carries the same
      unhinted embed as the GET.
- [ ] On **Facturación**, "Aviso WhatsApp" for the same cobro opens `wa.me` with a
      message whose `/pay/` link is byte-identical to the one above.
