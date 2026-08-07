-- ============================================================================
-- Business Helper — Team invitations
-- Migration: 20260806160000_team_invitations.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
--
-- POST /api/organization/members returned a fabricated member object without
-- writing anything: the owner saw "Invitación enviada" and the invited person
-- was never told, never recorded, and could never join. There was no table to
-- write to — organization_members requires an auth.users id, which an invited
-- person does not have until they sign up.
--
-- This adds the missing intermediate state: a pending invitation, addressed by
-- email, redeemable exactly once by whoever holds the link.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  -- Only the SHA-256 digest of the invitation token is stored, for the same
  -- reason OTP codes are hashed: a leaked backup or a SELECT on this table must
  -- not hand out working invitation links.
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- 'owner' is deliberately absent: ownership transfers are not an invite.
  CONSTRAINT chk_invitation_role CHECK (role IN ('manager', 'member', 'accountant')),
  CONSTRAINT chk_invitation_status CHECK (status IN ('pending', 'accepted', 'revoked'))
);

-- One live invitation per address per organization; re-inviting replaces the
-- pending row rather than accumulating redeemable links.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_invitation_pending_email
  ON public.organization_invitations (organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_invitations_org
  ON public.organization_invitations (organization_id, status);

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Members of the organization manage its invitations. Redemption happens
-- through the service-role client instead: the invited user is by definition
-- not yet a member, so no authenticated policy can (or should) match their row.
DROP POLICY IF EXISTS "Tenant members manage organization invitations"
  ON public.organization_invitations;
CREATE POLICY "Tenant members manage organization invitations"
ON public.organization_invitations FOR ALL TO authenticated
USING (
  organization_id IN (SELECT public.user_organization_ids())
  OR organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
);

-- The anon role never touches invitations; the token lookup is server-side.
REVOKE ALL ON public.organization_invitations FROM anon;
