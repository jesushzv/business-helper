-- AI usage ledger (#228).
--
-- The assistant quota was self-reported: tierKey and currentUsage arrived in
-- the request body, so any tenant had an unlimited model allowance by sending
-- currentUsage: 0 — and the defaults meant the gate had never blocked anyone.
-- The tier now comes from organizations.subscription_tier and usage from this
-- ledger, written only through the service role.
--
-- RLS is enabled with NO policies on purpose, and tenant-facing roles are
-- revoked by name: a member who could UPDATE their own row via PostgREST
-- could zero their own counter. The service role (BYPASSRLS) is the only
-- reader and writer.

CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ai_usage_month CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT chk_ai_usage_used CHECK (used >= 0),
  PRIMARY KEY (organization_id, month)
);

ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges auto-grant to anon/authenticated as named
-- roles; with RLS deny-all this is belt and suspenders, but explicit is
-- cheaper to audit than implied.
REVOKE ALL ON TABLE public.ai_usage_monthly FROM PUBLIC, anon, authenticated;

-- Atomic increment: supabase-js cannot express used = used + 1 in an upsert,
-- and read-then-write loses counts under concurrency. Plain LANGUAGE sql, NOT
-- SECURITY DEFINER — it runs with the caller's rights, and only service_role
-- may call it (the #76 posture applied preemptively: revoke from the named
-- roles, not just PUBLIC).
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_organization_id uuid, p_month text)
RETURNS integer
LANGUAGE sql
AS $$
  INSERT INTO public.ai_usage_monthly (organization_id, month, used)
  VALUES (p_organization_id, p_month, 1)
  ON CONFLICT (organization_id, month)
  DO UPDATE SET used = public.ai_usage_monthly.used + 1, updated_at = now()
  RETURNING used;
$$;

REVOKE ALL ON FUNCTION public.increment_ai_usage(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text) TO service_role;
