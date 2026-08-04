import { describe, it, expect } from 'vitest';
import { getOrganizationBranding, generateThemeCssVariables, DEFAULT_BRANDING } from '@/lib/branding';

describe('Branding & Customization Module', () => {
  it('should provide default brand colors and company name when unconfigured', () => {
    const branding = getOrganizationBranding({});
    expect(branding.companyName).toBe(DEFAULT_BRANDING.companyName);
    expect(branding.primaryColor).toBe(DEFAULT_BRANDING.primaryColor);
    expect(branding.hasCustomLogo).toBe(false);
  });

  it('should resolve custom logo URL, company name, and tagline', () => {
    const branding = getOrganizationBranding({
      name: 'Constructora Monterrey SA',
      logo_url: 'https://storage.businesshelper.mx/logos/constructora.png',
      primary_color: '#059669',
      tagline: 'Construyendo el futuro',
    });
    expect(branding.companyName).toBe('Constructora Monterrey SA');
    expect(branding.logoUrl).toBe('https://storage.businesshelper.mx/logos/constructora.png');
    expect(branding.primaryColor).toBe('#059669');
    expect(branding.hasCustomLogo).toBe(true);
  });

  it('should generate dynamic CSS custom properties (--primary-color, --header-bg)', () => {
    const vars = generateThemeCssVariables({ primaryColor: '#7c3aed' });
    expect(vars['--primary-color']).toBe('#7c3aed');
    expect(vars['--header-bg']).toBe('#7c3aed');
  });
});
