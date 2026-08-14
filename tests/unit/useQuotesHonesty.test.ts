import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQuotes } from '@/lib/hooks/useQuotes';

/**
 * #50 — a quote shown in the list must exist on the server.
 *
 * The old createQuote posted with a 1.5s abort and fell back to local state on
 * ANY failure, so a rejected or slow write still produced a quote card — with
 * a client-minted public_token whose /q/ link resolved to nothing. On a
 * configured deployment the server row is now the only quote.
 */

const SERVER_QUOTE = {
  id: 'srv-quote-1',
  organization_id: 'org-1',
  client_id: 'client-1',
  created_by: 'user-1',
  title: 'Cotización real',
  line_items: [{ description: 'Servicio', quantity: 1, unit_price: 1000, sat_code: '84111506', unit: 'E48' }],
  subtotal_amount: 1000,
  iva_amount: 160,
  retencion_isr_amount: 0,
  retencion_iva_amount: 0,
  total_amount: 1160,
  currency: 'MXN',
  status: 'sent',
  valid_until: '2026-09-01',
  notes: '',
  public_token: 'server-token-abc123',
  converted_contract_id: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const CREATE_INPUT = {
  client_id: 'client-1',
  title: 'Cotización real',
  line_items: [{ description: 'Servicio', quantity: 1, unit_price: 1000, sat_code: '84111506', unit: 'E48' }],
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
  // A configured deployment: the hook must not treat this browser as the demo.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function mountHook(initialQuotes: unknown[] = []) {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { quotes: initialQuotes }));
  const rendered = renderHook(() => useQuotes());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe('createQuote honesty (configured deployment)', () => {
  it('throws and adds nothing when the API rejects the write', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo crear la cotización' } })
    );

    await act(async () => {
      await expect(result.current.createQuote(CREATE_INPUT)).rejects.toThrow(
        'No se pudo crear la cotización'
      );
    });

    expect(result.current.quotes).toEqual([]);
    // Nothing fabricated may survive a reload.
    expect(localStorage.getItem('business_helper_quotes_v1')).toBeNull();
  });

  it('throws and adds nothing when the network fails', async () => {
    const { result } = await mountHook();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await act(async () => {
      await expect(result.current.createQuote(CREATE_INPUT)).rejects.toThrow(
        'La cotización no fue creada'
      );
    });

    expect(result.current.quotes).toEqual([]);
  });

  it('uses the server row — id and public_token included — on success', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, SERVER_QUOTE));

    let created;
    await act(async () => {
      created = await result.current.createQuote(CREATE_INPUT);
    });

    // The /q/ link the vendor shares is built from this token; it must be the
    // one the database holds, never one minted in the browser.
    expect(created).toMatchObject({ id: 'srv-quote-1', public_token: 'server-token-abc123' });
    expect(result.current.quotes[0].public_token).toBe('server-token-abc123');
  });

  it('does not send identity fields for the server to ignore', async () => {
    const { result } = await mountHook();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, SERVER_QUOTE));

    await act(async () => {
      await result.current.createQuote(CREATE_INPUT);
    });

    const [, init] = fetchMock.mock.calls[1];
    const sent = JSON.parse(String(init?.body));
    expect(sent.id).toBeUndefined();
    expect(sent.public_token).toBeUndefined();
    expect(sent.organization_id).toBeUndefined();
    expect(sent.created_by).toBeUndefined();
  });
});

describe('fetchQuotes honesty (configured deployment)', () => {
  it('shows a real tenant with zero quotes an empty list, not the demo fixtures', async () => {
    const { result } = await mountHook([]);
    expect(result.current.quotes).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('reports an error instead of demo data when a configured backend fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'boom' }));
    const { result } = renderHook(() => useQuotes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.quotes).toEqual([]);
    expect(result.current.error).toBe('boom');
  });
});

/**
 * #59 — the remaining fire-and-forget writes.
 *
 * updateQuoteStatus and convertToContract flipped local state first and
 * discarded the response, so a rejected write still showed a converted quote
 * and announced a payment schedule that was never created.
 */
describe('updateQuoteStatus honesty (configured deployment)', () => {
  it('throws and leaves the status untouched when the API rejects the write', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'No tienes permiso' } })
    );

    await act(async () => {
      await expect(result.current.updateQuoteStatus('srv-quote-1', 'accepted')).rejects.toThrow(
        'No tienes permiso'
      );
    });

    expect(result.current.quotes[0].status).toBe('sent');
    // A status the database rejected must not survive a reload either.
    expect(localStorage.getItem('business_helper_quotes_v1')).toBeNull();
  });

  it('throws and leaves the status untouched when the network fails', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await act(async () => {
      await expect(result.current.updateQuoteStatus('srv-quote-1', 'accepted')).rejects.toThrow(
        'El estado no fue actualizado'
      );
    });

    expect(result.current.quotes[0].status).toBe('sent');
  });

  it('applies the server row on success', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...SERVER_QUOTE, status: 'accepted', updated_at: '2026-08-07T12:00:00Z' })
    );

    await act(async () => {
      await result.current.updateQuoteStatus('srv-quote-1', 'accepted');
    });

    expect(result.current.quotes[0].status).toBe('accepted');
    expect(result.current.quotes[0].updated_at).toBe('2026-08-07T12:00:00Z');
  });
});

