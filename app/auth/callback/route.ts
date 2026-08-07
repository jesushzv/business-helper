import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { track } from '@/lib/analytics';

/**
 * OAuth callback — the missing half of "Continuar con Google" (#48).
 *
 * The login and register pages start the flow with
 * `signInWithOAuth({ redirectTo: <origin>/auth/callback })`; the provider
 * returns here with a `?code=` that has to be exchanged for a session before
 * any cookie exists. Until this route existed, completing the Google consent
 * screen landed on a 404 and no session was ever created.
 *
 * Where the user lands depends on whether they already have an organization:
 * a brand-new Google account has none and needs onboarding; a returning user
 * goes to the dashboard (or the validated `next` path an invitation carried).
 */

/** Same-site relative paths only, so `next` cannot become an open redirect. */
function safeNextPath(next: string | null): string | null {
  return next && /^\/[^/\\]/.test(next) ? next : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (!isSupabaseConfigured() || !code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  // Mirrors the requireOrgAccess lookup: owner first, then membership.
  const { data: owned } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);

  let hasOrganization = Boolean(owned && owned.length > 0);
  if (!hasOrganization) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1);
    hasOrganization = Boolean(membership && membership.length > 0);
  }

  if (!hasOrganization) {
    // First arrival with this Google account: the email/password branch fires
    // this in the register page; the OAuth branch has no client-side moment
    // where a session is known to exist, so it fires here.
    track('signup_completed', { provider: 'google' }, { distinctId: user.id });
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  return NextResponse.redirect(`${origin}${next || '/dashboard'}`);
}
