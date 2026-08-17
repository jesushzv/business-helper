<!-- STATUS-AUTHORITY: docs/STATUS.md -->

# First live CFDI stamp — preflight

Whether the first stamp has happened, and what it unblocked, is recorded in
[`docs/STATUS.md`](../STATUS.md). This file is the **mechanism**: the order to do it in, what to
read back, and what each answer means.

## Why this document exists

Under the BYOK decision the platform never stamps on a tenant's behalf, so the CFDI path cannot be
exercised by configuring a platform credential — it needs *an organization* with its own
`sk_live_` Facturapi key and CSDs connected in Ajustes. There is no way to rehearse that from an
agent session: the sandbox proves the payload and the transport, and stops exactly where fiscal
validity begins.

That makes the first live stamp a **one-shot event on a real document**. A CFDI cannot be
un-issued — only cancelled, with a motivo, on record with the SAT. So it is worth doing
deliberately, once, watched, rather than discovering the result from a tenant's complaint.

The counterpart to this file is
[`live-verification-recipes.md`](live-verification-recipes.md), which covers everything that
*can* be checked without a credential. Do all of that first; this is only for what is left.

## Before you stamp

| # | Check | How | If it is wrong |
|:--|:---|:---|:---|
| 1 | The key is a **live** key | Ajustes shows the connected key's environment. `detectPacEnvironment` classifies `sk_live_` as `live`, `sk_test_` as `sandbox` | A sandbox key on production is refused by `refusesSandboxStamp` with `PAC_SANDBOX_KEY`. That refusal is the system working — connect the live key |
| 2 | CSDs are uploaded **at Facturapi**, not here | Facturapi dashboard. This product never holds CSDs; the tenant's PAC does | Stamping fails at the PAC with a credential error, not in this app |
| 3 | The issuing organization's fiscal data is complete and real | RFC, régimen fiscal, código postal in Ajustes | `validateInvoiceParties` refuses with `INVALID_SAT_METADATA` before any outbound call |
| 4 | The receiving client's fiscal data is complete and real | RFC, régimen, CP, uso CFDI on the client record | Same refusal. `lib/facturapi.ts` will not paper over a missing RFC |
| 5 | You have chosen the milestone deliberately | A real, modest amount is ideal — this stamps a genuine fiscal document | A test-shaped amount on a real RFC is still a real CFDI |

## Choose the first quote deliberately

Stamp a quote **with IVA applied** first. The zero-rate path is the one hardened without a live
observation: since #347 the payload sends an explicit `[{ type: 'IVA', rate: 0 }]` rather than an
empty array, precisely because nobody could confirm what v2 does with `taxes: []`. That change is
safe under either reading, but "safe under either reading" is not the same as "observed", and the
first live document is the wrong place to learn the difference.

Once an IVA quote has stamped cleanly, stamp a zero-IVA one as the second document and read its
tax lines back. That is the observation #347 is waiting for.

## Stamping

Issue through the app — `POST /api/invoices/issue`, from the milestone's stamping dialog. Do not
call Facturapi directly: the point is to exercise the path a tenant uses, including the claim
guard, the capability check and the storage write.

Expect it to be slow enough to doubt. Do not click twice. `cfdi_stamp_claims` exists to make a
double submit safe (it refuses the second with `23505`, proven live), but a deliberate
double-click is a worse first test than a patient single one.

## Read back, in this order

Confirm by reading state, never by the dialog's success message (hard rule #2).

1. **The UUID verifies at the SAT.** Paste the folio fiscal into the SAT's *Verificación de
   comprobantes fiscales* portal. This is the criterion — a UUID that does not verify means the
   document is not what the app says it is.
2. **The row is complete.** For the stamped milestone, read `cfdi_uuid`, `cfdi_total`,
   `cfdi_xml_url`, `cfdi_pdf_url` and `cfdi_status`. A `null` `cfdi_total` or missing verification
   URL is #347's second half: since this pass the mapping reports that drift to Sentry rather than
   degrading silently, so **check Sentry too** — a warning there names exactly which field v2 did
   not send.
3. **The totals match the quote.** The stamped total must equal what the client agreed to. A
   document 16% larger than the quote means a tax line was applied that should not have been;
   16% smaller means `tax_included` was read as true. Both were live findings in #26 and both are
   pinned by tests now — this confirms the pins are right.
4. **The documents open.** Download the XML and PDF from the milestone. A stored URL that 404s is
   a storage problem, not a stamping one, and is worth separating before reporting.

## If it fails

Read the error before retrying, and expect it to be legible: the PAC client maps 401/403 to
`UNAUTHORIZED` and refuses a response with no folio fiscal rather than recording a stamp. A failed
attempt writes `cfdi_status: 'failed'` and `cfdi_error` on the milestone, so the reason survives
the dialog closing.

Do not retry a failure you have not read. A stamp that failed at the PAC left no document; a stamp
that failed *after* the PAC answered may have left one, and `findInvoiceByExternalId` is how the
app finds it rather than issuing a second.

## What one clean stamp closes, and what it does not

It closes the criterion that no amount of mocked coverage can: the outbound call executed against
the real service and the SAT recognised the result.

It does **not** close the complemento de pago path, which is a different document with different
required fields and has never reached a real PAC. Nor does it close the zero-rate question unless
the second document above was actually stamped and read back. Say which of the three you did.
