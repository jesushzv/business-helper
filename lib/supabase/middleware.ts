import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Demo cookies older builds minted (and lib/demoUtils.ts still sets for the
 * explicit ?demo=true opt-in). A real session actively purges them below.
 */
const DEMO_COOKIE_NAMES = ['demo_mode', 'business_helper_sandbox', 'sandbox'];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;

  // Bypass auth checks for API endpoints and static assets to prevent invocation failures
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
  const isPlaceholderUrl = !process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl.includes('placeholder');
  const isSandboxEnv = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.IS_SANDBOX === 'true';

  /**
   * Demo mode is a property of the deployment, never of the request. This
   * used to also trust a `demo_mode`/`business_helper_sandbox` cookie — and
   * mint one, week-long, for every visitor who was not signed in yet. One
   * pass through /login on the way to Google was enough to get stamped, and
   * the cookie branch short-circuited *before* the session was consulted, so
   * a completed OAuth sign-in still landed on the sandbox dashboard forever
   * (each request re-extended the cookie). Client-side demo browsing needs no
   * server cookie: ?demo=true is handled in lib/demoUtils.ts.
   */
  if (isPlaceholderUrl || isSandboxEnv) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // A real session voids any lingering demo cookie, whether it came from
      // an old build's minting or from demo browsing before the sign-in.
      for (const name of DEMO_COOKIE_NAMES) {
        if (request.cookies.get(name)) {
          supabaseResponse.cookies.set(name, '', { path: '/', maxAge: 0 });
        }
      }
    }
    // No user: an unauthenticated visitor is simply unauthenticated — never
    // granted demo state by the server (the demo is a client-side opt-in).
  } catch (error) {
    console.error('Middleware session update error:', error);
  }

  return supabaseResponse;
}
