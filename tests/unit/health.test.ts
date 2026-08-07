import { describe, it, expect } from 'vitest';
import { getHealthStatus, auditEnvironmentSecrets } from '@/lib/health';

describe('Production health payload', () => {
  it('reports healthy with both database and auth configured', () => {
    const health = getHealthStatus({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test_anon_key',
    });

    expect(health.status).toBe('healthy');
    expect(health.services).toEqual({ database: 'connected', auth: 'active' });
    expect(typeof health.timestamp).toBe('string');
  });
});

describe('Environment secret auditor', () => {
  it('passes when every required variable is present', () => {
    const audit = auditEnvironmentSecrets({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test_anon_key',
      NEXT_PUBLIC_APP_URL: 'https://businesshelper.app',
    });

    expect(audit.isReadyForProduction).toBe(true);
    expect(audit.missingRequired).toEqual([]);
    expect(audit.appUrl).toBe('https://businesshelper.app');
  });

  it('names the missing variables rather than reporting readiness', () => {
    const audit = auditEnvironmentSecrets({});

    expect(audit.isReadyForProduction).toBe(false);
    expect(audit.missingRequired).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('counts the third-party integrations that are wired up', () => {
    const audit = auditEnvironmentSecrets({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test_anon_key',
      NEXT_PUBLIC_APP_URL: 'https://businesshelper.app',
      STRIPE_SECRET_KEY: 'sk_test_123',
      SENTRY_DSN: 'https://123@sentry.io/1',
    });

    expect(audit.configuredThirdPartyCount).toBe(2);
    expect(audit.activeThirdPartyKeys).toEqual(['STRIPE_SECRET_KEY', 'SENTRY_DSN']);
  });
});
