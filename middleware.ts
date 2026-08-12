import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  try {
    const response = await updateSession(request);
    if (response && typeof response === 'object' && 'headers' in response) {
      return response;
    }
    return NextResponse.next({ request });
  } catch (error) {
    console.error('Middleware execution exception:', error);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (/api/*)
     * - monitoring (Sentry's tunnel route — see `tunnelRoute` in next.config.ts)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static image/asset extensions
     *
     * `monitoring` is not under `/api`, so without naming it here every error
     * report would be run through Supabase session refresh and, for a signed-out
     * visitor, redirected — losing exactly the reports from the sessions most
     * likely to have broken.
     */
    '/((?!api|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
