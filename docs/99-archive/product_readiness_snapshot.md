# Module Capabilities Reference: Business Helper

> [!CAUTION]
> **ARCHIVED — do not read this for status, and do not update it.**
> Superseded by [`docs/STATUS.md`](../STATUS.md), the single source of truth. Kept only as a record of what
> was believed on the date it was written. It carried a competing status dashboard that reported 100% roadmap progress while core integrations were simulated.

> **What each module does, and where it lives in the codebase**
>
> *Originally "Product Readiness & Roadmap Execution Snapshot" (2026-08-03). Collapsed 2026-08-07 to the
> one section that was not duplicated elsewhere.*

This document answers **"what does this module do and where is its code?"** — nothing else. It is a
capability inventory, not a status report.

> [!IMPORTANT]
> **These entries describe scope, not verification.** A module listed here exists and is unit-tested; that
> is not evidence its third-party integration has executed against the real service. The 2026-08-06 security
> review found several of these shipping with a simulated call underneath. For what is actually launch-safe,
> read [`docs/STATUS.md`](../STATUS.md).

**Where the other content went**

| Question | Read instead |
|:---|:---|
| Is this ready to launch? What is actually done? | [`docs/STATUS.md`](../STATUS.md) |
| Expert review findings and remediation status | [`product_readiness_workback.md`](product_readiness_workback.md) (WS-A…WS-I, with gates) |
| Full review analyses | [`product_expert_review_aug2026.md`](product_expert_review_aug2026.md), [`ux_ui_audit_synthesis_aug2026.md`](../04-execution-testing/ux_ui_audit_synthesis_aug2026.md) |
| Pre-launch task checklist | [`product_launch_checklist.md`](../04-execution-testing/product_launch_checklist.md) |
| Launch-day playbook | [`product_launch_checklist.md`](../04-execution-testing/product_launch_checklist.md) §04 |
| Sprint history and schedule | [`product-roadmap.md`](../03-product-specs/product-roadmap.md) |

*Prior revisions carried its own copies of the middle four. They had already drifted — its remediation table
listed as "🔲 Pending" a dozen items the workback recorded as ☑ done, and its status dashboard reported 100%
completion against features that were simulated. Keeping one copy of each removes the drift surface.*

---

## Module Capabilities

### 1. Core CRM & Client Directory — `/dashboard/clients`
* Live Mexican RFC Modulo 11 check-digit syntax validation (12 chars Moral, 13 chars Física).
* 0–100 Client Health Score based on historical payment timeliness.
* Chronological activity feed for quote approvals, contract signatures, and payments.
* B2B trade credit fields: `credit_limit`, `credit_days`, `credit_status`, with enforcement in the quote wizard.

### 2. Quote & Contract Engine — `/dashboard/quotes`, `/q/[token]`
* 3-step quote generator with SAT tax calculation (16% IVA, ISR withholding, IVA withholding).
* Public zero-login quote portal (`/q/[token]`) with mobile-first responsive layout.
* 6-digit OTP phone verification generating a SHA-256 cryptosealed digital signature.
* One-tap contract conversion with milestone payment splitting.

> [!WARNING]
> **OTP delivery has no provider configured.** `lib/otpDelivery.ts` implements Twilio SMS, Twilio WhatsApp
> and Meta Cloud API, but with `OTP_DELIVERY_CHANNEL` unset the endpoint returns 502 and **no quote can be
> signed**. Issuance is also capped per quote rather than per recipient phone. Issues #2 and #17.

### 3. Accounts Receivable & SPEI Portal — `/dashboard/receivables`, `/pay/[token]`
* Real-time debt Kanban (*Atrasado*, *Vence Hoy*, *Por Vencer*).
* Public SPEI receipt upload portal (`/pay/[token]`) with Banxico *Clave de Rastreo* logging.
* File security guardrails enforcing `< 5MB` magic-byte validation (PNG/JPG/PDF only).
* One-tap owner payment confirmation workflow.
* Per-organization bank details (`components/settings/BankAccountCard.tsx`) — each org must configure its own CLABE.

### 4. Business Dashboard & Control Center — `/dashboard`
* Total collected revenue, pending receivables, and overdue balances summary cards.
* 30/60/90-day cash flow projection chart based on contract milestone due dates.
* Top clients by revenue leaderboard.

### 5. Invoicing & Accountant Tools — `/invoices`
* **Nota de Venta & Recibo de Pago PDF Engine** (`lib/receiptGenerator.ts`): 1-click printable receipt with tenant branding and tax breakdowns, requiring no SAT CSD certificate or PAC credentials. This is the zero-friction default.
* **1-Click Accountant Export Package** (`lib/accountantExport.ts`): structured CSV summaries and organized ZIP downloads for external *contadores*. Reads real milestones as of PR #19.
* Pre-saved product catalog with SAT unit keys (`E48`) and product codes (`84111506`).

> [!WARNING]
> **CFDI 4.0 stamping is not operational.** The original implementation simulated it — fabricated IDs and
> URLs written as `cfdi_status: 'issued'` (issue #3). Real provider-agnostic PAC integration exists in
> **PR #23, unmerged and never run against a live sandbox**. Design intent — users connect their own PAC,
> Business Helper never stores CSD certificates — is in
> [`cfdi_integration_architecture.md`](../02-architecture/cfdi_integration_architecture.md).

### 6. Enterprise Roles, AI & Operations — `/team`, `/assistant`, `/products`, `/settings`
* Multi-user Role-Based Access Control (`Owner`, `Manager`, `Member`, `Accountant`) with team invitations (`lib/teamInvitations.ts`).
* Inventory stock tracking with low-stock warnings (`<= 5 units`) and automatic deduction.
* Natural language AI assistant (`lib/whatsappAI.ts`, `lib/aiOrgContext.ts`) via the Gemini REST API for debt inquiry parsing; in-app support console on `/help`.
* **1-Tap `wa.me/` Click-to-Chat**: zero-cost deep links for *owner-initiated* messages. Note this cannot deliver an OTP to a signer — that needs the provider in module 2.
* Outbound WhatsApp dispatch via Twilio / Meta (`lib/whatsappOutbound.ts`), real as of PR #13, inert until credentials are set.
* USD / MXN multi-currency engine with automated base-currency aggregation.
* White-label branding customizer generating CSS variables for tenant logo, colors, and header themes.

---

*Document maintained under `docs/04-execution-testing/product_readiness_snapshot.md` per [AGENTS-DOCS-GUIDE.md](../AGENTS-DOCS-GUIDE.md).*
