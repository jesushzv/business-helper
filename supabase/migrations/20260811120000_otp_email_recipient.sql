-- ============================================================================
-- Business Helper — email OTP recipients in the send ledger
-- Migration: 20260811120000_otp_email_recipient.sql
-- Engine: PostgreSQL 16 (Supabase Cloud)
--
-- Email becomes the OTP launch channel (founder decision, 2026-08-11); the
-- sms and whatsapp channels are deprecated but stay functional. The rate-limit
-- ledger keys every budget on the recipient, and its CHECK pinned that key to
-- E.164 phones — an email-keyed insert would fail the constraint and the
-- route would fail closed, refusing every send on the new channel.
--
-- The column keeps its historical name `phone_e164` on purpose: Vercel
-- auto-deploys `main` while migrations are applied by hand (hard rule 6), so
-- the previous deploy's code — which inserts into `phone_e164` — can still be
-- live when this runs. Renaming the column would turn every OTP issue in that
-- window into a 500 in front of a signer. Widening the CHECK is safe in both
-- directions: old code keeps writing phones (still accepted), new code writes
-- emails (now accepted).
--
-- Idempotent by convention: DROP … IF EXISTS before each ADD, so a re-run
-- converges on the same constraint.
-- ============================================================================

ALTER TABLE public.otp_send_log
  DROP CONSTRAINT IF EXISTS chk_otp_send_log_phone_e164;

ALTER TABLE public.otp_send_log
  DROP CONSTRAINT IF EXISTS chk_otp_send_log_recipient;

-- E.164 phone, or a lowercased email in the same forgiving shape the
-- application validates with (`looksLikeEmail` in lib/clientFieldHints.ts —
-- "something@something.something"). The app lowercases before insert; the
-- constraint enforces it so two casings of one inbox cannot become two
-- budgets by bypassing the app.
ALTER TABLE public.otp_send_log
  ADD CONSTRAINT chk_otp_send_log_recipient CHECK (
    phone_e164 ~ '^\+[0-9]{10,15}$'
    OR (
      phone_e164 ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
      AND phone_e164 = lower(phone_e164)
    )
  );

COMMENT ON COLUMN public.otp_send_log.phone_e164 IS
  'Normalized OTP recipient and rate-limit key: E.164 phone (deprecated sms/whatsapp channels) or lowercased email (email channel). Name predates the email channel; kept to survive the deploy-before-migrate window.';
