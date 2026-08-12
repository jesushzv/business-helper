# CFDI Integration Architecture: Business Helper

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

> [!NOTE]
> **Live status lives in [`docs/STATUS.md`](../STATUS.md) — not here.** The ✅/🔴 marks describe **which capabilities the design covers**. Whether the PAC integration has been exercised against a live account is a status claim.

> **PAC Integration Strategy & Trust-Forward Architecture**
>
> Grounded in the Independent Product Expert Review (August 2026) and aligned with `@docs/02-architecture/app-architecture-plan.md` and `@docs/01-strategy/PRD-business-helper.md`.

---

## 01 Executive Summary

Business Helper's CFDI 4.0 electronic invoicing integrates with third-party **PAC (Proveedor Autorizado de Certificación)** providers — the standard industry model. No SaaS stamps CFDI in-house directly with SAT.

This document defines the **trust-forward integration architecture** where Business Helper **never stores or handles user CSD (Certificado de Sello Digital) certificates or FIEL/e.firma keys**. This eliminates the most common objection from Mexican SMEs: *"No quiero subir mis llaves del SAT a una app que no conozco."*

---

## 02 Key Distinction: CSD ≠ FIEL

| Certificate | Full Name | Purpose | Who Needs It |
|---|---|---|---|
| **FIEL / e.firma** | Firma Electrónica Avanzada | Personal digital signature for SAT portal access, tax filings, and broad administrative procedures | Individual taxpayers (never shared with third parties) |
| **CSD** | Certificado de Sello Digital | Invoice-specific certificate used *only* for stamping CFDI | PAC providers require CSD (`.cer`, `.key`, password files) to stamp invoices |

> [!IMPORTANT]
> Business Helper's architecture ensures the user's **CSD stays with their PAC of choice** — never uploaded to or stored by Business Helper servers.

---

## 03 Integration Models

### Option A: PAC-as-a-Service with API Key ⭐ **RECOMMENDED — Primary Model**

```
┌──────────────────────┐     JSON Invoice Data     ┌──────────────────────┐
│                      │ ─────────────────────────▶ │                      │
│   Business Helper    │     (via PAC API Key)      │   PAC Provider       │
│   (Web App)          │                            │   (Facturama,        │
│                      │ ◀───────────────────────── │    FiscalAPI,        │
│                      │   UUID + XML + PDF         │    SW Sapien,        │
└──────────────────────┘                            │    Conectia)         │
                                                    └──────────────────────┘
                                                              │
                                                    User uploads CSD here
                                                    (NOT to Business Helper)
```

**How it works:**
1. The user creates an account directly with a PAC provider (Facturama, FiscalAPI, SW Sapien, Conectia)
2. The user uploads their CSD (`.cer`, `.key`, password) to the PAC — **not to Business Helper**
3. The user provides their **PAC API Key** to Business Helper (a simple string, not a certificate)
4. Business Helper sends invoice data as JSON via the PAC's REST API
5. The PAC handles XML generation, signing, stamping with SAT, and returns UUID + XML + PDF
6. Business Helper stores the UUID, XML URL, and PDF URL in the `milestones` table

**Trust message:** *"Nunca almacenamos tus certificados SAT. Tú los guardas con tu PAC de confianza; nosotros solo enviamos los datos de la factura."*

**Cost examples:**
- FiscalAPI: $199 MXN/month base + per-folio
- Facturama API: $1,650/year + $0.40–$0.50 per folio
- SW Sapien: Per-folio pricing, competitive for high volume

---

### Option B: Client-Side / Browser-Based Signing (Most Secure)

```
┌──────────────────────┐     Pre-signed XML        ┌──────────────────────┐
│   User's Browser     │ ─────────────────────────▶ │   Business Helper    │
│   (Local Processing) │     (CSD never leaves      │   Server             │
│                      │      the device)           │                      │
│   CSD files loaded   │                            │         │            │
│   in browser memory  │                            │         ▼            │
│   via Web Crypto API │                            │   PAC Provider       │
└──────────────────────┘                            │   (Stamp-only mode)  │
                                                    └──────────────────────┘
```

**How it works:**
1. User loads their CSD files into the browser (local processing only, never sent to server)
2. Business Helper generates CFDI XML structure in the browser via JavaScript
3. Browser signs the XML using CSD via the Web Crypto API
4. Only the **pre-signed XML** is sent to Business Helper → PAC for the UUID/timbre
5. The `.key` file **never leaves the user's device**

**Trade-off:** Higher technical complexity, but maximum user trust. Some PACs (like SW Sapien) support "timbrado de XML ya sellado" — stamping without signing.

**Status:** Future differentiator (Phase 3+). Not recommended for initial implementation.

---

### Option C: Hybrid — Nota de Venta Default + CFDI via Connected PAC Account

