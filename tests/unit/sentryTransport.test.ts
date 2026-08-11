import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isSentryConfigured,
  parseSentryDsn,
  envelopeEndpoint,
  scrubText,
  scrubExtra,
  formatErrorPayload,
  captureException,
  captureMessage,
} from '@/lib/sentry';

/**
 * #52 — error monitoring transmits, and does not carry personal data with it.
 *
 * `lib/sentry.ts` was a shim: both branches of `captureException` called
 * `console.error`, while `dispatchedToSentry: true` claimed a dispatch that
 * never happened. For a solo founder this is the only mechanism that reports a
 * production 500, and `app/global-error.tsx` told users their team had been
 * notified automatically.
 *
 * These pin the two things that make it real: an outbound request actually
 * leaves, and the exit criterion's scrubbing holds — "no RFC, CLABE, phone
 * number or email appears in the payload", with `organization_id` surviving.
 */

const DSN = 'https://abc123def@o4507.ingest.us.sentry.io/6789';
const ENV = { SENTRY_DSN: DSN };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The event object out of the last envelope sent. */
function lastEvent(): Record<string, any> {
  const body = fetchMock.mock.calls.at(-1)![1].body as string;
  const lines = body.split('\n');
  return JSON.parse(lines[2]);
}

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

  it('builds the envelope endpoint from the DSN, including a self-hosted path prefix', () => {
    expect(envelopeEndpoint(parseSentryDsn(DSN)!)).toBe(
      'https://o4507.ingest.us.sentry.io/api/6789/envelope/'
    );
    expect(envelopeEndpoint(parseSentryDsn('https://k@sentry.example.com/inner/42')!)).toBe(
      'https://sentry.example.com/inner/api/42/envelope/'
    );
  });

  it('refuses values that are not a DSN', () => {
    for (const bad of ['', 'invalid_dsn', 'https://sentry.io/123', 'https://k@sentry.io/abc']) {
      expect(parseSentryDsn(bad), `expected ${bad} to be refused`).toBeNull();
    }
    expect(isSentryConfigured({})).toBe(false);
  });
});

describe('Nothing is transmitted without a DSN (#52)', () => {
  it('does not call fetch and does not claim a dispatch', () => {
    const res = captureException(new Error('Network timeout'), { route: '/dashboard' }, {});

    expect(res.handled).toBe(true);
    expect(res.dispatchedToSentry).toBe(false);
    expect(res.delivery).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says in the log that nothing was transmitted', () => {
    // Hard rule #1 applied to our own console: the old prefix was
    // `[SENTRY CAPTURE]`, which reads as a capture having happened.
    captureException(new Error('boom'), {}, {});
    const prefix = vi.mocked(console.error).mock.calls[0][0] as string;
    expect(prefix).toMatch(/NOTHING TRANSMITTED/);
  });
});

describe('An error actually leaves the process (#52)', () => {
  it('POSTs an envelope to the DSN endpoint with the auth header', async () => {
    const res = captureException(new Error('DB pool exhausted'), {
      organization_id: 'ecae39e6-bae7-4d3e-b960-27e7cb348cc5',
      route: '/api/quotes',
    }, ENV);

    expect(res.dispatchedToSentry).toBe(true);
    await expect(res.delivery).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://o4507.ingest.us.sentry.io/api/6789/envelope/');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Sentry-Auth']).toMatch(/sentry_key=abc123def/);
    expect(init.headers['Content-Type']).toBe('application/x-sentry-envelope');
  });

  it('sends a three-line envelope whose event carries the tenant and route', async () => {
    captureException(new Error('DB pool exhausted'), {
      organization_id: 'ecae39e6-bae7-4d3e-b960-27e7cb348cc5',
      route: '/api/quotes',
      level: 'fatal',
    }, ENV);

    const body = fetchMock.mock.calls[0][1].body as string;
    const lines = body.split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.parse(lines[1]).type).toBe('event');

    const event = JSON.parse(lines[2]);
    // The exit criterion: the alert arrives with its organization_id and route.
    expect(event.tags.organization_id).toBe('ecae39e6-bae7-4d3e-b960-27e7cb348cc5');
    expect(event.tags.route).toBe('/api/quotes');
    expect(event.level).toBe('fatal');
    expect(event.exception.values[0].value).toBe('DB pool exhausted');
  });

  it('reports a rejected delivery as false rather than as a send', async () => {
    fetchMock.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    const res = captureException(new Error('boom'), {}, ENV);
    await expect(res.delivery).resolves.toBe(false);
  });

  it('never throws or rejects when the monitoring host is unreachable', async () => {
    // A caller is always a `catch` block or an error boundary. Sentry being
    // down must not become the error the user sees.
    fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const res = captureException(new Error('boom'), {}, ENV);
    await expect(res.delivery).resolves.toBe(false);
  });

  it('transmits a captureMessage too', async () => {
    const res = captureMessage('Folios agotados', 'warning', { organization_id: 'org-1' }, ENV);
    await expect(res.delivery).resolves.toBe(true);
    expect(lastEvent().message.formatted).toBe('Folios agotados');
  });
});

