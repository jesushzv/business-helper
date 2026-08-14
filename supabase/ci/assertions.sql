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

-- ---------------------------------------------------------------------------
-- 6. One organization per owner (#109/#168). A constraint is only proven by
--    making it *reject* something, so this attempts the duplicate the schema
--    now forbids and fails the build if the INSERT succeeds.
--
--    The subtransaction matters: an unhandled unique_violation would abort the
--    outer transaction and take every later assertion with it.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.organizations (id, name, owner_id)
    VALUES (
      '00000000-0000-4000-8000-0000000000a2', 'CI Tenant Segundo',
      '00000000-0000-4000-8000-000000000001'
    );
    RAISE EXCEPTION
      'organizations accepted a second row for one owner_id — uq_organizations_owner_id is missing (#168)';
  EXCEPTION
    WHEN unique_violation THEN
      NULL; -- refused, which is the assertion
  END;
END
$$;

-- …and the index is the *unique* one, not a plain index that happens to exist.
DO $$
DECLARE
  is_unique boolean;
BEGIN
  SELECT indisunique INTO is_unique
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE c.relname = 'uq_organizations_owner_id';

  IF is_unique IS NULL THEN
    RAISE EXCEPTION 'uq_organizations_owner_id does not exist (#168)';
  ELSIF NOT is_unique THEN
    RAISE EXCEPTION 'uq_organizations_owner_id exists but is not UNIQUE (#168)';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 7. contracts.quote_id is ON DELETE RESTRICT (#336, sub-decision 1).
--
--    It was SET NULL, so a conversion completing between the quotes route's
--    pre-check and its DELETE orphaned the contract: the /pay/[token] walk
--    (quotes.public_token -> contract) dies and the #218 resume lookup, keyed
--    on contracts.quote_id, can never find it again.
--
--    Proven by making it reject: the seeded quote has a contract, so deleting
--    it must raise. Reading pg_constraint would only prove the catalog says
--    RESTRICT; this proves Postgres acts on it.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    DELETE FROM public.quotes WHERE id = '00000000-0000-4000-8000-0000000000d1';
    RAISE EXCEPTION
      'deleting a converted quote succeeded — contracts.quote_id is not ON DELETE RESTRICT (#336)';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL; -- refused, which is the assertion
  END;
END
$$;

-- …and the positive control, so the rejection above cannot pass against a
-- constraint that refuses every delete. A quote with no contract still goes.
DO $$
DECLARE
  removed bigint;
BEGIN
  INSERT INTO public.quotes (id, organization_id, client_id, created_by, title,
                             subtotal_amount, total_amount, public_token, status)
  VALUES ('00000000-0000-4000-8000-0000000000d9', '00000000-0000-4000-8000-0000000000a1',
          '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
          'Cotización CI sin contrato', 100, 116, 'ci-public-token-0009', 'draft');

  DELETE FROM public.quotes WHERE id = '00000000-0000-4000-8000-0000000000d9';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 1 THEN
    RAISE EXCEPTION 'a draft quote with no contract could not be deleted (removed=%)', removed;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 8. cfdi_stamp_claims.milestone_id is ON DELETE RESTRICT (#336, sub-decision 2).
--
--    It was CASCADE. In the window between the claim insert and the
--    cfdi_status flip, a concurrent delete removed milestone + claim, the
--    issue route's later updates matched 0 rows with no error, and the PAC
--    stamped — a live SAT document with no milestone and no reconciliation
--    anchor. A held claim must block the deletion atomically.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  removed bigint;
BEGIN
  INSERT INTO public.milestones (id, organization_id, contract_id, label, amount, due_date)
  VALUES ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000a1',
          '00000000-0000-4000-8000-0000000000e1', 'Hito con claim', 100, '2026-09-01');

  -- No claim yet: the delete must work, or the rejection below proves nothing.
  DELETE FROM public.milestones WHERE id = '00000000-0000-4000-8000-0000000000f9';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 1 THEN
    RAISE EXCEPTION 'an unclaimed pending milestone could not be deleted (removed=%)', removed;
  END IF;

  -- Now with a claim held, the same delete must be refused.
  INSERT INTO public.milestones (id, organization_id, contract_id, label, amount, due_date)
  VALUES ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000a1',
          '00000000-0000-4000-8000-0000000000e1', 'Hito con claim', 100, '2026-09-01');
  INSERT INTO public.cfdi_stamp_claims (milestone_id, organization_id)
  VALUES ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000a1');

  BEGIN
    DELETE FROM public.milestones WHERE id = '00000000-0000-4000-8000-0000000000f9';
    RAISE EXCEPTION
      'deleting a milestone with a held stamp claim succeeded — cfdi_stamp_claims.milestone_id still CASCADEs (#336)';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL; -- refused, which is the assertion
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- 9. The restrictive FOR DELETE policies (#336, sub-decision 3), proven by
--    impersonating a real auth.uid() rather than by reading pg_policies.
--
--    The tenant policies are FOR ALL, which covers DELETE, so an authenticated
--    member could take their session JWT straight to PostgREST and delete a
--    converted quote — the OTP legal evidence — bypassing both the
--    `delete_records` capability and the status guard, neither of which exists
--    outside the route handler.
--
--    RLS refuses silently: the DELETE affects 0 rows rather than raising. So
--    each case reads the row count back, and each refusal is paired with the
--    permitted case that proves the policy is not simply refusing everything.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  removed bigint;
BEGIN
  -- Two quotes with no contract, so only the policy can decide the outcome —
  -- the FK RESTRICT from section 7 must not be what refuses either of them.
  INSERT INTO public.quotes (id, organization_id, client_id, created_by, title,
                             subtotal_amount, total_amount, public_token, status)
  VALUES
    ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-0000000000a1',
     '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
     'Cotización convertida', 100, 116, 'ci-public-token-000a', 'converted'),
    ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-0000000000a1',
     '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
     'Cotización borrador', 100, 116, 'ci-public-token-000b', 'draft');

  -- A real session: the seeded owner's uid, read by auth.uid() through the
  -- same claim PostgREST sets.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;

  -- The caller can see both, or the refusal below would be about visibility
  -- rather than about the DELETE policy.
  IF (SELECT count(*) FROM public.quotes
       WHERE id IN ('00000000-0000-4000-8000-0000000000da',
                    '00000000-0000-4000-8000-0000000000db')) <> 2 THEN
    RESET ROLE;
    RAISE EXCEPTION 'the impersonated owner cannot see their own quotes — the seed, not the policy, is wrong';
  END IF;

  DELETE FROM public.quotes WHERE id = '00000000-0000-4000-8000-0000000000da';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'an authenticated member deleted a CONVERTED quote via RLS (#336)';
  END IF;

  DELETE FROM public.quotes WHERE id = '00000000-0000-4000-8000-0000000000db';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'the DELETE policy also blocks a DRAFT quote (removed=%) — it refuses everything', removed;
  END IF;

  RESET ROLE;
