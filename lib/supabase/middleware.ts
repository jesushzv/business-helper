import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Demo cookies older builds minted (and lib/demoUtils.ts still sets for the
 * explicit ?demo=true opt-in). A real session actively purges them below.
 */
const DEMO_COOKIE_NAMES = ['demo_mode', 'business_helper_sandbox', 'sandbox'];

/**
 * The signed-in surface: every route group under app/(dashboard)/. A visitor
 * here without a session used to get the full app shell with every fetch
 * answering 401 — a wall of error states with no "inicia sesión" anywhere,
 * which reads as "the app is broken", not "you are signed out" (#248).
 * Deliberately excludes /onboarding: a fresh signup is pushed there in the
 * same tick its session cookie is being written, and a race here would
 * bounce a brand-new tenant to the login form.
 */
const PROTECTED_PREFIXES = [
  '/assistant',
  '/clients',
  '/dashboard',
  '/help',
  '/invoices',
  '/products',
  '/quotes',
  '/receivables',
  '/settings',
  '/team',
];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Whether this request belongs to a client-side demo tour. The dashboard
 * renders demo fixtures for a signed-out browser that opted in via
 * ?demo=true — that opt-in lives in localStorage, which the server cannot
 * see, but the entry navigation carries the query param and
 * lib/demoUtils.ts plants a `demo_mode` cookie for the navigations after
 * it. This function only declines to *block*; it never grants demo state —
 * the client still decides what to render, and a real session purges these
 * cookies below.
 */
function carriesDemoOptIn(request: NextRequest): boolean {
  const params = request.nextUrl.searchParams;
  if (params.get('demo') === 'true' || params.get('sandbox') === 'true') return true;
  return DEMO_COOKIE_NAMES.some((name) => request.cookies.get(name)?.value === 'true');
}

/**
 * Whether the browser carries a Supabase auth cookie (`sb-<ref>-auth-token`,
 * possibly chunked). Its absence is the one *deterministic* signed-out signal
 * available here: `getUser()` answers `user: null` both for "no session" and
 * for "Auth server unreachable", and redirecting on the second would lock
 * every tenant out during a GoTrue blip (#64's tri-state, again). A carried
 * cookie that fails validation stays on the page — the app shell redirects on
 * the API's authoritative 401 instead.
 */
function carriesAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'));
}

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
    } else if (
      isProtectedPage(pathname) &&
      !carriesDemoOptIn(request) &&
      !carriesAuthCookie(request)
    ) {
      // Definitively signed out on the signed-in surface → the login form,
      // carrying the page they wanted so a successful sign-in returns them to
      // it (#248). An unauthenticated visitor is still never granted demo
      // state by the server; the demo opt-in check above only declines to
      // block.
      return NextResponse.redirect(
        new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url)
      );
    }
  } catch (error) {
    // Fail open: an unreachable Auth server means the session is *unknown*,
    // not absent (#64's tri-state) — redirecting here would lock every tenant
    // out during a GoTrue blip. The API routes still 401 on their own.
    console.error('Middleware session update error:', error);
  }

  return supabaseResponse;
}
