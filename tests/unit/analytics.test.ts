import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PRODUCT_EVENTS,
  CLIENT_REPORTABLE_EVENTS,
  ANONYMOUS_EVENTS,
  aliasAnonymousId,
  buildCapturePayload,
  captureEvent,
  getAnalyticsHost,
  isAnalyticsConfigured,
  isClientReportableEvent,
  isProductEvent,
  requiresSession,
  sanitizeAnonymousId,
  sanitizeEventProperties,
} from '@/lib/analytics';

/**
 * Issue #37: the seven-event funnel that makes a launch readable.
 *
 * Two things are worth testing here beyond the payload shape. First, that
 * personal data cannot reach a third-party analytics system even when a call
 * site passes it — the filter has to fail closed. Second, that instrumentation
 * never becomes a way for a request to fail: an unreachable PostHog must leave
 * the quote created.
 */

const CONFIGURED = { POSTHOG_API_KEY: 'phc_0123456789abcdefghij' };

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('the event set', () => {
  it('covers the whole quote-to-cash loop and nothing else', () => {
    expect([...PRODUCT_EVENTS]).toEqual([
      'signup_started',
      'signup_completed',
      'client_created',
      'quote_created',
      'quote_sent',
      'quote_signed',
      'payment_confirmed',
    ]);
  });

  it('rejects anything outside the set', () => {
    expect(isProductEvent('quote_created')).toBe(true);
    expect(isProductEvent('quote_deleted')).toBe(false);
    expect(isProductEvent('$identify')).toBe(false);
    expect(isProductEvent(undefined)).toBe(false);
  });

  it('lets the browser report only the events it is the source of', () => {
    expect([...CLIENT_REPORTABLE_EVENTS]).toEqual(['signup_started', 'signup_completed', 'quote_sent']);

    // A browser must not be able to assert money or a signature.
    expect(isClientReportableEvent('payment_confirmed')).toBe(false);
    expect(isClientReportableEvent('quote_signed')).toBe(false);
    expect(isClientReportableEvent('client_created')).toBe(false);
  });

  it('permits an anonymous subject only before the account exists', () => {
    expect([...ANONYMOUS_EVENTS]).toEqual(['signup_started', 'signup_completed']);
    expect(requiresSession('signup_started')).toBe(false);
    expect(requiresSession('signup_completed')).toBe(false);
    expect(requiresSession('quote_sent')).toBe(true);
    expect(requiresSession('payment_confirmed')).toBe(true);
  });
});

describe('property sanitization', () => {
  it('keeps identifiers, amounts and flags', () => {
    expect(
      sanitizeEventProperties({
        quote_id: 'b3f1c2d4',
        total_amount: 97440,
        currency: 'MXN',
        has_rfc: true,
        line_item_count: 3,
      })
    ).toEqual({
      quote_id: 'b3f1c2d4',
      total_amount: 97440,
      currency: 'MXN',
      has_rfc: true,
      line_item_count: 3,
    });
  });

  it('drops personal data by property name', () => {
    const clean = sanitizeEventProperties({
      quote_id: 'q-1',
      client_name: 'Materiales MTY SA de CV',
      contact_email: 'roberto@materialesmty.mx',
      phone: '8115551234',
      rfc: 'ABC120315HD9',
      clabe: '012180001234567895',
      codigo_postal: '64000',
      accepted_ip: '187.190.1.1',
      otp_code: '123456',
    });

    expect(clean).toEqual({ quote_id: 'q-1' });
  });

  it('keeps a boolean derived from personal data, drops the value it was derived from', () => {
    expect(
      sanitizeEventProperties({
        has_rfc: true,
        has_phone: false,
        rfc: 'ABC120315HD9',
        phone: 8115551234,
      })
    ).toEqual({ has_rfc: true, has_phone: false });
  });

  it('drops personal data by value shape whatever it was named', () => {
    const clean = sanitizeEventProperties({
      reference: '012180001234567895',
      contact: 'roberto@materialesmty.mx',
      issuer: 'ABC120315HD9',
      whom: '8115551234',
    });

    expect(clean).toEqual({});
  });

  it('does not mistake dates, amounts or ids for personal data', () => {
    const clean = sanitizeEventProperties({
      valid_until: '2026-08-30',
      confirmed_at: '2026-08-07T17:24:39.000Z',
      quote_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      total_amount: 8115551234,
    });

    expect(clean).toEqual({
      valid_until: '2026-08-30',
      confirmed_at: '2026-08-07T17:24:39.000Z',
      quote_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      total_amount: 8115551234,
    });
  });

  it('drops nested payloads rather than serializing a whole record', () => {
    const clean = sanitizeEventProperties({
      quote_id: 'q-1',
      client: { name: 'Don Roberto', rfc: 'ABC120315HD9' },
      line_items: [{ description: 'Cemento' }],
    });

    expect(clean).toEqual({ quote_id: 'q-1' });
  });

  it('truncates long strings, drops non-finite numbers and caps the property count', () => {
    const long = 'x'.repeat(500);
    const many: Record<string, number> = {};
    for (let i = 0; i < 40; i++) many[`p${i}`] = i;

    expect(sanitizeEventProperties({ note: long }).note).toHaveLength(200);
    expect(sanitizeEventProperties({ ratio: Number.NaN })).toEqual({});
    expect(Object.keys(sanitizeEventProperties(many))).toHaveLength(25);
  });

  it('returns an empty object for anything that is not a plain object', () => {
    expect(sanitizeEventProperties(null)).toEqual({});
    expect(sanitizeEventProperties('quote')).toEqual({});
    expect(sanitizeEventProperties([1, 2])).toEqual({});
  });
});

