/**
 * Business Helper — Demo Mode & Environment Utilities
 *
 * Demo mode has exactly two legitimate sources: the deployment itself (no
 * Supabase configured, or an explicit env flag) and an explicit visitor
 * opt-in (?demo=true / ?sandbox=true, persisted in localStorage + cookies so
 * the tour survives navigation). It is never the default: this function once
 * ended in `return true`, which put the DEMO chrome on every real production
 * session — Google sign-ins included.
 */

/** localStorage keys the ?demo=true opt-in plants. They have no expiry. */
const DEMO_STORAGE_KEYS = ['business_helper_sandbox', 'business_helper_demo'] as const;
/** Cookie names read as demo signals (older builds minted these server-side too). */
const DEMO_COOKIE_NAMES = ['demo_mode', 'business_helper_sandbox', 'sandbox'] as const;

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
    if (hasRuntimeDemoFlags()) {
      return true;
    }
  }

  // Deployment-level demo: env flag, or no Supabase to be real against.
  if (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    process.env.IS_SANDBOX === 'true' ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    return true;
  }

  return false;
}

/**
 * The demo signals a browser can carry at runtime — the localStorage flags
 * and cookies the ?demo=true opt-in (or an older middleware build) planted.
 * Deliberately excludes the env signals: callers use this to tell "this
 * browser opted into the demo" apart from "this deployment IS the demo".
 */
export function hasRuntimeDemoFlags(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (DEMO_STORAGE_KEYS.some((key) => localStorage.getItem(key) === 'true')) {
      return true;
    }
  } catch {
    // Storage unavailable — cookies below still answer.
  }
  return DEMO_COOKIE_NAMES.some((name) => document.cookie.includes(`${name}=true`));
}

/**
 * A real sign-in ends the demo. The localStorage flags never expire and the
 * cookies lasted a week, so without this a single click on "Ver Demo" kept
 * showing the sandbox dashboard *after* a successful Google OAuth — the
 * flags outlived the session that should have replaced them.
 */
export function exitDemoMode(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of DEMO_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable — nothing planted there to clear.
  }
  for (const name of DEMO_COOKIE_NAMES) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
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
