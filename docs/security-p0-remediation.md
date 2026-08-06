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
| `OTP_DELIVERY_CHANNEL` | Yes (production) | `sms` \| `whatsapp`. See §4 for the provider variables each channel needs. Unset fails closed in production. |

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
money to the wrong account — but it needs a comms plan before deploy. To find
who still needs to act:

```sql
select id, name from organizations where bank_clabe is null;
```

## 4. OTP delivery

`lib/otpDelivery.ts` sends the code over one of three channels, selected by
`OTP_DELIVERY_CHANNEL`:

| `OTP_DELIVERY_CHANNEL` | Provider | Required variables |
|---|---|---|
| `sms` | Twilio Messages API | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_NUMBER` (or `TWILIO_PHONE_NUMBER`) |
| `whatsapp` | Twilio, else Meta Cloud API | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` — or `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID` |
| unset | console (development only) | — |

On `whatsapp`, Twilio is used when `TWILIO_WHATSAPP_NUMBER` is set; otherwise
the Meta Cloud API is used. A provider that rejects the send, times out, or is
missing credentials produces a failure — `POST /api/quotes/public/[token]/otp`
then returns 502 rather than reporting a code that never arrived.

With the variable unset outside production, codes are logged to the server
console and returned as `dev_code`. In production an unset channel fails closed:
echoing the code back would hand every signature to whoever asked for one.

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
