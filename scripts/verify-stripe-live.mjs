#!/usr/bin/env node
/**
 * Verifies that Stripe can actually take money on this deployment, before a
 * real card is the thing that finds out it cannot (#68).
 *
 * `lib/stripe.ts` and `lib/stripeClient.ts` are unit-tested, but those tests
 * prove the code builds a correct request given a price id — not that the id
 * exists in the account, that it is live rather than test, or that it bills the
 * amount the pricing page advertises. Those are properties of a Stripe account,
 * so they need a call to Stripe.
 *
 * The mismapped case is the dangerous one: a tier pointed at another tier's
 * Price id charges the wrong amount and still reports success everywhere. That
 * is worse than failing to charge, and no amount of mocked-fetch testing can
 * see it.
 *
 *   STRIPE_SECRET_KEY=sk_live_… \
 *   STRIPE_PRICE_INICIAL=price_… STRIPE_PRICE_NEGOCIO=price_… STRIPE_PRICE_EMPRESA=price_… \
 *   NEXT_PUBLIC_APP_URL=https://businesshelper.app \
 *   npm run verify:stripe
 *
 * Every request this script makes is a GET. It creates nothing, charges
 * nothing, and is safe to run against the live account — unlike
 * `npm run verify:webhook`, which sends real subscription events and must never
 * point at production.
 *
 * A passing run means the account and the price map are ready. It does NOT
 * mean anyone has been charged: #68 closes on a real card, in live mode, with
 * the webhook that recorded it passing signature verification (#63).
 *
 * The expected amounts below mirror STRIPE_PLANS in lib/stripe.ts. Keep the two
 * in step — tests/unit/stripePriceMap.test.ts fails the build if they drift.
 */

const env = process.env;

const STRIPE_API_VERSION = '2024-06-20';

/**
 * Stripe's API, or a local stub when one is named.
 *
 * The override exists so `tests/unit/verifyStripeGuard.test.ts` can pin this
 * script's *verdict* — which responses it calls a pass — the way #63 pins
 * `verify:webhook`'s. It is accepted **only** for localhost, and a non-local
 * value is a hard failure rather than a silent fallback to the real API: an
 * override that quietly did nothing would let a run report on an account it
 * never contacted.
 */
const STRIPE_API_BASE = (() => {
  const override = process.env.STRIPE_API_BASE_URL?.trim();
  if (!override) return 'https://api.stripe.com/v1';
  if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(override)) {
    console.error(
      `\n✗ STRIPE_API_BASE_URL must point at localhost — got "${override}".\n\n` +
        '  It exists for the test stub only. Unset it to check the real account.\n'
    );
    process.exit(1);
  }
  return override.replace(/\/$/, '');
})();

/** Mirrors STRIPE_PLANS in lib/stripe.ts. Amounts are MXN per month. */
const EXPECTED_TIERS = [
  { id: 'inicial', envVars: ['STRIPE_PRICE_INICIAL', 'STRIPE_PRICE_EMPRENDEDOR'], amountMxn: 299 },
  { id: 'negocio', envVars: ['STRIPE_PRICE_NEGOCIO'], amountMxn: 599 },
  { id: 'empresa', envVars: ['STRIPE_PRICE_EMPRESA'], amountMxn: 999 },
];

/** The events app/api/stripe/webhook/route.ts acts on. */
const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

let failed = 0;

