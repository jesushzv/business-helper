import { describe, it, expect } from 'vitest';
import { getHealthStatus, auditEnvironmentSecrets, supabaseProjectRef } from '@/lib/health';

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

describe('supabaseProjectRef (#121)', () => {
  it('takes the project ref from a Supabase URL', () => {
    expect(supabaseProjectRef('https://dfyoavffxzujvxvnsizi.supabase.co')).toBe(
      'dfyoavffxzujvxvnsizi'
    );
    expect(supabaseProjectRef('https://dfyoavffxzujvxvnsizi.supabase.co/')).toBe(
      'dfyoavffxzujvxvnsizi'
    );
  });

  it('answers null rather than guessing', () => {
    // A guess here is worse than an absence: `verify:webhook` compares this
    // against an operator-supplied ref to decide whether it may write, so a
    // fabricated value could match nothing — or something.
    expect(supabaseProjectRef(undefined)).toBeNull();
    expect(supabaseProjectRef(null)).toBeNull();
    expect(supabaseProjectRef('')).toBeNull();
    expect(supabaseProjectRef('not a url')).toBeNull();
    expect(supabaseProjectRef('dfyoavffxzujvxvnsizi.supabase.co')).toBeNull();
  });

  it('never returns anything but the subdomain', () => {
    // Whatever it returns is printed and compared; it must never carry a
    // credential, a path or a query.
    const ref = supabaseProjectRef('https://abc123.supabase.co/rest/v1?apikey=secret');
    expect(ref).toBe('abc123');
    expect(ref).not.toContain('secret');
  });
});
