import React, { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClientDetailPage from '@/app/(dashboard)/clients/[id]/page';
import { __resetCurrentOrgCacheForTests } from '@/lib/hooks/useCurrentOrg';

/**
 * #96 — the client detail page must derive its financial modules from the
 * tenant's real rows and must not flash "Cliente no encontrado" while loading.
 *
 * The old page fed hardcoded mockQuotes/mockContracts/mockMilestones — with no
 * demo gate — into the activity timeline, the health meter and the credit
 * summary, so "Crédito Utilizado" showed a $45,000 fiction for every real
 * client. And it never read `loading`, so until the directory fetch resolved,
 * every cold load claimed the client "no existe o fue eliminado".
 */

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const SERVER_CLIENT = {
  id: 'client-real-1',
  organization_id: 'org-real-1',
  name: 'Aceros del Bajío S.A. de C.V.',
  contact_name: 'Ing. Laura Peña',
  email: 'lpena@acerosbajio.mx',
  phone: '4771234567',
  rfc: 'ABA050505XX1',
  regimen_fiscal: '601',
  codigo_postal: '37000',
  cfdi_use: 'G03',
  notes: null,
  health_score: 90,
  credit_limit: 80000,
  credit_days: 30,
  credit_status: 'active',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

function answerApis({
  clients,
  receivables = [],
}: {
  clients: Promise<Response> | Response;
  receivables?: unknown[];
}) {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/clients')) return clients;
    if (url.startsWith('/api/quotes')) return jsonResponse(200, { quotes: [] });
    if (url.startsWith('/api/receivables')) return jsonResponse(200, { receivables });
    if (url.startsWith('/api/organization')) {
      return jsonResponse(200, {
        organization: { id: 'org-real-1', name: 'Ferretería La Central' },
        role: 'owner',
      });
    }
    return jsonResponse(404, {});
  });
}

function renderPage() {
  // React's use() unwraps an already-fulfilled promise synchronously when the
  // status/value fields are present; a bare Promise.resolve suspends the tree
  // for the whole test instead.
  const params = Promise.resolve({ id: 'client-real-1' }) as Promise<{ id: string }> & {
    status: string;
    value: { id: string };
  };
  params.status = 'fulfilled';
  params.value = { id: 'client-real-1' };

  return render(
    <Suspense fallback={null}>
      <ClientDetailPage params={params} />
    </Suspense>
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  __resetCurrentOrgCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('loading gate', () => {
  it('never claims "Cliente no encontrado" while the directory is still loading', async () => {
    // The clients fetch never resolves within this test.
    answerApis({ clients: new Promise<Response>(() => {}) });
    renderPage();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Cliente no encontrado/i)).toBeNull();
    expect(screen.queryByText(/fue eliminado/i)).toBeNull();
  });

  it('says "no encontrado" only after the directory resolved without the client', async () => {
    answerApis({ clients: jsonResponse(200, { clients: [] }) });
    renderPage();

    expect(await screen.findByText(/Cliente no encontrado/i)).toBeTruthy();
    // The copy no longer asserts a deletion the app cannot know about.
    expect(screen.queryByText(/fue eliminado/i)).toBeNull();
  });

  it('shows an error state, not "no encontrado", when the directory fetch failed', async () => {
    answerApis({ clients: jsonResponse(500, { error: { message: 'boom' } }) });
    renderPage();

    expect(await screen.findByText(/No se pudo cargar el cliente/i)).toBeTruthy();
    expect(screen.queryByText(/Cliente no encontrado/i)).toBeNull();
  });
});

describe('real financial data (#96)', () => {
  it('renders zero credit utilization and an empty timeline for a client with no rows', async () => {
    answerApis({ clients: jsonResponse(200, { clients: [SERVER_CLIENT] }) });
    renderPage();

    expect((await screen.findAllByText('Aceros del Bajío S.A. de C.V.')).length).toBeGreaterThan(0);

    // The credit meter derives from the tenant's (empty) receivables — the old
    // page showed $22,500 used from the fixture milestones here.
    expect(screen.getByText('$0 MXN')).toBeTruthy();
    expect(screen.queryByText(/45,000|22,500/)).toBeNull();
    expect(screen.queryByText(/Anticipo 50% Obra Civil/)).toBeNull();
    expect(screen.queryByText(/Cotización Materiales Obra Civil/)).toBeNull();

    // Empty history is reported as empty, not filled with fiction.
    expect(screen.getByText(/0 Eventos/)).toBeTruthy();
  });

  it('counts this client’s owed milestones and ignores other clients’ (the #78 mapping, pinned)', async () => {
    answerApis({
      clients: jsonResponse(200, { clients: [SERVER_CLIENT] }),
      // Server-shaped rows: client arrives nested under contracts, the way
      // /api/receivables actually returns it — toMilestoneWithClient flattens.
      receivables: [
        {
          id: 'm-1',
          contract_id: 'c-1',
          organization_id: 'org-real-1',
          label: 'Anticipo',
          amount: 5000,
          due_date: '2026-09-01',
          status: 'pending',
          contracts: { id: 'c-1', title: 'Obra', clients: { id: 'client-real-1', name: 'Aceros del Bajío S.A. de C.V.' } },
        },
        {
          id: 'm-2',
          contract_id: 'c-2',
          organization_id: 'org-real-1',
          label: 'Otro cliente',
          amount: 7000,
          due_date: '2026-09-01',
          status: 'pending',
          contracts: { id: 'c-2', title: 'Otra obra', clients: { id: 'client-other', name: 'Otro S.A.' } },
        },
      ],
    });
    renderPage();

    await screen.findAllByText('Aceros del Bajío S.A. de C.V.');
    // Only this client's pending milestone consumes credit: $5,000, not $12,000.
    expect(screen.getByText('$5,000 MXN')).toBeTruthy();
    expect(screen.queryByText('$12,000 MXN')).toBeNull();
  });
});

