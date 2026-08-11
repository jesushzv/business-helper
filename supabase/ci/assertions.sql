-- Assertions over the schema the migrations just built (#35). Runs after the
-- double-apply in scripts/ci-verify-migrations.sh; every failure RAISEs, so a
-- migration that re-opens anon access to a tenant table fails CI loudly.
--
-- Seeds one tenant with real-looking rows first: "anon sees zero rows" proves
-- nothing against an empty database.

-- ---------------------------------------------------------------------------
-- Seed (as the superuser; rolled back at the end — the cluster is throwaway,
-- but a clean exit keeps the script re-runnable while debugging locally).
-- ---------------------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-4000-8000-000000000001', 'owner@ci.example')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, owner_id, subscription_tier, bank_clabe, bank_name)
VALUES (
  '00000000-0000-4000-8000-0000000000a1', 'CI Tenant', '00000000-0000-4000-8000-000000000001',
  'free', '012180001234567899', 'Banco CI'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, organization_id, name, phone)
VALUES ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Cliente CI', '8112345678')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.quotes (id, organization_id, client_id, created_by, title, subtotal_amount, total_amount, public_token)
VALUES (
  '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
  'Cotización CI', 1000, 1160, 'ci-public-token-0001'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.contracts (id, organization_id, quote_id, client_id, title, scope_description, total_amount)
VALUES (
  '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1',
  'Contrato CI', 'Alcance CI', 1160
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.milestones (id, organization_id, contract_id, label, amount, due_date)
VALUES (
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000e1', 'Anticipo CI', 580, '2026-09-01'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.otp_send_log (phone_e164, quote_id, channel)
VALUES ('+528112345678', '00000000-0000-4000-8000-0000000000d1', 'sms');

-- ---------------------------------------------------------------------------
-- 1. Tenant isolation: anon must be denied outright (the P0-3 posture) or see
--    zero of the seeded rows. Either is acceptable; visible rows are not.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  visible bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'organization_members', 'clients', 'quotes', 'contracts',
    'milestones', 'otp_send_log', 'stripe_webhook_events', 'pac_connections',
    'cfdi_payment_complements', 'audit_logs', 'products'
  ] LOOP
    BEGIN
      EXECUTE 'SET LOCAL ROLE anon';
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO visible;
      EXECUTE 'RESET ROLE';
      IF visible > 0 THEN
        RAISE EXCEPTION 'anon can read % row(s) of public.%', visible, t;
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        EXECUTE 'RESET ROLE'; -- denied outright: the strongest acceptable answer
    END;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. service_role keeps working: an over-broad future REVOKE must fail here,
--    in CI, not by taking down signing in production.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  visible bigint;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO visible FROM public.quotes;
  IF visible < 1 THEN
    RAISE EXCEPTION 'service_role cannot see the seeded quote';
  END IF;
  UPDATE public.milestones SET status = 'requested'
    WHERE id = '00000000-0000-4000-8000-0000000000f1';
  RESET ROLE;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. The OTP ledger's recipient CHECK: rejects a bare national number and an
--    uppercased email, accepts E.164 and a lowercased email (the E.164 half is
--    the constraint #17 verified by hand; the email half is the launch
--    channel's key).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.otp_send_log (phone_e164) VALUES ('8115559988');
    RAISE EXCEPTION 'chk_otp_send_log_recipient accepted a non-E.164 number';
  EXCEPTION
    WHEN check_violation THEN NULL; -- correct
  END;
  BEGIN
    INSERT INTO public.otp_send_log (phone_e164) VALUES ('Cliente@CI.example');
    RAISE EXCEPTION 'chk_otp_send_log_recipient accepted a non-lowercased email — two casings, two budgets';
  EXCEPTION
    WHEN check_violation THEN NULL; -- correct
  END;
  -- The accepting side, so the rejections above cannot pass vacuously against
  -- a constraint that refuses everything.
  INSERT INTO public.otp_send_log (phone_e164, quote_id, channel)
  VALUES ('cliente@ci.example', '00000000-0000-4000-8000-0000000000d1', 'email');
END
$$;

-- ---------------------------------------------------------------------------
-- 4. SECURITY DEFINER grant posture, on the real database this time (#76):
--    no such function grants EXECUTE to anon/authenticated, except the
--    documented exemption RLS itself depends on.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offender record;
BEGIN
  FOR offender IN
    SELECT p.proname, pg_get_userbyid(x.grantee) AS role
      FROM pg_proc p, aclexplode(p.proacl) x
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND x.privilege_type = 'EXECUTE'
       AND pg_get_userbyid(x.grantee) IN ('anon', 'authenticated')
       AND p.proname <> 'user_organization_ids' -- RLS policies call it as the querying role
  LOOP
    RAISE EXCEPTION 'SECURITY DEFINER public.% grants EXECUTE to % — see #76', offender.proname, offender.role;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS is enabled on every public table. A CREATE TABLE that forgets it
--    ships a table PostgREST serves unfiltered.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offender record;
BEGIN
  FOR offender IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    RAISE EXCEPTION 'public.% has row-level security DISABLED', offender.relname;
  END LOOP;
END
$$;

ROLLBACK;