describe('configuration gating', () => {
  it('requires a real project key', () => {
    expect(isAnalyticsConfigured({})).toBe(false);
    expect(isAnalyticsConfigured({ POSTHOG_API_KEY: '   ' })).toBe(false);
    expect(isAnalyticsConfigured({ POSTHOG_API_KEY: 'phc_short' })).toBe(false);
    expect(isAnalyticsConfigured({ POSTHOG_API_KEY: 'sk_live_0123456789abcdefghij' })).toBe(false);
    expect(isAnalyticsConfigured(CONFIGURED)).toBe(true);
  });

  it('defaults to the US cloud and refuses a non-https host', () => {
    expect(getAnalyticsHost({})).toBe('https://us.i.posthog.com');
    expect(getAnalyticsHost({ POSTHOG_HOST: 'https://eu.i.posthog.com/' })).toBe('https://eu.i.posthog.com');
    expect(getAnalyticsHost({ POSTHOG_HOST: 'http://evil.example' })).toBe('https://us.i.posthog.com');
  });
});

describe('capture payload', () => {
  it('carries the tenant on every event so funnels can be segmented', () => {
    const payload = buildCapturePayload(
      'quote_created',
      {
        distinctId: 'user-1',
        organizationId: 'org-7',
        properties: { quote_id: 'q-1', client_name: 'Don Roberto' },
        timestamp: '2026-08-07T12:00:00.000Z',
      },
      CONFIGURED
    );

    expect(payload.event).toBe('quote_created');
    expect(payload.distinct_id).toBe('user-1');
    expect(payload.timestamp).toBe('2026-08-07T12:00:00.000Z');
    expect(payload.api_key).toBe(CONFIGURED.POSTHOG_API_KEY);
    expect(payload.properties.organization_id).toBe('org-7');
    expect(payload.properties.quote_id).toBe('q-1');
    expect(payload.properties).not.toHaveProperty('client_name');
  });

  it('marks an event with no tenant rather than omitting the field', () => {
    const payload = buildCapturePayload('signup_started', { distinctId: 'anon-1' }, CONFIGURED);
    expect(payload.properties.organization_id).toBe('none');
  });
});

