#!/usr/bin/env node
/**
 * Exercises a deployed /api/stripe/webhook against the P0-2 acceptance criteria.
 *
 * The signature verifier is unit-tested, but that only proves the function is
 * correct — not that the deployed route calls it, that STRIPE_WEBHOOK_SECRET is
 * set on the target, or that the idempotency ledger exists. Those are properties
 * of a running deployment, so they need a request to one.
 *
 *   STRIPE_WEBHOOK_SECRET=whsec_… \
 *   WEBHOOK_URL=https://staging.example.com/api/stripe/webhook \
 *   npm run verify:webhook
 *
 * Never point this at production: it sends real subscription events, and a
 * passing run means one was applied. Use a staging deployment and, for the
 * idempotency check, an ORG_ID you are willing to have written to.
 */

const url = process.env.WEBHOOK_URL;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
// Without a real organization the route stops at the UUID check, before the
// ledger — so the idempotency case needs one to be meaningful.
const orgId = process.env.ORG_ID;

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!url) {
  fail(
    'WEBHOOK_URL is not set.\n\n' +
      '  export WEBHOOK_URL="https://staging.example.com/api/stripe/webhook"\n\n' +
      '  Refusing to guess a target — this sends subscription-change events.'
  );
}

if (!secret) {
  fail('STRIPE_WEBHOOK_SECRET is not set. It must match the secret on the target deployment.');
}

// Allowlist, not denylist: the old guard named businesshelper.mx and silently
// stopped matching when the domain moved to businesshelper.app (#43). A safety
// check that has to be updated on every rename fails open; this one fails
// closed — anything that is not local, a Vercel preview, or an explicit
// staging host is refused.
const isSafeTarget =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) ||
  /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app\//.test(url) ||
  /^https:\/\/staging\./.test(url);

if (!isSafeTarget) {
  fail(
    'Refusing to run against a target that is not localhost, a *.vercel.app preview, or a staging.* host.\n' +
      '  This script sends real subscription events; a passing run means one was applied.\n' +
      '  Never point it at production.'
  );
}

const { createHmac } = await import('node:crypto');

function sign(body, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret).update(`${timestampSeconds}.${body}`, 'utf8').digest('hex');
  return `t=${timestampSeconds},v1=${signature}`;
}

function event(id, organizationId) {
  return JSON.stringify({
    id,
    type: 'customer.subscription.updated',
    data: {
      object: {
        metadata: { organization_id: organizationId },
        status: 'active',
        items: { data: [{ price: { id: process.env.STRIPE_PRICE_NEGOCIO || 'price_test' } }] },
      },
    },
  });
}

async function post(body, signatureHeader) {
  const headers = { 'Content-Type': 'application/json' };
  if (signatureHeader) headers['Stripe-Signature'] = signatureHeader;

  const response = await fetch(url, { method: 'POST', headers, body });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

console.log(`\nVerifying ${url}\n`);

// 1. The original exploit: no signature at all.
{
  const { status } = await post(event('evt_unsigned', orgId || 'org_demo'), null);
  record('unsigned request is rejected', status === 400, `HTTP ${status}`);
}

// 2. A signature made with the wrong secret.
{
  const body = event('evt_wrongsecret', orgId || 'org_demo');
  const forged = createHmac('sha256', 'whsec_not_the_real_secret')
    .update(`${Math.floor(Date.now() / 1000)}.${body}`, 'utf8')
    .digest('hex');
  const { status } = await post(body, `t=${Math.floor(Date.now() / 1000)},v1=${forged}`);
  record('signature from a different secret is rejected', status === 400, `HTTP ${status}`);
}

// 3. Body altered after signing.
{
  const body = event('evt_tampered', orgId || 'org_demo');
  const header = sign(body);
  const { status } = await post(body.replace('active', 'canceled'), header);
  record('tampered payload is rejected', status === 400, `HTTP ${status}`);
}

// 4. Correctly signed but stale — a captured request replayed later.
{
  const body = event('evt_stale', orgId || 'org_demo');
  const { status } = await post(body, sign(body, Math.floor(Date.now() / 1000) - 3600));
  record('stale timestamp is rejected', status === 400, `HTTP ${status}`);
}

// 5. A valid event is accepted, and 6. redelivering it is a no-op.
if (orgId) {
  const eventId = `evt_verify_${Date.now()}`;
  const body = event(eventId, orgId);
  const header = sign(body);

  const first = await post(body, header);
  record('correctly signed event is accepted', first.status === 200, `HTTP ${first.status}`);

  const second = await post(body, header);
  record(
    'redelivery of the same event id is deduplicated',
    second.status === 200 && second.json?.duplicate === true,
    second.json?.duplicate === true ? 'duplicate: true' : `HTTP ${second.status}, ${JSON.stringify(second.json)}`
  );
} else {
  console.log('  – skipped: valid-event and idempotency checks need ORG_ID (a real organization UUID)');
}

const failed = results.filter((r) => !r.passed);

console.log('');
if (failed.length > 0) {
  fail(`${failed.length} of ${results.length} checks failed.`);
}
console.log(`✓ All ${results.length} checks passed.\n`);
