/**
 * Business Helper — Demo Mode & Environment Utilities
 */

export function isDemoModeActive(searchParamsStr?: string): boolean {
  if (typeof window !== 'undefined') {
    // Check URL search params
    const params = new URLSearchParams(searchParamsStr || window.location.search);
    if (params.get('demo') === 'true') {
      return true;
    }
    // Check localStorage sandbox / demo flag
    if (localStorage.getItem('business_helper_sandbox') === 'true' || localStorage.getItem('business_helper_demo') === 'true') {
      return true;
    }
  }

  // Environment check fallback
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return true;
  }

  return false;
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
