import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

/**
 * `scripts/verify-stripe-live.mjs` is the only evidence #68 will have before a
 * real card is charged, so its *verdict* is under test here — which responses
 * it calls a pass, and whether it can be talked into signing off on a run that
 * skipped something.
 *
 * This is `verifyWebhookGuard.test.ts`'s lesson applied ahead of the incident
 * rather than after one (#63): a preflight that prints ticks for checks it
 * never ran is worse than no preflight, because it converts an unknown into a
 * false assurance. The stub below proves nothing about the real Stripe account
 * — that is what running the script with a live key is for. What it pins is
 * the judgement.
 *
 * The failure it exists for: a tier pointed at another tier's Price id. Each
 * price is individually valid, so nothing local catches it; the customer is
 * simply charged the wrong amount, and every screen reports success.
 */

const SCRIPT = path.resolve(__dirname, '../../scripts/verify-stripe-live.mjs');

interface PriceStub {
  unit_amount: number;
  currency: string;
  active: boolean;
  livemode: boolean;
  recurring: { interval: string; interval_count: number } | null;
}

const monthly = (amountMxn: number): PriceStub => ({
  unit_amount: amountMxn * 100,
  currency: 'mxn',
  active: true,
  livemode: true,
  recurring: { interval: 'month', interval_count: 1 },
});

interface StubOptions {
  account?: Record<string, unknown>;
  prices?: Record<string, PriceStub>;
  webhookEndpoints?: Array<Record<string, unknown>>;
}

const DEFAULT_PRICES: Record<string, PriceStub> = {
  price_live_inicial: monthly(299),
  price_live_negocio: monthly(599),
  price_live_empresa: monthly(999),
};

const DEFAULT_ENDPOINT = {
  url: 'https://example.test/api/stripe/webhook',
  status: 'enabled',
  livemode: true,
  enabled_events: [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ],
};

let server: Server | null = null;

function startStub(options: StubOptions = {}): Promise<string> {
  const prices = options.prices ?? DEFAULT_PRICES;
  const account = options.account ?? {
    id: 'acct_stub',
    charges_enabled: true,
    payouts_enabled: true,
    country: 'MX',
  };
  const endpoints = options.webhookEndpoints ?? [DEFAULT_ENDPOINT];

  return new Promise((resolve) => {
    server = createServer((req, res) => {
      const url = req.url || '';
      res.setHeader('Content-Type', 'application/json');

      if (url.startsWith('/account')) {
        res.end(JSON.stringify(account));
        return;
      }

      if (url.startsWith('/webhook_endpoints')) {
        res.end(JSON.stringify({ data: endpoints }));
        return;
      }

      const priceMatch = url.match(/^\/prices\/([^?]+)/);
      if (priceMatch) {
        const price = prices[decodeURIComponent(priceMatch[1])];
        if (!price) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: { message: 'No such price' } }));
          return;
        }
        res.end(JSON.stringify(price));
        return;
      }

      res.statusCode = 404;
      res.end('{}');
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server!.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function runScript(env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT],
      { env: { ...process.env, ...env }, timeout: 20_000, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = (err as { code?: number } | null)?.code ?? (err ? 1 : 0);
        resolve({ code, out: `${stdout || ''}${stderr || ''}` });
      }
    );
  });
}

async function run(overrides: Record<string, string> = {}, stub: StubOptions = {}) {
  const base = await startStub(stub);
  return runScript({
    STRIPE_API_BASE_URL: `${base}`,
    STRIPE_SECRET_KEY: 'sk_live_stub',
    STRIPE_WEBHOOK_SECRET: 'whsec_stub',
    STRIPE_PRICE_INICIAL: 'price_live_inicial',
    STRIPE_PRICE_NEGOCIO: 'price_live_negocio',
    STRIPE_PRICE_EMPRESA: 'price_live_empresa',
    NEXT_PUBLIC_APP_URL: 'https://example.test',
    ...overrides,
  });
}

afterEach(() => {
  server?.close();
  server = null;
});

describe('verify:stripe only signs off on a price map that bills the advertised amount (#68)', () => {
  it('passes when the account can charge and every tier matches the pricing page', async () => {
    const { code, out } = await run();
    expect(out).toContain('Account and price map verified');
    expect(code).toBe(0);
  });

  it('fails when a tier bills an amount the pricing page does not advertise', async () => {
    // The defect this script exists for: Negocio pointed at a $699 price.
    const { code, out } = await run(
      {},
      { prices: { ...DEFAULT_PRICES, price_live_negocio: monthly(699) } }
    );
    expect(code).toBe(1);
    expect(out).toContain('negocio');
    expect(out).toContain('$599 MXN');
  });

  it('fails when two tiers share one price id', async () => {
    // Each price is individually valid — only the comparison catches this.
    const { code, out } = await run({ STRIPE_PRICE_EMPRESA: 'price_live_negocio' });
    expect(code).toBe(1);
    expect(out).toContain('two tiers share one price id');
  });

  it('fails when a price id does not exist in the account', async () => {
    const { code, out } = await run({ STRIPE_PRICE_EMPRESA: 'price_typo' });
    expect(code).toBe(1);
    expect(out).toContain('does not exist in this account');
  });

  it('fails when a live key is pointed at a test-mode price', async () => {
    const testModePrice = { ...monthly(999), livemode: false };
    const { code, out } = await run(
      {},
      { prices: { ...DEFAULT_PRICES, price_live_empresa: testModePrice } }
    );
    expect(code).toBe(1);
    expect(out).toContain('livemode=false');
  });

  it('fails when the account cannot accept charges', async () => {
    const { code, out } = await run(
      {},
      { account: { id: 'acct_stub', charges_enabled: false, payouts_enabled: false, country: 'MX' } }
    );
    expect(code).toBe(1);
    expect(out).toContain('charges_enabled=false');
  });

  it('fails when a tier has no price id at all', async () => {
    const { code, out } = await run({ STRIPE_PRICE_EMPRESA: '' });
    expect(code).toBe(1);
    expect(out).toContain('STRIPE_PRICE_EMPRESA is unset');
  });

  it('fails when no webhook endpoint is registered for this deployment', async () => {
    // Checkout would succeed and no tier would ever be granted.
    const { code, out } = await run({}, { webhookEndpoints: [] });
    expect(code).toBe(1);
    expect(out).toContain('no endpoint with url');
  });

  it('fails when the endpoint does not subscribe to the events the route handles', async () => {
    const { code, out } = await run(
      {},
      {
        webhookEndpoints: [
          { ...DEFAULT_ENDPOINT, enabled_events: ['checkout.session.completed'] },
        ],
      }
    );
    expect(code).toBe(1);
    expect(out).toContain('missing customer.subscription.created');
  });

  /**
   * The #63 property: an incomplete run is not a pass, and there is no flag to
   * make it one.
   */
  it('refuses to report a pass when a money-path check was skipped', async () => {
    const { code, out } = await run({ NEXT_PUBLIC_APP_URL: '' });
    expect(code).toBe(1);
    expect(out).toContain('INCOMPLETE');
    expect(out).toContain('webhook endpoint registration');
    expect(out).not.toContain('Account and price map verified');
  });
});

describe('verify:stripe cannot be pointed away from Stripe (#68)', () => {
  it('refuses a non-local API base rather than silently using the real one', async () => {
    const { code, out } = await runScript({
      STRIPE_API_BASE_URL: 'https://attacker.example/v1',
      STRIPE_SECRET_KEY: 'sk_live_stub',
    });
    expect(code).toBe(1);
    expect(out).toContain('must point at localhost');
  });
});
