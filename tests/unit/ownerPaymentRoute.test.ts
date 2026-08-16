import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `POST /api/receivables/[id]/payments` — registrar pago (#394, option A).
 *
 * The route's job is narrow and the risky parts are all at its edges: who may
 * call it, what it refuses to read off the body, and whether a refusal is
 * reported as one. The arithmetic lives in `record_owner_payment` and is
 * covered by `ownerRecordedPayment.test.ts`.
 */

const authState = { role: 'owner' as string };
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
let rpcResult: { data: unknown; error: unknown } = { data: '20000', error: null };

vi.mock('@/lib/apiAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiAuth')>('@/lib/apiAuth');
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        supabase: {},
        userId: 'user-1',
        organizationId: 'org-1',
        role: authState.role,
      },
    })),
  };
});

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
  }),
}));

const params = Promise.resolve({ id: 'milestone-1' });

async function post(body: unknown) {
  const { POST } = await import('@/app/api/receivables/[id]/payments/route');
  const res = await POST(
    new Request('http://test/api', { method: 'POST', body: JSON.stringify(body) }),
    { params }
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  authState.role = 'owner';
  rpcCalls.length = 0;
  rpcResult = { data: '20000', error: null };
});

describe('who may record a payment', () => {
  it('refuses a member — recording money is the confirm_payment class of act', async () => {
    authState.role = 'member';
    const res = await post({ amount: 20000 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    // Refused before the database is touched, not after.
    expect(rpcCalls).toHaveLength(0);
  });

  it.each(['owner', 'manager', 'accountant'])('allows %s', async (role) => {
    authState.role = role;
    const res = await post({ amount: 20000 });
    expect(res.status).toBe(200);
  });
});

describe('what the route reads, and refuses to read', () => {
  it('records the amount of this wire and answers with the new total', async () => {
    const res = await post({ amount: 20000, trackingReference: ' SPEI20260814000001 ' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, transferred_amount: 20000 });
    expect(rpcCalls[0].name).toBe('record_owner_payment');
    expect(rpcCalls[0].args.p_amount).toBe(20000);
    expect(rpcCalls[0].args.p_tracking_reference).toBe('SPEI20260814000001');
    // The organization comes from the session, never the body.
    expect(rpcCalls[0].args.p_organization_id).toBe('org-1');
  });

  it('never takes a receipt URL from the caller', async () => {
    await post({ amount: 20000, receiptUrl: 'https://evil.example/comprobante.pdf' });

    // A comprobante is filed through the upload route, which issues the storage
    // URL itself. Accepting one here would let a caller write any string into a
    // column the UI renders as a link (#355/#85).
    expect(rpcCalls[0].args.p_receipt_url).toBeNull();
  });

  it('rejects an amount that is not a payment, on the field', async () => {
    for (const amount of [0, -5, 'mucho', undefined]) {
      const res = await post({ amount });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
      // Keyed by column so it lands under the input rather than in a banner a
      // 375px viewport has scrolled past (#146).
      expect(res.body.error.fields?.amount).toBeTruthy();
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it('rejects an unparseable date rather than dating the payment to today', async () => {
    const res = await post({ amount: 100, declaredAt: 'ayer' });

    expect(res.status).toBe(400);
    expect(res.body.error.fields?.declaredAt).toBeTruthy();
    expect(rpcCalls).toHaveLength(0);
  });

  it('passes a real date through, because parcialidad numbering is chronological', async () => {
    await post({ amount: 100, declaredAt: '2026-08-01T17:00:00.000Z' });
    expect(rpcCalls[0].args.p_declared_at).toBe('2026-08-01T17:00:00.000Z');
  });
});

describe('failures are reported as failures', () => {
  it('answers 404 when the cobro is not this organization’s', async () => {
    // The function has no status filter, so zero rows can only mean this.
    rpcResult = { data: null, error: null };
    const res = await post({ amount: 100 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not report a write the database refused as a success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    rpcResult = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

    const res = await post({ amount: 100 });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBeUndefined();
    expect(typeof res.body.error?.message).toBe('string');
  });
});
