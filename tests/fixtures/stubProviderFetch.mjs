/**
 * A `fetch` stub injected into `scripts/verify-otp-delivery.mjs` via
 * `node --import`, so the script's *verdict* can be tested without a network
 * call or a provider account.
 *
 * Deliberately loaded from outside the script rather than plumbed through an
 * env var it reads: a `RESEND_API_BASE`-style seam in the script itself would
 * be one config flip away from letting a real run be pointed at something that
 * always says yes, which is the class of hole #118 exists to close.
 *
 * The stub proves nothing about Resend or Twilio. What it pins is which
 * responses the script calls a pass, and — the #118 property — whether it can
 * be made to sign off on a run whose send stage never happened.
 */

function json(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

globalThis.fetch = async (input) => {
  const url = String(input);

  // Stage 2: the authenticated read that checks the sending domain.
  if (url.startsWith('https://api.resend.com/domains')) {
    return json({ data: [{ name: 'businesshelper.app', status: 'verified' }] });
  }

  // Stage 3: the real send.
  if (url.startsWith('https://api.resend.com/emails')) {
    return json({ id: 'stub_email_id' });
  }

  // Anything else would be an unstubbed call; fail loudly rather than
  // silently letting the script treat a 404 as a pass.
  return json({ name: 'unstubbed_request', url }, false, 599);
};