END
$$;

DO $$
DECLARE
  removed bigint;
BEGIN
  -- The milestone half: pending/none is deletable, anything past it is not.
  INSERT INTO public.milestones (id, organization_id, contract_id, label, amount, due_date, status, cfdi_status)
  VALUES
    ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000a1',
     '00000000-0000-4000-8000-0000000000e1', 'Hito confirmado', 100, '2026-09-01', 'confirmed', 'none'),
    ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-0000000000a1',
     '00000000-0000-4000-8000-0000000000e1', 'Hito timbrado', 100, '2026-09-01', 'pending', 'issued'),
    ('00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-0000000000a1',
     '00000000-0000-4000-8000-0000000000e1', 'Hito pendiente', 100, '2026-09-01', 'pending', 'none');

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  SET LOCAL ROLE authenticated;

  DELETE FROM public.milestones WHERE id = '00000000-0000-4000-8000-0000000000fa';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'an authenticated member deleted a CONFIRMED milestone via RLS (#336)';
  END IF;

  DELETE FROM public.milestones WHERE id = '00000000-0000-4000-8000-0000000000fb';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 0 THEN
    RESET ROLE;
    RAISE EXCEPTION 'an authenticated member deleted a milestone carrying a CFDI via RLS (#336)';
  END IF;

  DELETE FROM public.milestones WHERE id = '00000000-0000-4000-8000-0000000000fc';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 1 THEN
    RESET ROLE;
    RAISE EXCEPTION 'the milestone DELETE policy also blocks a pending/none row (removed=%)', removed;
  END IF;

  RESET ROLE;
END
$$;

-- …and both policies are RESTRICTIVE and scoped to DELETE. A future edit that
-- recreates either as PERMISSIVE would be a no-op that reads as protection:
-- permissive policies combine with OR, so it would grant, not constrain.
DO $$
DECLARE
  expected record;
  found record;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('quotes', 'Deletable quote statuses only'),
      ('milestones', 'Deletable milestone states only')
    ) AS t(tablename, policyname)
  LOOP
    SELECT p.permissive, p.cmd INTO found
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename = expected.tablename
       AND p.policyname = expected.policyname;

    IF found IS NULL THEN
      RAISE EXCEPTION 'policy "%" on public.% does not exist (#336)', expected.policyname, expected.tablename;
    ELSIF found.permissive <> 'RESTRICTIVE' THEN
      RAISE EXCEPTION 'policy "%" on public.% is PERMISSIVE — it grants rather than constrains (#336)',
        expected.policyname, expected.tablename;
    ELSIF found.cmd <> 'DELETE' THEN
      RAISE EXCEPTION 'policy "%" on public.% applies to % rather than DELETE (#336)',
        expected.policyname, expected.tablename, found.cmd;
    END IF;
  END LOOP;
END
$$;

ROLLBACK;
