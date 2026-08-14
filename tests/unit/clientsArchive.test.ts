import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { requireOrgAccess } from '@/lib/apiAuth';
import { useClients } from '@/lib/hooks/useClients';

/**
 * Archiving a client (#337).
 *
 * `quotes.client_id` and `contracts.client_id` are ON DELETE RESTRICT, so a
 * client who has ever been quoted is permanently undeletable — the normal case
 * for every client that matters. #262 made that refusal honest; this is where
 * the tenant goes afterwards.
 *
 * The property that has to hold everywhere: **an archived client is absent
 * from the surfaces where the tenant chooses who to work with next**, and
 * present nowhere else by accident. The two lists are disjoint, so a caller
 * cannot show archived clients by forgetting a flag.
 */

vi.mock('@/lib/apiAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiAuth')>('@/lib/apiAuth');
  // `isDemoDeployment` is re-exported from apiAuth, and Vitest leaves
  // NEXT_PUBLIC_SUPABASE_URL unset — which the real function reads as the demo
  // deployment, short-circuiting GET to `{clients: []}` before it touches a
  // query. Without this stub every assertion below would pass against a route
  // that never ran (the CLAUDE.md Vitest trap).
  return { ...actual, requireOrgAccess: vi.fn(), isDemoDeployment: () => false };
});

vi.mock('@/lib/supabase/service', () => ({
  isDemoDeployment: () => false,
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({}),
}));

const ORG = 'org-1';

/** Every filter the route applied, so the query itself can be asserted. */
interface Recorded {
  is: Array<[string, unknown]>;
  not: Array<[string, string, unknown]>;
  updates: Array<Record<string, unknown>>;
}

let recorded: Recorded;
let rows: Array<Record<string, unknown>>;
let updateResult: Record<string, unknown> | null;

function chain() {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  Object.assign(builder, {
    select: self,
    eq: self,
    is: (col: string, val: unknown) => {
      recorded.is.push([col, val]);
      return builder;
    },
    not: (col: string, op: string, val: unknown) => {
      recorded.not.push([col, op, val]);
      return builder;
    },
    update: (values: Record<string, unknown>) => {
      recorded.updates.push(values);
      return builder;
    },
    order: async () => ({ data: rows, error: null }),
    maybeSingle: async () => ({ data: updateResult, error: null }),
  });
  return builder;
}

