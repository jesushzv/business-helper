/* eslint-disable @typescript-eslint/no-require-imports */
const { NextResponse } = require('next/server');


async function updateSession(request) {
  let supabaseResponse;
  if (typeof NextResponse !== 'undefined' && NextResponse.next && request) {
    supabaseResponse = NextResponse.next({ request });
  } else {
    supabaseResponse = { status: 200, headers: new Map() };
  }

  const pathname = request ? request.nextUrl?.pathname || '' : '';
  const searchParams = request?.nextUrl?.searchParams;
  const isDemoQuery = searchParams?.get('demo') === 'true' || searchParams?.get('sandbox') === 'true';

  if (supabaseResponse.cookies && isDemoQuery) {
    try {
      supabaseResponse.cookies.set('demo_mode', 'true', { path: '/', maxAge: 60 * 60 * 24 * 7 });
    } catch {
      // Cookie set fallback
    }
  }

  return supabaseResponse;
}

module.exports = {
  updateSession,
};


