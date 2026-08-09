#!/usr/bin/env node
/**
 * Exercises a deployed /api/stripe/webhook against issue #63's acceptance criteria.
 *
 * The signature verifier is unit-tested, but that only proves the function is
 * correct — not that the deployed route calls it, that STRIPE_WEBHOOK_SECRET is
 * set on the target and matches, or that the idempotency ledger exists. Those
 * are properties of a running deployment, so they need requests to one.
 *
 *   STRIPE_WEBHOOK_SECRET=whsec_… \
 *   WEBHOOK_URL=https://staging.example.com/api/stripe/webhook \
 *   ORG_ID=<a real organization uuid in that deployment's database> \
 *   npm run verify:webhook
 *
 * Never point this at production: it sends real subscription events, and a
 * passing run means one was applied. Use a staging deployment and an ORG_ID you
 * are willing to have written to.
 *
 * ⚠ The allowlist below guards the URL, not the database behind it. A Vercel
 * preview is a preview of the *code*; its environment variables come from the
 * same project, and Vercel applies a variable to Preview as well as Production
 * unless it was explicitly scoped otherwise. So a `*.vercel.app` target can be
 * holding the production SUPABASE_SERVICE_ROLE_KEY, and the two ORG_ID checks
 * would write subscription_tier and subscription_status to a real tenant's row.
 * Confirm which project the target's Supabase variables point at before setting
 * ORG_ID. The signature checks write nothing and are safe either way.
 *
 * ── Why a rejection-only run is not a sign-off ────────────────────────────────
 *
 * This script used to run four rejection checks, skip the accept-and-process
 * and idempotency checks whenever ORG_ID was unset, print "✓ All 4 checks
 * passed" and exit 0. Two holes in that:
 *
 *   1. An endpoint that rejects *everything* — no STRIPE_WEBHOOK_SECRET set at
 *      all, so every request 400s — passed all four rejection checks. The
 *      script could not tell "verifies signatures correctly" from "is not
 *      configured".
 *   2. The two criteria that actually protect money (a real event is applied;
 *      a redelivery is not applied twice) were the two it silently skipped,
 *      while the summary line read like a full pass.
 *
 * So: a positive control runs first and is mandatory, and an incomplete run
 * exits non-zero and never prints a pass. There is deliberately no flag to
 * opt out of that — an opt-out is how "All checks passed" comes back.
 */

const url = process.env.WEBHOOK_URL;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
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

