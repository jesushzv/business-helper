import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The public payment route's milestone targeting (money-path review of the
 * #79 fix). While #79 404'd every request, the POST logic had never run; once
 * live, taking `[0]` of an unordered embed let the row shown and the row
 * marked diverge, and a re-POST could rewrite a `confirmed` milestone back to
 * `marked_paid`, destroying the confirmed record's evidence.
 *
 * Pinned here: GET and POST agree on "earliest still-payable milestone";
 * a contract with nothing payable answers 409 PAYMENT_ALREADY_RECORDED; and
 * the write itself carries the status filter, so zero rows updated is a 409,
 * never a success.
 */

interface MockMilestone {
  id: string;
  label?: string;
  amount?: number;
  due_date?: string;
  status?: string;
}

const state: {
  milestones: MockMilestone[];
  updatedRows: Array<{ id: string }>;
  lastUpdate: { values?: Record<string, unknown>; id?: string; statuses?: string[] } | null;
} = { milestones: [], updatedRows: [], lastUpdate: null };

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  // Vitest leaves NEXT_PUBLIC_SUPABASE_URL unset, which the real function
  // reads as the sandbox — and the sandbox serves its fixture instead of the
  // logic under test (#259's gate).
  isDemoDeployment: () => false,
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'quote-1',
                  organization_id: 'org-1',
                  title: 'Suministro',
                  contracts: { id: 'contract-1', title: 'Suministro', milestones: state.milestones },
                  clients: { name: 'Cliente' },
                  organizations: { name: 'Ferretería', bank_accounts: [{ id: 'a1', label: 'BBVA', bank_name: 'BBVA', clabe: '012180001234567899', account_holder: null, is_default: true, archived_at: null }] },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      // milestones update chain: .update(v).eq('id', x).in('status', [...]).select('id')
      return {
        update: (values: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            in: (_c: string, statuses: string[]) => ({
              select: async () => {
                state.lastUpdate = { values, id, statuses };
                return { data: state.updatedRows, error: null };
              },
            }),
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        // Shape is not existence: the route proves the object is really in the
        // bucket before minting a URL for it (#85).
        list: async () => ({ data: [{ name: 'spei_m-1_1234.png' }], error: null }),
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://project.supabase.co/storage/v1/object/public/spei-vouchers/${path}`,
          },
        }),
      }),
    },
  }),
}));

async function getRoute() {
  return import('@/app/api/receivables/public/[token]/route');
}

function postRequest(body: Record<string, unknown> = {}): Request {
  return new Request('https://businesshelper.app/api/receivables/public/tok-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracking_reference: 'SPEI123', transferred_amount: 1000, ...body }),
  });
}

const params = { params: Promise.resolve({ token: 'tok-1' }) };

beforeEach(() => {
  state.milestones = [];
  state.updatedRows = [];
  state.lastUpdate = null;
});

describe('GET — which milestone the payer sees', () => {
  it('shows the earliest still-payable milestone, not whichever the embed listed first', async () => {
    state.milestones = [
      { id: 'm-final', label: 'Liquidación', amount: 500, due_date: '2026-10-01', status: 'pending' },
      { id: 'm-paid', label: 'Anticipo', amount: 500, due_date: '2026-08-01', status: 'confirmed' },
      { id: 'm-next', label: 'Segundo pago', amount: 500, due_date: '2026-09-01', status: 'pending' },
    ];
    const { GET } = await getRoute();
    const res = await GET(new Request('https://businesshelper.app/x'), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.milestone.id).toBe('m-next');
  });

  it('answers 409 PAYMENT_ALREADY_RECORDED when nothing is payable — never payment instructions', async () => {
    state.milestones = [
      { id: 'm-1', due_date: '2026-08-01', status: 'confirmed' },
      { id: 'm-2', due_date: '2026-09-01', status: 'marked_paid' },
    ];
    const { GET } = await getRoute();
    const res = await GET(new Request('https://businesshelper.app/x'), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
  });
});

describe('POST — which milestone gets marked, and when it refuses', () => {
  it('targets the same earliest-payable milestone as GET, with the status filter in the write', async () => {
    state.milestones = [
      { id: 'm-paid', due_date: '2026-08-01', status: 'confirmed' },
      { id: 'm-next', due_date: '2026-09-01', status: 'pending' },
    ];
    state.updatedRows = [{ id: 'm-next' }];
    const { POST } = await getRoute();
    const res = await POST(postRequest(), params);
    expect(res.status).toBe(200);
    expect(state.lastUpdate?.id).toBe('m-next');
    expect(state.lastUpdate?.statuses).toEqual(['pending', 'requested']);
  });

  it('409s when every milestone is already declared or confirmed — a confirmed row is never downgraded', async () => {
    state.milestones = [{ id: 'm-1', due_date: '2026-08-01', status: 'confirmed' }];
    const { POST } = await getRoute();
    const res = await POST(postRequest(), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    expect(state.lastUpdate).toBeNull();
  });

  it('409s — not success — when the guarded write updates zero rows (concurrent duplicate)', async () => {
    state.milestones = [{ id: 'm-1', due_date: '2026-09-01', status: 'pending' }];
    state.updatedRows = []; // someone else marked it between read and write
    const { POST } = await getRoute();
    const res = await POST(postRequest(), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
  });
});

/**
 * A receipt-less declaration must not erase a receipt somebody else filed (#339).
 *
 * The payer's own upload is allowed to fail without blocking the declaration
 * (#85's decision), so `receipt_url` was written unconditionally — as `null`
 * whenever the body carried no `receipt_path`. That was harmless only while
 * nothing else could set the column. Wiring the owner-side upload made it
 * destructive: the owner files the comprobante their client sent over
 * WhatsApp, the milestone stays `pending` (filing evidence is not confirming a
 * payment), so it remains the target of the public POST — and the same client
 * submitting a receipt-less declaration afterwards wipes the evidence out of
 * Cobranza and out of the accountant export, silently.
 */
describe('POST — a declaration without a receipt does not erase one (#339)', () => {
  it('omits receipt_url entirely when the body carries no receipt_path', async () => {
    state.milestones = [{ id: 'm-1', due_date: '2026-09-01', status: 'pending' }];
    state.updatedRows = [{ id: 'm-1' }];
    const { POST } = await getRoute();

    const res = await POST(postRequest(), params);

    expect(res.status).toBe(200);
    // Not "is null" — the key must be absent, so the column keeps its value.
    expect(state.lastUpdate?.values).not.toHaveProperty('receipt_url');
    // The rest of the declaration still lands.
    expect(state.lastUpdate?.values).toMatchObject({
      status: 'marked_paid',
      tracking_reference: 'SPEI123',
      transferred_amount: 1000,
    });
  });

  it('still writes the receipt when the payer did attach one', async () => {
    state.milestones = [{ id: 'm-1', due_date: '2026-09-01', status: 'pending' }];
    state.updatedRows = [{ id: 'm-1' }];
    const { POST } = await getRoute();

    const res = await POST(
      postRequest({ receipt_path: 'org-1/spei_m-1_1234.png' }),
      params
    );

    expect(res.status).toBe(200);
    expect(state.lastUpdate?.values).toHaveProperty('receipt_url');
    expect(String(state.lastUpdate?.values?.receipt_url)).toContain('spei_m-1_1234.png');
  });
});