function record(name, passed, detail) {
  if (!passed) failed += 1;
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function note(message) {
  console.log(`  · ${message}`);
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/** Bounded GET so a hung Stripe does not hang the check. */
async function get(path) {
  try {
    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Stripe-Version': STRIPE_API_VERSION,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, json };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'network error';
    return { ok: false, status: 0, json: {}, transport: reason };
  }
}

function firstConfigured(envVars) {
  for (const name of envVars) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function pesos(centavos) {
  return `$${(centavos / 100).toLocaleString('en-US')} MXN`;
}

// ---------------------------------------------------------------------------
// Stage 1 — configuration
// ---------------------------------------------------------------------------

console.log('\nStripe live-mode verification\n');
console.log('Config');

const secretKey = env.STRIPE_SECRET_KEY?.trim();

if (!secretKey) {
  fail(
    'STRIPE_SECRET_KEY is not set.\n\n' +
      '  export STRIPE_SECRET_KEY=sk_live_…   # or sk_test_… to rehearse against the sandbox\n\n' +
      '  Without it /api/stripe/checkout answers 503 and nobody can subscribe.'
  );
}

const mode = secretKey.startsWith('sk_live_') ? 'live' : secretKey.startsWith('sk_test_') ? 'test' : null;

if (!mode) {
  fail(
    `STRIPE_SECRET_KEY does not look like a Stripe secret key (expected sk_live_… or sk_test_…).\n\n` +
      '  A restricted key (rk_…) is not enough: this checks account and price state.'
  );
}

record('STRIPE_SECRET_KEY present', true, `${mode} mode`);

if (mode === 'test') {
  note('Test mode. Every check below runs against the sandbox — a pass here does not');
  note('release the live gate. Re-run with sk_live_… before charging a real card.');
}

record(
  'STRIPE_WEBHOOK_SECRET present',
  Boolean(env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')),
  env.STRIPE_WEBHOOK_SECRET
    ? 'set'
    : 'unset — the webhook rejects every event, so no subscription is ever granted'
);

const appUrl = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
if (!appUrl) {
  note('NEXT_PUBLIC_APP_URL unset — the webhook endpoint check will be skipped');
}

// ---------------------------------------------------------------------------
// Stage 2 — can this account take money at all
// ---------------------------------------------------------------------------

console.log('\nAccount');

const account = await get('/account');

if (!account.ok) {
  fail(
    `Stripe rejected the key (${account.transport ?? `HTTP ${account.status}`}${
      account.json?.error?.message ? `: ${account.json.error.message}` : ''
    }).\n\n  Check the key belongs to the Business Helper account and has not been rolled.`
  );
}

record('key accepted', true, account.json.id);
record(
  'account can accept charges',
  account.json.charges_enabled === true,
  account.json.charges_enabled
    ? 'charges_enabled'
    : 'charges_enabled=false — finish activation in the Stripe dashboard (business details, bank account)'
);
record(
  'account can receive payouts',
  account.json.payouts_enabled === true,
  account.json.payouts_enabled
    ? 'payouts_enabled'
    : 'payouts_enabled=false — money can be collected but not withdrawn'
);

if (account.json.country && account.json.country !== 'MX') {
  note(`account country is ${account.json.country}; MXN prices on a non-MX account may convert`);
}

if (Array.isArray(account.json.requirements?.currently_due) && account.json.requirements.currently_due.length) {
  note(`Stripe is still asking for: ${account.json.requirements.currently_due.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Stage 3 — does each tier bill exactly what the pricing page promises
// ---------------------------------------------------------------------------

async function checkPrice({ id, envVars, amountMxn }, { recurring }) {
  const configured = firstConfigured(envVars);

  if (!configured) {
    return { id, configured: false, envVar: envVars[0] };
  }

  // A Product id here is the mistake that took live checkout down: the dashboard
  // shows `prod_…` at the top of the product page and `price_…` further down
  // under Pricing, and Stripe's own answer — "No such price" — reads like the
  // id was deleted rather than like it was never a price. Named before the GET,
  // which would only report a 404.
  const shape = /^price_[A-Za-z0-9_]+$/.test(configured.value)
    ? 'price'
    : /^prod_[A-Za-z0-9_]+$/.test(configured.value)
      ? 'product'
      : 'other';

  if (shape !== 'price') {
    console.log(`  ${configured.name} → ${configured.value}`);
    record(
      `  ${id}: is a Price id`,
      false,
      shape === 'product'
        ? `${configured.value} is a Product id — open it in the dashboard and copy the id under ` +
            'Pricing (price_…). Checkout bills a Price; a Product id fails with "No such price"'
        : `${configured.value} is not a Stripe Price id (expected price_…)`
    );
    return { id, configured: true, ok: false };
  }

  const price = await get(`/prices/${encodeURIComponent(configured.value)}`);

  if (!price.ok) {
    record(
      `${id}: price exists`,
      false,
      price.transport ??
        (price.status === 404
          ? `${configured.value} does not exist in this account (${mode} mode)`
          : `HTTP ${price.status}`)
    );
    return { id, configured: true, ok: false };
  }

  const expectedCentavos = amountMxn * 100;
  const isLive = price.json.livemode === true;
  const checks = [
    ['is active', price.json.active === true, price.json.active ? 'active' : 'archived in Stripe'],
    [
      `bills ${pesos(expectedCentavos)}`,
      price.json.unit_amount === expectedCentavos,
      price.json.unit_amount === expectedCentavos
        ? pesos(price.json.unit_amount)
        : `bills ${pesos(price.json.unit_amount ?? 0)} — the pricing page says ${pesos(expectedCentavos)}`,
    ],
    [
      'is priced in MXN',
      price.json.currency === 'mxn',
      price.json.currency === 'mxn' ? 'mxn' : `${price.json.currency} — a customer would be charged in the wrong currency`,
    ],
    [
      recurring ? 'recurs monthly' : 'is a one-time price',
      recurring
        ? price.json.recurring?.interval === 'month' && (price.json.recurring?.interval_count ?? 1) === 1
        : !price.json.recurring,
      recurring
        ? price.json.recurring
          ? `every ${price.json.recurring.interval_count ?? 1} ${price.json.recurring.interval}`
          : 'one-time — a subscription cannot be created from it'
        : price.json.recurring
          ? `recurring ${price.json.recurring.interval} — a one-time price must not renew`
          : 'one-time',
    ],
    [
      `matches the key's mode (${mode})`,
      isLive === (mode === 'live'),
      isLive === (mode === 'live')
        ? `livemode=${isLive}`
        : `livemode=${isLive} while the key is ${mode} — Stripe will reject the session`,
    ],
  ];

  console.log(`  ${configured.name} → ${configured.value}`);
  for (const [name, passed, detail] of checks) {
    record(`  ${id}: ${name}`, passed, detail);
  }

  return { id, configured: true, ok: checks.every(([, passed]) => passed) };
}

console.log('\nSubscription prices');

const tierResults = [];
for (const tier of EXPECTED_TIERS) {
  const result = await checkPrice(tier, { recurring: true });
  if (!result.configured) {
    record(`${result.id}: price id configured`, false, `${result.envVar} is unset — this tier cannot be sold`);
  }
  tierResults.push(result);
}

// The same live Price id behind two tiers charges one of them the other's
// amount, and each price checks out individually — only the comparison sees it.
const configuredIds = EXPECTED_TIERS.map((tier) => firstConfigured(tier.envVars)?.value).filter(Boolean);
record(
  'each tier has its own price id',
  new Set(configuredIds).size === configuredIds.length,
  new Set(configuredIds).size === configuredIds.length ? 'no duplicates' : 'two tiers share one price id'
);

// Folio packs are gone (BYOK, #221): tenants stamp through their own PAC, so
// there is no pack product to sell and no per-pack price variable to verify.

// ---------------------------------------------------------------------------
// Stage 4 — is the webhook that grants the tier registered
// ---------------------------------------------------------------------------

console.log('\nWebhook endpoint');

const skipped = [];

if (!appUrl) {
  skipped.push(
    'the webhook endpoint registration (NEXT_PUBLIC_APP_URL unset) — without it nothing\n' +
      '      grants a tier after a successful payment, so this is a money-path check'
  );
  note('not run: NEXT_PUBLIC_APP_URL is unset');
} else {
  const expectedUrl = `${appUrl}/api/stripe/webhook`;
  const endpoints = await get('/webhook_endpoints?limit=100');

  if (!endpoints.ok) {
    record('webhook endpoints readable', false, endpoints.transport ?? `HTTP ${endpoints.status}`);
  } else {
    const match = (endpoints.json.data || []).find((endpoint) => endpoint.url === expectedUrl);

    record('an endpoint is registered for this deployment', Boolean(match), match ? expectedUrl : `no endpoint with url ${expectedUrl}`);

    if (match) {
      record('endpoint is enabled', match.status === 'enabled', `status ${match.status}`);

      const events = match.enabled_events || [];
      const missing = events.includes('*') ? [] : REQUIRED_EVENTS.filter((e) => !events.includes(e));
      record(
        'endpoint subscribes to the events the route handles',
        missing.length === 0,
        missing.length ? `missing ${missing.join(', ')}` : `${events.includes('*') ? 'all events' : `${events.length} events`}`
      );

      if (match.livemode !== (mode === 'live')) {
        record('endpoint mode matches the key', false, `endpoint livemode=${match.livemode}`);
      }
    }

    // Stripe returns a signing secret only when the endpoint is created, so it
    // cannot be compared with STRIPE_WEBHOOK_SECRET from here.
    note('the signing secret cannot be read back from the API — npm run verify:webhook (#63) proves it matches');
  }
}

// ---------------------------------------------------------------------------

console.log('');

if (failed) {
  fail(
    `${failed} check${failed === 1 ? '' : 's'} failed. Fix them before charging a card —\n` +
      '  a wrong price id charges the wrong amount and reports success everywhere.'
  );
}

// An exit code is a claim (#63). A run that skipped a money-path check has not
// verified this deployment, however many checks it printed a tick against, and
// there is deliberately no flag to override that.
if (skipped.length) {
  console.error(
    `INCOMPLETE — the checks that ran passed, but this is not a #68 sign-off.\n\n` +
      skipped.map((s) => `    – ${s}`).join('\n') +
      '\n\n  Re-run with it set before treating the price map as verified.\n'
  );
  process.exit(1);
}

console.log(
  `✓ Account and price map verified in ${mode} mode.\n\n` +
    '  This proves Stripe would accept a session for each tier at the advertised price.\n' +
    '  It does not prove anyone has paid. #68 still needs, on the live account:\n' +
    '    1. a real card charged end to end through /settings, then refunded\n' +
    '    2. the subscription visible on the organization (written only by the webhook)\n' +
    '    3. that webhook delivery passing signature verification (#63)\n'
);