function subscriptionEvent(id, organizationId) {
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

/**
 * An event type the route acknowledges and ignores.
 *
 * This is what makes a positive control possible without touching any tenant's
 * data: the route returns 200 `{ ignored }` as soon as the signature verifies,
 * before it looks at the organization, the service role, or the ledger. So it
 * proves the secret matches and that valid signatures are accepted — on any
 * deployment, with no ORG_ID and no database — while writing nothing.
 */
function ignoredEvent(id) {
  return JSON.stringify({
    id,
    type: 'invoice.payment_succeeded',
    data: { object: {} },
  });
}

async function post(body, signatureHeader) {
  const headers = { 'Content-Type': 'application/json' };
  if (signatureHeader) headers['Stripe-Signature'] = signatureHeader;

  try {
    const response = await fetch(url, { method: 'POST', headers, body });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
  } catch (error) {
    // A network failure is a failed check, not a stack trace: the target being
    // unreachable is one of the things this run is meant to report.
    return { status: 0, json: {}, networkError: error?.message || String(error) };
  }
}

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function describe(response) {
  if (response.networkError) return `unreachable: ${response.networkError}`;
  return `HTTP ${response.status}${response.json?.error ? ` "${response.json.error}"` : ''}`;
}

console.log(`\nVerifying ${url}\n`);

// 0. Positive control, and the check every other one depends on.
//
// A correctly signed event of an ignored type must be accepted. If this fails,
// the target's secret does not match ours (or the route rejects everything),
// and the rejection checks below prove nothing — they would pass on an endpoint
// with no signature verification configured at all.
{
  const body = ignoredEvent(`evt_control_${Date.now()}`);
  const response = await post(body, sign(body));
  const passed = response.status === 200 && response.json?.ignored === 'invoice.payment_succeeded';
  record('correctly signed event is accepted (control: secret matches)', passed, describe(response));

  if (!passed) {
    console.error(
      '\n✗ The positive control failed, so nothing below it is meaningful.\n\n' +
        '  Every rejection check would also pass against an endpoint that rejects\n' +
        '  everything — which is exactly what a deployment with no\n' +
        '  STRIPE_WEBHOOK_SECRET looks like.\n\n' +
        (response.status === 503
          ? '  HTTP 503 means the target has no STRIPE_WEBHOOK_SECRET set.\n'
          : '  Check that STRIPE_WEBHOOK_SECRET here is byte-identical to the one on the target.\n')
    );
    process.exit(1);
  }
}

// 1. The original exploit: no signature at all.
//
// 400 specifically, not merely "not 200": the route answers 503 when it has no
// secret configured, and a 503 here would mean check 0 passed against a
// different deployment than the one being probed.
{
  const response = await post(subscriptionEvent('evt_unsigned', orgId || 'org_demo'), null);
  record('unsigned request is rejected', response.status === 400, describe(response));
}

// 2. A signature made with the wrong secret.
{
  const body = subscriptionEvent('evt_wrongsecret', orgId || 'org_demo');
  // One timestamp for both the signed payload and the header: computing
  // Date.now() twice can straddle a second boundary, which would make the
  // signature invalid for a reason this check is not testing.
  const timestamp = Math.floor(Date.now() / 1000);
  const forged = createHmac('sha256', 'whsec_not_the_real_secret')
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
  const response = await post(body, `t=${timestamp},v1=${forged}`);
  record('signature from a different secret is rejected', response.status === 400, describe(response));
}

// 3. Body altered after signing.
{
  const body = subscriptionEvent('evt_tampered', orgId || 'org_demo');
  const header = sign(body);
  const response = await post(body.replace('active', 'canceled'), header);
  record('tampered payload is rejected', response.status === 400, describe(response));
}

// 4. Correctly signed but stale — a captured request replayed later.
{
  const body = subscriptionEvent('evt_stale', orgId || 'org_demo');
  const response = await post(body, sign(body, Math.floor(Date.now() / 1000) - 3600));
  record('timestamp older than tolerance is rejected', response.status === 400, describe(response));
}

// 5. Correctly signed but dated in the future — the same window, other side.
{
  const body = subscriptionEvent('evt_future', orgId || 'org_demo');
  const response = await post(body, sign(body, Math.floor(Date.now() / 1000) + 3600));
  record('timestamp beyond tolerance in the future is rejected', response.status === 400, describe(response));
}

// 6 and 7. A real subscription event is applied, and redelivering it is a no-op.
// These are the two criteria that protect money, and the two the old script
// skipped by default.
if (orgId) {
  const eventId = `evt_verify_${Date.now()}`;
  const body = subscriptionEvent(eventId, orgId);
  const header = sign(body);

  const first = await post(body, header);
  record(
    'correctly signed subscription event is accepted and applied',
    first.status === 200 && Boolean(first.json?.processed),
    first.status === 404
      ? `HTTP 404 — ORG_ID ${orgId} does not exist in the target's database`
      : describe(first)
  );

  const second = await post(body, header);
  record(
    'redelivery of the same event id is deduplicated',
    second.status === 200 && second.json?.duplicate === true,
    second.json?.duplicate === true ? 'duplicate: true' : describe(second)
  );
}

const failed = results.filter((r) => !r.passed);

console.log('');

if (failed.length > 0) {
  fail(`${failed.length} of ${results.length} checks failed.`);
}

if (!orgId) {
  // Not a pass. The run proved the endpoint verifies signatures; it proved
  // nothing about whether a real event is applied exactly once, which is the
  // half of #63 that guards the money path.
  console.error(
    `INCOMPLETE — ${results.length} checks passed, but this is not a #63 sign-off.\n\n` +
      '  Not run, because ORG_ID is unset:\n' +
      '    – a correctly signed subscription event is accepted and applied\n' +
      '    – a redelivery of that event is deduplicated\n\n' +
      '  Re-run with ORG_ID set to a real organization uuid in the target\n' +
      "  deployment's database. Those two checks write to that organization,\n" +
      '  which is why they need a staging target you are willing to change.\n'
  );
  process.exit(1);
}

console.log(`✓ All ${results.length} checks passed.\n`);

// The record the founder pastes into docs/STATUS.md. Written by the run rather
// than from memory, because "verified on <date> against <target>" reconstructed
// afterwards is how a claim outlives the thing it was claiming about.
let revision = 'unknown';
try {
  const { execFileSync } = await import('node:child_process');
  revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Not a git checkout, or no git — the rest of the record still stands.
}

console.log('Record of this run — paste into docs/STATUS.md:\n');
console.log(`  Stripe webhook verification (#63): ${results.length}/${results.length} checks passed`);
console.log(`  target:   ${new URL(url).origin}`);
console.log(`  org:      ${orgId}`);
console.log(`  revision: ${revision}`);
console.log(`  run at:   ${new Date().toISOString()}`);
console.log('');