/**
 * The state every real client was actually in (#96 deployed verification).
 *
 * `clients.credit_limit` / `credit_days` / `credit_status` were declared in
 * types/database.ts but no migration had ever created them, so in production
 * all three read as undefined. The card collapsed that into an authorized limit
 * of $0 under a green "Activo" badge — terms nobody had set, on the screen
 * where the owner decides whether to extend more credit.
 */
describe('a client with no credit line configured', () => {
  const UNASSESSED = {
    ...SERVER_CLIENT,
    credit_limit: null,
    credit_days: null,
    credit_status: null,
  };

  it('says no credit line is assigned instead of showing a green "Activo" over $0', async () => {
    answerApis({ clients: jsonResponse(200, { clients: [UNASSESSED] }) });
    renderPage();

    expect(await screen.findByText(/Sin línea de crédito asignada/i)).toBeTruthy();
    expect(screen.queryByText('Activo')).toBeNull();
    expect(screen.queryByText(/Límite de Crédito Autorizado/i)).toBeNull();
    // "Contado (0 días)" states payment terms the owner never chose.
    expect(screen.queryByText(/Contado \(0 días\)/i)).toBeNull();
  });

  it('still shows money genuinely owed, so the balance is not hidden', async () => {
    answerApis({
      clients: jsonResponse(200, { clients: [UNASSESSED] }),
      receivables: [
        {
          id: 'm-1',
          contract_id: 'c-1',
          organization_id: 'org-real-1',
          label: 'Anticipo',
          amount: 5000,
          due_date: '2026-09-01',
          status: 'pending',
          contracts: { id: 'c-1', title: 'Obra', clients: { id: 'client-real-1', name: 'Aceros' } },
        },
      ],
    });
    renderPage();

    expect(await screen.findByText(/Saldo Pendiente de Cobro/i)).toBeTruthy();
    expect(screen.getByText('$5,000 MXN')).toBeTruthy();
  });
});

describe('the SAT fiscal card does not fake a profile the client does not have', () => {
  it('marks missing régimen and código postal instead of showing 601 / N/A', async () => {
    answerApis({
      clients: jsonResponse(200, {
        clients: [{ ...SERVER_CLIENT, regimen_fiscal: null, codigo_postal: null }],
      }),
    });
    renderPage();

    await screen.findAllByText('Aceros del Bajío S.A. de C.V.');
    // '601' rendered as a fallback made an unconfigured client look ready to
    // invoice under someone else's tax regime.
    expect(screen.queryByText('601')).toBeNull();
    expect(screen.getAllByText(/Falta capturar/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/no podrás facturarle/i)).toBeTruthy();
  });

  it('shows the stored values when they exist, with no warning', async () => {
    answerApis({ clients: jsonResponse(200, { clients: [SERVER_CLIENT] }) });
    renderPage();

    await screen.findAllByText('Aceros del Bajío S.A. de C.V.');
    // Named, not a bare SAT code: "601" alone does not tell the owner which
    // régimen their client is on (#127). The code is still there — the value
    // is unchanged, only its presentation.
    expect(screen.getByText(/601 — General de Ley Personas Morales/)).toBeTruthy();
    expect(screen.getByText('37000')).toBeTruthy();
    expect(screen.queryByText(/Falta capturar/i)).toBeNull();
    expect(screen.queryByText(/no podrás facturarle/i)).toBeNull();
  });
});

describe('the activity timeline is only as honest as its reads (#260)', () => {
  it('does not render "0 Eventos" as fact when the quotes read failed', async () => {
    // The credit figures already carried balanceKnown; the timeline on the
    // same screen rendered "Sin historial de actividad / 0 Eventos" off a
    // failed quotes fetch.
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/clients')) return jsonResponse(200, { clients: [SERVER_CLIENT] });
      if (url.startsWith('/api/quotes'))
        return jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'boom' } });
      if (url.startsWith('/api/receivables')) return jsonResponse(200, { receivables: [] });
      if (url.startsWith('/api/organization')) {
        return jsonResponse(200, {
          organization: { id: 'org-real-1', name: 'Ferretería La Central' },
          role: 'owner',
        });
      }
      return jsonResponse(404, {});
    });
    renderPage();

    await screen.findByText(/No pudimos cargar el historial de este cliente/i);
    expect(screen.queryByText(/0 Eventos/i)).toBeNull();
    expect(screen.getByText(/— Eventos/i)).toBeTruthy();
  });
});
