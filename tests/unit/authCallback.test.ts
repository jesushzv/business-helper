import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #48 — /auth/callback is the missing half of "Continuar con Google".
 *
 * The OAuth provider returns a ?code= that must be exchanged for a session by
 * a route handler; without one the user finished the Google consent screen and
 * landed on a 404. These tests pin the exchange, the safe handling of `next`,
 * and where each kind of user lands.
 */

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
let ownedOrgs: Array<{ id: string }> = [];
let memberships: Array<{ organization_id: string }> = [];
let configured = true;

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => configured,
  createClient: async () => ({
    auth: { exchangeCodeForSession, getUser },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          limit: async () => ({
            data: table === 'organizations' ? ownedOrgs : memberships,
          }),
        }),
      }),
    }),
  }),
}));

const track = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => track(...args),
}));

import { GET } from '@/app/auth/callback/route';

function callbackRequest(query: string): Request {
  return new Request(`https://app.example.com/auth/callback${query}`);
}

function redirectTarget(res: Response): string {
  return res.headers.get('location') || '';
}

beforeEach(() => {
  vi.clearAllMocks();
  configured = true;
  ownedOrgs = [];
  memberships = [];
  exchangeCodeForSession.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('GET /auth/callback', () => {
  it('redirects to login with an error when no code is present', async () => {
    const res = await GET(callbackRequest(''));
    expect(redirectTarget(res)).toBe('https://app.example.com/login?error=oauth');
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('returns a user who declined consent to a clean login form, not an error', async () => {
    // The provider sends `error=access_denied` when the user presses Cancel on
    // the consent screen. Reporting "no se pudo completar" for a deliberate
    // choice states a failure that never happened.
    const res = await GET(callbackRequest('?error=access_denied&error_description=User+denied'));
    expect(redirectTarget(res)).toBe('https://app.example.com/login');
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('still reports an error for provider failures other than a declined consent', async () => {
    const res = await GET(callbackRequest('?error=server_error'));
    expect(redirectTarget(res)).toBe('https://app.example.com/login?error=oauth');
  });

  it('redirects to login with an error when the code exchange fails', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } });
    const res = await GET(callbackRequest('?code=abc'));
    expect(redirectTarget(res)).toBe('https://app.example.com/login?error=oauth');
  });

  it('redirects to login when Supabase is not configured', async () => {
    configured = false;
    const res = await GET(callbackRequest('?code=abc'));
    expect(redirectTarget(res)).toBe('https://app.example.com/login?error=oauth');
  });

  it('sends a first-time user (no organization) to onboarding and fires signup_completed', async () => {
    const res = await GET(callbackRequest('?code=abc'));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(redirectTarget(res)).toBe('https://app.example.com/onboarding');
    expect(track).toHaveBeenCalledWith(
      'signup_completed',
      { provider: 'google' },
      { distinctId: 'user-1' }
    );
  });

  it('sends a returning owner to the dashboard without re-firing signup_completed', async () => {
    ownedOrgs = [{ id: 'org-1' }];
    const res = await GET(callbackRequest('?code=abc'));
    expect(redirectTarget(res)).toBe('https://app.example.com/dashboard');
    expect(track).not.toHaveBeenCalled();
  });

  it('sends a returning member (non-owner) to the dashboard', async () => {
    memberships = [{ organization_id: 'org-2' }];
    const res = await GET(callbackRequest('?code=abc'));
    expect(redirectTarget(res)).toBe('https://app.example.com/dashboard');
  });

  it('honors a same-site next path for returning users', async () => {
    ownedOrgs = [{ id: 'org-1' }];
    const res = await GET(callbackRequest('?code=abc&next=/invitacion/tok123'));
    expect(redirectTarget(res)).toBe('https://app.example.com/invitacion/tok123');
  });

  it('ignores an absolute or protocol-relative next (no open redirect)', async () => {
    ownedOrgs = [{ id: 'org-1' }];
    for (const evil of ['//evil.example.com', 'https://evil.example.com', '/\\evil']) {
      const res = await GET(callbackRequest(`?code=abc&next=${encodeURIComponent(evil)}`));
      expect(redirectTarget(res)).toBe('https://app.example.com/dashboard');
    }
  });
});
