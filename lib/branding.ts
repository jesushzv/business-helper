/**
 * Business Helper — White-Labeling & Organization Branding Engine
 * 
 * Provides customizable theme generation, logo fallbacks, and CSS custom property maps
 * for multi-tenant public quote portals (/q/[token]) and payment portals (/pay/[token]).
 */

export interface OrganizationBrandingConfig {
  primaryColor: string;
  secondaryColor?: string;
  companyName: string;
  logoUrl?: string | null;
  tagline?: string | null;
  hasCustomLogo: boolean;
}

export const DEFAULT_BRANDING: OrganizationBrandingConfig = {
  primaryColor: '#2563eb', // Default Tailwind Blue-600
  secondaryColor: '#1e40af', // Blue-800
  companyName: 'Business Helper',
  logoUrl: null,
  tagline: 'Gestión Inteligente de Cotizaciones y Cobranza',
  hasCustomLogo: false,
};

/**
 * Returns complete branding configuration for an organization with graceful fallbacks
 */
export function getOrganizationBranding(orgData: Partial<OrganizationBrandingConfig> & { name?: string; logo_url?: string; primary_color?: string } = {}): OrganizationBrandingConfig {
  const companyName = orgData.companyName || orgData.name || DEFAULT_BRANDING.companyName;
  const logoUrl = orgData.logoUrl || orgData.logo_url || null;
  const primaryColor = orgData.primaryColor || orgData.primary_color || DEFAULT_BRANDING.primaryColor;

  return {
    primaryColor,
    secondaryColor: orgData.secondaryColor || DEFAULT_BRANDING.secondaryColor,
    companyName,
    logoUrl,
    tagline: orgData.tagline || DEFAULT_BRANDING.tagline,
    hasCustomLogo: Boolean(logoUrl),
  };
}

/**
 * Generates dynamic CSS custom properties for inline theme application
 */
export function generateThemeCssVariables(config: Partial<OrganizationBrandingConfig> = {}): Record<string, string> {
  const branding = getOrganizationBranding(config);
  
  // Calculate slightly darker hover state shade
  const primaryHover = branding.primaryColor === '#2563eb' ? '#1d4ed8' : branding.primaryColor;

  return {
    '--primary-color': branding.primaryColor,
    '--primary-hover': primaryHover,
    '--header-bg': branding.primaryColor,
    '--accent-color': branding.secondaryColor || '#1e40af',
  };
}
