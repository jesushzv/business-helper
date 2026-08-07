# CFDI Integration Architecture: Business Helper

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
| **Phase 1** | Option A — PAC API Key integration (Facturama/FiscalAPI) | 🔴 High | Week 3–6 |
| **Phase 1.5** | Option C — Connected PAC Account (OAuth flow) | 🟡 Medium | Week 6–8 |
| **Phase 2** | Option D — SAT Portal redirect (low-volume users) | 🟡 Medium | Week 8–10 |
| **Phase 3** | Option B — Client-side browser signing | 🟢 Future | Q1 2027 |
| **Ongoing** | Option E — Accountant orchestration (already natural workflow) | ✅ Passive | Continuous |

---

## 05 CFDI Pricing Strategy (Repositioned)

> [!IMPORTANT]
> **Strategic change from Expert Review:** CFDI is repositioned from a plan-gated feature ($999 Empresa only) to a **pay-per-folio add-on** available across all plans.

### Updated Pricing Model

| Plan | Base CFDI Allocation | Pay-Per-Folio Add-on |
|---|---|---|
| **Emprendedor** ($299/mo) | 0 included (Nota de Venta default) | $5 MXN/folio (connect your PAC) |
| **Negocio** ($599/mo) | 10 CFDI folios/month included | $3 MXN/folio beyond allocation |
| **Empresa** ($999/mo) | 50 CFDI folios/month included | $2 MXN/folio beyond allocation |
| **Folio Pack Add-on** | — | 50 folios for $100 MXN / 200 folios for $350 MXN |

### Rationale
- A $299 PyME landing its first B2B client needing a deductible invoice should NOT have to upgrade 3.3x to $999
- Aligns with how PyMEs actually grow: they add capabilities as needed
- Removes the $700 upgrade barrier for a $3 invoice
- Creates a natural upsell path: more invoices → higher plan
- SenHub offers unlimited stamping at $79/mo — we must be competitive on accessibility

### Trust Messaging for Landing Page
> *"Nunca almacenamos tus certificados SAT. Conecta tu PAC de confianza (Facturama, FiscalAPI, SW Sapien) y nosotros enviamos los datos. Tú mantienes el control total."*

---

## 06 Technical Implementation Notes

### Current Architecture (Facturapi Direct)
```
lib/facturapi.ts → POST https://www.facturapi.io/v1/invoices
                   Headers: { Authorization: Bearer FACTURAPI_SECRET_KEY }
```

### Target Architecture (PAC API Key Model)
```
lib/pacClient.ts → Abstraction layer supporting multiple PAC providers
                   ├── facturapi.ts (Facturama adapter)
                   ├── fiscalapi.ts (FiscalAPI adapter)
                   └── swsapien.ts  (SW Sapien adapter)

Database: organizations table
  ├── pac_provider (enum: 'facturama' | 'fiscalapi' | 'swsapien' | null)
  ├── pac_api_key (encrypted, stored in Supabase Vault)
  └── cfdi_folios_remaining (integer, decremented per stamp)
```

### Migration Path
1. Current `FACTURAPI_SECRET_KEY` in `.env` becomes the **platform default** for users who don't bring their own PAC
2. New `/settings/invoicing` page lets users connect their own PAC API key
3. PAC API keys are stored encrypted in Supabase Vault (never in plaintext)
4. `lib/facturapi.ts` refactored into `lib/pacClient.ts` with provider-agnostic interface

---

*Document maintained under `docs/02-architecture/cfdi_integration_architecture.md` per [AGENTS-DOCS-GUIDE.md](../../docs/AGENTS-DOCS-GUIDE.md).*
