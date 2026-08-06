import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

/**
 * Service-role Supabase client.
 *
 * Public (unauthenticated) surfaces — the shared quote link, the SPEI payment
 * page, the Stripe webhook — used to reach the database through the anon key,
 * which meant their access was governed by RLS policies written permissively
 * enough to let those flows work. Those policies (`public_token IS NOT NULL`)
 * were tautologies that exposed every tenant's rows to anyone holding the
 * publishable anon key.
 *
 * The fix inverts the trust model: no anon policy grants public access at all,
 * and these routes use the service role instead, which bypasses RLS. That makes
 * scoping the caller's responsibility, so every query issued with this client
 * MUST filter by the exact secret token supplied in the request. Never widen a
 * query here to return a set the caller did not already prove they can name.
 *
 * This module must never be imported from a Client Component — the key it reads
 * is server-only and is deliberately not prefixed with NEXT_PUBLIC_.
 */

export function isServiceRoleConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(
    url &&
    key &&
    !url.includes('placeholder-url') &&
    url.startsWith('https://')
  );
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for public token access'
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
