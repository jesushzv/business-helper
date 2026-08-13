import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The quote write routes must *call* the credit gate (#203).
 *
 * Before this gate, `validateQuoteCreditLimit` computed `isAllowed: false` for
 * a client the owner marked `blocked` — and nothing read it. The wizard
 * rendered "solo se permiten ventas de contado" and created the quote anyway;
 * `grep -rn credit app/api/quotes/` returned nothing. A client fetch is not a
 * control, so the refusal lives here, in the route.
 *
 * Same seam-shape as quoteBankAccountRoute.test.ts: call the real handlers,
 * assert on what reaches the DB layer.
 */

const insertCalls: Array<Record<string, unknown>> = [];
const updateCalls: Array<Record<string, unknown>> = [];

/** Clients org-1 actually holds, keyed by id. */
const OWN_CLIENTS: Record<string, { name: string; credit_status: string | null }> = {
  'client-active': { name: 'Constructora del Valle', credit_status: 'active' },
  'client-suspended': { name: 'Ferretería Central', credit_status: 'suspended' },
  'client-blocked': { name: 'Comercial Morosa SA', credit_status: 'blocked' },
  'client-no-line': { name: 'Cliente Nuevo', credit_status: null },
};

/** Set true to make the clients read fail — the gate must answer "unknown". */
let clientsReadFails = false;

function clientsTable() {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: async () => {
      if (clientsReadFails) return { data: null, error: { message: 'boom' } };
      if (filters.organization_id !== 'org-1') return { data: null, error: null };
      const row = OWN_CLIENTS[String(filters.id)];
      return { data: row ?? null, error: null };
    },
  };
  return builder;
}

function quotesTable() {
  return {
    insert: (values: Record<string, unknown>) => {
      insertCalls.push(values);
      return {
        select: () => ({ single: async () => ({ data: { id: 'quote-1', ...values }, error: null }) }),
      };
    },
    update: (values: Record<string, unknown>) => {
      updateCalls.push(values);
      return {
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'quote-1', ...values }, error: null }),
            }),
          }),
        }),
      };
    },
  };
}

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    isDemoDeployment: () => false,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'owner',
        supabase: {
          from: (table: string) => (table === 'clients' ? clientsTable() : quotesTable()),
        },
      },
    })),
  };
});

const { POST } = await import('@/app/api/quotes/route');
const { PUT } = await import('@/app/api/quotes/[id]/route');

function postQuote(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Suministro', ...body }),
    })
  );
}

function putQuote(body: Record<string, unknown>) {
  return PUT(
    new Request('http://localhost/api/quotes/quote-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'quote-1' }) }
  );
}

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
  clientsReadFails = false;
});

describe('POST /api/quotes credit gate (#203)', () => {
  it('refuses a client the owner marked blocked, and writes nothing', async () => {
    const res = await postQuote({ client_id: 'client-blocked' });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('CLIENT_CREDIT_BLOCKED');
    // The message names the client and where to change the state — a refusal
    // the tenant cannot act on is a dead end.
    expect(body.error.message).toContain('Comercial Morosa SA');
    expect(insertCalls).toHaveLength(0);
  });

  it('creates for an active client', async () => {
    const res = await postQuote({ client_id: 'client-active' });

    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
  });

  it('suspended stays a warning, not a refusal — the wizard words it', async () => {
    const res = await postQuote({ client_id: 'client-suspended' });

    expect(res.status).toBe(201);
  });

  it('a client with no credit line configured is not restricted', async () => {
    const res = await postQuote({ client_id: 'client-no-line' });

    expect(res.status).toBe(201);
  });

  it("refuses a client id the organization does not hold, and writes nothing", async () => {
    // The FK only proves the id exists somewhere; without this refusal a quote
    // can be planted referencing another tenant's client (same class as #164's
    // bank_account_id check). Not-found is a definitive answer — distinct from
    // the failed-read case below, which stays permissive.
    const res = await postQuote({ client_id: 'client-of-another-tenant' });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('CLIENT_NOT_FOUND');
    expect(insertCalls).toHaveLength(0);
  });

  it('a failed credit read answers "unknown" and still creates (#64 posture)', async () => {
    clientsReadFails = true;
    const res = await postQuote({ client_id: 'client-blocked' });

    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
  });

  it('a quote naming no client skips the gate entirely', async () => {
    const res = await postQuote({});

    expect(res.status).toBe(201);
  });
});

describe('PUT /api/quotes/[id] credit gate (#203)', () => {
  it('refuses re-pointing a quote at a blocked client, and writes nothing', async () => {
    const res = await putQuote({ client_id: 'client-blocked' });

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('CLIENT_CREDIT_BLOCKED');
    expect(updateCalls).toHaveLength(0);
  });

  it('leaves an edit alone when it does not name a client', async () => {
    const res = await putQuote({ title: 'Suministro corregido' });

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
  });
});
