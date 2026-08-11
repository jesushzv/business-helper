/**
 * The one client-side signal that says "demo fixtures are legitimate here".
 *
 * `isDemoModeActive()` in lib/demoUtils.ts cannot be used for this: it ends in
 * `return true`, so on a real tenant it still answers yes. And a hook cannot
 * infer demo mode from a `503 BACKEND_NOT_CONFIGURED` either — collection GET
 * routes answer the demo deployment with 200 and an empty list, so that code
 * never appears on the read paths a hook uses.
 *
 * What is left is the build-time signal, which is what this reads. It was
 * written for #50 and lived privately inside `lib/hooks/useQuotes.ts`; it is
 * shared from here so the second and third caller cannot drift from it.
 *
 * Getting this wrong in either direction is a real defect: too permissive and a
 * paying tenant is shown fixtures as if they were their own records; too strict
 * and the marketing demo renders blank.
 */
export function isClientDemoMode(): boolean {
  // Deployment-level demo: an explicit build flag, or no Supabase to be real
  // against. Neither can be true for a paying tenant.
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return true;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return true;
  if (typeof window === 'undefined') return false;

  // The visitor opt-in — but never over a real session (#124). The flag is
  // planted by any `?demo=true` link, has no expiry, and nothing used to
  // clear it, so a visitor who once opened the tour and then signed up in the
  // same browser was served fixtures forever: their own clients, quotes and
  // ~$145,000 of cobranza owed by companies that do not exist, with `error`
  // null so nothing on screen contradicted it.
  //
  // Signing in is unambiguous evidence the visitor is not a sandbox tourist,
  // and this is the synchronous half of that: `DemoSessionExit` clears the
  // flags on mount, but it is async and only mounts in the dashboard chrome,
  // so hooks could fetch fixtures before it ever ran. Checking the session
  // cookie closes that window on the first read.
  if (hasSupabaseSessionCookie()) return false;

  try {
    return localStorage.getItem('business_helper_sandbox') === 'true';
  } catch {
    // Storage unavailable (Safari private mode throws) — not a demo signal.
    return false;
  }
}

/**
 * Is there a Supabase auth cookie in this browser?
 *
 * `@supabase/ssr` stores the session as `sb-<project-ref>-auth-token`, split
 * across `.0`/`.1` chunks when it is large. Matching the prefix covers both.
 * This is deliberately a *synchronous* check: `isClientDemoMode()` is called
 * during render by every data hook, so it cannot await `getSession()`.
 *
 * A cookie is evidence of a session, not proof it is still valid — an expired
 * one still reads. That is the right failure direction here: the cost of
 * believing a stale cookie is that a former tenant sees empty real data
 * instead of fixtures, while the cost of the opposite is a paying tenant
 * shown invented money.
 */
function hasSupabaseSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie);
}