describe('Personal data never reaches the payload (#52)', () => {
  it('redacts an email, RFC, CLABE and phone from free text', () => {
    expect(scrubText('contacto ana@ferreteria.mx pidió')).toBe('contacto [email] pidió');
    expect(scrubText('RFC DNO850101HD9 inválido')).toBe('RFC [rfc] inválido');
    expect(scrubText('(clabe)=(012180001234567899)')).toBe('(clabe)=([clabe])');
    expect(scrubText('whatsapp 8112345678 falló')).toBe('whatsapp [phone] falló');
  });

  it('redacts the value Postgres quotes back in a constraint violation', () => {
    // The reason key-based filtering is not enough: no key is involved, the
    // account number is in the prose of the error message itself.
    const message =
      'duplicate key value violates unique constraint "uq_bank_clabe" DETAIL: Key (clabe)=(012180001234567899) already exists.';
    const scrubbed = scrubText(message);
    expect(scrubbed).not.toMatch(/012180001234567899/);
    expect(scrubbed).toMatch(/\[clabe\]/);
  });

  it('keeps organization_id and user_id intact — they are the point of the report', () => {
    const org = 'ecae39e6-bae7-4d3e-b960-27e7cb348cc5';
    const payload = formatErrorPayload(new Error('x'), {
      organization_id: org,
      user_id: 'f116bb9c-70ed-49c9-b954-d97f1e4ba1c3',
      route: '/api/invoices/issue',
    });

    expect(payload.tags.organization_id).toBe(org);
    expect(payload.tags.user_id).toBe('f116bb9c-70ed-49c9-b954-d97f1e4ba1c3');
    expect(payload.tags.route).toBe('/api/invoices/issue');
  });

  it('scrubs the message and the stack, not just the message', async () => {
    const err = new Error('pago de ana@ferreteria.mx por CLABE 012180001234567899');
    err.stack = 'Error: pago de ana@ferreteria.mx\n    at /app/lib/pay.ts:1:1';

    captureException(err, {}, ENV);
    const event = lastEvent();

    expect(JSON.stringify(event)).not.toMatch(/ana@ferreteria\.mx/);
    expect(JSON.stringify(event)).not.toMatch(/012180001234567899/);
    expect(event.extra.stack).toMatch(/at \/app\/lib\/pay\.ts/);
  });

  it('drops PII-keyed extras and refuses nested objects', () => {
    const clean = scrubExtra({
      clabe: '012180001234567899',
      email: 'ana@ferreteria.mx',
      quote_id: 'q-1',
      client: { rfc: 'DNO850101HD9' },
      attempts: 3,
    });

    expect(clean).not.toHaveProperty('clabe');
    expect(clean).not.toHaveProperty('email');
    expect(clean.quote_id).toBe('q-1');
    expect(clean.attempts).toBe(3);
    // A whole row passed "for context" is where PII hides.
    expect(clean.client).toBe('[object omitted]');
  });

  it('leaves a uuid alone — its digit runs must not read as a phone number', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(scrubText(uuid)).toBe(uuid);
  });

  it('carries no personal data anywhere in a realistic capture', async () => {
    captureException(new Error('stamp failed for RFC DNO850101HD9'), {
      organization_id: 'ecae39e6-bae7-4d3e-b960-27e7cb348cc5',
      route: '/api/invoices/issue',
      extra: { clabe: '012180001234567899', client_email: 'ana@ferreteria.mx', folio: 12 },
    }, ENV);

    const serialized = JSON.stringify(lastEvent());
    expect(serialized).not.toMatch(/DNO850101HD9/);
    expect(serialized).not.toMatch(/012180001234567899/);
    expect(serialized).not.toMatch(/ana@ferreteria\.mx/);
    // …while the diagnostic content survives.
    expect(serialized).toMatch(/ecae39e6-bae7-4d3e-b960-27e7cb348cc5/);
    expect(serialized).toMatch(/\/api\/invoices\/issue/);
    expect(serialized).toMatch(/"folio":12/);
  });
});
