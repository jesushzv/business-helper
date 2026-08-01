const { NextResponse } = require('next/server');

async function updateSession(request) {
  const pathname = request ? request.nextUrl?.pathname || '' : '';
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');
  
  if (isProtected && request?.nextUrl) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  
  if (typeof NextResponse !== 'undefined' && NextResponse.next && request) {
    return NextResponse.next({ request });
  }
  
  return { status: 200 };
}

module.exports = {
  updateSession,
};


