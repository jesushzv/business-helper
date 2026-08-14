import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (relativePath: string) => readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('Legal pages', () => {
  it('publishes an LFPDPPP privacy notice with ARCO rights', () => {
    const privacy = read('app/privacy/page.tsx');

    expect(privacy).toContain('Aviso de Privacidad');
    expect(privacy).toContain('LFPDPPP');
    expect(privacy).toContain('ARCO');
  });

  it('publishes terms covering the SaaS relationship and cancellation', () => {
    const terms = read('app/terms/page.tsx');

    expect(terms).toContain('Términos y Condiciones');
    expect(terms).toContain('Business Helper');
    expect(terms.includes('Cancelación') || terms.includes('cancelar')).toBe(true);
  });
});

describe('Registration form', () => {
  const register = read('app/(auth)/register/page.tsx');

  it('collects the RFC and WhatsApp number the CFDI and reminder flows need', () => {
    expect(register.toLowerCase()).toContain('rfc');
    expect(register.includes('phone') || register.includes('WhatsApp')).toBe(true);
  });

  it('requires consent linked to the privacy notice and terms', () => {
    expect(register).toContain('/privacy');
    expect(register).toContain('/terms');
    expect(register.includes('checkbox') || register.includes('acceptTerms')).toBe(true);
  });
});

describe('Dashboard navigation', () => {
  const DASHBOARD_PAGES = [
    'quotes',
    'receivables',
    'invoices',
    'products',
    'team',
    'assistant',
    'help',
    'clients',
    'dashboard',
    'settings',
  ];

  it.each(DASHBOARD_PAGES)('the %s page renders the shared Header', (page) => {
    // Directly, or through DashboardPageShell — whose own assertion below
    // closes the indirection.
    expect(read(join('app', '(dashboard)', page, 'page.tsx'))).toMatch(
      /<Header|<DashboardPageShell/
    );
  });

  it('DashboardPageShell renders the shared Header', () => {
    expect(read(join('components', 'layout', 'DashboardPageShell.tsx'))).toContain('<Header');
  });
});
