#!/usr/bin/env node
/**
 * Verifies that the OTP delivery channel is really configured, before a signer
 * is the one who finds out that it isn't.
 *
 * `lib/otpDelivery.ts` is unit-tested, but the tests prove the code sends
 * correctly given credentials — not that the credentials on a deployment exist,
 * are valid, or belong to an account that can reach an inbox. Those are
 * properties of an environment, so they need a call to the provider.
 *
 * Three stages, each gated on the previous one passing:
 *
 *   1. Config    — which variables the email channel needs, and which are absent.
 *   2. Credential — an authenticated read against Resend. Sends nothing.
 *   3. Send       — a real email, only when OTP_TEST_EMAIL is set.
 *
 *   OTP_DELIVERY_CHANNEL=email \
 *   RESEND_API_KEY=re_… OTP_EMAIL_FROM='Business Helper <firmas@businesshelper.app>' \
 *   OTP_TEST_EMAIL=you@example.com \
 *   npm run verify:otp
 *
 * Stage 3 is not optional in the sense that matters: a run that skips it exits
 * NON-ZERO and prints INCOMPLETE (#118). Stages 1-2 authenticate; only stage 3
 * shows the message leaving. There is deliberately no flag to downgrade an
 * incomplete run to a pass.
 *
 * Stage 3 sends a fixed sample string rather than a real OTP — this script
 * never touches a quote, so nothing it sends can sign anything.
 *
 * The requirement table below mirrors describeDeliveryConfig() in
 * lib/otpDelivery.ts. Keep the two in step; tests/unit/otpDelivery.test.ts
 * covers the library side. The sms/whatsapp channels (Twilio / Meta) were
 * removed; a deployment still configured for one fails stage 1 with the
 * migration named.
 */

const env = process.env;

let failed = 0;

function record(name, passed, detail) {
  if (!passed) failed += 1;
  const mark = passed ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/** Fetch with a bound so a hung provider does not hang the check. */
async function request(url, init = {}) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, json };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'network error';
    return { ok: false, status: 0, json: {}, transport: reason };
  }
}

// ---------------------------------------------------------------------------
// Stage 1 — configuration
// ---------------------------------------------------------------------------

console.log('\nOTP delivery verification\n');
console.log('Config');

if (env.OTP_DELIVERY_CHANNEL === 'sms' || env.OTP_DELIVERY_CHANNEL === 'whatsapp') {
  record('OTP_DELIVERY_CHANNEL is email', false, `got ${env.OTP_DELIVERY_CHANNEL}`);
  fail(
    `The ${env.OTP_DELIVERY_CHANNEL} channel was removed (Twilio / Meta providers retired).\n\n` +
      '  export OTP_DELIVERY_CHANNEL=email\n\n' +
      '  Until then the deployment fails closed: the signing flow returns 502\n' +
      '  and no code is ever issued.'
  );
}

if (env.OTP_DELIVERY_CHANNEL !== 'email') {
  record('OTP_DELIVERY_CHANNEL is email', false, `got ${env.OTP_DELIVERY_CHANNEL ?? '(unset)'}`);
  fail(
    'No delivery channel selected.\n\n' +
      '  export OTP_DELIVERY_CHANNEL=email\n\n' +
      '  Unset means the console channel, which fails closed in production —\n' +
      '  the signing flow returns 502 and no code is ever issued.'
  );
}

record('OTP_DELIVERY_CHANNEL is email', true, 'email');

// Mirrors describeDeliveryConfig(): email resolves to Resend.
const provider = 'resend_email';
const missing = ['RESEND_API_KEY', 'OTP_EMAIL_FROM'].filter((key) => !env[key]);

record('provider resolved', true, provider);
record(
  'required variables present',
  missing.length === 0,
  missing.length ? `missing ${missing.join(', ')}` : 'all set'
);

if (missing.length) {
  fail(
    `${provider} is missing ${missing.join(', ')}.\n\n` +
      '  Set them in the deployment environment, redeploy, and run this again.\n' +
      '  Until then the signing flow answers 502 for every request.'
  );
}

// ---------------------------------------------------------------------------
// Stage 2 — credentials, without sending
// ---------------------------------------------------------------------------

console.log('\nCredentials');

// An authenticated read: the domains list. Sends nothing, but proves the key
// is real and shows whether the from-address's domain can actually send —
// Resend refuses sends from unverified domains, which otherwise surfaces
// only as a 403 on a signer's first request.
const domains = await request('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
});

