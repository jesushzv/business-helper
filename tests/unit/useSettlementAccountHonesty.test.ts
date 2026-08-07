import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSettlementAccount } from '@/lib/hooks/useSettlementAccount';

/**
 * #64 — the hook behind the settlement-account banner.
 *
 * Optimistic-fallback hooks are this repo's most repeated defect (#33, #50,
 * #58, #59), so this one is pinned the same way. The specific hazards here are
 * mirror images of each other:
 *
 *   - Claiming an account exists when the server never said so would leave the
 *     share actions enabled and the warning hidden, which is the bug the issue
 *     describes.
 *   - Claiming one is missing because a request failed would paste a red
 *     "nobody can pay you" banner across a healthy tenant's dashboard.
 *
 * Hence the tri-state: only a server answer moves `ready` off `null`.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // A configured deployment: without this the build-time demo signal is on and
  // the hook never reaches the network.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function mountHook() {
  const rendered = renderHook(() => useSettlementAccount());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe('useSettlementAccount', () => {
  it('reports ready when the organization has an 18-digit CLABE', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        organization: { id: 'org-1', bank_clabe: '012180001234567899' },
        role: 'owner',
      })
    );

    const { result } = await mountHook();

    expect(result.current.ready).toBe(true);
    expect(result.current.canFix).toBe(true);
  });

  it('reports not-ready when the organization has no CLABE', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { organization: { id: 'org-1', bank_clabe: null }, role: 'owner' })
    );

    const { result } = await mountHook();

    expect(result.current.ready).toBe(false);
  });

  it('reports unknown — never "missing" — when the read fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'Error interno' } })
    );

    const { result } = await mountHook();

    // false would warn the tenant about a problem the server never reported.
    expect(result.current.ready).toBeNull();
  });

  it('reports unknown when the request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = await mountHook();

    expect(result.current.ready).toBeNull();
  });

  it('does not treat a non-owner as able to fix the account', async () => {
    // The PATCH is scoped by owner_id, so pointing a member at the bank form
    // sends them somewhere they cannot save.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { organization: { id: 'org-1', bank_clabe: null }, role: 'member' })
    );

    const { result } = await mountHook();

    expect(result.current.ready).toBe(false);
    expect(result.current.canFix).toBe(false);
  });

  it('does not call the API in demo mode, and does not warn there either', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    const { result } = await mountHook();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(true);
  });
});
