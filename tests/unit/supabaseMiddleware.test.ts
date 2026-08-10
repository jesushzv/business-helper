import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The middleware once minted week-long `demo_mode` / `business_helper_sandbox`
 * cookies for every visitor who was not signed in yet — including the pass
 * through /login on the way to Google — and then honored those cookies
 * *before* looking at the session. A completed OAuth sign-in therefore kept
 * landing on the sandbox dashboard: the cookie short-circuit re-extended
 * itself on every request and the session was never consulted again.
 *
 * The contract pinned here: demo is a property of the deployment (env), never
 * of the request; an unauthenticated caller is never granted demo cookies
 * (API convention #5); and a real session actively purges stale demo cookies.
 */

const mockGetUser = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mockGetUser } })),
}));

import { updateSession } from '@/lib/supabase/middleware';
import { createServerClient } from '@supabase/ssr';

function makeRequest(url: string, cookies: Record<string, string> = {}): NextRequest {
  const request = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

const DEMO_COOKIES = ['demo_mode', 'business_helper_sandbox', 'sandbox'];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'real-anon-key');
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
  vi.stubEnv('IS_SANDBOX', '');
  mockGetUser.mockResolvedValue({ data: { user: null } });
});

describe('updateSession on a configured deployment', () => {
  it('sets NO demo cookies for an unauthenticated visitor', async () => {
    const response = await updateSession(makeRequest('https://app.test/login'));

    for (const name of DEMO_COOKIES) {
      expect(response.cookies.get(name)).toBeUndefined();
    }
  });

  it('sets NO demo cookies even when the URL asks with ?demo=true', async () => {
    const response = await updateSession(makeRequest('https://app.test/dashboard?demo=true'));

    for (const name of DEMO_COOKIES) {
      expect(response.cookies.get(name)).toBeUndefined();
    }
  });

  it('consults the session even when a stale sandbox cookie is present', async () => {
    await updateSession(
      makeRequest('https://app.test/dashboard', { business_helper_sandbox: 'true' })
    );

    expect(createServerClient).toHaveBeenCalled();
    expect(mockGetUser).toHaveBeenCalled();
  });

  it('purges stale demo cookies once a real session exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await updateSession(
      makeRequest('https://app.test/dashboard', {
        demo_mode: 'true',
        business_helper_sandbox: 'true',
      })
    );

    for (const name of ['demo_mode', 'business_helper_sandbox']) {
      const purged = response.cookies.get(name);
      expect(purged?.value).toBe('');
      expect(purged?.maxAge).toBe(0);
    }
  });

  it('does not touch demo cookie names the request never carried', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await updateSession(makeRequest('https://app.test/dashboard'));

    for (const name of DEMO_COOKIES) {
      expect(response.cookies.get(name)).toBeUndefined();
    }
  });
});

describe('updateSession on the demo deployment', () => {
  it('short-circuits without a Supabase client when unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    await updateSession(makeRequest('https://app.test/dashboard'));

    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('short-circuits when NEXT_PUBLIC_DEMO_MODE is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

    await updateSession(makeRequest('https://app.test/dashboard'));

    expect(createServerClient).not.toHaveBeenCalled();
  });
});

describe('updateSession bypass paths', () => {
  it('leaves API routes untouched', async () => {
    await updateSession(makeRequest('https://app.test/api/quotes'));

    expect(createServerClient).not.toHaveBeenCalled();
  });
});
