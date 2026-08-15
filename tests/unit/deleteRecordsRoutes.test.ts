import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Deletion, gated and guarded.
 *
 * Deletes were the only writes with no capability check — any member of any
 * role could destroy a client, a quote, a product or a cobro — and two of the
 * routes would happily destroy records the business cannot afford to lose: a
 * signed/converted quote (whose public_token is what /pay/[token] resolves,
 * so deleting it kills a payment link already in a client's hands — the #72
 * defect manufactured on purpose) and a milestone with payments or a CFDI
 * (whose complementos CASCADE away with it).
 *
 * These pin the properties per route: the delete_records gate holds; the
 * status guards travel inside the DELETE statement itself; the cross-table
 * facts a status cannot carry (a #218 partially-converted quote's live
 * contract, an in-flight stamp claim) are checked before the destruction; and
 * a refused deletion answers with a Spanish 409 naming why — never a 404 that
 * reads as "already gone".
 */

const authState = {
  role: 'owner' as string,
};

/**
 * Per-table answer queues: every `.maybeSingle()` shifts the next answer off
 * the queue for the table its chain was created with, defaulting to no-row.
 * The routes consult more than one table now (quotes → contracts first,
 * milestones → cfdi_stamp_claims → milestone_payments first), so a single flat
 * queue would couple the tests to call order.
 */
const dbState = {
  tables: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
  chains: [] as Array<{ table: string } & Record<string, ReturnType<typeof vi.fn>>>,
};

const ROW_OK = { data: { id: 'row-1' }, error: null };
const NO_ROW = { data: null, error: null };

/**
 * The parent-contract read `DELETE /api/receivables/[id]` now issues first
 * (#335). A schedule the client has signed is immutable, so the route reads
 * the contract's status before it destroys anything and refuses when it is
 * not one the tenant may still change.
 */
const parentContract = (status: string) => ({
  data: { id: 'row-1', contracts: { status } },
  error: null,
});

function makeSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      const chain = { table } as { table: string } & Record<string, ReturnType<typeof vi.fn>>;
      // `limit` joined the list with the milestone_payments pre-check (#381):
      // a cobro can carry several declared payments, so that read takes the
      // first rather than asking maybeSingle() to choose among many.
      for (const method of ['delete', 'select', 'eq', 'in', 'limit']) {
        chain[method] = vi.fn().mockReturnValue(chain);
      }
      chain.maybeSingle = vi.fn(async () => dbState.tables[table]?.shift() ?? NO_ROW);
      dbState.chains.push(chain);
      return chain;
    }),
  };
}

vi.mock('@/lib/apiAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiAuth')>('@/lib/apiAuth');
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        supabase: makeSupabaseMock(),
        userId: 'user-1',
        organizationId: 'org-1',
        role: authState.role,
      },
    })),
  };
});

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}));

const params = Promise.resolve({ id: 'row-1' });
const req = (method = 'DELETE') => new Request('http://test/api', { method });

/** The RESTRICT-direction 23503, in Postgres' real wording. */
const RESTRICT_ERROR = {
  code: '23503',
  message:
    'update or delete on table "clients" violates foreign key constraint "quotes_client_id_fkey" on table "quotes"',
  details: 'Key (id)=(row-1) is still referenced from table "quotes".',
};

function chainsFor(table: string) {
  return dbState.chains.filter((c) => c.table === table);
}

beforeEach(() => {
  authState.role = 'owner';
  dbState.tables = {};
  dbState.chains = [];
});

