import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isDemoModeActive, exitDemoMode, hasRuntimeDemoFlags, DEMO_ORGANIZATION } from '@/lib/demoUtils';

function expireDemoCookies() {
  for (const name of ['demo_mode', 'business_helper_sandbox', 'sandbox']) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe('Demo / sandbox mode detection', () => {
  beforeEach(() => {
    localStorage.clear();
    expireDemoCookies();
    vi.unstubAllEnvs();
    // Vitest has no NEXT_PUBLIC_SUPABASE_URL, which alone reads as the demo
    // deployment — stub a configured one so these tests exercise the
    // real-tenant branch (see LESSONS.md, client/server state).
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  });

  it('activates on ?demo=true', () => {
    expect(isDemoModeActive('demo=true')).toBe(true);
  });

  it('activates on ?sandbox=true', () => {
    expect(isDemoModeActive('sandbox=true')).toBe(true);
  });

  it('persists the flag so the next navigation stays in demo mode', () => {
    isDemoModeActive('demo=true');

    expect(localStorage.getItem('business_helper_sandbox')).toBe('true');
  });

  /**
   * The function used to end in `return true` — "demo unless explicitly
   * authenticated" — which put the DEMO banner on every real production
   * session, Google sign-ins included. A configured deployment with no demo
   * flag anywhere is a real tenant.
   */
  it('is OFF for a real tenant: configured deployment, no flags, no params', () => {
    expect(isDemoModeActive()).toBe(false);
  });

  it('stays ON for the unconfigured demo deployment', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(isDemoModeActive()).toBe(true);
  });

  it('activates from a lingering sandbox cookie', () => {
    document.cookie = 'business_helper_sandbox=true; path=/';
    expect(isDemoModeActive()).toBe(true);
  });
});

describe('exitDemoMode — a real sign-in ends the demo', () => {
  beforeEach(() => {
    localStorage.clear();
    expireDemoCookies();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  });

  it('clears the localStorage flags and cookies that ?demo=true planted', () => {
    isDemoModeActive('demo=true');
    expect(hasRuntimeDemoFlags()).toBe(true);

    exitDemoMode();

    expect(localStorage.getItem('business_helper_sandbox')).toBeNull();
    expect(localStorage.getItem('business_helper_demo')).toBeNull();
    expect(document.cookie).not.toContain('demo_mode=true');
    expect(document.cookie).not.toContain('business_helper_sandbox=true');
    expect(hasRuntimeDemoFlags()).toBe(false);
    expect(isDemoModeActive()).toBe(false);
  });

  it('also clears the week-long cookies older middleware builds minted', () => {
    document.cookie = 'demo_mode=true; path=/';
    document.cookie = 'business_helper_sandbox=true; path=/';
    expect(hasRuntimeDemoFlags()).toBe(true);

    exitDemoMode();

    expect(hasRuntimeDemoFlags()).toBe(false);
  });
});

describe('Demo organization fixture', () => {
  it('identifies the seeded demo tenant', () => {
    expect(DEMO_ORGANIZATION.id).toBe('org-demo-1');
    expect(DEMO_ORGANIZATION.contact_name).toBe('Don Roberto');
  });
});
