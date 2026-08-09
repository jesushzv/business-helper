'use client';

import { isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * Which third-party sign-in providers the Auth server will actually accept (#48).
 *
 * ## Why this has to be asked, rather than assumed
 *
 * `supabase.auth.signInWithOAuth()` cannot tell you a provider is disabled. It
 * builds the authorize URL client-side, calls `window.location.assign(url)` and
 * returns `{ data, error: null }` — the `error` is a hardcoded literal in
 * `_handleProviderSignIn`, not a result. So the `if (authError)` guard the
 * login and register pages were written with is dead code for this failure: by
 * the time the Auth server rejects the provider, the browser has already left
 * the app.
 *
 * What the user sees in that case is not a page of ours. GoTrue answers
 * `/auth/v1/authorize?provider=google` with a raw JSON body on a
 * `*.supabase.co` origin:
 *
 *     {"code":400,"error_code":"validation_failed",
 *      "msg":"Unsupported provider: provider is not enabled"}
 *
 * — English, unstyled, off-site, with no way back. That is the live state of
 * the production project as of 2026-08-09: `external.google` is `false`, and
 * `auth.identities` holds exactly one row, `provider=email`. No Google sign-in
 * has ever succeeded, which is precisely why #48's exit criteria are still open.
 *
 * `/auth/v1/settings` is the same Auth server reporting which providers it will
 * accept. It is a public, anon-key endpoint — no secret involved — and it is
 * the only source of truth available to the browser before the navigation
 * happens. Gating the button on it means the day the founder enables Google in
 * the Supabase dashboard, the button comes back on its own with no deploy.
 */

/** The providers this app offers a button for. */
export type OAuthProvider = 'google';

/**
 * Three states, deliberately distinct — this is not a boolean:
 *
 *   - `true`  — the Auth server accepts this provider.
 *   - `false` — it does not, or there is no Auth server configured at all.
 *               Only this state hides a button or refuses a click.
 *   - `null`  — unknown: the settings read failed. Nothing is claimed.
 *
 * `null` resolves permissively (the button stays, the click proceeds) and that
 * direction is deliberate. Collapsing unknown into `false` would hide a working
 * sign-in method on a network blip — and for a user whose only account is a
 * Google one, that is a lockout with no recovery path. The cost of being wrong
 * the other way is bounded: they reach the same off-site error the gate exists
 * to prevent, which is exactly where they were before this module.
 */
export type ProviderAvailability = boolean | null;

/**
 * Asks the Auth server which providers it accepts.
 *
 * Returns `false` when Supabase is not configured at all (the marketing demo
 * deployment): there is no Auth server, so no provider can work, and the
 * placeholder URL the client factory falls back to would send the user to a DNS
 * error. That is the same "absent is absent" rule the placeholder-token gotchas
 * in CLAUDE.md describe — a control that cannot work is not rendered live.
 */
export async function fetchOAuthProviderEnabled(
  provider: OAuthProvider
): Promise<ProviderAvailability> {
  if (!isSupabaseConfigured()) return false;

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !apikey) return false;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey },
    });
    if (!res.ok) return null;

    const body = await res.json();
    const enabled = body?.external?.[provider];
    // A body we cannot read is unknown, never "disabled" — inferring absence
    // from a shape we did not recognise would invent the same fact the tri-state
    // exists to avoid.
    return typeof enabled === 'boolean' ? enabled : null;
  } catch {
    return null;
  }
}