describe('captureEvent', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends nothing when no project key is configured', async () => {
    const result = await captureEvent('quote_created', { distinctId: 'user-1' }, {});
    expect(result).toEqual({ captured: false, reason: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the event to the PostHog capture endpoint', async () => {
    const result = await captureEvent(
      'payment_confirmed',
      { distinctId: 'user-1', organizationId: 'org-7', properties: { amount: 5000 } },
      CONFIGURED
    );

    expect(result.captured).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://us.i.posthog.com/i/v0/e/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.event).toBe('payment_confirmed');
    expect(body.properties.amount).toBe(5000);
    expect(body.properties.organization_id).toBe('org-7');
  });

  it('refuses an unknown event or a missing subject before making a request', async () => {
    expect(
      await captureEvent('quote_deleted' as never, { distinctId: 'user-1' }, CONFIGURED)
    ).toEqual({ captured: false, reason: 'unknown_event' });
    expect(await captureEvent('quote_created', { distinctId: '' }, CONFIGURED)).toEqual({
      captured: false,
      reason: 'missing_distinct_id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a rejected capture without throwing', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(captureEvent('quote_created', { distinctId: 'user-1' }, CONFIGURED)).resolves.toEqual({
      captured: false,
      reason: 'http_401',
    });
  });

  it('swallows a network failure — analytics never fails the request it observes', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(captureEvent('quote_created', { distinctId: 'user-1' }, CONFIGURED)).resolves.toEqual({
      captured: false,
      reason: 'network_error',
    });

    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    fetchMock.mockRejectedValue(timeout);
    await expect(captureEvent('quote_created', { distinctId: 'user-1' }, CONFIGURED)).resolves.toEqual({
      captured: false,
      reason: 'timeout',
    });
  });
});

describe('anonymous identity', () => {
  it('accepts only ids of the shape the browser mints', () => {
    expect(sanitizeAnonymousId('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    );
    expect(sanitizeAnonymousId('anon-abc12345')).toBe('anon-abc12345');
    expect(sanitizeAnonymousId('short')).toBeNull();
    expect(sanitizeAnonymousId('user@example.com')).toBeNull();
    expect(sanitizeAnonymousId({ id: 'x' })).toBeNull();
    expect(sanitizeAnonymousId('x'.repeat(65))).toBeNull();
  });

  it('stitches the pre-signup visitor onto the account they created', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await aliasAnonymousId('user-1', 'anon-abc12345', CONFIGURED);
    expect(result.captured).toBe(true);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe('$identify');
    expect(body.distinct_id).toBe('user-1');
    expect(body.properties.$anon_distinct_id).toBe('anon-abc12345');

    vi.unstubAllGlobals();
  });

  it('does nothing when there is nothing to stitch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await aliasAnonymousId('user-1', '', CONFIGURED)).toEqual({
      captured: false,
      reason: 'nothing_to_alias',
    });
    expect(await aliasAnonymousId('user-1', 'user-1', CONFIGURED)).toEqual({
      captured: false,
      reason: 'nothing_to_alias',
    });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe('the funnel is wired at every boundary', () => {
  const boundaries: Array<[string, string, string]> = [
    ['signup_started', 'app/(auth)/register/page.tsx', 'trackClientEvent'],
    ['signup_completed', 'app/(auth)/register/page.tsx', 'trackClientEvent'],
    ['client_created', 'app/api/clients/route.ts', 'trackServerEvent'],
    ['quote_created', 'app/api/quotes/route.ts', 'trackServerEvent'],
    ['quote_sent', 'components/quotes/QuoteCard.tsx', 'trackClientEvent'],
    ['quote_signed', 'app/api/quotes/public/[token]/route.ts', 'trackServerEvent'],
    ['payment_confirmed', 'app/api/receivables/[id]/confirm/route.ts', 'trackServerEvent'],
  ];

  it.each(boundaries)('records %s in %s', (event, file, tracker) => {
    const source = readSource(file);
    expect(source).toContain(`${tracker}('${event}'`);
  });

  it('records the server-side steps only after the write returned a row', () => {
    // A capture placed before the insert measures intent, not outcome.
    const quotes = readSource('app/api/quotes/route.ts');
    expect(quotes.indexOf("trackServerEvent('quote_created'")).toBeGreaterThan(
      quotes.indexOf('Failed to create quote')
    );

    const confirm = readSource('app/api/receivables/[id]/confirm/route.ts');
    expect(confirm.indexOf("trackServerEvent('payment_confirmed'")).toBeGreaterThan(
      confirm.indexOf('Cobro no encontrado')
    );
  });

  it('keeps the project key out of the browser bundle', () => {
    for (const file of ['lib/analyticsClient.ts', 'components/quotes/QuoteCard.tsx', 'app/(auth)/register/page.tsx']) {
      const source = readSource(file);
      expect(source).not.toContain('POSTHOG');
      expect(source).not.toContain('posthog.com');
    }
  });
});