describe('convertToContract honesty (configured deployment)', () => {
  it('throws and does not mark the quote converted when the route fails', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, {
        error: { code: 'SERVER_ERROR', message: 'No se pudo convertir la cotización a contrato' },
      })
    );

    await act(async () => {
      await expect(result.current.convertToContract('srv-quote-1')).rejects.toThrow(
        'No se pudo convertir la cotización a contrato'
      );
    });

    // No contract, no milestones, no receivable — so no 'converted' either.
    expect(result.current.quotes[0].status).toBe('sent');
  });

  it('does not flip the status when only the network failed', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await act(async () => {
      await expect(result.current.convertToContract('srv-quote-1')).rejects.toThrow(
        'La cotización no fue convertida'
      );
    });

    expect(result.current.quotes[0].status).toBe('sent');
  });

  it('never mirrors a real tenant\'s quotes — public_token included — into localStorage (#113)', async () => {
    // A serialized quote carries public_token, the value /q/[token] and
    // /pay/[token] resolve without any session. Persisting it at rest hands a
    // working signing link to anything that can read this origin's
    // localStorage. The mirror is demo-sandbox state only (#93).
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        contract: { id: 'srv-contract-1', title: 'Cotización real', total_amount: 1160 },
        milestones: [{ id: 'ms-1', amount: 1160, label: 'Pago único' }],
      })
    );

    await act(async () => {
      await result.current.convertToContract('srv-quote-1');
    });

    // The successful path is the leak: applyStatusLocally runs after the
    // server confirms, and its mirror must be demo-gated.
    expect(result.current.quotes[0].status).toBe('converted');
    expect(localStorage.getItem('business_helper_quotes_v1')).toBeNull();
  });

  it('removes an already-leaked quotes mirror for a real tenant on mount (#113)', async () => {
    // Tokens leaked before the gate existed stay on disk otherwise — and
    // isClientDemoMode() also honors a sandbox flag the visitor can flip,
    // which would render the stale rows back into the UI.
    localStorage.setItem('business_helper_quotes_v1', JSON.stringify([SERVER_QUOTE]));

    const { result } = await mountHook([SERVER_QUOTE]);

    expect(result.current.quotes).toHaveLength(1);
    expect(localStorage.getItem('business_helper_quotes_v1')).toBeNull();
  });

  it('makes exactly one request and returns the server contract and milestones', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    const serverContract = { id: 'srv-contract-1', title: 'Cotización real', total_amount: 1160 };
    const serverMilestones = [
      { id: 'ms-1', amount: 580, label: 'Anticipo' },
      { id: 'ms-2', amount: 580, label: 'Liquidación' },
    ];
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { contract: serverContract, milestones: serverMilestones })
    );

    let conversion;
    await act(async () => {
      conversion = await result.current.convertToContract('srv-quote-1');
    });

    // The route creates contract + milestones + status in one call; the hook
    // must not additionally PUT the status itself.
    const convertCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/convert')
    );
    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(convertCalls).toHaveLength(1);
    expect(putCalls).toHaveLength(0);

    // The milestones announced to the user are the ones the server created,
    // not a locally derived pair.
    expect(conversion!.contract).toEqual(serverContract);
    expect(conversion!.milestones).toEqual(serverMilestones);
    expect(result.current.quotes[0].status).toBe('converted');
  });
});

describe('deleteQuote honesty (configured deployment)', () => {
  it('keeps the quote when the route refuses the deletion, and surfaces the server\'s reason', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    // The 409 a signed/converted quote gets: it must reach the tenant as the
    // route wrote it, and the card must not vanish for a row that still exists.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: 'QUOTE_PROTECTED', message: 'Esta cotización ya fue firmada o convertida en contrato' },
      })
    );

    await act(async () => {
      await expect(result.current.deleteQuote('srv-quote-1')).rejects.toThrow(
        'ya fue firmada o convertida'
      );
    });

    expect(result.current.quotes).toHaveLength(1);
  });

  it('keeps the quote when the network fails', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await act(async () => {
      await expect(result.current.deleteQuote('srv-quote-1')).rejects.toThrow();
    });

    expect(result.current.quotes).toHaveLength(1);
  });

  it('removes the quote only after the server confirms, with a single DELETE call', async () => {
    const { result } = await mountHook([SERVER_QUOTE]);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    await act(async () => {
      await result.current.deleteQuote('srv-quote-1');
    });

    expect(result.current.quotes).toEqual([]);
    const deleteCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
    expect(String(deleteCalls[0][0])).toBe('/api/quotes/srv-quote-1');
    // No mirror of a real tenant's quotes survives the deletion either (#113).
    expect(localStorage.getItem('business_helper_quotes_v1')).toBeNull();
  });
});

describe('demo mode (no backend in the bundle)', () => {
  it('creates a local quote without calling the API', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    const rendered = renderHook(() => useQuotes());
    await waitFor(() => expect(rendered.result.current.loading).toBe(false));
    const fetchCallsBefore = fetchMock.mock.calls.length;

    let created;
    await act(async () => {
      created = await rendered.result.current.createQuote(CREATE_INPUT);
    });

    expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore);
    expect(created).toMatchObject({ organization_id: 'org-demo-1' });
    expect(rendered.result.current.quotes.some((q) => q.id === created!.id)).toBe(true);
  });

  it('deletes locally without calling the API', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');

    const rendered = renderHook(() => useQuotes());
    await waitFor(() => expect(rendered.result.current.loading).toBe(false));
    const target = rendered.result.current.quotes[0];
    const fetchCallsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      await rendered.result.current.deleteQuote(target.id);
    });

    expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore);
    expect(rendered.result.current.quotes.some((q) => q.id === target.id)).toBe(false);
  });
});
