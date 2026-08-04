import { describe, it, expect } from 'vitest';
import { isSentryConfigured, formatErrorPayload, captureException, captureMessage } from '@/lib/sentry';

describe('Sentry Monitoring & Error Handler Engine Suite', () => {
  it('should validate Sentry DSN syntax correctly in isSentryConfigured', () => {
    expect(isSentryConfigured({})).toBe(false);
    expect(
      isSentryConfigured({
        NEXT_PUBLIC_SENTRY_DSN: 'https://key@sentry.io/12345',
      })
    ).toBe(true);
    expect(
      isSentryConfigured({
        NEXT_PUBLIC_SENTRY_DSN: 'invalid_dsn',
      })
    ).toBe(false);
  });

  it('should construct structured payload with organization_id and route tags in formatErrorPayload', () => {
    const err = new Error('Test DB Connection Error');
    const payload = formatErrorPayload(err, {
      organization_id: 'org_demo_123',
      route: '/api/quotes',
      level: 'error',
    });
    expect(payload.name).toBe('Error');
    expect(payload.message).toBe('Test DB Connection Error');
    expect(payload.tags.organization_id).toBe('org_demo_123');
    expect(payload.tags.route).toBe('/api/quotes');
    expect(payload.tags.severity).toBe('error');
  });

  it('should capture exception without throwing when DSN is absent', () => {
    const res = captureException(new Error('Network timeout'), { route: '/dashboard' }, {});
    expect(res.handled).toBe(true);
    expect(res.dispatchedToSentry).toBe(false);
    expect(('message' in res.payload) ? res.payload.message : '').toBe('Network timeout');
  });

  it('should log warning and info message alerts cleanly', () => {
    const res = captureMessage('Rate limit threshold warning', 'warning', {
      organization_id: 'org_rate_1',
    });
    expect(res.handled).toBe(true);
    expect(res.payload.message).toBe('Rate limit threshold warning');
    expect('level' in res.payload ? res.payload.level : 'warning').toBe('warning');
  });
});
