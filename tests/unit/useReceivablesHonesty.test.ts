import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReceivables } from '@/lib/hooks/useReceivables';

/**
 * #33 — the hook must not report a payment as confirmed when the API said no.
 *
 * The old implementation wrote the optimistic state, persisted it to
 * localStorage, and discarded the fetch outcome — so a 401/403/500 still moved
 * the "cobrado este mes" total on a write that never landed.
 */

const SERVER_ROW = {
  id: 'm-1',
  contract_id: 'c-1',
  organization_id: 'org-1',
  label: 'Anticipo',
  amount: 1000,
  due_date: '2026-09-01',
  status: 'marked_paid',
  receipt_url: null,
  tracking_reference: null,
  transferred_amount: null,
  confirmed_at: null,
  created_at: '2026-08-01T00:00:00Z',
};

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
  // Without this the whole file tests nothing it claims to: `isClientDemoMode()`
  // keys off NEXT_PUBLIC_SUPABASE_URL, which Vitest leaves unset, so every
  // "real tenant" assertion below would actually be exercising the demo
  // sandbox branch (the CLAUDE.md Vitest trap).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  // Initial load: the API returns one live row for a configured backend.
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { receivables: [SERVER_ROW] }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function mountHook() {
  const rendered = renderHook(() => useReceivables());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe('confirmPayment honesty', () => {
  it('does not mark the row confirmed when the API rejects (403)', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Tu rol no permite confirmar pagos' } })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.confirmPayment('m-1', 1000);
    });

    expect(outcome).toMatchObject({ success: false, error: 'Tu rol no permite confirmar pagos' });
    expect(result.current.receivables[0].status).toBe('marked_paid');
    expect(result.current.receivables[0].confirmed_at).toBeNull();
    // Nothing rejected may survive a reload.
    expect(localStorage.getItem('business_helper_receivables_v1') || '').not.toContain('"confirmed"');
  });

  it('does not mark the row confirmed when the server errors (500)', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'No se pudo confirmar el pago' }));

    let outcome;
    await act(async () => {
      outcome = await result.current.confirmPayment('m-1');
    });

    expect(outcome).toMatchObject({ success: false, error: 'No se pudo confirmar el pago' });
    expect(result.current.receivables[0].status).toBe('marked_paid');
  });

  it('does not mark the row confirmed when the network fails', async () => {
    const { result } = await mountHook();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    let outcome;
    await act(async () => {
      outcome = await result.current.confirmPayment('m-1');
    });

    expect(outcome).toMatchObject({ success: false });
    expect(result.current.receivables[0].status).toBe('marked_paid');
  });

  it('confirms from the server row and surfaces the complement on success', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...SERVER_ROW,
        status: 'confirmed',
        transferred_amount: 1000,
        confirmed_at: '2026-08-07T18:00:00Z',
        complement: { uuid: 'uuid-123', installment: 1 },
      })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.confirmPayment('m-1', 1000);
    });

    expect(outcome).toMatchObject({
      success: true,
      complement: { uuid: 'uuid-123', installment: 1 },
      complementError: null,
    });
    expect(result.current.receivables[0].status).toBe('confirmed');
    expect(result.current.receivables[0].confirmed_at).toBe('2026-08-07T18:00:00Z');
  });

  it('surfaces complementError when the payment confirmed but the SAT document did not', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        ...SERVER_ROW,
        status: 'confirmed',
        complementError: { code: 'PAC_REJECTED', message: 'El PAC rechazó el complemento' },
      })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.confirmPayment('m-1');
    });

    expect(outcome).toMatchObject({
      success: true,
      complementError: { code: 'PAC_REJECTED', message: 'El PAC rechazó el complemento' },
    });
    // The payment itself did confirm.
    expect(result.current.receivables[0].status).toBe('confirmed');
  });

  it('allows the local-only update on the demo deployment (503 BACKEND_NOT_CONFIGURED)', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, {
        error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Esta operación requiere una base de datos configurada' },
      })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.confirmPayment('m-1', 500);
    });

    expect(outcome).toMatchObject({ success: true });
    expect(result.current.receivables[0].status).toBe('confirmed');
  });
});

describe('uploadSpeiProof honesty', () => {
  it('reports failure and leaves the row unchanged when the PUT fails', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'Failed to update milestone' }));

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadSpeiProof('m-1', {
        receipt_url: 'https://example.com/r.pdf',
        tracking_reference: 'SPEI123',
      });
    });

    expect(outcome).toMatchObject({ success: false });
    expect(result.current.receivables[0].tracking_reference).toBeNull();
  });

  it('applies the row after a successful PUT', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...SERVER_ROW, status: 'marked_paid' }));

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadSpeiProof('m-1', {
        receipt_url: 'https://example.com/r.pdf',
        tracking_reference: 'SPEI123',
        transferred_amount: 1000,
      });
    });

    expect(outcome).toMatchObject({ success: true });
    expect(result.current.receivables[0].tracking_reference).toBe('SPEI123');
  });
});

describe('fetchReceivables honesty', () => {
  it('shows a real tenant with zero receivables an empty list, not the demo fixtures', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { receivables: [] }));

    const { result } = renderHook(() => useReceivables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.receivables).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('reports an error instead of demo data when a configured backend fails', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));

    const { result } = renderHook(() => useReceivables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.receivables).toEqual([]);
    expect(result.current.error).toBe('boom');
  });

  /**
   * The defect this pins (#96 verification): the fetch used to sit inside a
   * bare `catch` that fell through to seeding INITIAL_DEMO_RECEIVABLES into
   * localStorage. A real tenant who lost their connection for one request —
   * routine on the 3G phone this product targets — was shown ~$145,000 owed by
   * three companies that do not exist, with `error` left null so no screen
   * could contradict it, and those same invented milestones fed the client
   * detail page's "Crédito Utilizado" meter.
   *
   * The file already claimed to cover this: the test below used to be titled
   * "falls back to demo fixtures ONLY for the unconfigured-backend deployment"
   * while never once rejecting the fetch. The "only" was asserted nowhere.
   */
  it('surfaces a network failure as an error and never as demo fixtures', async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useReceivables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.receivables).toEqual([]);
    expect(result.current.error).toBeTruthy();
    // The specific fiction that used to appear here.
    expect(JSON.stringify(result.current.receivables)).not.toContain('Construcciones Maya');
    expect(localStorage.getItem('business_helper_receivables_v1')).toBeNull();
  });

  it('does not fall back to fixtures on a 503 either, once a backend is configured', async () => {
    // A hook cannot use BACKEND_NOT_CONFIGURED to authorize fixtures: demo
    // detection is the build-time signal, not a response code (CLAUDE.md).
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'sin base de datos' } })
    );

    const { result } = renderHook(() => useReceivables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.receivables).toEqual([]);
    expect(result.current.error).toBe('sin base de datos');
  });

  it('does not mirror a real tenant\'s rows into localStorage', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...SERVER_ROW, status: 'marked_paid' }));

    await act(async () => {
      await result.current.uploadSpeiProof('m-1', {
        receipt_url: 'https://example.com/r.pdf',
        tracking_reference: 'SPEI123',
      });
    });

    // The mirror was also the stale snapshot the fixture fallback read back.
    expect(localStorage.getItem('business_helper_receivables_v1')).toBeNull();
  });

  it('serves the sandbox its fixtures when the build has no Supabase URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    fetchMock.mockReset();

    const { result } = renderHook(() => useReceivables());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.receivables.length).toBeGreaterThan(0);
    expect(result.current.receivables[0].organization_id).toBe('org-demo-1');
    // The demo deployment must not be blanked by the gate above.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
