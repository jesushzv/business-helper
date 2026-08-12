import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #52 — error monitoring transmits, and never claims a dispatch it did not make.
 *
 * This file used to assert the shape of a hand-built Sentry envelope: a POST to
 * the ingest endpoint, three newline-separated lines, an `X-Sentry-Auth` header.
 * `@sentry/nextjs` owns the transport now, so those assertions would be testing
 * Sentry's code, not ours. What survives the transport swap is the contract the
 * adapter is *for*, and that is what is pinned here:
 *
 *   - nothing transmits, and it says so, when no client is initialised;
 *   - what does transmit carries the tenant, the route and the severity;
 *   - failure of the monitoring host never reaches the caller.
 *
 * PII scrubbing moved with the transport — it is `beforeSend` now, and lives in
 * `tests/unit/sentryScrub.test.ts`.
 */

const captureExceptionSpy = vi.fn((..._args: unknown[]) => undefined as unknown);
const captureMessageSpy = vi.fn((..._args: unknown[]) => undefined as unknown);
const flushSpy = vi.fn(async (..._args: unknown[]) => true);

/** Swapped per test to model "no client" / "client with DSN" / "disabled". */
let currentClient: unknown;

vi.mock('@sentry/nextjs', () => ({
  getClient: () => currentClient,
  captureException: (...args: unknown[]) => captureExceptionSpy(...args),
  captureMessage: (...args: unknown[]) => captureMessageSpy(...args),
  flush: (...args: unknown[]) => flushSpy(...args),
}));

const {
  isSentryConfigured,
  parseSentryDsn,
  formatErrorPayload,
  captureException,
  captureMessage,
} = await import('@/lib/sentry');

const DSN = 'https://abc123def@o4507.ingest.us.sentry.io/6789';
const ENV = { SENTRY_DSN: DSN };
const ORG = 'ecae39e6-bae7-4d3e-b960-27e7cb348cc5';

/** The shape `lib/sentry.ts` interrogates: a DSN, and not explicitly disabled. */
function initialisedClient({ enabled = true } = {}) {
  return { getDsn: () => ({ host: 'o4507.ingest.us.sentry.io' }), getOptions: () => ({ enabled }) };
}

/** The second argument the adapter hands the SDK. */
interface CaptureOptions {
  level: string;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
}

function lastCall(spy: typeof captureExceptionSpy): [unknown, CaptureOptions] {
  return spy.mock.calls.at(-1) as [unknown, CaptureOptions];
}