```
┌──────────────────────┐                            ┌──────────────────────┐
│                      │     Default: PDF Nota      │                      │
│   Business Helper    │     de Venta (no SAT)      │   User's Accountant  │
│   (Web App)          │ ─────────────────────────▶ │   or Client          │
│                      │                            │                      │
│                      │     Optional: CFDI via     │                      │
│                      │     Connected PAC Account  │   PAC Provider       │
│                      │ ─────────────────────────▶ │   (OAuth / API Key)  │
└──────────────────────┘                            └──────────────────────┘
```

**How it works:**
1. **Default workflow:** Business Helper generates PDF "Notas de Venta" (no CSD needed, no SAT stamping). This is the current `lib/receiptGenerator.ts` engine.
2. **When CFDI is needed:** User connects their existing PAC account via OAuth or API Key
3. Business Helper becomes a **data sender**, not a stamper. The user's PAC handles everything.

**Benefit:** Zero CSD handling by Business Helper. The user controls their own stamping infrastructure.

**Status:** This is the recommended **secondary model** alongside Option A.

---

### Option D: Redirect to SAT Portal (Low-Volume Fallback)

For users with very low invoice volume (< 5/month):
1. Business Helper pre-fills invoice data and redirects the user to the SAT's free portal
2. User logs in with their CIEC/FIEL and stamps manually
3. Business Helper tracks status and stores user-uploaded XML/PDF

**Benefit:** Zero CSD upload anywhere. **Limitation:** Not scalable, breaks the "todo-en-uno" promise.

---

### Option E: Accountant / Despacho Orchestration

1. Business Helper sends invoice data to the user's accountant/despacho contable
2. The accountant stamps using their own tools and CSD, then returns XML/PDF
3. Business Helper tracks status and stores the final documents

**Benefit:** Aligns with the existing "export ZIP para contador" workflow. **Limitation:** Adds latency (hours/days vs. seconds).

---

## 04 Recommended Implementation Roadmap

| Phase | Model | Priority | Timeline |
|---|---|---|---|
| **Current (MVP)** | Nota de Venta PDF + Accountant ZIP Export | ✅ Shipped | Now |
| **Phase 1** | Option A — PAC API Key integration (Facturapi) | ✅ Shipped | Aug 2026 |
| **Phase 1.5** | Option C — Connected PAC Account (OAuth flow) | 🟡 Medium | Week 6–8 |
| **Phase 2** | Option D — SAT Portal redirect (low-volume users) | 🟡 Medium | Week 8–10 |
| **Phase 3** | Option B — Client-side browser signing | 🟢 Future | Q1 2027 |
| **Ongoing** | Option E — Accountant orchestration (already natural workflow) | ✅ Passive | Continuous |

---

## 05 CFDI Pricing Strategy (BYOK)

