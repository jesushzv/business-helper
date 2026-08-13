import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCurrentOrg, __resetCurrentOrgCacheForTests } from '@/lib/hooks/useCurrentOrg';

/**
 * #93 — the chrome's identity hook. Real tenants get their own organization
 * from the API or neutral chrome; the demo persona is reachable only behind
 * the demo signal. Unknown must render as unknown, never as "Don Roberto".
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Real-tenant mode; no anon key, so the auth-user lookup is skipped and the
  // org still loads from the API (isSupabaseConfigured() stays false).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  __resetCurrentOrgCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('real tenant', () => {
  it('serves the organization from GET /api/organization, never the demo persona', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        organization: {
          id: 'org-1',
          name: 'Ferretería La Central',
          rfc: 'FCE900101AB1',
          logo_url: null,
          subscription_tier: 'inicial',
        },
        role: 'manager',
      })
    );
    const { result } = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.org?.name).toBe('Ferretería La Central');
    expect(result.current.org?.subscription_tier).toBe('inicial');
    expect(result.current.role).toBe('manager');
    expect(JSON.stringify(result.current)).not.toContain('Don Roberto');
  });

  it('renders neutral chrome (null org) on a failed read — never the demo identity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: 'boom' } }));
    const { result } = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.org).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('renders neutral chrome on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.org).toBeNull();
  });

  it('fetches once for many chrome consumers (module cache)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { organization: { id: 'org-1', name: 'X' }, role: 'owner' })
    );
    const first = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const second = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(second.result.current.org?.name).toBe('X');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * #248 — AppShell redirects on `denied` (401 → login, NO_ORGANIZATION →
 * onboarding), so it must be an *authoritative* signal: only the API's own
 * status + code pair sets it. Anything ambiguous stays null, because a
 * redirect fired off a network blip throws a healthy tenant out of their
 * dashboard mid-work.
 */
describe('denied — the authoritative signals the app shell redirects on (#248)', () => {
  it("reports 'unauthenticated' for the API's own 401 UNAUTHENTICATED", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sesión requerida' } })
    );
    const { result } = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.denied).toBe('unauthenticated');
  });

  it("reports 'no_organization' for 403 NO_ORGANIZATION", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        error: { code: 'NO_ORGANIZATION', message: 'La cuenta no pertenece a ninguna organización' },
      })
    );
    const { result } = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.denied).toBe('no_organization');
  });

  it('stays null (unknown) on a 500, a network failure, and the 503 demo deployment', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: 'boom' } }));
    const server = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(server.result.current.loading).toBe(false));
    expect(server.result.current.denied).toBeNull();

    __resetCurrentOrgCacheForTests();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const network = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(network.result.current.loading).toBe(false));
    expect(network.result.current.denied).toBeNull();

    __resetCurrentOrgCacheForTests();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Sin base de datos' } })
    );
    const demo = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(demo.result.current.loading).toBe(false));
    expect(demo.result.current.denied).toBeNull();
  });
});

describe('demo deployment', () => {
  it('serves the demo persona only behind the demo signal, without touching the network', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const { result } = renderHook(() => useCurrentOrg());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.org?.name).toBe('Distribuidora del Norte');
    expect(result.current.user?.name).toBe('Don Roberto');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
