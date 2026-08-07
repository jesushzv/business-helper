import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FUNNEL_EVENTS,
  capture,
  isAnalyticsConfigured,
  sanitizeEventProperties,
} from '@/lib/analytics';

/**
 * #37 — the seven-event funnel. Three properties matter: it sends nothing
 * without a key, it never lets PII into properties, and it never throws.
 */

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{"status": 1}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

describe('configuration gate', () => {
  it('is a silent no-op without a key — nothing is sent, nothing errors', async () => {
    expect(isAnalyticsConfigured()).toBe(false);
    await capture('quote_created', { organization_id: 'org-1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends to the PostHog capture endpoint when configured', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    await capture('quote_created', { organization_id: 'org-1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://us.i.posthog.com/capture/');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'quote_created',
      properties: { organization_id: 'org-1' },
    });
    expect(body.distinct_id).toBeTruthy();
  });

  it('honors a custom ingestion host', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com/';
    await capture('signup_started');
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://eu.i.posthog.com/capture/');
  });
});

describe('PII never reaches properties', () => {
  it('strips the blocked keys and nested objects', () => {
    const clean = sanitizeEventProperties({
      organization_id: 'org-1',
      amount_bucket: 'mid',
      phone: '+528115551234',
      email: 'x@y.mx',
      rfc: 'XAXX010101000',
      clabe: '012345678901234567',
      client_name: 'Construcciones Maya',
      client: { phone: '+52...', rfc: '...' },
    });

    expect(clean).toEqual({ organization_id: 'org-1', amount_bucket: 'mid' });
  });

  it('applies the filter on the wire, not just in the helper', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    await capture('payment_confirmed', { organization_id: 'org-1', phone: '8115551234' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.properties.phone).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('8115551234');
  });
});

describe('analytics can never break the product', () => {
  it('swallows a rejected fetch', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(capture('signup_started')).resolves.toBeUndefined();
  });

  it('reuses one pseudonymous distinct_id per browser', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    await capture('signup_started');
    await capture('signup_completed');
    const first = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).distinct_id;
    const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).distinct_id;
    expect(first).toBe(second);
  });

  it('uses the explicit distinctId when the caller provides one (server paths)', async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    await capture('quote_signed', { organization_id: 'org-1' }, { distinctId: 'org:org-1' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.distinct_id).toBe('org:org-1');
  });
});

describe('funnel coverage — every event has a live call site', () => {
  // Exit criterion from #37: a funnel from signup_started to payment_confirmed.
  // This fails if an event is renamed or a call site is deleted without notice.
  const searchRoots = ['app', 'components', 'lib'];

  function collectSources(dir: string, found: string[] = []): string[] {
    const { readdirSync, statSync } = require('fs') as typeof import('fs');
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === '.next') continue;
        collectSources(full, found);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        found.push(full);
      }
    }
    return found;
  }

  const sources = searchRoots
    .flatMap((root) => collectSources(join(process.cwd(), root)))
    .filter((f) => !f.endsWith(join('lib', 'analytics.ts')))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  it.each([...FUNNEL_EVENTS])("'%s' is captured somewhere in app/, components/ or lib/", (event) => {
    expect(sources).toContain(`'${event}'`);
  });
});
