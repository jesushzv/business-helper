#!/usr/bin/env node
/**
 * Verifies that an OTP delivery channel is really configured, before a signer
 * is the one who finds out that it isn't.
 *
 * `lib/otpDelivery.ts` is unit-tested, but the tests prove the code sends
 * correctly given credentials — not that the credentials on a deployment exist,
 * are valid, or belong to an account that can message a Mexican handset. Those
 * are properties of an environment, so they need a call to the provider.
 *
 * Three stages, each gated on the previous one passing:
 *
 *   1. Config    — which variables the selected channel needs, and which are absent.
 *   2. Credential — an authenticated read against the provider. Sends nothing.
 *   3. Send       — a real message, only when OTP_TEST_PHONE is set.
 *
 *   OTP_DELIVERY_CHANNEL=sms \
 *   TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… TWILIO_SMS_NUMBER=+1… \
 *   OTP_TEST_PHONE=+528115559988 \
 *   npm run verify:otp
 *
 * Stage 3 sends a billable message to a handset you control. It is opt-in for
 * that reason, and it sends a fixed sample string rather than a real OTP — this
 * script never touches a quote, so nothing it sends can sign anything.
 *
 * The requirement table below mirrors describeDeliveryConfig() in
 * lib/otpDelivery.ts. Keep the two in step; tests/unit/otpDelivery.test.ts
 * covers the library side.
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

function basicAuth(sid, token) {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Stage 1 — configuration
// ---------------------------------------------------------------------------

console.log('\nOTP delivery verification\n');
console.log('Config');

const channel =
  env.OTP_DELIVERY_CHANNEL === 'sms' || env.OTP_DELIVERY_CHANNEL === 'whatsapp'
    ? env.OTP_DELIVERY_CHANNEL
    : 'console';

if (channel === 'console') {
  record('OTP_DELIVERY_CHANNEL is sms or whatsapp', false, `got ${env.OTP_DELIVERY_CHANNEL ?? '(unset)'}`);
  fail(
    'No delivery channel selected.\n\n' +
      '  export OTP_DELIVERY_CHANNEL=sms      # or whatsapp\n\n' +
      '  Unset means the console channel, which fails closed in production —\n' +
      '  the signing flow returns 502 and no code is ever issued.'
  );
}

record('OTP_DELIVERY_CHANNEL is sms or whatsapp', true, channel);

// Mirrors describeDeliveryConfig(): on whatsapp, Twilio wins when its number is
// set; otherwise Meta is the provider that would run.
let provider;
let missing;

if (channel === 'sms') {
  provider = 'twilio_sms';
  missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'].filter((key) => !env[key]);
  if (!env.TWILIO_SMS_NUMBER && !env.TWILIO_PHONE_NUMBER) missing.push('TWILIO_SMS_NUMBER');
} else if (env.TWILIO_WHATSAPP_NUMBER) {
  provider = 'twilio_whatsapp';
  missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'].filter((key) => !env[key]);
} else {
  provider = 'meta_whatsapp';
  missing = ['META_WHATSAPP_TOKEN', 'META_PHONE_NUMBER_ID'].filter((key) => !env[key]);
}

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

const sender = channel === 'sms' ? env.TWILIO_SMS_NUMBER || env.TWILIO_PHONE_NUMBER : env.TWILIO_WHATSAPP_NUMBER;

if (provider === 'twilio_sms' || provider === 'twilio_whatsapp') {
  const sid = env.TWILIO_ACCOUNT_SID;
  const account = await request(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
    headers: { Authorization: basicAuth(sid, env.TWILIO_AUTH_TOKEN) },
  });

  record(
    'Twilio credentials accepted',
    account.ok,
    account.transport ?? (account.ok ? `account ${account.json.status ?? 'active'}` : `HTTP ${account.status}`)
  );

  if (account.ok && account.json.status && account.json.status !== 'active') {
    record('Twilio account is active', false, `status ${account.json.status} — sends will be rejected`);
  }

  // A from-number the account does not own is the failure that otherwise
  // surfaces only as Twilio error 21606 on a signer's first request.
  const numbers = await request(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(sender)}`,
    { headers: { Authorization: basicAuth(sid, env.TWILIO_AUTH_TOKEN) } }
  );

  if (numbers.ok) {
    const owned = Array.isArray(numbers.json.incoming_phone_numbers) && numbers.json.incoming_phone_numbers.length > 0;
    // WhatsApp senders are not IncomingPhoneNumbers, so absence there proves
    // nothing on that channel — report it without failing the run.
    if (provider === 'twilio_sms') {
      record('sender number belongs to the account', owned, owned ? sender : `${sender} not found on this account`);
    } else {
      console.log(`  · WhatsApp sender ${sender} — ownership not checkable via this API, stage 3 confirms it`);
    }
  }
} else {
  const version = env.META_GRAPH_API_VERSION || 'v21.0';
  const number = await request(
    `https://graph.facebook.com/${version}/${encodeURIComponent(env.META_PHONE_NUMBER_ID)}?fields=display_phone_number,quality_rating`,
    { headers: { Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}` } }
  );

  record(
    'Meta credentials accepted',
    number.ok,
    number.transport ??
      (number.ok
        ? `sender ${number.json.display_phone_number ?? env.META_PHONE_NUMBER_ID}`
        : `HTTP ${number.status}${number.json?.error?.code ? ` / ${number.json.error.code}` : ''}`)
  );

  if (number.ok && number.json.quality_rating && number.json.quality_rating !== 'GREEN') {
    record('sender quality rating', false, `${number.json.quality_rating} — Meta may throttle sends`);
  }
}

if (failed) {
  fail(`${failed} check${failed === 1 ? '' : 's'} failed. Fix the credentials before enabling the channel.`);
}

// ---------------------------------------------------------------------------
// Stage 3 — a real message, opt-in
// ---------------------------------------------------------------------------

const testPhone = env.OTP_TEST_PHONE;

if (!testPhone) {
  console.log(
    '\nSend stage skipped. Set OTP_TEST_PHONE=+52… to send a real message to a handset you control.'
  );
  console.log(`\n✓ Configuration and credentials verified for ${provider}.\n`);
  process.exit(0);
}

if (!/^\+\d{10,15}$/.test(testPhone)) {
  fail(`OTP_TEST_PHONE must be E.164, e.g. +528115559988 — got "${testPhone}".`);
}

console.log(`\nSend  (real message to ${testPhone})`);

// Deliberately not a valid-looking code: this script issues nothing, and a
// sample that reads like an OTP would train recipients to trust it.
const body =
  'Business Helper: prueba de configuración del canal de verificación. ' +
  'No es un código de firma y no requiere ninguna acción.';

let send;

if (provider === 'twilio_sms' || provider === 'twilio_whatsapp') {
  const prefix = provider === 'twilio_whatsapp' ? 'whatsapp:' : '';
  send = await request(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuth(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: `${prefix}${sender}`, To: `${prefix}${testPhone}`, Body: body }).toString(),
    }
  );
  record(
    'provider accepted the message',
    send.ok,
    send.transport ?? (send.ok ? `sid ${send.json.sid}` : `HTTP ${send.status}${send.json?.code ? ` / ${send.json.code}` : ''}`)
  );
} else {
  const version = env.META_GRAPH_API_VERSION || 'v21.0';
  send = await request(
    `https://graph.facebook.com/${version}/${encodeURIComponent(env.META_PHONE_NUMBER_ID)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: testPhone,
        type: 'text',
        text: { preview_url: false, body },
      }),
    }
  );
  record(
    'provider accepted the message',
    send.ok,
    send.transport ??
      (send.ok
        ? `id ${send.json?.messages?.[0]?.id ?? 'sent'}`
        : `HTTP ${send.status}${send.json?.error?.code ? ` / ${send.json.error.code}` : ''}`)
  );
}

if (failed) {
  // 63016 (Twilio) and 131047 (Meta) both mean the same thing: a free-form
  // message to someone outside the 24-hour customer service window. That is
  // the normal state for a signer who was just sent a quote link, and it needs
  // an approved authentication template rather than a configuration change.
  const code = send.json?.code ?? send.json?.error?.code;
  if (code === 63016 || code === 131047) {
    fail(
      `The provider refused a free-form message to ${testPhone} (${code}).\n\n` +
        '  WhatsApp only allows free-form sends inside the 24-hour window that opens\n' +
        '  when the recipient messages the business. An OTP to anyone else has to go\n' +
        '  out as an approved template in the authentication category, which\n' +
        '  lib/otpDelivery.ts does not send yet.\n\n' +
        '  Either message the business from this handset and re-run within 24 hours\n' +
        '  to confirm the credentials, or use OTP_DELIVERY_CHANNEL=sms.'
    );
  }

  fail(`${failed} check${failed === 1 ? '' : 's'} failed.`);
}

// Acceptance by the provider is not arrival: carriers drop messages, and on
// WhatsApp a template-less send outside a 24h window is accepted then dropped.
console.log(
  `\n✓ ${provider} accepted the send.\n\n` +
    `  Confirm the message actually arrived on ${testPhone} — acceptance is not delivery.\n` +
    `  Then complete the end-to-end check: issue a code from a real quote, sign with it,\n` +
    `  and confirm replaying the same code fails.\n`
);
