import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * #273 — the marketing demo's first screen showed a server-error banner.
 *
 * Reproduced live: `/demo`'s own "Entrar a la Demostración" button sends the
 * visitor to `/dashboard?demo=true`, where — on the real deployment, with
 * Supabase configured — `useDashboardAnalytics` fired a real fetch that 401s
 * and rendered "No pudimos actualizar tus números" over the fixture KPIs, and
 * the assistant answered every question with "Sesión requerida" because its
 * gate read `isSupabaseConfigured()` instead of the demo signal.
 *
 * The Vitest trap cuts both ways here (LESSONS): the sandbox cases rely on the
 * default env reading as demo, and the real-tenant cases stub the URL so they
 * exercise the fetch path.
 */

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useDashboardAnalytics demo gate (#273)', () => {
  it('never fetches /api/dashboard/analytics in the sandbox', async () => {
    // Default Vitest env: no Supabase URL → demo. The sub-hooks serve their
    // fixtures; the analytics endpoint must not be asked at all — its 401 was
    // the amber banner on the tour's first screen.
    const { useDashboardAnalytics } = await import('@/lib/hooks/useDashboardAnalytics');
    const { result } = renderHook(() => useDashboardAnalytics());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const analyticsCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith('/api/dashboard/analytics')
    );
    expect(analyticsCalls).toHaveLength(0);
    expect(result.current.error).toBeNull();
    // The figures still exist — computed from the sub-hooks' fixtures.
    expect(result.current.metrics).toBeTruthy();
  });

  it('still asks the server for a real tenant', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/receivables')) return jsonResponse(200, { receivables: [] });
      if (url.startsWith('/api/quotes')) return jsonResponse(200, { quotes: [] });
      if (url.startsWith('/api/clients')) return jsonResponse(200, { clients: [] });
      return jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'boom' } });
    });

    const { useDashboardAnalytics } = await import('@/lib/hooks/useDashboardAnalytics');
    const { result } = renderHook(() => useDashboardAnalytics());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const analyticsCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith('/api/dashboard/analytics')
    );
    expect(analyticsCalls).toHaveLength(1);
    // And a failed server read is still reported, not swallowed (#97).
    expect(result.current.error).toBeTruthy();
  });
});

describe('useAIAssistant demo gate (#273)', () => {
  it('answers from the sample ledger in the sandbox, without touching the API', async () => {
    const { useAIAssistant } = await import('@/lib/hooks/useAIAssistant');
    const { result } = renderHook(() => useAIAssistant());

    expect(result.current.isDemoMode).toBe(true);

    await act(async () => {
      await result.current.askAssistant('¿Cuánto me debe Construcciones Maya?');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.history[0]?.isDemo).toBe(true);
    // The failure this pins: the visitor read a red "Sesión requerida".
    expect(result.current.error).toBeNull();
  });

  it('asks the real API for a signed-in tenant', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        query: 'x',
        intent: 'general',
        answerText: 'Tienes $0 por cobrar.',
        whatsappUrl: '',
        engine: 'rules',
      })
    );

    const { useAIAssistant } = await import('@/lib/hooks/useAIAssistant');
    const { result } = renderHook(() => useAIAssistant());

    expect(result.current.isDemoMode).toBe(false);

    await act(async () => {
      await result.current.askAssistant('¿Cuánto tengo por cobrar?');
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/ai/assistant', expect.anything());
    expect(result.current.history[0]?.isDemo).toBe(false);
  });
});
