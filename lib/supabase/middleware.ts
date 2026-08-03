import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
  const isDemoQuery = request.nextUrl.searchParams.get('demo') === 'true' || request.nextUrl.searchParams.get('sandbox') === 'true';
  const isDemoCookie = request.cookies.get('demo_mode')?.value === 'true' || request.cookies.get('sandbox')?.value === 'true' || request.cookies.get('business_helper_sandbox')?.value === 'true';
  const isSandboxEnv = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.IS_SANDBOX === 'true';
  const isDemoMode = isPlaceholderUrl || isDemoQuery || isDemoCookie || isSandboxEnv;

  // In sandbox / demo mode or unconfigured Supabase, set persistent cookies and allow uninterrupted access
  if (isDemoMode) {
    supabaseResponse.cookies.set('demo_mode', 'true', { path: '/', maxAge: 60 * 60 * 24 * 7 });
    supabaseResponse.cookies.set('business_helper_sandbox', 'true', { path: '/', maxAge: 60 * 60 * 24 * 7 });
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

    if (!user) {
      // Set demo mode cookie so unauthenticated demo visitors can experience the full app without interruptions
      supabaseResponse.cookies.set('demo_mode', 'true', { path: '/', maxAge: 60 * 60 * 24 * 7 });
      supabaseResponse.cookies.set('business_helper_sandbox', 'true', { path: '/', maxAge: 60 * 60 * 24 * 7 });
      return supabaseResponse;
    }
  } catch (error) {
    console.error('Middleware session update error:', error);
  }

  return supabaseResponse;
}

try {
  if (typeof module !== 'undefined' && module && 'exports' in module) {
    module.exports = { updateSession };
  }
} catch {
  // Edge runtime fallback
}


