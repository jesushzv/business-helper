-- ============================================================================
-- Business Helper — Initial Multi-Tenant Schema & Row-Level Security (RLS)
-- Migration: 20260803000000_initial_schema.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 01. Helper Security Functions
-- ----------------------------------------------------------------------------

-- Trigger function: Automatically updates updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 02. Tables & Core Entities
-- ----------------------------------------------------------------------------

-- Table 1: organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rfc text,
  regimen_fiscal text,
  codigo_postal text,
  logo_url text,
  industry text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  subscription_tier text NOT NULL DEFAULT 'free',
  subscription_status text NOT NULL DEFAULT 'active',
  facturapi_organization_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_subscription_tier CHECK (subscription_tier IN ('free', 'emprendedor', 'negocio', 'empresa')),
  CONSTRAINT chk_subscription_status CHECK (subscription_status IN ('active', 'past_due', 'canceled'))
);

-- Table 2: organization_members
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  invited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_org_user UNIQUE (organization_id, user_id),
  CONSTRAINT chk_member_role CHECK (role IN ('owner', 'manager', 'member', 'accountant'))
);

-- Table 3: clients
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  rfc text,
  regimen_fiscal text,
  codigo_postal text,
  cfdi_use text DEFAULT 'G03',
  notes text,
  health_score int4 NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_client_health_score_range CHECK (health_score BETWEEN 0 AND 100)
);

-- Table 4: products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  unit_price numeric(12,2) NOT NULL,
  unit text NOT NULL DEFAULT 'E48',
  sat_product_code text NOT NULL DEFAULT '84111506',
  stock_quantity int4,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table 5: quotes
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal_amount numeric(12,2) NOT NULL,
  iva_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  retencion_isr_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  retencion_iva_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  total_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  status text NOT NULL DEFAULT 'draft',
  valid_until date,
  notes text,
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  converted_contract_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_quote_currency CHECK (currency IN ('MXN', 'USD')),
  CONSTRAINT chk_quote_status CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'))
);

-- Table 6: contracts
CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  quote_id uuid UNIQUE REFERENCES public.quotes(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  title text NOT NULL,
  scope_description text NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  status text NOT NULL DEFAULT 'draft',
  contract_hash text,
  client_otp_code text,
  client_otp_verified boolean NOT NULL DEFAULT false,
  client_otp_attempts int4 NOT NULL DEFAULT 0,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_contract_currency CHECK (currency IN ('MXN', 'USD')),
  CONSTRAINT chk_contract_status CHECK (status IN ('draft', 'sent', 'client_signed', 'accepted', 'completed', 'cancelled')),
  CONSTRAINT chk_otp_attempts_limit CHECK (client_otp_attempts BETWEEN 0 AND 5)
);

-- Foreign Key circular reference resolution for quotes -> contracts
-- (drop-first so the file is idempotent, per convention — verified in CI, #35)
ALTER TABLE public.quotes
  DROP CONSTRAINT IF EXISTS fk_quotes_converted_contract;
ALTER TABLE public.quotes
  ADD CONSTRAINT fk_quotes_converted_contract
  FOREIGN KEY (converted_contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;

-- Table 7: milestones
CREATE TABLE IF NOT EXISTS public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount numeric(12,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  receipt_url text,
  tracking_reference text,
  transferred_amount numeric(12,2),
  cfdi_id text,
  cfdi_status text NOT NULL DEFAULT 'none',
  cfdi_xml_url text,
  cfdi_pdf_url text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_milestone_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_milestone_status CHECK (status IN ('pending', 'requested', 'marked_paid', 'confirmed')),
  CONSTRAINT chk_milestone_cfdi_status CHECK (cfdi_status IN ('none', 'pending', 'issued', 'failed'))
);

-- Table 8: csd_credentials
CREATE TABLE IF NOT EXISTS public.csd_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  certificate_base64 text NOT NULL,
  private_key_encrypted text NOT NULL,
  password_encrypted text NOT NULL,
  rfc text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table 9: audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor text NOT NULL,
  details text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 03. Performance & Lookup Indexes
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_lookup 
  ON public.organization_members (user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_milestones_due_status 
  ON public.milestones (organization_id, due_date, status);

CREATE INDEX IF NOT EXISTS idx_clients_org_rfc 
  ON public.clients (organization_id, rfc) WHERE rfc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_org_status_date 
  ON public.quotes (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_hash 
  ON public.contracts (contract_hash) WHERE contract_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_name_trgm 
  ON public.clients USING gin (name gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 04. Automated Updated At Triggers
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_organizations_updated_at ON public.organizations;
CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_clients_updated_at ON public.clients;
CREATE TRIGGER set_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_products_updated_at ON public.products;
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_quotes_updated_at ON public.quotes;
CREATE TRIGGER set_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_contracts_updated_at ON public.contracts;
CREATE TRIGGER set_contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper function: Returns active user's accessible organization IDs
CREATE OR REPLACE FUNCTION public.user_organization_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id 
  FROM public.organization_members 
  WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 05. Row-Level Security (RLS) Multi-Tenant Policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csd_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Organizations Policy
DROP POLICY IF EXISTS "Users can access owned or member organizations" ON public.organizations;
CREATE POLICY "Users can access owned or member organizations"
ON public.organizations FOR ALL TO authenticated
USING (
  owner_id = auth.uid() OR id IN (SELECT public.user_organization_ids())
);

-- 2. Organization Members Policy
DROP POLICY IF EXISTS "Members can view co-members in their org" ON public.organization_members;
CREATE POLICY "Members can view co-members in their org"
ON public.organization_members FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);

-- 3. Clients Policy
DROP POLICY IF EXISTS "Tenant members access organization clients" ON public.clients;
CREATE POLICY "Tenant members access organization clients"
ON public.clients FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);

-- 4. Products Policy
DROP POLICY IF EXISTS "Tenant members access organization products" ON public.products;
CREATE POLICY "Tenant members access organization products"
ON public.products FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);

-- 5. Quotes Policy (Authenticated Members + Public Token Read)
DROP POLICY IF EXISTS "Tenant members access organization quotes" ON public.quotes;
CREATE POLICY "Tenant members access organization quotes"
ON public.quotes FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);

DROP POLICY IF EXISTS "Public read quotes via public_token" ON public.quotes;
CREATE POLICY "Public read quotes via public_token"
ON public.quotes FOR SELECT TO anon
USING (public_token IS NOT NULL);

-- 6. Contracts Policy (Authenticated Members + Public Read)
DROP POLICY IF EXISTS "Tenant members access organization contracts" ON public.contracts;
CREATE POLICY "Tenant members access organization contracts"
ON public.contracts FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);

DROP POLICY IF EXISTS "Public read contracts for OTP signing" ON public.contracts;
CREATE POLICY "Public read contracts for OTP signing"
ON public.contracts FOR SELECT TO anon
USING (status IN ('sent', 'client_signed', 'accepted'));

-- 7. Milestones Policy
DROP POLICY IF EXISTS "Tenant members access organization milestones" ON public.milestones;
CREATE POLICY "Tenant members access organization milestones"
ON public.milestones FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);

-- 8. CSD Credentials Policy (Restricted to Owner/Accountant)
DROP POLICY IF EXISTS "Tenant members access organization CSD credentials" ON public.csd_credentials;
CREATE POLICY "Tenant members access organization CSD credentials"
ON public.csd_credentials FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);

-- 9. Audit Logs Policy
DROP POLICY IF EXISTS "Tenant members access organization audit logs" ON public.audit_logs;
CREATE POLICY "Tenant members access organization audit logs"
ON public.audit_logs FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);
