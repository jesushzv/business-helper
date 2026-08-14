import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #148 at the routes — the wiring, not the helper.
 *
 * `writeErrorResponses.test.ts` proves the describer answers well; the scan in
 * `writeErrorLegibility.test.ts` proves every route calls something. Neither
 * proves a route passes the *right* error, the right noun or the right verb,
 * and neither would notice a handler that classified the failure and then
 * returned 200 anyway. These invoke the real handlers with a Supabase double
 * whose write fails, and read the response — the only place all three show up.
 *
 * Three of the routes here answered a failed write in **English** with a bare
 * string body (`{ error: 'Failed to update milestone' }`), which breaks the
 * envelope every consumer branches on (CLAUDE.md convention 2) as well as
 * hiding the cause.
 */

const SCHEMA_STALE = {
  code: 'PGRST204',
  message: "Could not find the 'transferred_amount' column of 'milestones' in the schema cache",
};
const RLS_DENIED = { code: '42501', message: 'new row violates row-level security policy' };

const state: { failure: unknown } = { failure: null };

vi.mock('@/lib/sentry', () => ({ captureException: () => {} }));
vi.mock('@/lib/supabase/server', () => ({ isSupabaseConfigured: () => true }));

/** Every chain a write in these routes uses, all resolving to the injected failure. */
function failingTable() {
  const result = async () => ({ data: null, error: state.failure });
  const selectable = () => ({ select: () => ({ single: result, maybeSingle: result }) });
  // `neq` after the org scope is the confirm route's not-yet-confirmed
  // precondition, carried inside the UPDATE (#286).
  const scoped = () => ({
    eq: () => ({
      eq: () => ({ neq: () => selectable(), ...selectable() }),
      ...selectable(),
    }),
  });
  return {
    insert: () => ({ ...selectable(), then: undefined }),
    update: () => scoped(),
    delete: () => scoped(),
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: 'm-1' }, error: null }) }),
        maybeSingle: async () => ({ data: { id: 'm-1' }, error: null }),
      }),
    }),
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
        supabase: { from: () => failingTable() },
      },
    })),
  };
});

function jsonRequest(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.failure = null;
});

describe('POST /api/products', () => {
  it('answers a stale schema with 503 and the column, not one opaque 500', async () => {
    state.failure = { code: 'PGRST204', message: "Could not find the 'unit' column of 'products' in the schema cache" };
    const { POST } = await import('@/app/api/products/route');
    const res = await POST(
      jsonRequest('https://businesshelper.app/api/products', {
        name: 'Cemento gris 50kg',
        unit_price: 250,
      })
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('SCHEMA_OUT_OF_DATE');
    expect(body.error.message).toContain('unit');
    // And never a fabricated product (hard rule 1).
    expect(body.product).toBeUndefined();
  });
});

describe('PUT /api/receivables/[id]', () => {
  it('answers a permission denial in Spanish, inside the envelope', async () => {
    state.failure = RLS_DENIED;
    const { PUT } = await import('@/app/api/receivables/[id]/route');
    const res = await PUT(
      jsonRequest('https://businesshelper.app/api/receivables/m-1', { label: 'Anticipo' }, 'PUT'),
      { params: Promise.resolve({ id: 'm-1' }) }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    // Was `{ error: 'Failed to update milestone' }` — English, bare string, 500.
    expect(typeof body.error).toBe('object');
    expect(body.error.message).toMatch(/permiso/i);
    expect(body.error.message).toMatch(/actualizar el cobro/i);
  });
});

describe('POST /api/receivables/[id]/confirm', () => {
  it('reports a failed confirmation as a failure, and says why', async () => {
    state.failure = SCHEMA_STALE;
    const { POST } = await import('@/app/api/receivables/[id]/confirm/route');
    const res = await POST(
      jsonRequest('https://businesshelper.app/api/receivables/m-1/confirm', {
        transferred_amount: 5000,
      }),
      { params: Promise.resolve({ id: 'm-1' }) }
    );
    const body = await res.json();

    // Money: the write that would have recorded the payment is the one that
    // failed, so nothing in the answer may read as confirmation.
    expect(res.status).toBe(503);
    expect(body.success).toBeUndefined();
    expect(body.error.code).toBe('SCHEMA_OUT_OF_DATE');
    expect(body.error.message).toContain('transferred_amount');
    expect(JSON.stringify(body)).not.toMatch(/confirmado|confirmed/i);
  });
});
