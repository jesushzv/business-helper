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
 *   3. Send       — a real message, only when OTP_TEST_EMAIL / OTP_TEST_PHONE is set.
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
  env.OTP_DELIVERY_CHANNEL === 'email' ||
  env.OTP_DELIVERY_CHANNEL === 'sms' ||
  env.OTP_DELIVERY_CHANNEL === 'whatsapp'
    ? env.OTP_DELIVERY_CHANNEL
    : 'console';

if (channel === 'console') {
  record('OTP_DELIVERY_CHANNEL is email, sms or whatsapp', false, `got ${env.OTP_DELIVERY_CHANNEL ?? '(unset)'}`);
  fail(
    'No delivery channel selected.\n\n' +
      '  export OTP_DELIVERY_CHANNEL=email    # sms and whatsapp still work, deprecated\n\n' +
      '  Unset means the console channel, which fails closed in production —\n' +
      '  the signing flow returns 502 and no code is ever issued.'
  );
}

record('OTP_DELIVERY_CHANNEL is email, sms or whatsapp', true, channel);
if (channel === 'sms' || channel === 'whatsapp') {
  console.log(`  · the ${channel} channel is deprecated — plan the move to OTP_DELIVERY_CHANNEL=email`);
}

// Mirrors describeDeliveryConfig(): on whatsapp, Twilio wins when its number is
// set; otherwise Meta is the provider that would run.
let provider;
let missing;

if (channel === 'email') {
  provider = 'resend_email';
  missing = ['RESEND_API_KEY', 'OTP_EMAIL_FROM'].filter((key) => !env[key]);
} else if (channel === 'sms') {
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

const sender =
  channel === 'sms' ? env.TWILIO_SMS_NUMBER || env.TWILIO_PHONE_NUMBER : env.TWILIO_WHATSAPP_NUMBER;

if (provider === 'resend_email') {
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
} else if (provider === 'twilio_sms' || provider === 'twilio_whatsapp') {
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
const testEmail = env.OTP_TEST_EMAIL;
const testRecipient = provider === 'resend_email' ? testEmail : testPhone;

if (!testRecipient) {
  // #118 — the exit code is the machine-readable claim, and it used to be 0
  // here. Stages 1–2 prove the credentials exist and authenticate; neither can
  // see a *delivery* failure. A Resend account still in sandbox, a sending
  // domain whose DNS has not propagated, a Twilio trial restricted to verified
  // numbers: each passes both stages and reaches nobody. Since the skipped
  // stage is the only one the signing flow actually depends on, an incomplete
  // run exits non-zero and names what did not run. Deliberately no opt-out
  // flag — a flag that downgrades this to a pass is how the pass comes back.
  const variable = provider === 'resend_email' ? 'OTP_TEST_EMAIL=you@…' : 'OTP_TEST_PHONE=+52…';
  const target = provider === 'resend_email' ? 'an inbox' : 'a handset';

  console.error(
    `\nINCOMPLETE — configuration and credentials verified for ${provider}, ` +
      'but this is not a sign-off.\n\n' +
      '  Not run, because the send stage has no target:\n' +
      `    – a real message is accepted by ${provider} and arrives at ${target} you control\n\n` +
      `  Re-run with ${variable} set.\n`
  );
  process.exit(1);
}

if (provider === 'resend_email') {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(testEmail)) {
    fail(`OTP_TEST_EMAIL must be an email address — got "${testEmail}".`);
  }
} else if (!/^\+\d{10,15}$/.test(testPhone)) {
  fail(`OTP_TEST_PHONE must be E.164, e.g. +528115559988 — got "${testPhone}".`);
}

console.log(`\nSend  (real message to ${testRecipient})`);

// Deliberately not a valid-looking code: this script issues nothing, and a
// sample that reads like an OTP would train recipients to trust it.
const body =
  'Business Helper: prueba de configuración del canal de verificación. ' +
  'No es un código de firma y no requiere ninguna acción.';

let send;

if (provider === 'resend_email') {
  send = await request('https://api.resend.com/emails', {
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
} else if (provider === 'twilio_sms' || provider === 'twilio_whatsapp') {
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
// The recipient is identified by domain (email) or country code (phone): the
// record is meant for a public doc, and the full address is neither needed to
// interpret the run nor safe to paste there.
const recipientLabel =
  provider === 'resend_email' ? `@${testEmail.split('@')[1]}` : `${testPhone.slice(0, 3)}…`;

console.log(
  `\n✓ ${provider} accepted the send.\n\n` +
    `  Confirm the message actually arrived at ${testRecipient} — acceptance is not delivery\n` +
    `  (on email, check the spam folder too).\n` +
    `  Then complete the end-to-end check: issue a code from a real quote, sign with it,\n` +
    `  and confirm replaying the same code fails.\n\n` +
    '  Record for docs/STATUS.md, once you have confirmed arrival AND the replay check —\n' +
    '  this block records what the script did, which is one step short of that:\n\n' +
    `    channel:     ${channel}\n` +
    `    provider:    ${provider}\n` +
    `    sender:      ${provider === 'resend_email' ? env.OTP_EMAIL_FROM : sender}\n` +
    `    recipient:   ${recipientLabel} (full address withheld)\n` +
    `    accepted_at: ${new Date().toISOString()}\n`
);