> [!IMPORTANT]
> **Superseded twice.** The original plan gated CFDI behind the $999 tier; an
> expert review repositioned it as a pay-per-folio add-on (0/10/50 folios
> included, $2–$5 MXN per extra, folio packs). The **BYOK decision**
> (2026-08-12, `docs/STATUS.md` §05, #221) killed the folio model in turn: the
> platform never stamps on behalf of tenants, so there is no folio to include,
> meter, or resell.

### Current Model

Every tier carries the same CFDI story: the tenant connects **their own PAC
account** (Facturapi) in Ajustes, their provider bills them per stamp, and
their CSD never leaves their PAC. Business Helper charges for the workflow
(quote → contract → payment → invoice), not per document. Tier differentiation
lives in other features.

### Trust Messaging for Landing Page
> *"Nunca almacenamos tus certificados SAT. Conecta tu PAC de confianza (Facturapi) y nosotros enviamos los datos. Tú mantienes el control total."*

(Facturapi only, until a second adapter exists — #226.)

---

## 06 Technical Implementation Notes

### Shipped Architecture (Option A — PAC API Key)

Until August 2026 the code below this heading described a plan, and
`lib/facturapi.ts` shipped a `simulateInvoiceStamping()` that fabricated a folio
and two `storage.businesshelper.mx` URLs. The route wrote them as
`cfdi_status: 'issued'`, so the product recorded invoices the SAT had never
seen. That is gone; there is no simulated path left in the codebase.

```
lib/pacClient.ts       → provider-agnostic stamp / cancel / download
                         └── Facturapi adapter (POST https://www.facturapi.io/v2/invoices,
                             Authorization: Bearer <key>; v1 answers 410 since 2023, #26)
lib/pacConnection.ts   → resolves the tenant's own PAC key — the only source (BYOK, #221)
lib/pacCredentials.ts  → AES-256-GCM sealing of PAC API keys (PAC_ENCRYPTION_KEY)
lib/cfdiStorage.ts     → XML/PDF into the private `cfdi-documents` bucket
lib/facturapi.ts       → CFDI 4.0 payload construction and validation only
lib/complementoPago.ts → whether a PPD payment owes a complement, and filing it

Database (20260807120000_cfdi_pac_integration.sql)
  pac_connections            — provider, sealed api key, hint, environment (owner-only RLS)
  organizations.cfdi_folios_* and reserve/release_cfdi_folio()  — dropped by
    20260812182430_drop_cfdi_folio_ledger.sql (#224; unread/uncalled since #221)
  milestones.cfdi_uuid / _provider / _environment / _xml_path / _pdf_path
           / _stamped_at / _cancelled_at / _error
  csd_credentials            — dropped (see §02; nothing may store a CSD here)

Database (20260807170000_cfdi_payment_complements.sql)
  milestones.cfdi_payment_method  — PUE / PPD, as stamped
  milestones.cfdi_total           — the PAC's own total, which balances reconcile against
  cfdi_payment_complements        — one row per payment complement, stamped or attempted
```

**Endpoints**

| Route | Purpose |
|---|---|
| `POST /api/invoices/issue` | Stamps a milestone. Validates both parties, calls the tenant's PAC, stores XML/PDF, records the UUID and the payment method. |
| `POST /api/invoices/[id]/cancel` | Files a SAT cancellation with a motive (01–04). |
| `GET /api/invoices/[id]/document?type=xml\|pdf[&complement=<id>]` | Signs a short-lived link to the stored document, invoice or complement. |
| `GET/POST /api/invoices/[id]/complement` | Reports what a PPD invoice still owes, and files a complement by hand. |
| `POST /api/receivables/[id]/confirm` | Confirms a payment — and files the complement it owes, when the CFDI is PPD. |
| `GET/PUT/DELETE /api/organization/pac` | Connects, inspects and revokes the tenant's PAC key. |

### Complemento de Recepción de Pagos (PPD)

A CFDI stamped **PUE** declares the amount as already paid. **PPD** declares
that it is not, and obliges the taxpayer to file a *complemento de pago* — a
second stamped document, type `P`, with its own folio fiscal — within the first
days of the month following each payment received.

`buildComplementoPagoPayload` existed from the start and nothing called it,
while `/api/invoices/issue` already accepted `paymentMethod: 'PPD'`. The product
could therefore create the obligation and had no way to meet it.

**How it works now.** `/api/receivables/[id]/confirm` is where a payment becomes
known, so it is where the complement is filed. The attempt runs inline — the
document is due in days and there is no job runner — but it can never fail the
confirmation: the money arrived either way, so a failure is returned alongside
the confirmed milestone and left as a `failed` row the user retries from
Facturación.

**Partial payments.** `installment` is the SAT NumParcialidad, derived from the
complements already issued against the invoice rather than hardcoded to `1`.
Each row stores `last_balance` (ImpSaldoAnt) and `remaining_balance`
(ImpSaldoInsoluto) as stamped, and a partial payment carries a proportional
slice of the invoice's IVA and retenciones in ImpuestosDR. A payment larger than
the outstanding balance is capped: ImpPagado may not exceed ImpSaldoAnt.

**Duplicate protection.** A partial unique index on
`(milestone_id, installment)`, excluding failed rows, stops two confirmations
racing on the same cobro from stamping the same parcialidad twice — a duplicate
complement can only be undone by cancelling it at the SAT. The PAC idempotency
key is `complement:<milestoneId>:<installment>`, so a retry after a timeout is
deduplicated while a genuine second payment is not.

**Billing.** A complement is a stamped document the tenant's PAC bills for,
exactly like the invoice it settles. Nothing is metered platform-side (#221).

**Capability.** `POST /api/invoices/[id]/complement` requires `issue_cfdi`, like
stamping. The automatic path in `confirm` does not: the PPD invoice was already
issued by someone holding that capability, and the complement is the legally
required consequence of a payment, not a new commitment. Refusing to file it
because a `member` confirmed the transfer would leave the organization out of
compliance to enforce a permission about a decision already taken.

**The default is still PUE.** PPD is now reachable from the invoicing screen,
per-cobro, because the complement it obliges can finally be filed. It is not the
default: a cobro settled on issuance is PUE, which is what most of this
product's users are doing.

**No platform account.** `FACTURAPI_SECRET_KEY`, `lib/cfdiFolios.ts` and the
`source: 'platform'` credential path were removed with #221. A tenant with no
connected PAC gets `PAC_NOT_CONNECTED`, never a stamp on someone else's RFC.

**Sandbox.** A `sk_test_` key returns structurally complete documents with no
fiscal validity. The environment is recorded on the milestone, surfaced in the
UI as *"CFDI de prueba (sin validez fiscal)"*, and refused outright in
production.

### Still Open
1. Additional adapters (Facturama, FiscalAPI, SW Sapien) behind the same `PacProvider` interface. Until one exists, user-facing copy names **Facturapi only** (#226) — naming a PAC the connect form refuses is an overstatement.
2. Cancelling a complemento de pago. `/api/invoices/[id]/cancel` cancels the invoice; a complement stamped in error has no route of its own, and the SAT requires cancelling the complement before the invoice it settles.
3. The accountant export (`lib/accountantExport.ts`) still lists one CFDI per milestone. A PPD invoice's complements are stamped documents the accountant needs and are not in the package.

---

*Document maintained under `docs/02-architecture/cfdi_integration_architecture.md` per [AGENTS-DOCS-GUIDE.md](../../docs/AGENTS-DOCS-GUIDE.md).*
