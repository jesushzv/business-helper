-- A provider failure used to spend one of a quote's 10 lifetime OTP sends
-- forever — ten outages made the quote permanently unsignable (#60). The
-- decided shape: a failed delivery keeps its hourly slot (a broken provider
-- must stay throttled) but releases the lifetime one (that budget counts codes
-- that actually reached someone). Deleting the row would refund both, so the
-- failure is flagged instead and the lifetime count filters on it.
ALTER TABLE public.otp_send_log
  ADD COLUMN IF NOT EXISTS delivery_failed boolean NOT NULL DEFAULT false;
