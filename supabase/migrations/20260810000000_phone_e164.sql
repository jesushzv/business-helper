-- #94 — non-Mexican client phone numbers are now in scope.
--
-- `clients.phone` and `organizations.phone` stored 10 bare digits and every
-- consumer re-derived `+52` for itself. That form cannot represent a foreign
-- number at all: a US client's `2125551234` is exactly ten digits, so it
-- passed validation and was dialed as `+522125551234` — a real Mexican number
-- belonging to somebody else. The send was billable, it could reach a
-- stranger, and the client never received their signature code.
--
-- The stored form becomes E.164 (`+528112345678`), which carries the country
-- explicitly, matching `otp_send_log.phone_e164` — that column has been E.164
-- with a CHECK since #22's rate limiting, so the two now agree.
--
-- Idempotent by convention: the backfill only touches rows that are not
-- already E.164, so re-running it is a no-op.

-- ---------------------------------------------------------------------------
-- Backfill: 10 bare digits -> +52 + those digits.
-- ---------------------------------------------------------------------------
-- Deliberately narrow. Only shapes whose country is unambiguous are converted:
-- a bare 10-digit value predates #94, and before #94 the product accepted
-- nothing but Mexican numbers, so +52 is the correct and only reading. Rows in
-- any other shape are left exactly as they are rather than guessed at — the
-- application still parses the legacy forms (`formatE164Phone`,
-- `generateWhatsAppLink`), so an unconverted row keeps working, whereas a
-- wrong guess would silently redirect a signature code.
UPDATE public.clients
SET phone = '+52' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND regexp_replace(phone, '\D', '', 'g') ~ '^[0-9]{10}$';

UPDATE public.organizations
SET phone = '+52' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND regexp_replace(phone, '\D', '', 'g') ~ '^[0-9]{10}$';

-- The retired Mexican mobile form (`521` + 10 digits), which the app has always
-- normalized away. Same reasoning: the country is unambiguous.
UPDATE public.clients
SET phone = '+52' || substring(regexp_replace(phone, '\D', '', 'g') from 4)
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND regexp_replace(phone, '\D', '', 'g') ~ '^521[0-9]{10}$';

UPDATE public.organizations
SET phone = '+52' || substring(regexp_replace(phone, '\D', '', 'g') from 4)
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND regexp_replace(phone, '\D', '', 'g') ~ '^521[0-9]{10}$';

-- `52` + 10 digits, already carrying the country code but without the plus.
UPDATE public.clients
SET phone = '+' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND regexp_replace(phone, '\D', '', 'g') ~ '^52[0-9]{10}$';

UPDATE public.organizations
SET phone = '+' || regexp_replace(phone, '\D', '', 'g')
WHERE phone IS NOT NULL
  AND phone NOT LIKE '+%'
  AND regexp_replace(phone, '\D', '', 'g') ~ '^52[0-9]{10}$';

-- ---------------------------------------------------------------------------
-- No CHECK constraint, on purpose.
-- ---------------------------------------------------------------------------
-- The obvious next step would be `CHECK (phone ~ '^\+[0-9]{10,15}$')` to match
-- otp_send_log. It is deliberately omitted:
--
--   * Vercel auto-deploys `main` and migrations are applied by hand, so the
--     old code can still be live when this runs (hard rule 6). A constraint
--     would turn every save from the previous deploy into a 500 during that
--     window, on the client form, in front of a tenant.
--   * Any row this backfill could not classify would fail the constraint and
--     block the migration itself, converting an unreachable phone number into
--     an outage.
--
-- Validation is enforced on the write path by `normalizeClientPhone`, which
-- parses against the full numbering-plan metadata — strictly more than a regex
-- can express. A follow-up issue should add the constraint once the deploy has
-- settled and a census confirms every row conforms; the census query is in the
-- PR description.