function mockAuth(role = 'owner') {
  vi.mocked(requireOrgAccess).mockResolvedValue({
    ok: true,
    ctx: {
      organizationId: ORG,
      userId: 'user-1',
      role,
      supabase: { from: () => chain() },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(() => {
  recorded = { is: [], not: [], updates: [] };
  rows = [];
  updateResult = { id: 'c-1', name: 'Constructora del Bajío', archived_at: null };
  mockAuth();
});

describe('GET /api/clients — the two lists are disjoint (#337)', () => {
  async function get(url: string) {
    const { GET } = await import('@/app/api/clients/route');
    return GET(new Request(url));
  }

  it('excludes archived clients from the default directory', async () => {
    await get('https://businesshelper.app/api/clients');

    // `archived_at IS NULL` — the directory and the quote wizard's picker both
    // read this list, so this one filter covers both surfaces.
    expect(recorded.is).toContainEqual(['archived_at', null]);
    expect(recorded.not).toHaveLength(0);
  });

  it('returns only archived clients when asked for them', async () => {
    await get('https://businesshelper.app/api/clients?archived=1');

    expect(recorded.not).toContainEqual(['archived_at', 'is', null]);
    // Not a superset: the archived view never mixes in active clients.
    expect(recorded.is).toHaveLength(0);
  });

  it('returns both lists for archived=all, for label resolution', async () => {
    // The quotes list puts a name and a phone on cards for quotes that already
    // exist. Reading active-only turned every quote of a newly archived client
    // into "Cliente sin asignar" with the WhatsApp action disabled — for a
    // client whose phone is on file, and whose /q/ link still works.
    await get('https://businesshelper.app/api/clients?archived=all');

    expect(recorded.is).toHaveLength(0);
    expect(recorded.not).toHaveLength(0);
  });

  it('treats anything other than archived=1 as the active directory', async () => {
    // The hook sends `archived=0` for the default view; a stray or hostile
    // value must not open the archived list either.
    for (const query of ['?archived=0', '?archived=true', '?archived=', '?otro=1']) {
      recorded = { is: [], not: [], updates: [] };
      await get(`https://businesshelper.app/api/clients${query}`);
      expect(recorded.is, query).toContainEqual(['archived_at', null]);
      expect(recorded.not, query).toHaveLength(0);
    }
  });
});

describe('POST /api/clients/[id]/archive (#337)', () => {
  async function post(body: unknown, id = 'c-1') {
    const { POST } = await import('@/app/api/clients/[id]/archive/route');
    return POST(
      new Request(`https://businesshelper.app/api/clients/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it('stamps archived_at from the server, not from the caller', async () => {
    const res = await post({ archived: true });

    expect(res.status).toBe(200);
    expect(recorded.updates).toHaveLength(1);
    const written = recorded.updates[0].archived_at;
    // A real timestamp the server chose — the caller only sends a boolean, so
    // no value it supplies can land in this column.
    expect(typeof written).toBe('string');
    expect(Number.isNaN(Date.parse(written as string))).toBe(false);
  });

  it('restores by clearing the column, not by writing a sentinel', async () => {
    const res = await post({ archived: false });

    expect(res.status).toBe(200);
    // NULL is what "never archived" means; any other value would make the
    // column's two states indistinguishable again.
    expect(recorded.updates[0]).toEqual({ archived_at: null });
  });

  it('refuses a body that does not say which way', async () => {
    // Defaulting an absent verb to "archive" would let a malformed restore
    // hide a client instead of bringing it back.
    for (const body of [{}, { archived: 'true' }, { archived: 1 }, null]) {
      recorded.updates = [];
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(recorded.updates).toHaveLength(0);
    }
  });

  it('refuses a role without delete_records, and writes nothing', async () => {
    mockAuth('member');

    const res = await post({ archived: true });

    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/no permite archivar/i);
    expect(recorded.updates).toHaveLength(0);
  });

  it('404s when the row is not this organization’s', async () => {
    // The write is scoped by organization as well as id, so a by-id call
    // against another tenant changes nothing and reveals nothing.
    updateResult = null;

    const res = await post({ archived: true });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns the server row so the caller applies what was stored', async () => {
    updateResult = { id: 'c-1', name: 'Constructora del Bajío', archived_at: '2026-08-14T08:00:00Z' };

    const body = await (await post({ archived: true })).json();

    expect(body.client).toMatchObject({ id: 'c-1', archived_at: '2026-08-14T08:00:00Z' });
  });
});

/**
 * The hook half: the directory changes because the server said so.
 *
 * A row leaving the list is the visible effect of archiving, so applying it
 * before the write lands would hide a client on a request that failed — the
 * #33/#50/#59 shape on the directory.
 */
describe('useClients.archiveClient honesty (#337)', () => {
  const fetchMock = vi.fn<typeof fetch>();

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ROW = {
    id: 'c-1',
    organization_id: ORG,
    name: 'Constructora del Bajío',
    archived_at: null,
  };

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    // Without this the hook takes the demo branch and none of this runs
    // against the real-tenant path (the CLAUDE.md Vitest trap).
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { clients: [ROW] }));
  });

  async function mounted() {
    const rendered = renderHook(() => useClients());
    await waitFor(() => expect(rendered.result.current.loading).toBe(false));
    return rendered;
  }

  it('asks for the active list by default and the archived list on demand', async () => {
    const { result } = await mounted();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/clients?archived=0');

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { clients: [] }));
    await act(async () => {
      result.current.setShowArchived(true);
    });

    await waitFor(() => expect(fetchMock.mock.calls[1][0]).toBe('/api/clients?archived=1'));
  });

  it('removes the client from the list only after the server confirms', async () => {
    const { result } = await mounted();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { client: { ...ROW, archived_at: '2026-08-14T08:00:00Z' } })
    );

    await act(async () => {
      await result.current.archiveClient('c-1', true);
    });

    expect(fetchMock.mock.calls[1][0]).toBe('/api/clients/c-1/archive');
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      archived: true,
    });
    expect(result.current.clients).toHaveLength(0);
  });

  it('leaves the directory untouched when the write is refused', async () => {
    const { result } = await mounted();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, {
        error: { code: 'FORBIDDEN', message: 'Tu rol no permite archivar clientes' },
      })
    );

    await expect(
      act(async () => {
        await result.current.archiveClient('c-1', true);
      })
    ).rejects.toThrow(/no permite archivar/i);

    // Still there — a refused archive must not look like an archived client.
    expect(result.current.clients).toHaveLength(1);
  });
});

/**
 * The surfaces around archiving, which is where its first review found the
 * defects rather than in the column itself (#337).
 */
describe('what archiving must not break (#337)', () => {
  it('does not count archived clients as active, on either path', async () => {
    const { calculateBusinessMetrics } = await import('@/lib/dashboardAnalytics');

    const clients = [
      { id: 'a', name: 'Activa' },
      { id: 'b', name: 'Archivada', archived_at: '2026-08-14T08:00:00Z' },
    ];

    // The analytics route sends the unfiltered list — an archived client's
    // revenue still happened, so they stay in the top-clients ranking — but
    // the *count* is of the directory. The route and the client-side fallback
    // read the same predicate, or one tile shows two numbers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = calculateBusinessMetrics([], [], clients as any);

    expect(summary.activeClientsCount).toBe(1);
  });

  it('keeps an archived client out of the assistant’s follow-up roster, but not out of its ledger', async () => {
    const { buildGroundedAssistantPrompt } = await import('@/lib/whatsappAI');

    const prompt = buildGroundedAssistantPrompt(
      '¿A quién le tengo que cobrar?',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { intent: 'unknown', answer: '', engine: 'rules' } as any,
      {
        clients: [
          { id: 'a', name: 'Activa Sin Deuda' },
          { id: 'b', name: 'Archivada Sin Deuda', archived_at: '2026-08-14T08:00:00Z' },
          { id: 'c', name: 'Archivada Que Debe', archived_at: '2026-08-14T08:00:00Z' },
        ],
        receivables: [{ clientId: 'c', amount: 5000, status: 'pending' }],
      }
    );

    // Archived and settled: nothing to chase, so it is not offered as someone
    // to chase.
    expect(prompt).not.toContain('Archivada Sin Deuda');
    // Archived but still owing: archiving is visibility, not a soft delete.
    expect(prompt).toContain('Archivada Que Debe');
    expect(prompt).toContain('Activa Sin Deuda');
  });
});
