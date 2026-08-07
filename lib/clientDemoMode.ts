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
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (typeof window !== 'undefined' &&
      localStorage.getItem('business_helper_sandbox') === 'true')
  );
}