describe('the delete_records gate holds on every data-delete route', () => {
  const routes = [
    ['clients', 'clients', () => import('@/app/api/clients/[id]/route')],
    ['quotes', 'quotes', () => import('@/app/api/quotes/[id]/route')],
    ['products', 'products', () => import('@/app/api/products/[id]/route')],
    ['receivables', 'milestones', () => import('@/app/api/receivables/[id]/route')],
  ] as const;

  it.each(routes)('rejects a member deleting a %s row with 403, before touching the database', async (_name, _table, load) => {
    authState.role = 'member';
    const { DELETE } = await load();
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(dbState.chains).toHaveLength(0);
  });

  it.each(routes)('rejects an accountant deleting a %s row', async (_name, _table, load) => {
    authState.role = 'accountant';
    const { DELETE } = await load();
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(403);
  });

  it.each(routes)('lets a manager delete a %s row', async (_name, table, load) => {
    authState.role = 'manager';
    // The receivables route reads its parent contract first (#335); every
    // other route's first answer on its own table is the delete itself.
    dbState.tables =
      table === 'milestones'
        ? { milestones: [parentContract('draft'), ROW_OK] }
        : { [table]: [ROW_OK] };
    const { DELETE } = await load();
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/clients/[id] — a client with history is refused honestly', () => {
  it('maps the RESTRICT 23503 to a 409 naming cotizaciones y contratos', async () => {
    dbState.tables = { clients: [{ data: null, error: RESTRICT_ERROR }] };
    const { DELETE } = await import('@/app/api/clients/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('HAS_REFERENCES');
    expect(body.error.message).toMatch(/cotizaciones o contratos/i);
    // The old mapping told the tenant the record "ya no existe" and to reload.
    expect(body.error.message).not.toMatch(/recarga|ya no existe/i);
  });

  it('deletes a history-free client and scopes by organization', async () => {
    dbState.tables = { clients: [ROW_OK] };
    const { DELETE } = await import('@/app/api/clients/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(200);
    const chain = chainsFor('clients')[0];
    expect(chain.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });
});

describe('DELETE /api/quotes/[id] — signed and converted quotes are not deletable', () => {
  it('carries the status precondition inside the DELETE itself', async () => {
    dbState.tables = { quotes: [ROW_OK] };
    const { DELETE } = await import('@/app/api/quotes/[id]/route');
    await DELETE(req(), { params });

    const chain = chainsFor('quotes')[0];
    const inCall = chain.in.mock.calls.find(([column]) => column === 'status');
    expect(inCall).toBeDefined();
    const statuses = inCall![1] as string[];
    expect(statuses).toEqual(expect.arrayContaining(['draft', 'sent', 'rejected', 'expired']));
    // accepted carries the client's OTP signature; converted anchors the live
    // /pay/ link. Neither may ever enter the deletable set.
    expect(statuses).not.toContain('accepted');
    expect(statuses).not.toContain('converted');
  });

  it('refuses a quote whose contract exists even while its status is still deletable (#218)', async () => {
    // The partial-conversion state: contract + milestones inserted, the final
    // status flip failed, quote still 'sent'. Status alone would delete it,
    // SET-NULL the contract's quote_id, and kill the /pay/ link plus the #218
    // resume path.
    dbState.tables = { contracts: [{ data: { id: 'contract-1' }, error: null }] };
    const { DELETE } = await import('@/app/api/quotes/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('QUOTE_PROTECTED');
    expect(body.error.message).toMatch(/contrato/i);
    // The quote itself must not have been touched.
    expect(chainsFor('quotes')).toHaveLength(0);
    // And the contract lookup is org-scoped like every other read.
    const contractChain = chainsFor('contracts')[0];
    expect(contractChain.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });

  it('answers 409 QUOTE_PROTECTED — not 404 — when the quote exists in a protected status', async () => {
    dbState.tables = {
      quotes: [
        NO_ROW, // the guarded DELETE matches no row
        { data: { status: 'converted' }, error: null }, // the classifying read finds it
      ],
    };
    const { DELETE } = await import('@/app/api/quotes/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('QUOTE_PROTECTED');
    expect(body.error.message).toMatch(/firmada o convertida/i);
  });

  it('still answers 404 when the quote does not exist in this organization', async () => {
    dbState.tables = { quotes: [NO_ROW, NO_ROW] };
    const { DELETE } = await import('@/app/api/quotes/[id]/route');
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/receivables/[id] — a cobro with movement is a money record', () => {
  it('deletes only a pending milestone with no CFDI, enforced inside the DELETE', async () => {
    dbState.tables = { milestones: [parentContract('sent'), ROW_OK] };
    const { DELETE } = await import('@/app/api/receivables/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(200);
    // [0] is the parent-contract read; the DELETE is the chain after it.
    const chain = chainsFor('milestones')[1];
    expect(chain.eq).toHaveBeenCalledWith('status', 'pending');
    expect(chain.eq).toHaveBeenCalledWith('cfdi_status', 'none');
    expect(chain.eq).toHaveBeenCalledWith('organization_id', 'org-1');
  });

  it('refuses a milestone that already has a declared payment, by name', async () => {
    // `milestone_payments.milestone_id` is ON DELETE RESTRICT (#381), so
    // without this pre-check the DELETE fails with a bare 23503 and the tenant
    // reads "tiene registros relacionados" — a refusal naming a table they
    // cannot see. Reachable: a `pending` milestone carrying a
    // `transferred_amount` is a partial wire the owner logged and left open,
    // which is exactly what the backfill turned into a ledger row.
    dbState.tables = {
      milestones: [parentContract('draft')],
      milestone_payments: [{ data: { id: 'payment-1' }, error: null }],
    };
    const { DELETE } = await import('@/app/api/receivables/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('MILESTONE_PROTECTED');
    expect(body.error.message).toMatch(/pago registrado/i);
    expect(chainsFor('milestones').some((c) => c.delete.mock.calls.length > 0)).toBe(false);
  });

  it('refuses a milestone with an in-flight stamp claim before touching the row', async () => {
    // Between the claim insert and the cfdi_status flip, the milestone still
    // reads pending/none; deleting it would CASCADE the claim away and leave
    // a possible live SAT document with no reconciliation anchor.
    dbState.tables = {
      milestones: [parentContract('draft')],
      cfdi_stamp_claims: [{ data: { milestone_id: 'row-1' }, error: null }],
    };
    const { DELETE } = await import('@/app/api/receivables/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('MILESTONE_PROTECTED');
    expect(body.error.message).toMatch(/timbrado/i);
    // The parent-contract read is a read; nothing was destroyed.
    expect(chainsFor('milestones').some((c) => c.delete.mock.calls.length > 0)).toBe(false);
  });

  it('answers 409 MILESTONE_PROTECTED for a milestone the guard excluded', async () => {
    dbState.tables = { milestones: [parentContract('draft'), NO_ROW, ROW_OK] };
    const { DELETE } = await import('@/app/api/receivables/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('MILESTONE_PROTECTED');
    expect(body.error.message).toMatch(/pago o factura|movimientos/i);
  });

  // #335 — the decision taken in #329: a schedule carrying the client's OTP
  // evidence is immutable, mirroring how #327 treats signed quotes.
  it.each(['client_signed', 'accepted'])(
    'refuses to delete a pending milestone of a %s contract',
    async (status) => {
      dbState.tables = { milestones: [parentContract(status)] };
      const { DELETE } = await import('@/app/api/receivables/[id]/route');
      const res = await DELETE(req(), { params });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('CONTRACT_SIGNED');
      // Plain Spanish saying *why*, not "precondition failed" (hard rule 8).
      expect(body.error.message).toMatch(/firmó/i);
      expect(body.error.message).not.toMatch(/precondition|status|contract\b/i);
      // Refused before anything was destroyed.
      expect(chainsFor('milestones').some((c) => c.delete.mock.calls.length > 0)).toBe(false);
    }
  );

  it('refuses for completed and cancelled contracts too — the allowlist is draft/sent', async () => {
    for (const status of ['completed', 'cancelled']) {
      dbState.tables = { milestones: [parentContract(status)] };
      dbState.chains = [];
      const { DELETE } = await import('@/app/api/receivables/[id]/route');
      const res = await DELETE(req(), { params });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe('CONTRACT_SIGNED');
    }
  });

  it('refuses rather than proceeds when the contract status cannot be established', async () => {
    // `milestones.contract_id` is NOT NULL, so an unresolvable contract is a
    // broken row. "We could not establish the status" must not collapse into
    // "go ahead and destroy it" (#64's tri-state rule on a destructive write).
    dbState.tables = { milestones: [{ data: { id: 'row-1', contracts: null }, error: null }] };
    const { DELETE } = await import('@/app/api/receivables/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('CONTRACT_SIGNED');
    expect(chainsFor('milestones').some((c) => c.delete.mock.calls.length > 0)).toBe(false);
  });

  it('reads the embed as PostgREST may hand it back — an array of one', async () => {
    dbState.tables = {
      milestones: [{ data: { id: 'row-1', contracts: [{ status: 'draft' }] }, error: null }, ROW_OK],
    };
    const { DELETE } = await import('@/app/api/receivables/[id]/route');
    const res = await DELETE(req(), { params });

    expect(res.status).toBe(200);
  });

  it("still deletes a pending, unstamped milestone of a contract the tenant may change", async () => {
    for (const status of ['draft', 'sent']) {
      dbState.tables = { milestones: [parentContract(status), ROW_OK] };
      dbState.chains = [];
      const { DELETE } = await import('@/app/api/receivables/[id]/route');
      const res = await DELETE(req(), { params });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    }
  });

  it('answers the conventional Spanish envelope on not-found, not a bare English string', async () => {
    dbState.tables = { milestones: [NO_ROW, NO_ROW] };
    const { DELETE } = await import('@/app/api/receivables/[id]/route');
    const res = await DELETE(req(), { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toMatch(/cobro/i);
  });
});

describe('source contract', () => {
  it.each([
    'app/api/clients/[id]/route.ts',
    'app/api/quotes/[id]/route.ts',
    'app/api/products/[id]/route.ts',
    'app/api/receivables/[id]/route.ts',
  ])('%s checks the delete_records capability', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).toContain("hasCapability(role, 'delete_records')");
  });
});
