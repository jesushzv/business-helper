async function updateSession(request) {
  const pathname = request ? request.nextUrl?.pathname || '' : '';
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) {
    return { status: 307, redirect: '/login' };
  }
  return { status: 200 };
}

module.exports = {
  updateSession,
};

