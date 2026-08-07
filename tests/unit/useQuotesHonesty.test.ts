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
});
