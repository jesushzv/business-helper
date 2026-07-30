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
- `owner_id`: uuid (FK -> `auth.users.id`, not null, IDX)
- `stripe_customer_id`: text (nullable, UQ)
- `stripe_subscription_id`: text (nullable, UQ)
- `subscription_tier`: text (not null, default: `'free'`) -- 'free' | 'emprendedor' | 'negocio' | 'empresa'
- `subscription_status`: text (not null, default: `'active'`) -- 'active' | 'past_due' | 'canceled'
- `facturapi_organization_id`: text (nullable) -- Linked PAC tenant ID
- `created_at`: timestamptz (not null, default: `now()`)
- `updated_at`: timestamptz (not null, default: `now()`)

#### `organization_members`
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, IDX)
- `user_id`: uuid (FK -> `auth.users.id`, not null, IDX)
- `role`: text (not null, default: `'member'`) -- 'owner' | 'manager' | 'member' | 'accountant'
- `invited_at`: timestamptz (not null, default: `now()`)
- `created_at`: timestamptz (not null, default: `now()`)
- *Constraint*: UQ `(organization_id, user_id)`

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
- `cfdi_id`: text (nullable) -- Facturapi UUID
- `cfdi_status`: text (not null, default: `'none'`) -- 'none' | 'pending' | 'issued' | 'failed'
- `cfdi_xml_url`: text (nullable)
- `cfdi_pdf_url`: text (nullable)
- `confirmed_at`: timestamptz (nullable)
- `created_at`: timestamptz (not null, default: `now()`)

#### `csd_credentials` (Vault)
- `id`: uuid (PK, default: `gen_random_uuid()`)
- `organization_id`: uuid (FK -> `organizations.id`, not null, UQ)
- `certificate_base64`: text (not null)
- `private_key_encrypted`: text (not null) -- Encrypted with KMS/HMAC key
- `password_encrypted`: text (not null)
- `rfc`: text (not null)
- `is_active`: boolean (not null, default: `true`)
- `expires_at`: timestamptz (nullable)
- `created_at`: timestamptz (not null, default: `now()`)

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
                                                      └── (1:N) ──> csd_credentials     │
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
| `private_key_encrypted` | `csd_credentials` | Confidential Legal Key | **AES-256-GCM** encrypted before database insertion |
| `password_encrypted` | `csd_credentials` | Credential | **AES-256-GCM** encrypted before database insertion |
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

### Audit Logging

Every state transition (`quote_created`, `contract_signed`, `payment_confirmed`, `cfdi_issued`) inserts an immutable record into `audit_logs` capturing `organization_id`, `actor`, `action`, `ip`, and timestamp.
