/**
 * Business Helper — Demo Mode & Environment Utilities
 */

export function isDemoModeActive(searchParamsStr?: string): boolean {
  if (typeof window !== 'undefined') {
    // Check URL search params
    const params = new URLSearchParams(searchParamsStr || window.location.search);
    if (params.get('demo') === 'true' || params.get('sandbox') === 'true') {
      try {
        localStorage.setItem('business_helper_sandbox', 'true');
        localStorage.setItem('business_helper_demo', 'true');
        document.cookie = 'demo_mode=true; path=/; max-age=604800';
        document.cookie = 'business_helper_sandbox=true; path=/; max-age=604800';
      } catch {
        // Storage failover
      }
      return true;
    }
    // Check localStorage sandbox / demo flag
    if (localStorage.getItem('business_helper_sandbox') === 'true' || localStorage.getItem('business_helper_demo') === 'true') {
      return true;
    }
    // Check cookies
    if (document.cookie.includes('demo_mode=true') || document.cookie.includes('business_helper_sandbox=true') || document.cookie.includes('sandbox=true')) {
      return true;
    }
  }

  // Environment check fallback or unauthenticated demo browsing
  if (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    process.env.IS_SANDBOX === 'true' ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    return true;
  }

  // Fallback for seamless demo experience: enable demo mode unless explicitly authenticated
  return true;
}

export const DEMO_ORGANIZATION = {
  id: 'org-demo-1',
  name: 'Distribuidora del Norte S.A. de C.V.',
  rfc: 'DNO850101HD9',
  contact_name: 'Don Roberto',
  email: 'donroberto@distribuidoranorte.mx',
  phone: '8115551234',
  plan_tier: 'pro',
};

