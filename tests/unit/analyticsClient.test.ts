import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAnalyticsDistinctId,
  hasFullCookieConsent,
  resetEphemeralAnalyticsId,
  trackClientEvent,
} from '@/lib/analyticsClient';

/**
 * The browser half of issue #37.
 *
 * The cookie notice offers "Aceptar Todo" and "Solo Esenciales" and declares
 * essential cookies plus anonymous navigation analytics. These tests pin that
 * distinction: full consent may persist an identifier on the device,
 * essential-only may not, and events are recorded in both cases because
 * anonymous analytics is what the notice says we do.
 */

describe('consent-aware identity', () => {
  beforeEach(() => {
    localStorage.clear();
    resetEphemeralAnalyticsId();
  });

  it('persists an anonymous id only under full consent', () => {
    localStorage.setItem('bh_cookie_consent', 'all');
    expect(hasFullCookieConsent()).toBe(true);

    const first = getAnalyticsDistinctId();
    expect(first).toBeTruthy();
    expect(localStorage.getItem('bh_anon_id')).toBe(first);

    // A returning visitor is the same person in the funnel.
    resetEphemeralAnalyticsId();
    expect(getAnalyticsDistinctId()).toBe(first);
  });

  it('stores nothing on the device under essential-only consent', () => {
    localStorage.setItem('bh_cookie_consent', 'essential');
    expect(hasFullCookieConsent()).toBe(false);

    const id = getAnalyticsDistinctId();
    expect(id).toBeTruthy();
    expect(localStorage.getItem('bh_anon_id')).toBeNull();

    // Stable within the page, forgotten when it unloads.
    expect(getAnalyticsDistinctId()).toBe(id);
    resetEphemeralAnalyticsId();
    expect(getAnalyticsDistinctId()).not.toBe(id);
  });

  it('treats an undecided visitor as essential-only', () => {
    expect(hasFullCookieConsent()).toBe(false);
    getAnalyticsDistinctId();
    expect(localStorage.getItem('bh_anon_id')).toBeNull();
  });
});

describe('trackClientEvent', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    resetEphemeralAnalyticsId();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to our own endpoint, never to a third party', () => {
    trackClientEvent('signup_started', { prefilled: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/analytics/event');
    expect(init.keepalive).toBe(true);

    const body = JSON.parse(init.body);
    expect(body.event).toBe('signup_started');
    expect(body.properties).toEqual({ prefilled: true });
    expect(body.anonymousId).toBeTruthy();
  });

  it('does not throw when the endpoint is unreachable', () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => trackClientEvent('quote_sent', { quote_id: 'q-1' })).not.toThrow();

    fetchMock.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => trackClientEvent('quote_sent')).not.toThrow();
  });
});