record(
  'Resend credentials accepted',
  domains.ok,
  domains.transport ?? (domains.ok ? 'key valid' : `HTTP ${domains.status}${domains.json?.name ? ` / ${domains.json.name}` : ''}`)
);

if (domains.ok) {
  const fromAddress = String(env.OTP_EMAIL_FROM);
  const fromDomain = (fromAddress.match(/@([^\s>]+)>?$/) || [])[1]?.toLowerCase();
  const list = Array.isArray(domains.json?.data) ? domains.json.data : [];
  const entry = list.find((d) => String(d?.name).toLowerCase() === fromDomain);

  if (!fromDomain) {
    record('OTP_EMAIL_FROM parses to an address', false, `got "${fromAddress}"`);
  } else if (!entry) {
    // Not fatal by itself — a Resend sandbox address (onboarding@resend.dev)
    // is not in the domains list but does send. Report without failing;
    // stage 3 settles it.
    console.log(`  · domain ${fromDomain} not among the account's domains — stage 3 settles whether it can send`);
  } else {
    record(
      'sending domain is verified',
      entry.status === 'verified',
      `${fromDomain} — status ${entry.status}`
    );
  }
}

if (failed) {
  fail(`${failed} check${failed === 1 ? '' : 's'} failed. Fix the credentials before enabling the channel.`);
}

// ---------------------------------------------------------------------------
// Stage 3 — a real message, opt-in
// ---------------------------------------------------------------------------

const testEmail = env.OTP_TEST_EMAIL;

if (!testEmail) {
  // #118 — the exit code is the machine-readable claim, and it used to be 0
  // here. Stages 1–2 prove the credentials exist and authenticate; neither can
  // see a *delivery* failure. A Resend account still in sandbox or a sending
  // domain whose DNS has not propagated passes both stages and reaches nobody.
  // Since the skipped stage is the only one the signing flow actually depends
  // on, an incomplete run exits non-zero and names what did not run.
  // Deliberately no opt-out flag — a flag that downgrades this to a pass is
  // how the pass comes back.
  console.error(
    `\nINCOMPLETE — configuration and credentials verified for ${provider}, ` +
      'but this is not a sign-off.\n\n' +
      '  Not run, because the send stage has no target:\n' +
      `    – a real message is accepted by ${provider} and arrives at an inbox you control\n\n` +
      '  Re-run with OTP_TEST_EMAIL=you@… set.\n'
  );
  process.exit(1);
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(testEmail)) {
  fail(`OTP_TEST_EMAIL must be an email address — got "${testEmail}".`);
}

console.log(`\nSend  (real message to ${testEmail})`);

// Deliberately not a valid-looking code: this script issues nothing, and a
// sample that reads like an OTP would train recipients to trust it.
const body =
  'Business Helper: prueba de configuración del canal de verificación. ' +
  'No es un código de firma y no requiere ninguna acción.';

const send = await request('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: env.OTP_EMAIL_FROM,
    to: [testEmail],
    subject: 'Prueba de configuración — Business Helper',
    text: body,
  }),
});
record(
  'provider accepted the message',
  send.ok,
  send.transport ?? (send.ok ? `id ${send.json?.id ?? 'sent'}` : `HTTP ${send.status}${send.json?.name ? ` / ${send.json.name}` : ''}`)
);

if (failed) {
  fail(`${failed} check${failed === 1 ? '' : 's'} failed.`);
}

// Acceptance by the provider is not arrival: filters drop messages. The
// recipient is identified by domain only: the record is meant for a public
// doc, and the full address is neither needed to interpret the run nor safe
// to paste there.
const recipientLabel = `@${testEmail.split('@')[1]}`;

console.log(
  `\n✓ ${provider} accepted the send.\n\n` +
    `  Confirm the message actually arrived at ${testEmail} — acceptance is not delivery\n` +
    `  (check the spam folder too).\n` +
    `  Then complete the end-to-end check: issue a code from a real quote, sign with it,\n` +
    `  and confirm replaying the same code fails.\n\n` +
    '  Record for docs/STATUS.md, once you have confirmed arrival AND the replay check —\n' +
    '  this block records what the script did, which is one step short of that:\n\n' +
    `    channel:     email\n` +
    `    provider:    ${provider}\n` +
    `    sender:      ${env.OTP_EMAIL_FROM}\n` +
    `    recipient:   ${recipientLabel} (full address withheld)\n` +
    `    accepted_at: ${new Date().toISOString()}\n`
);
