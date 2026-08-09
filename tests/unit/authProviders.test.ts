import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOAuthProviderEnabled } from '@/lib/authProviders';

/**
 * #48 — "Continuar con Google" must not be offered when the Auth server will
 * not accept Google.
 *
 * The production project answered `external.google: false` on 2026-08-09, and
 * `signInWithOAuth` cannot report that: it assigns `window.location` and
 * returns `error: null`, so the user lands on GoTrue's raw English JSON error
 * off-site. This suite pins the pre-flight read that closes that gap, and in
 * particular pins the tri-state — `null` (unknown) must never be reported as
 * `false`, because `false` is the only value that hides the button.
 *
 * NOTE: `isSupabaseConfigured()` reads NEXT_PUBLIC_SUPABASE_URL, which is unset
 * under Vitest. Every "real tenant" case below has to stub it, or the module
 * short-circuits to `false` and the assertion proves nothing (CLAUDE.md).
 */

const REAL_URL = 'https://real-project.supabase.co';
const REAL_KEY = 'real-anon-key';

function configureRealTenant() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', REAL_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', REAL_KEY);
}

function mockSettings(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchOAuthProviderEnabled', () => {
  it('reports true when the Auth server accepts the provider', async () => {
    configureRealTenant();
    mockSettings({ external: { google: true, email: true } });

    await expect(fetchOAuthProviderEnabled('google')).resolves.toBe(true);
  });

  it('reports false when the Auth server does not accept the provider', async () => {
    configureRealTenant();
    // The exact shape the production project returned on 2026-08-09.
    mockSettings({ external: { google: false, email: true, phone: false } });

    await expect(fetchOAuthProviderEnabled('google')).resolves.toBe(false);
  });

  it('reads /auth/v1/settings on the project origin, sending the anon key', async () => {
    configureRealTenant();
    const fetchMock = mockSettings({ external: { google: true } });

    await fetchOAuthProviderEnabled('google');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${REAL_URL}/auth/v1/settings`);
    expect((init as { headers: Record<string, string> }).headers.apikey).toBe(REAL_KEY);
  });

  it('does not double the slash when the configured URL has a trailing one', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `${REAL_URL}/`);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', REAL_KEY);
    const fetchMock = mockSettings({ external: { google: true } });

    await fetchOAuthProviderEnabled('google');

    expect(fetchMock.mock.calls[0][0]).toBe(`${REAL_URL}/auth/v1/settings`);
  });

  describe('unknown is never reported as disabled', () => {
    it('returns null when the settings request is not ok', async () => {
      configureRealTenant();
      mockSettings({}, false, 500);

      await expect(fetchOAuthProviderEnabled('google')).resolves.toBeNull();
    });

    it('returns null when the request throws', async () => {
      configureRealTenant();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      await expect(fetchOAuthProviderEnabled('google')).resolves.toBeNull();
    });

    it('returns null when the body cannot be parsed', async () => {
      configureRealTenant();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('not json');
          },
        })
      );

      await expect(fetchOAuthProviderEnabled('google')).resolves.toBeNull();
    });

    it('returns null when the body has no entry for the provider', async () => {
      configureRealTenant();
      mockSettings({ external: { email: true } });

      await expect(fetchOAuthProviderEnabled('google')).resolves.toBeNull();
    });

    it('returns null when the body has no external map at all', async () => {
      configureRealTenant();
      mockSettings({ saml_enabled: false });

      await expect(fetchOAuthProviderEnabled('google')).resolves.toBeNull();
    });
  });

  describe('unconfigured deployments', () => {
    it('reports false without a network call when Supabase is not configured', async () => {
      // No env stubs: this is the marketing demo / Vitest default.
      const fetchMock = mockSettings({ external: { google: true } });

      await expect(fetchOAuthProviderEnabled('google')).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports false for the placeholder credentials the client factory falls back to', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://placeholder-url.supabase.co');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-anon-key');
      const fetchMock = mockSettings({ external: { google: true } });

      await expect(fetchOAuthProviderEnabled('google')).resolves.toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
