import { describe, it, expect, beforeEach } from 'vitest';
import { isDemoModeActive, DEMO_ORGANIZATION } from '@/lib/demoUtils';

describe('Demo / sandbox mode detection', () => {
  beforeEach(() => {
    localStorage.clear();
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
});

describe('Demo organization fixture', () => {
  it('identifies the seeded demo tenant', () => {
    expect(DEMO_ORGANIZATION.id).toBe('org-demo-1');
    expect(DEMO_ORGANIZATION.contact_name).toBe('Don Roberto');
  });
});
