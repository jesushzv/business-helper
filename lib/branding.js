/**
 * Business Helper — White-Labeling & Organization Branding Engine (CommonJS)
 */

const DEFAULT_BRANDING = {
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  companyName: 'Business Helper',
  logoUrl: null,
  tagline: 'Gestión Inteligente de Cotizaciones y Cobranza',
  hasCustomLogo: false,
};

function getOrganizationBranding(orgData = {}) {
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

function generateThemeCssVariables(config = {}) {
  const branding = getOrganizationBranding(config);
  const primaryHover = branding.primaryColor === '#2563eb' ? '#1d4ed8' : branding.primaryColor;

  return {
    '--primary-color': branding.primaryColor,
    '--primary-hover': primaryHover,
    '--header-bg': branding.primaryColor,
    '--accent-color': branding.secondaryColor || '#1e40af',
  };
}

module.exports = {
  DEFAULT_BRANDING,
  getOrganizationBranding,
  generateThemeCssVariables,
};
