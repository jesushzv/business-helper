import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { normalizeTierKey } from '@/lib/stripe';
import { getAppBaseUrl } from '@/lib/url';

/**
 * The one entry point for "I want this plan".
 *
 * Every plan CTA — the pricing page, the landing page's pricing block, the
 * folio calculator's recommendation, the tier comparison modal — used to link
 * straight to `/register?plan=…`, with no idea who was clicking. So an owner
 * who already had an account and wanted to *upgrade* was handed a registration
 * form: the one page that cannot sell them anything, asking for a business they
 * had already created. And `?plan=` was read by nobody — not by the register
 * page, which pulls `businessName`, `rfc`, `phone` and `email` off the query
 * and never `plan` — so the tier they picked was dropped at the first hop even
 * when registration was the right destination.
 *
 * The decision needs the session, and the session lives on the server, so it is
 * made here rather than in a client component: a hook would render *some* href
 * before it knows the answer, and the wrong one is the bug being fixed (the
 * three-state rule in `docs/LESSONS.md` — unknown is not "signed out").
 *
 *   no session            -> /register?plan=…   (sign up, then come back to it)
 *   session, no org       -> /onboarding?plan=… (the org is what a plan attaches to)
 *   session with an org   -> /settings?plan=…   (the only page that can charge)
 *
 * The tier is normalized through `normalizeTierKey`, so the aliases the
 * marketing pages use (`starter`/`pro`/`business`) arrive as the canonical id
 * the billing card matches on. An unknown or missing plan is not guessed: it
 * goes to the destination without one.
 */

// Reads cookies to decide; must never be cached.
export const dynamic = 'force-dynamic';

function destination(path: string, tier: string | null, request: Request): URL {
  // Same-origin by construction: the URL is built from this request's origin,
  // never from a literal (`lib/url.ts` is the only builder of app URLs, and
  // `tests/unit/url.test.ts` fails the build on a hardcoded one).
  let origin: string;
  try {
    origin = new URL(request.url).origin;
  } catch {
    origin = getAppBaseUrl();
  }

  const url = new URL(path, origin);
  if (tier) url.searchParams.set('plan', tier);
  return url;
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get('plan') || '';
  const tier = normalizeTierKey(requested);

  // No backend configured (the marketing demo deployment): there is no session
  // to read, and signing up is the honest next step.
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(destination('/register', tier, request));
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(destination('/register', tier, request));
    }

    const { data: owned } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1);

    if (owned && owned.length > 0) {
      return NextResponse.redirect(destination('/settings', tier, request));
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1);

    if (membership && membership.length > 0) {
      // A member lands on the same page an owner does. The billing card is
      // where the plan lives; whether they may buy is the checkout route's call
      // (`billing_management`), not a redirect's.
      return NextResponse.redirect(destination('/settings', tier, request));
    }

    return NextResponse.redirect(destination('/onboarding', tier, request));
  } catch {
    // A read that failed tells us nothing about who is signed in, and guessing
    // "signed out" is how an owner ends up in the registration form again.
    // Onboarding resumes at the right step for an existing account and is
    // reachable either way.
    return NextResponse.redirect(destination('/onboarding', tier, request));
  }
}
