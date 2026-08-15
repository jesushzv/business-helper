# Database Schema Design: Business Helper

> **Technical Reference & PostgreSQL Schema Specification**
>
> A complete database design blueprint for **Business Helper**, covering multi-tenant relational schemas, Row-Level Security (RLS), Mexican tax compliance structures (SAT/CFDI 4.0), access patterns, indexing strategies, and zero-downtime Supabase migration workflows.

---

## 01 Overview & Goals

### Database Choice

* **Technology**: PostgreSQL 16
* **Hosting**: Supabase Cloud (Managed PostgreSQL in AWS `us-east-1` with PostgREST, Auth, and Storage integration)
* **Rationale**: PostgreSQL provides native ACID compliance, complex relational integrity, JSONB semi-structured data support (for flexible quote line items and SAT tax metadata), and native Row-Level Security (RLS) for multi-tenant isolation.

### Design Priorities

* **Read vs. Write Heavy**: Read-heavy (~85% reads / 15% writes). Dashboard views, client history, aging reports, and quote lookups occur constantly on mobile viewports.
* **Consistency Model**: Strong consistency. Financial receivables, contract cryptoseals, and invoice tracking require strict transaction isolation (Read Committed / Serializable where financial locks occur).
* **Normalization**: Hybrid. Highly normalized for relational entities (`organizations`, `clients`, `contracts`, `milestones`), with controlled denormalization (`jsonb` for quote line items snapshotting, tax withholding totals on contracts/quotes).
* **Scale Expectations**: Designed to support 10,000+ organizations, 500,000+ clients, and 2,000,000+ receivables with sub-50ms query latency via proper indexing.

---

## 02 Core Entities

### Organization & Team Entities

