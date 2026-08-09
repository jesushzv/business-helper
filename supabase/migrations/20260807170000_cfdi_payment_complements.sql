-- ============================================================================
-- Business Helper — Complemento de Recepción de Pagos (CFDI type P)
-- Migration: 20260807170000_cfdi_payment_complements.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
--
-- `buildComplementoPagoPayload` has existed since the CFDI work started and
-- nothing ever called it. A CFDI stamped as PPD (pago en parcialidades o
-- diferido) obliges the taxpayer to file a payment complement — a second
-- stamped document, with its own UUID — in the first days of the month after
-- each payment received. The product could already issue PPD documents through
-- `/api/invoices/issue`, so it was creating that obligation and then leaving
-- the user to discover it from the SAT.
--
-- Two things were missing from the schema:
--
--   01. The milestone never recorded *which* payment method its CFDI was
--       stamped with, so nothing could tell a PPD document from a PUE one
--       after the fact.
--   02. `milestones` models exactly one CFDI. A payment complement is a
--       different document with its own folio fiscal, and a PPD invoice paid
--       in three transfers produces three of them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 01. What the invoice was stamped as
--
-- `cfdi_payment_method` is the SAT MetodoPago of the stamped document, not a
-- preference: it is written by the stamping route from what the PAC accepted.
-- NULL means a document stamped before this migration, whose method is not
-- known from the row; those are treated as PUE, which is what
-- `/api/invoices/issue` defaulted to and the UI only ever produced.
--
-- `cfdi_total` is the document's own total as the PAC computed it. Balances in
-- a payment complement (ImpSaldoAnt / ImpPagado / ImpSaldoInsoluto) must
-- reconcile against the CFDI, not against the milestone amount the CFDI was
-- derived from — the two can differ by a rounding step once the PAC recomputes
-- taxes from the base.
-- ----------------------------------------------------------------------------
ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS cfdi_payment_method text,
  ADD COLUMN IF NOT EXISTS cfdi_total numeric(12,2);

ALTER TABLE public.milestones
  DROP CONSTRAINT IF EXISTS chk_milestone_cfdi_payment_method;
ALTER TABLE public.milestones
  ADD CONSTRAINT chk_milestone_cfdi_payment_method
  CHECK (cfdi_payment_method IS NULL OR cfdi_payment_method IN ('PUE', 'PPD'));

-- ----------------------------------------------------------------------------
-- 02. The complements themselves
--
-- One row per payment complement, stamped or attempted. `installment` is the
-- SAT NumParcialidad: the 1-based ordinal of the payment against the related
-- document. `last_balance` is the outstanding amount before the payment
-- (ImpSaldoAnt) and `remaining_balance` what is left after it
-- (ImpSaldoInsoluto); both are stored because they are part of the stamped
-- document and must not be recomputed from a milestone that may have been
-- edited since.
--
-- A failed attempt is kept rather than deleted. The obligation survives the
-- failure, so the row is what tells the UI a complement is owed and lets the
-- user retry it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cfdi_payment_complements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  milestone_id uuid NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,

  -- SAT NumParcialidad, 1-based.
  installment integer NOT NULL,
  -- ImpPagado: what was received in this payment.
  amount numeric(12,2) NOT NULL,
  -- ImpSaldoAnt / ImpSaldoInsoluto around this payment.
  last_balance numeric(12,2) NOT NULL,
  remaining_balance numeric(12,2) NOT NULL,

  -- SAT FormaPago of the payment (c_FormaPago; '03' is transferencia/SPEI).
  payment_form text NOT NULL DEFAULT '03',
  payment_date timestamptz NOT NULL DEFAULT now(),
  -- NumOperacion — the SPEI tracking reference when the user captured one.
  operation_number text,

  status text NOT NULL DEFAULT 'pending',
  -- The PAC's own invoice id for the complement, needed to cancel or
  -- re-download it. The UUID is the folio fiscal of the complement itself,
  -- distinct from the folio of the invoice it settles.
  cfdi_id text,
  cfdi_uuid text,
  cfdi_provider text,
  cfdi_environment text,
  cfdi_xml_path text,
  cfdi_pdf_path text,
  stamped_at timestamptz,
  cancelled_at timestamptz,
  -- Why the last attempt failed, in the user's language.
  error text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_complement_installment_positive CHECK (installment >= 1),
  CONSTRAINT chk_complement_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_complement_balances CHECK (
    last_balance > 0
    AND remaining_balance >= 0
    AND amount <= last_balance
  ),
  CONSTRAINT chk_complement_status CHECK (status IN ('pending', 'issued', 'failed', 'cancelled')),
  CONSTRAINT chk_complement_environment CHECK (
    cfdi_environment IS NULL OR cfdi_environment IN ('sandbox', 'live')
  )
);

-- The folio fiscal is unique per stamped document, complements included.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cfdi_complements_uuid
  ON public.cfdi_payment_complements (cfdi_uuid)
  WHERE cfdi_uuid IS NOT NULL;

-- One live complement per installment. Two confirmations racing on the same
-- milestone would otherwise both compute installment N and stamp it twice, and
-- a duplicated complement can only be undone by cancelling it at the SAT.
-- 'failed' is excluded so a failed attempt can be retried on the same
-- installment rather than stranding it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cfdi_complements_installment
  ON public.cfdi_payment_complements (milestone_id, installment)
  WHERE status <> 'failed';

CREATE INDEX IF NOT EXISTS idx_cfdi_complements_milestone
  ON public.cfdi_payment_complements (milestone_id);

CREATE INDEX IF NOT EXISTS idx_cfdi_complements_org_status
  ON public.cfdi_payment_complements (organization_id, status);

ALTER TABLE public.cfdi_payment_complements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cfdi_payment_complements FROM anon;

-- Same tenant scoping as `milestones`, which is what these rows hang off. The
-- routes filter by organization_id as well; RLS is the backstop.
DROP POLICY IF EXISTS "Tenant members access organization payment complements" ON public.cfdi_payment_complements;
CREATE POLICY "Tenant members access organization payment complements"
ON public.cfdi_payment_complements FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
);
