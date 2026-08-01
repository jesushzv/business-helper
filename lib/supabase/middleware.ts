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
  const isDemoQuery = request.nextUrl.searchParams.get('demo') === 'true';
  const isDemoCookie = request.cookies.get('demo_mode')?.value === 'true';
  const isDemoMode = isPlaceholderUrl || isDemoQuery || isDemoCookie;

  // In demo mode or unconfigured Supabase, bypass remote auth network call immediately
  if (isDemoMode) {
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

    if (!user && (pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding'))) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
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


