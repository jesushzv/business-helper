import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useClient } from '@/lib/hooks/useClient';

/**
 * `useClient` must keep four outcomes apart (#360, the #64 tri-state rule).
 *
 * The page above it renders a different screen for each, and every collapse has
 * already shipped here in some form: "still loading" read as "deleted" (#96),
 * a failed read read as an empty fact (#96 again, on the credit figures), and
 * demo fixtures served to a real tenant (#93/#96).
 */

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ROW = { id: 'c-1', name: 'Aceros del Bajío', archived_at: '2026-08-14T08:00:00Z' };

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Vitest leaves this unset, which means the demo signal is ON by default and
  // every real-tenant branch below would be skipped silently.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useClient keeps loading, found, absent and failed apart (#360)', () => {
  it('claims nothing while the read is in flight', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const { result } = renderHook(() => useClient('c-1'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.loading).toBe(true);
    expect(result.current.client).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns the server row for an archived client — the read the whole fix rests on', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { client: ROW }));
    const { result } = renderHook(() => useClient('c-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.client).toEqual(ROW);
    expect(result.current.error).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/clients/c-1');
  });

  it('reports 404 as absent — a fact about this organization', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Cliente no encontrado' } })
    );
    const { result } = renderHook(() => useClient('c-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
    // Absent is not an error: the page must say "no encontrado", not "no se
    // pudo cargar".
    expect(result.current.error).toBeNull();
  });

  it('reports a 500 as a failed read, never as absent', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: { message: 'boom' } }));
    const { result } = renderHook(() => useClient('c-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.notFound).toBe(false);
  });

  it('reports a network failure as a failed read, never as absent', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useClient('c-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.notFound).toBe(false);
    expect(result.current.client).toBeNull();
  });

  it('applies a server row without refetching, so a confirmed write shows', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { client: ROW }));
    const { result } = renderHook(() => useClient('c-1'));
    await waitFor(() => expect(result.current.client).toEqual(ROW));

    const restored = { ...ROW, archived_at: null };
    result.current.applyServerRow(restored as never);

    await waitFor(() => expect(result.current.client).toEqual(restored));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the demo sandbox is reached only behind the build-time signal (#93)', () => {
  it('resolves from the sandbox and never calls the API', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    localStorage.setItem(
      'business_helper_clients_v1',
      JSON.stringify([{ id: 'demo-9', name: 'Cliente de Prueba', archived_at: null }])
    );

    const { result } = renderHook(() => useClient('demo-9'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.client?.name).toBe('Cliente de Prueba');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not seed the sandbox as a side effect of opening a profile', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    const { result } = renderHook(() => useClient('nobody'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
    // Reading one client must not write the directory. The list hook owns
    // seeding; a by-id read that also seeded would make "open a profile" a
    // mutation of the sandbox.
    expect(localStorage.getItem('business_helper_clients_v1')).toBeNull();
  });

  it('serves no fixture to a real tenant whose read failed', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useClient('client-demo-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    // `client-demo-1` is a real fixture id. A real tenant on a failed read gets
    // the error, never Construcciones Maya (#93/#96).
    expect(result.current.client).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});
