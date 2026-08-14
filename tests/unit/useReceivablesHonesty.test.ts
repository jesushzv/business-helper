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

  it('refuses to confirm locally on a 503 once a backend is configured', async () => {
    // This used to succeed: a 503 BACKEND_NOT_CONFIGURED authorized a local
    // "confirmed" with a locally minted timestamp. But a real deployment
    // returns that same code when its *server-side* Supabase config is broken,
    // so a misconfigured production reported payments as received that nobody
    // had received. Demo detection is the build-time signal, never a response
    // code (CLAUDE.md).
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

    expect(outcome).toMatchObject({ success: false });
    expect(result.current.receivables[0].status).toBe('marked_paid');
    expect(result.current.receivables[0].confirmed_at).toBeNull();
  });

  it('still allows the sandbox to confirm locally', async () => {
    const { result } = await mountHook();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'sin base de datos' } })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.confirmPayment('m-1', 500);
    });

    expect(outcome).toMatchObject({ success: true });
    expect(result.current.receivables[0].status).toBe('confirmed');
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
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, url: 'https://cdn/x.pdf' })
    );

    await act(async () => {
      await result.current.uploadReceipt('m-1', new File(['%PDF-1.4'], 'r.pdf', { type: 'application/pdf' }));
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

/**
 * #339 — filing the comprobante the client sent over WhatsApp.
 *
 * The authenticated upload route (`/api/receivables/[id]/upload`) had no
 * caller, and the reason it needed hardening in the first place is the reason
 * every case here exists: it used to answer a *failed* storage upload with
 * `{success: true, url: 'https://storage.businesshelper.mx/…'}` — a host that
 * serves nothing — so payment evidence a user believed they had filed did not
 * exist (#85, the #58/#86 shape).
 *
 * The hook writes what the route returned, or it reports a failure. There is
 * no third outcome, and no locally constructed URL anywhere.
 */
describe('uploadReceipt honesty (#339)', () => {
  const file = () => new File(['%PDF-1.4 fake'], 'comprobante.pdf', { type: 'application/pdf' });

  it('files the URL the server returned, never one built here', async () => {
    const { result } = await mountHook();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          url: 'https://project.supabase.co/storage/v1/object/public/spei-vouchers/org-1/spei_m-1_123.pdf',
          filePath: 'org-1/spei_m-1_123.pdf',
        })
      );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadReceipt('m-1', file());
    });

    expect(outcome).toMatchObject({ success: true });
    expect(result.current.receivables[0].receipt_url).toBe(
      'https://project.supabase.co/storage/v1/object/public/spei-vouchers/org-1/spei_m-1_123.pdf'
    );
    // Nothing derived from the file name ever reaches the row.
    expect(result.current.receivables[0].receipt_url).not.toContain('comprobante.pdf');
    // Filing evidence is not the same claim as "this was paid".
    expect(result.current.receivables[0].status).toBe('marked_paid');
    expect(result.current.receivables[0].confirmed_at).toBeNull();
  });

  it('posts the file under the field name the route reads', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, url: 'https://cdn/x.pdf' }));

    await act(async () => {
      await result.current.uploadReceipt('m-1', file());
    });

    // A key-name mismatch here ships as a swallowed failure reported as
    // success (#95/#96), and only the route knows the answer: `formData.get('file')`.
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/receivables/m-1/upload');
    expect((init as RequestInit).method).toBe('POST');
    const body = (init as RequestInit).body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('comprobante.pdf');
  });

  it('reports a rejected upload as a failure and files nothing', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: {
          code: 'INVALID_FILE',
          message: 'El archivo no es una imagen PNG, JPG ni un documento PDF válido.',
        },
      })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadReceipt('m-1', file());
    });

    expect(outcome).toMatchObject({
      success: false,
      error: 'El archivo no es una imagen PNG, JPG ni un documento PDF válido.',
    });
    expect(result.current.receivables[0].receipt_url).toBeNull();
    // One request: the list load, then the refused upload.
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it('treats a 200 with no URL as a failure', async () => {
    // The absence of the thing being uploaded is not a successful upload.
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadReceipt('m-1', file());
    });

    expect(outcome).toMatchObject({ success: false });
    expect(result.current.receivables[0].receipt_url).toBeNull();
  });

  it('surfaces the server\'s "stored but not filed" message verbatim', async () => {
    // Two different failures with two different next steps: retrying is right
    // here, and "el archivo no sirve" would be wrong. Since #355 the route is
    // the only writer, so it is the only thing that knows the object landed —
    // the lead used to be constructed here and now comes from the server.
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, {
        error: {
          code: 'RECEIPT_SAVE_FAILED',
          message:
            'El comprobante se subió pero no se pudo guardar en el cobro. ' +
            'No se pudo guardar el comprobante. Vuelve a intentarlo; si sigue fallando, avísanos. ' +
            'Intenta de nuevo.',
        },
      })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadReceipt('m-1', file());
    });

    expect(outcome).toMatchObject({ success: false });
    expect((outcome as unknown as { error: string }).error).toMatch(/se subió/i);
    expect(result.current.receivables[0].receipt_url).toBeNull();
  });

  it('makes exactly one request — the route stores and files in one step (#355)', async () => {
    // The two-step left a window where the object existed in the bucket and
    // nothing pointed at it, and required this client to hand the server a URL
    // to trust. Both are gone.
    const { result } = await mountHook();
    const before = fetchMock.mock.calls.length;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, url: 'https://cdn/x.pdf', filePath: 'org-1/owner_m-1_1.pdf' })
    );

    await act(async () => {
      await result.current.uploadReceipt('m-1', file());
    });

    expect(fetchMock.mock.calls).toHaveLength(before + 1);
    expect(fetchMock.mock.calls[before][0]).toBe('/api/receivables/m-1/upload');
    // No PUT carrying a receipt_url the server would have had to trust.
    const methods = fetchMock.mock.calls.slice(before).map((c) => (c[1] as RequestInit)?.method);
    expect(methods).not.toContain('PUT');
  });

  it('reports a dropped connection as a failure, not a filed receipt', async () => {
    const { result } = await mountHook();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadReceipt('m-1', file());
    });

    expect(outcome).toMatchObject({ success: false, error: 'Sin conexión. El comprobante no se subió.' });
    expect(result.current.receivables[0].receipt_url).toBeNull();
  });

  it('refuses in the sandbox instead of inventing a stored file', async () => {
    // The demo has no storage, so the only "success" it could report is a URL
    // pointing at nothing — and the branch short-circuits *before* the fetch,
    // never as a fallback on a real request's result (#287).
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const { result } = await mountHook();
    const callsBefore = fetchMock.mock.calls.length;

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadReceipt('m-1', file());
    });

    expect(outcome).toMatchObject({ success: false });
    expect((outcome as unknown as { error: string }).error).toMatch(/demostración/i);
    expect(fetchMock.mock.calls).toHaveLength(callsBefore);
  });
});