beforeEach(() => {
  currentClient = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('DSN parsing (#52)', () => {
  it('accepts the shape Sentry actually issues', () => {
    // The regression this exists for: the old check was
    // `dsn.includes('@sentry')`, and a real DSN reads `…@o4507.ingest.us.sentry.io`
    // — the character after `@` is the org prefix, so the substring is absent.
    // Every correctly configured deployment read as unconfigured, and the only
    // value that passed was the one in the old test.
    expect(isSentryConfigured(ENV)).toBe(true);

    const parsed = parseSentryDsn(DSN)!;
    expect(parsed.publicKey).toBe('abc123def');
    expect(parsed.host).toBe('o4507.ingest.us.sentry.io');
    expect(parsed.projectId).toBe('6789');
  });

  it('refuses values that are not a DSN', () => {
    for (const bad of ['', 'invalid_dsn', 'https://sentry.io/123', 'https://k@sentry.io/abc']) {
      expect(parseSentryDsn(bad), `expected ${bad} to be refused`).toBeNull();
    }
    expect(isSentryConfigured({})).toBe(false);
  });
});

describe('Nothing is transmitted without an initialised client (#52)', () => {
  it('does not hand the SDK anything and does not claim a dispatch', () => {
    const res = captureException(new Error('Network timeout'), { route: '/dashboard' }, {});

    expect(res.handled).toBe(true);
    expect(res.dispatchedToSentry).toBe(false);
    expect(res.delivery).toBeUndefined();
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });

  it('says in the log that nothing was transmitted', () => {
    // Hard rule #1 applied to our own console: the prefix this replaced was
    // `[SENTRY CAPTURE]`, which reads as a capture having happened.
    captureException(new Error('boom'), {}, {});
    const prefix = vi.mocked(console.error).mock.calls[0][0] as string;
    expect(prefix).toMatch(/NOTHING TRANSMITTED/);
  });

  it('distinguishes "no DSN anywhere" from "DSN set but this runtime never inited"', () => {
    // Different fixes — a missing Vercel env var versus a config that did not
    // load — and previously one indistinguishable log line.
    captureException(new Error('boom'), {}, ENV);
    expect(vi.mocked(console.error).mock.calls[0][2]).toMatchObject({ dsn_in_env: true });

    vi.mocked(console.error).mockClear();
    captureException(new Error('boom'), {}, {});
    expect(vi.mocked(console.error).mock.calls[0][2]).toMatchObject({ dsn_in_env: false });
  });

  it('treats an explicitly disabled client as no client', () => {
    currentClient = initialisedClient({ enabled: false });
    expect(captureException(new Error('boom'), {}, ENV).dispatchedToSentry).toBe(false);
    expect(captureExceptionSpy).not.toHaveBeenCalled();
  });
});

describe('An error reaches the SDK with its tenant attached (#52)', () => {
  beforeEach(() => {
    currentClient = initialisedClient();
  });

  it('passes the original error, the level, and the tenant and route as tags', async () => {
    const error = new Error('DB pool exhausted');
    const res = captureException(error, {
      organization_id: ORG,
      route: '/api/quotes',
      level: 'fatal',
    }, ENV);

    expect(res.dispatchedToSentry).toBe(true);
    await expect(res.delivery).resolves.toBe(true);

    const [captured, options] = lastCall(captureExceptionSpy);
    // The original Error, not a formatted copy — the SDK needs it to parse frames.
    expect(captured).toBe(error);
    expect(options.level).toBe('fatal');
    // The exit criterion: the alert arrives with its organization_id and route.
    expect(options.tags.organization_id).toBe(ORG);
    expect(options.tags.route).toBe('/api/quotes');
  });

  it('defaults an unlabelled capture to error severity', () => {
    captureException(new Error('boom'), {}, ENV);
    expect(lastCall(captureExceptionSpy)[1].level).toBe('error');
    expect(lastCall(captureExceptionSpy)[1].tags.severity).toBe('error');
  });

  it('scrubs the tags and extras it builds, before the SDK ever sees them', () => {
    captureException(new Error('boom'), {
      organization_id: ORG,
      extra: { clabe: '012180001234567899', folio: 12 },
    }, ENV);

    const { extra } = lastCall(captureExceptionSpy)[1];
    expect(extra).not.toHaveProperty('clabe');
    expect(extra.folio).toBe(12);
  });

  it('reports a flush that did not drain as false rather than as a send', async () => {
    flushSpy.mockResolvedValueOnce(false);
    await expect(captureException(new Error('boom'), {}, ENV).delivery).resolves.toBe(false);
  });

  it('never throws or rejects when the monitoring host is unreachable', async () => {
    // A caller is always a `catch` block or an error boundary. Sentry being
    // down must not become the error the user sees.
    flushSpy.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const res = captureException(new Error('boom'), {}, ENV);
    await expect(res.delivery).resolves.toBe(false);
  });

  it('transmits a captureMessage too, scrubbed', async () => {
    const res = captureMessage('Folios agotados para ana@ferreteria.mx', 'warning', {
      organization_id: ORG,
    }, ENV);

    await expect(res.delivery).resolves.toBe(true);
    const [message, options] = lastCall(captureMessageSpy);
    expect(message).toBe('Folios agotados para [email]');
    expect(options.level).toBe('warning');
    expect(options.tags.organization_id).toBe(ORG);
  });
});

describe('formatErrorPayload still defines what a report carries (#52)', () => {
  it('keeps organization_id and user_id intact', () => {
    const payload = formatErrorPayload(new Error('x'), {
      organization_id: ORG,
      user_id: 'f116bb9c-70ed-49c9-b954-d97f1e4ba1c3',
      route: '/api/invoices/issue',
    });

    expect(payload.tags.organization_id).toBe(ORG);
    expect(payload.tags.user_id).toBe('f116bb9c-70ed-49c9-b954-d97f1e4ba1c3');
    expect(payload.tags.route).toBe('/api/invoices/issue');
  });

  it('scrubs the message and the stack it formats', () => {
    const err = new Error('pago de ana@ferreteria.mx por CLABE 012180001234567899');
    err.stack = 'Error: pago de ana@ferreteria.mx\n    at /app/lib/pay.ts:1:1';

    const payload = formatErrorPayload(err, {});
    expect(payload.message).not.toMatch(/ana@ferreteria\.mx/);
    expect(payload.message).not.toMatch(/012180001234567899/);
    expect(payload.stack).toMatch(/at \/app\/lib\/pay\.ts/);
  });
});