#### `organizations`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `name`: text (not null)
- `rfc`: text (nullable, IDX) -- Mexican Taxpayer ID (12 or 13 chars)
- `regimen_fiscal`: text (nullable) -- SAT Régimen Fiscal code (e.g., '601', '626')
- `codigo_postal`: text (nullable) -- 5-digit Mexican postal code
- `logo_url`: text (nullable) -- Supabase Storage URL
- `industry`: text (nullable) -- e.g., 'construction', 'services', 'retail'
- `phone`: text (nullable) -- org WhatsApp contact, canonical 10-digit form (`20260809000000`; #95/#44)
- `owner_id`: uuid (FK -> `auth.users.id`, not null, **UQ**) -- one organization per owner,
  enforced by `uq_organizations_owner_id` (`20260811150000`; #109/#168). That index is also the
  only one `owner_id` needs; there is no separate non-unique index. This line read `IDX` while
  the live catalog had neither — the #96 class, which is why CLAUDE.md says to check the catalog
  before writing SQL.
- `stripe_customer_id`: text (nullable, UQ)
- `stripe_subscription_id`: text (nullable, UQ)
- `subscription_tier`: text (not null, default: `'free'`) -- 'free' | 'emprendedor' | 'negocio' | 'empresa'
- `subscription_status`: text (not null, default: `'active'`) -- the seven Stripe reports:
  'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' |
  'incomplete_expired' (widened in `20260806120000`; the union lives once in
  `lib/stripe.ts` as `SUBSCRIPTION_STATUSES`, #116)
- `facturapi_organization_id`: text (nullable) -- Linked PAC tenant ID
- ~~`cfdi_folios_used` / `cfdi_folios_period` / `cfdi_folios_purchased`~~ -- dropped in `20260812182430` (#224, BYOK: nothing meters folios)
- `bank_name`: text (nullable) -- SPEI settlement account (`20260806120000`)
- `bank_clabe`: text (nullable) -- 18-digit CLABE; absence blocks `/pay/` (#64); emptying it clears all three columns (#163)
- `bank_account_holder`: text (nullable)
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)

> **An organization settles at several accounts, one named per quote (#164).** This reverses the
> boundary this section asserted until 2026-08-11 — "one organization, one CLABE" — which had been
> an assumption nobody chose out loud until the founder questioned it and then chose against it.
> Accounts now live in [`bank_accounts`](#bank_accounts) below and a quote records the one its
> client pays into in `quotes.bank_account_id`.
>
> **The three `bank_*` columns above are legacy and still live.** They were not dropped with
> `20260811180000`, because Vercel deploys `main` on merge while migrations are applied by hand
> (hard rule #6), so the previously-deployed code must keep working against the new schema between
> those two events. `PATCH /api/organization` mirrors a legacy single-account write into
> `bank_accounts` for the same reason — letting the two diverge would reproduce #64's failure, a
> tenant told they can be paid while their client's payment page refuses. Dropping them is a later
> migration, once nothing reads them.

#### `bank_accounts`
*Added by `20260811180000_bank_accounts` (#164). Applied to production 2026-08-11.*
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id` `ON DELETE CASCADE`, not null, IDX)
- `label`: text (not null) -- What the owner calls it ("BBVA obra"). Two 18-digit strings are not distinguishable by sight, which is the mistake this feature invites
- `bank_name`: text (not null)
- `clabe`: text (not null)
- `account_holder`: text (nullable)
- `is_default`: boolean (not null, default: `false`)
- `archived_at`: timestamptz (nullable) -- Accounts are **archived, never deleted**: a sent quote names the account its client was told to pay
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)
- *Constraint*: `chk_bank_accounts_clabe_format` -- `clabe ~ '^[0-9]{18}$'`
- *Constraint*: `chk_bank_accounts_archived_not_default` -- an archived account cannot hold the default flag
- *Constraint*: `chk_bank_accounts_label_present` -- `length(trim(label)) > 0`
- *Index*: UQ partial `uq_bank_accounts_default_per_org` on `(organization_id) WHERE is_default AND archived_at IS NULL` -- at most one live default per organization, enforced in the database rather than in a route: which account money lands in must not depend on which request won a race
- *RLS*: `FOR ALL TO authenticated` on `organization_id IN (SELECT public.user_organization_ids())`, with `WITH CHECK` stated explicitly so a cross-tenant INSERT is refused on the way in

#### `organization_members`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `user_id`: uuid (FK -> `auth.users.id`, not null, IDX)
- `role`: text (not null, default: `'member'`) -- 'owner' | 'manager' | 'member' | 'accountant'
- `invited_at`: timestamptz (not null, default: `now()`)
- `created_at`: timestamptz (not null, default: `now()`)
- *Constraint*: UQ `(organization_id, user_id)`

#### `organization_invitations`
*Added by `20260806160000_team_invitations`. A pending invitation to join an organization; accepting one is what creates the `organization_members` row above.*
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id` `ON DELETE CASCADE`, not null)
- `email`: text (not null) -- the address invited; uniqueness is on `lower(email)`, not on this
- `role`: text (not null, default: `'member'`)
- `token_hash`: text (not null, UQ) -- **only the SHA-256 digest of the invitation token is stored**, for the same reason OTP codes are hashed: a leaked backup or a SELECT on this table must not hand out working invitation links. The token itself exists only in the emailed URL
- `status`: text (not null, default: `'pending'`)
- `invited_by`: uuid (FK -> `auth.users.id` `ON DELETE SET NULL`, nullable)
- `expires_at`: timestamptz (not null)
- `accepted_at`: timestamptz (nullable)
- `accepted_by`: uuid (FK -> `auth.users.id` `ON DELETE SET NULL`, nullable)
- `created_at`: timestamptz (not null, default: `now()`)
- *Constraint*: `chk_invitation_role` -- `role IN ('manager', 'member', 'accountant')`. **`'owner'` is deliberately absent**: transferring ownership is not an invitation
- *Constraint*: `chk_invitation_status` -- `status IN ('pending', 'accepted', 'revoked')`
- *Index*: UQ partial `uq_org_invitation_pending_email` on `(organization_id, lower(email)) WHERE status = 'pending'` -- one live invitation per address per organization, so re-inviting replaces the pending row instead of accumulating redeemable links

---

### CRM & Product Entities

#### `clients`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `name`: text (not null) -- Business or Legal Entity Name
- `contact_name`: text (nullable) -- Primary contact person
- `email`: text (nullable, IDX)
- `phone`: text (nullable) -- WhatsApp-sanitized 10-digit number
- `rfc`: text (nullable, IDX) -- Client RFC for CFDI 4.0 invoicing
- `regimen_fiscal`: text (nullable) -- SAT tax regime
- `codigo_postal`: text (nullable) -- SAT tax postal code
- `cfdi_use`: text (nullable, default: `'G03'`) -- SAT CFDI Usage (e.g., 'G03', 'P01')
- `notes`: text (nullable)
- `health_score`: int4 (not null, default: `100`) -- 0 to 100 payment reliability score
- `credit_limit`: numeric(12,2) (nullable, **no default**) -- Authorised credit limit line ($ MXN). NULL = no credit line has ever been configured
- `credit_days`: int4 (nullable, **no default**) -- Payment terms in days. NULL = never configured; `0` is a real answer meaning contado
- `credit_status`: text (nullable, **no default**, CHECK in `'active' | 'suspended' | 'blocked'`) -- NULL = never configured
- `archived_at`: timestamptz (nullable, **no default**) -- When the owner archived this client. NULL = never archived. **Directory visibility only, never a soft delete**: quotes, contracts and milestones are untouched, and the client's `/q/` and `/pay/` links keep resolving. `quotes.client_id` and `contracts.client_id` are `ON DELETE RESTRICT`, so a client with history can never be hard-deleted — this is where the tenant goes instead
- *Index*: partial `idx_clients_org_active` on `(organization_id) WHERE archived_at IS NULL` -- the shape of every directory and picker read. The archived list is deliberately unindexed: it is opened rarely, by one tenant at a time

> **These three carry no default on purpose.** This document previously
> specified them as `default 0.00 / 0 / 'active'`, and no migration ever created
> them at all — the columns were absent from production while `types/database.ts`
> declared them, so every read resolved to `undefined`. Defaulting would have
> made the resulting bug permanent rather than fixing it: a client nobody has
> assessed would be indistinguishable from one deliberately authorised at zero,
> and would render under a confident green "Activo" badge on the screen where
> the owner decides whether to extend more credit. Consumers must branch on
> `credit_limit IS NULL` (see `isConfigured` in `lib/clientCredit.ts`).
> Created by `20260809180000_clients_credit_terms.sql`.
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)

#### `products`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `name`: text (not null)
- `description`: text (nullable)
- `unit_price`: numeric(12,2) (not null)
- `unit`: text (not null, default: `'E48'`) -- SAT Clave Unidad (e.g., 'E48' for service)
- `sat_product_code`: text (not null, default: `'84111506'`) -- SAT Clave ProdServ
- `stock_quantity`: int4 (nullable) -- NULL for service businesses
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)

---

### Transactional & Financial Entities

#### `quotes`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `client_id`: uuid (FK -> `clients.id`, not null, IDX)
- `created_by`: uuid (FK -> `auth.users.id`, not null)
- `title`: text (not null)
- `line_items`: jsonb (not null, default: `'[]'::jsonb`) -- Array of [{ description, quantity, unit_price, sat_code }]
- `subtotal_amount`: numeric(12,2) (not null)
- `iva_amount`: numeric(12,2) (not null, default: `0.00`)
- `retencion_isr_amount`: numeric(12,2) (not null, default: `0.00`)
- `retencion_iva_amount`: numeric(12,2) (not null, default: `0.00`)
- `total_amount`: numeric(12,2) (not null)
- `currency`: text (not null, default: `'MXN'`) -- 'MXN' | 'USD'
- `status`: text (not null, default: `'draft'`) -- 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'
- `valid_until`: date (nullable)
- `notes`: text (nullable)
- `public_token`: text (not null, UQ) -- Cryptographic random string for public approval link
- `bank_account_id`: uuid (nullable, FK -> `bank_accounts.id` `ON DELETE RESTRICT`, IDX) -- The account this quote's client was told to pay (`20260811180000`, #164). NULL = the organization's default at render time, which is what every quote written before that migration means. Never re-resolved to the current default: see `resolveQuoteAccount()` in `lib/bankAccounts.ts`
- `converted_contract_id`: uuid (nullable, FK -> `contracts.id`)
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)

#### `contracts`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `quote_id`: uuid (nullable, FK -> `quotes.id`, UQ)
- `client_id`: uuid (FK -> `clients.id`, not null, IDX)
- `title`: text (not null)
- `scope_description`: text (not null)
- `total_amount`: numeric(12,2) (not null)
- `currency`: text (not null, default: `'MXN'`)
- `status`: text (not null, default: `'draft'`) -- 'draft' | 'sent' | 'client_signed' | 'accepted' | 'completed' | 'cancelled'
- `contract_hash`: text (nullable) -- SHA-256 digital cryptoseal
- `client_otp_code`: text (nullable)
- `client_otp_verified`: boolean (not null, default: `false`)
- `client_otp_attempts`: int4 (not null, default: `0`)
- `accepted_at`: timestamptz (nullable)
- `accepted_by_name`: text (nullable)
- `accepted_ip`: text (nullable)
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)

#### `milestones` (Receivables)
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `contract_id`: uuid (FK -> `contracts.id`, not null, IDX)
- `label`: text (not null) -- e.g., 'Anticipo 50%', 'Entrega Final'
- `amount`: numeric(12,2) (not null)
- `due_date`: date (not null, IDX)
- `status`: text (not null, default: `'pending'`) -- 'pending' | 'requested' | 'marked_paid' | 'confirmed'
- `receipt_url`: text (nullable) -- Storage URL for SPEI proof
- `tracking_reference`: text (nullable) -- SPEI Clave de Rastreo (Banxico)
- `transferred_amount`: numeric(12,2) (nullable)
- `cfdi_id`: text (nullable) -- The PAC's own invoice id, used to cancel or re-download
- `cfdi_uuid`: text (nullable, UQ where not null) -- SAT folio fiscal
- `cfdi_status`: text (not null, default: `'none'`) -- 'none' | 'pending' | 'issued' | 'failed' | 'cancelled'
- `cfdi_provider`: text (nullable) -- PAC that stamped it
- `cfdi_environment`: text (nullable) -- 'sandbox' | 'live'; a sandbox document has no fiscal validity
- `cfdi_xml_path`: text (nullable) -- Object path in the private `cfdi-documents` bucket
- `cfdi_pdf_path`: text (nullable) -- Object path in the private `cfdi-documents` bucket
- `cfdi_xml_url`: text (nullable) -- Authenticated download route, for the accountant export
- `cfdi_pdf_url`: text (nullable) -- Authenticated download route, for the accountant export
- `cfdi_stamped_at`: timestamptz (nullable)
- `cfdi_cancelled_at`: timestamptz (nullable)
- `cfdi_error`: text (nullable) -- Why the last attempt failed, in the user's language
- `confirmed_at`: timestamptz (nullable)
- `created_at`: timestamptz (not null, default: `now()`)
- `conversion_position`: smallint (nullable, `chk_` >= 1) -- 1..n for rows created by quote conversion; NULL for manual cobros. UQ with `contract_id` where not null (`uq_milestones_contract_conversion_position`), so a concurrent double-conversion cannot double the schedule (#222)

#### `cfdi_payment_complements`
*Added by `20260807170000_cfdi_payment_complements` (#29). One row per complemento de pago (CFDI type P), stamped or attempted — a PPD invoice paid in three transfers produces three. A failed attempt is kept, not deleted; the partial unique index excludes `status = 'failed'`, so a retry is a new row for the same installment.*

- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `milestone_id`: uuid (FK -> `milestones.id`, not null, IDX)
- `installment`: smallint (not null, `chk_` >= 1) -- SAT NumParcialidad, 1-based against the related document
- `amount`: numeric(12,2) (not null, > 0) -- ImpPagado, capped at `last_balance` by `chk_complement_balances`
- `last_balance`: numeric(12,2) (not null, > 0) -- ImpSaldoAnt; stored, never recomputed from the milestone
- `remaining_balance`: numeric(12,2) (not null, >= 0) -- ImpSaldoInsoluto
- `overpaid_amount`: numeric(12,2) (nullable, `chk_` NULL or >= 0) -- What the payment exceeded the balance by (`20260812230000`, #81); not declared in the complement. NULL predates the column. Failed attempt and retry both carry it — sum only `status = 'issued'`
- `payment_form`, `payment_date`, `operation_number`, `status` ('pending' | 'issued' | 'failed' | 'cancelled'), `cfdi_id`, `cfdi_uuid`, `cfdi_provider`, `cfdi_environment`, `cfdi_xml_path`, `cfdi_pdf_path`, `stamped_at`, `cancelled_at`, `error`, `created_by`, timestamps -- see the migration; `types/database.ts` mirrors the full shape

#### `pac_connections`

> Replaced `csd_credentials`, which was dropped in `20260807120000_cfdi_pac_integration.sql`.
> That table modelled a user's CSD (`certificate_base64`, `private_key_encrypted`,
> `password_encrypted`). Nothing ever wrote to it, and per §02 of
> `cfdi_integration_architecture.md` nothing ever should: the trust argument
> ("nunca almacenamos tus certificados SAT") depends on that data not existing here.
> The CSD stays with the user's PAC; we hold only the revocable API key below.

- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, UQ)
- `provider`: text (not null, default: `'facturapi'`)
- `api_key_sealed`: text (not null) -- 'v1.<iv>.<tag>.<ciphertext>', AES-256-GCM (`PAC_ENCRYPTION_KEY`)
- `api_key_hint`: text (not null) -- Last four characters, for the settings UI
- `environment`: text (not null, default: `'sandbox'`) -- 'sandbox' | 'live'
- `connected_by`: uuid (nullable, FK -> `auth.users.id`)
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)
- *RLS*: restricted to the organization **owner**, not every member

#### `audit_logs`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `contract_id`: uuid (nullable, FK -> `contracts.id`, IDX)
- `action`: text (not null) -- e.g., 'quote_created', 'contract_signed', 'payment_confirmed'
- `actor`: text (not null) -- 'owner' | 'client' | 'system'
- `details`: text (not null)
- `ip`: text (nullable)
- `created_at`: timestamptz (not null, default: `now()`)

---

## 03 Relationships & Constraints

### Relationship Map

```
auth.users (Supabase)
  │
  ├── (1:N) ──> organization_members <── (N:1) ── organizations
  │                                                   │
  │ (Owner 1:1)                                       ├── (1:N) ──> clients
  └───────────────────────────────────────────────────┼── (1:N) ──> products
                                                      ├── (1:N) ──> quotes ── (1:1) ──> contracts
                                                      └── (1:1) ──> pac_connections     │
                                                                                        └── (1:N) ──> milestones
```

* **`organizations` ↔ `organization_members`**: One-to-Many (Organization has 1+ members).
* **`organizations` → `clients`**: One-to-Many (Organization manages N clients).
* **`organizations` → `quotes`**: One-to-Many.
* **`clients` → `quotes`**: One-to-Many (Client receives N quotes).
* **`quotes` → `contracts`**: Zero-or-One-to-One (Optional: Quote converts into Contract).
* **`contracts` → `milestones`**: One-to-Many (Contract breaks down into N receivable milestones).

### Foreign Key Behaviors

| Parent Table | Child Table | Foreign Key Column | On Delete | On Update | Rationale |
|:---|:---|:---|:---|:---|:---|
| `organizations` | `organization_members` | `organization_id` | `CASCADE` | `CASCADE` | Deleting an org cleans up memberships |
| `organizations` | `clients` | `organization_id` | `RESTRICT` | `CASCADE` | Block org deletion if active client data exists |
| `organizations` | `quotes` | `organization_id` | `RESTRICT` | `CASCADE` | Preserve financial audit trail |
| `clients` | `quotes` | `client_id` | `RESTRICT` | `CASCADE` | Cannot delete a client with existing quotes |
| `quotes` | `contracts` | `quote_id` | `SET NULL` | `CASCADE` | Preserves contract if source quote is removed |
| `contracts` | `milestones` | `contract_id` | `CASCADE` | `CASCADE` | Milestones are strictly owned by their contract |

### Check Constraints & Business Rules

```sql
-- 1. Milestone amount must be positive
ALTER TABLE milestones ADD CONSTRAINT chk_milestone_amount_positive CHECK (amount > 0);

-- 2. Health score bounded between 0 and 100
ALTER TABLE clients ADD CONSTRAINT chk_client_health_score_range CHECK (health_score BETWEEN 0 AND 100);

-- 3. OTP verification attempts capped
ALTER TABLE contracts ADD CONSTRAINT chk_otp_attempts_limit CHECK (client_otp_attempts BETWEEN 0 AND 5);

-- 4. Valid currency codes
ALTER TABLE quotes ADD CONSTRAINT chk_quote_currency CHECK (currency IN ('MXN', 'USD'));
ALTER TABLE contracts ADD CONSTRAINT chk_contract_currency CHECK (currency IN ('MXN', 'USD'));

-- 5. Valid Subscription Tiers
ALTER TABLE organizations ADD CONSTRAINT chk_subscription_tier CHECK (subscription_tier IN ('free', 'emprendedor', 'negocio', 'empresa'));
```

---

## 04 Indexes & Performance

### Required Indexes

```sql
-- 1. Multi-Tenant Member Lookup (Extremely High Frequency for RLS)
CREATE UNIQUE INDEX idx_org_members_lookup 
ON organization_members (user_id, organization_id);

-- 2. Accounts Receivable Overdue & Due Date Filter (Dashboard & Cron)
CREATE INDEX idx_milestones_due_status 
ON milestones (organization_id, due_date, status);

-- 3. Client Search by RFC (SAT CFDI Validation)
CREATE INDEX idx_clients_org_rfc 
ON clients (organization_id, rfc) 
WHERE rfc IS NOT NULL;

-- 4. Quotes by Status & Date (Kanban & List views)
CREATE INDEX idx_quotes_org_status_date 
ON quotes (organization_id, status, created_at DESC);

-- 5. Contract Cryptoseal Public Verification
CREATE INDEX idx_contracts_hash 
ON contracts (contract_hash) 
WHERE contract_hash IS NOT NULL;

-- 6. Full-Text Search on Client Names & Contact Info (Trigram Index)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_clients_name_trgm 
ON clients USING gin (name gin_trgm_ops);
```

### Performance Considerations

* **N+1 Prevention**: Next.js Server Components select contracts with milestones using Supabase single-query nested JSON selects:
  `supabase.from('contracts').select('*, milestones(*), clients(*)')`
* **Pagination Strategy**: Cursor-based pagination (`created_at < last_seen_timestamp`) on `/api/quotes` and `/api/receivables` to prevent deep offset slowdowns.
* **Denormalized Snapshots**: `quotes.line_items` stores a complete snapshot of item titles and prices at creation time so subsequent price updates in `products` do not mutate historical quotes.

---

## 05 Access Patterns

### High-Frequency Queries

#### 1. Accounts Receivable Summary (Dashboard Header)
```sql
-- Pattern: Get overdue, due today, and upcoming totals for active org
SELECT 
  SUM(CASE WHEN due_date < CURRENT_DATE AND status IN ('pending', 'requested') THEN amount ELSE 0 END) AS total_overdue,
  SUM(CASE WHEN due_date = CURRENT_DATE AND status IN ('pending', 'requested') THEN amount ELSE 0 END) AS total_due_today,
  SUM(CASE WHEN due_date > CURRENT_DATE AND status IN ('pending', 'requested') THEN amount ELSE 0 END) AS total_upcoming
FROM milestones
WHERE organization_id = 'org_uuid_here';

-- Frequency: Every dashboard page view (~40% of all queries)
-- Index Used: idx_milestones_due_status
```

#### 2. Client Profile with Financial History
```sql
-- Pattern: Fetch client profile with recent quotes and contracts
SELECT c.*, 
       COUNT(DISTINCT q.id) AS total_quotes,
       COALESCE(SUM(m.amount) FILTER (WHERE m.status = 'confirmed'), 0) AS total_paid_mxn
FROM clients c
LEFT JOIN quotes q ON q.client_id = c.id
LEFT JOIN contracts con ON con.client_id = c.id
LEFT JOIN milestones m ON m.contract_id = con.id
WHERE c.organization_id = 'org_uuid_here' AND c.id = 'client_uuid_here'
GROUP BY c.id;

-- Frequency: High (Client CRM details tab)
-- Indexes Used: clients_pkey, idx_quotes_org_status_date, idx_milestones_due_status
```

#### 3. Public Quote Verification (Client Mobile View)
```sql
-- Pattern: Fetch public quote by secret token without authentication
SELECT q.*, c.name AS client_name, c.email AS client_email, o.name AS org_name, o.logo_url
FROM quotes q
JOIN clients c ON c.id = q.client_id
JOIN organizations o ON o.id = q.organization_id
WHERE q.public_token = 'crypto_token_hex';

-- Frequency: Medium (When client opens WhatsApp link)
-- Index Used: quotes_public_token_key (Unique B-tree)
```

---

## 06 Migration Plan

### Migration Tool Workflow

Migrations are managed via the **Supabase CLI** using versioned SQL scripts in `supabase/migrations/`:

```bash
# 1. Generate new migration file
npx supabase migration new add_business_helper_tables

# 2. Test migration locally against Docker Postgres container
npx supabase db reset

# 3. Apply to production Supabase project
npx supabase db push
```

### Evolution & Zero-Downtime Strategy

1. **Additive Schema Only**: Existing Mi Pacto tables (`contracts`, `milestones`) are extended with `organization_id` foreign keys using `DEFAULT NULL`.
2. **Backfill Script**: A SQL migration populates `organization_id` for existing solo users by auto-creating an `organizations` row for each `auth.users.id`.
3. **Enforce Constraints**: Once backfilled, `organization_id` is updated to `NOT NULL`.

```sql
-- Migration snippet: Backfill organizations for solo users
INSERT INTO organizations (name, owner_id)
SELECT COALESCE(raw_user_meta_data->>'full_name', 'Mi Negocio'), id
FROM auth.users
WHERE id NOT IN (SELECT owner_id FROM organizations);

INSERT INTO organization_members (organization_id, user_id, role)
SELECT id, owner_id, 'owner' FROM organizations
ON CONFLICT (organization_id, user_id) DO NOTHING;
```

---

## 07 Security & Privacy

### Sensitive Data Inventory

| Field | Entity | Sensitivity | Storage & Protection |
|:---|:---|:---|:---|
| `rfc` | `organizations`, `clients` | PII / Tax Data | Stored in plaintext; protected via Supabase RLS |
| `phone`, `email` | `clients` | PII | Stored in plaintext; sanitized on input |
| `api_key_sealed` | `pac_connections` | PAC Credential | **AES-256-GCM** sealed before insertion (`PAC_ENCRYPTION_KEY`, never stored in a row); owner-only RLS |
| CSD (`.cer`, `.key`, password) | — | Confidential Legal Key | **Never stored.** Held by the user's PAC; Business Helper only sends invoice data |
| `client_otp_code` | `contracts` | Transient Auth Code | 6-digit random string; cleared immediately upon verification |

### Row-Level Security (RLS) Policies

All tables must explicitly enforce RLS policies:

```sql
-- Enable RLS on Quotes table
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- 1. Tenant Members Read/Write Policy
CREATE POLICY "Tenant members access organization quotes"
ON quotes FOR ALL TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- 2. Public Read Access via Public Token (For WhatsApp Quote Links)
CREATE POLICY "Public read quotes via public token"
ON quotes FOR SELECT TO anon
USING (public_token IS NOT NULL);
```

### Server-Only Tables — RLS Deny-All, Service Role Only

Some tables must never be reachable from PostgREST with a tenant JWT, in either direction:
`otp_send_log`, `stripe_webhook_events`, `ai_usage_monthly` (#228 — a member who could UPDATE
their own usage row could zero their own model-call counter), and `cfdi_stamp_claims` (#213 — the
claim row inserted before every PAC stamp; PK on `milestone_id`, so a concurrent claimant collides
with `23505` instead of issuing a second CFDI). The pattern: enable RLS and write
**no policies**, and revoke table privileges from `anon` and `authenticated` **by name** (Supabase's
default privileges grant to them as named roles, so `FROM PUBLIC` alone strips nothing). Only the
service client reads or writes these tables, and the caller carries the burden of scoping every
query by `organization_id`.

These four are documented below rather than in §02, because what matters about them is the access
posture, not their place in the entity map. **`tests/unit/schemaDocTableCoverage.test.ts` fails the
build when a migration creates a table this document does not describe** (#156).

#### `otp_send_log`
*Added by `20260807000000_otp_send_rate_limit` (#17/#20); recipient semantics widened by `20260811120000_otp_email_recipient` (#155). One row per issued OTP — the shared state the per-recipient rate limit is counted from, because Vercel functions share no memory and an in-process counter would not survive an invocation.*
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `phone_e164`: text (not null) -- ⚠️ **The name lies, deliberately.** This is the *normalized recipient* and the rate-limit key: a **lowercased email** on the `email` launch channel, E.164 only on the deprecated `sms`/`whatsapp` channels. The historical name is kept because Vercel auto-deploys `main` while migrations are applied by hand (hard rule #6) — renaming it would turn every OTP issue in that window into a 500 in front of a signer. **Do not write a phone-shaped filter or CHECK against this column.** The live `COMMENT ON COLUMN` says the same thing
- `quote_id`: uuid (FK -> `quotes.id` `ON DELETE SET NULL`, nullable, IDX) -- `SET NULL` rather than `CASCADE` on purpose: deleting a quote must not erase the evidence that its codes went to a recipient, or deleting one would hand back that recipient's hourly budget
- `channel`: text (nullable)
- `created_at`: timestamptz (not null, default: `now()`)
- *Constraint*: `chk_otp_send_log_recipient` -- E.164 (`^\+[0-9]{10,15}$`) **or** a lowercased email in the same forgiving shape the app validates with. The lowercasing is enforced here, not just in the app, so two casings of one inbox cannot become two budgets by bypassing it. It replaced `chk_otp_send_log_phone_e164`, which was E.164-only
- *Index*: `idx_otp_send_log_phone_created` on `(phone_e164, created_at)` -- the hourly window query
- *Retention*: rows older than the widest limit window are ballast, but the per-quote lifetime cap reads history for quotes that are still signable, so prune conservatively: `DELETE FROM public.otp_send_log WHERE created_at < now() - interval '30 days';`

#### `stripe_webhook_events`
*Added by `20260806120000_security_hardening`. The idempotency ledger: Stripe retries deliveries, and without it a replayed subscription event re-applies a tier change.*
- `id`: text (PK) -- the Stripe event id; the PK is what makes reprocessing a no-op
- `event_type`: text (not null)
- `organization_id`: uuid (FK -> `organizations.id` `ON DELETE SET NULL`, nullable, IDX)
- `payload`: jsonb (nullable)
- `processed_at`: timestamptz (not null, default: `now()`)
- *Grants*: the by-name REVOKE arrived late, in `20260815000000_stripe_webhook_events_grants` (#242) — this table predates the pattern. RLS does not govern TRUNCATE, so RLS-with-no-policies left `anon` able to erase the ledger

#### `cfdi_stamp_claims`
*Added by `20260813000000_cfdi_stamp_claims` (#213), grants in `20260813010000`. Inserted **before** every PAC call so a second claimant collides instead of stamping a second CFDI — Facturapi's `external_id` deduplicates nothing (verified live, #26), and a CFDI cannot be un-issued, only cancelled on record with the SAT.*
- `milestone_id`: uuid (PK, FK -> `milestones.id`) -- PK on the milestone is the whole mechanism: the second concurrent claimant gets `23505`. `ON DELETE RESTRICT` since `20260814210000` (#336), so a held claim blocks the milestone's deletion rather than cascading away mid-stamp
- `organization_id`: uuid (FK -> `organizations.id` `ON DELETE CASCADE`, not null, IDX)
- `claimed_by`: uuid (nullable)
- `claimed_at`: timestamptz (not null, default: `now()`)
- *Lifecycle*: deleted on definitive PAC failure so a genuine retry proceeds; **kept on timeout** — the document may exist — and released only after the PAC's invoice list confirms no document carries the `external_id`

#### `ai_usage_monthly`
*Added by `20260812210000_ai_usage_ledger` (#228). One row per organization per month of model-written assistant answers.*
- `organization_id` + `month` (`'YYYY-MM'`): PK on the pair
- `used`: the counter
- *Writer*: `increment_ai_usage(uuid, text)` — plain SQL, ***not*** `SECURITY DEFINER`, executable by `service_role` only — is its atomic writer
- *Why server-only*: a member who could UPDATE their own usage row could zero their own model-call counter

### `SECURITY DEFINER` Functions — Grants Must Name the Roles

A `SECURITY DEFINER` function in `public` runs with its owner's privileges, outside RLS, and
PostgREST publishes every executable `public` function at `/rest/v1/rpc/<name>`. Locking one down
takes an explicit per-role revoke:

```sql
REVOKE EXECUTE ON FUNCTION public.my_function(uuid, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.my_function(uuid, text) TO service_role;
```

`REVOKE ALL ON FUNCTION … FROM PUBLIC` **does not achieve this.** Supabase grants `EXECUTE` on
functions created in `public` to `anon` and `authenticated` as *named roles*, and revoking the
implicit `PUBLIC` grant leaves a role-specific grant untouched. Both folio RPCs shipped callable by
any signed-in user this way (#76).

`tests/unit/securityDefinerGrants.test.ts` fails the build on a `SECURITY DEFINER` function in
`public` with no per-role revoke. It reads migration files, so it catches an unsafe migration at
authoring time — it cannot see the live database, and the grants that matter are the ones in
production.

**One documented exemption: `user_organization_ids()`.** It must keep its `authenticated` grant.
RLS policy expressions are evaluated as the querying role, and twelve policies call
`SELECT public.user_organization_ids()`; revoking it would make every authenticated read fail with
`permission denied for function`. It is also the safe shape — no parameters, body filtered on
`auth.uid()` — so a direct RPC call returns only the caller's own memberships. The exploitable
shape is a function that takes a tenant id as an *argument*, which is what the folio RPCs did.

### Audit Logging

Every state transition (`quote_created`, `contract_signed`, `payment_confirmed`, `cfdi_issued`) inserts an immutable record into `audit_logs` capturing `organization_id`, `actor`, `action`, `ip`, and timestamp.
