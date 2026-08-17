import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The public payment route's milestone targeting (money-path review of the
 * #79 fix). While #79 404'd every request, the POST logic had never run; once
 * live, taking `[0]` of an unordered embed let the row shown and the row
 * marked diverge, and a re-POST could rewrite a `confirmed` milestone back to
 * `marked_paid`, destroying the confirmed record's evidence.
 *
 * Pinned here: GET and POST agree on "earliest still-payable milestone";
 * a contract with nothing payable answers 409 — and *which* 409, since #382
 * split "ya está cubierto" from "ya fue registrado"; and the write itself
 * carries the status filter, so zero rows updated is a 409, never a success.
 *
 * "Payable" now means **a balance remains**, not a status (#382). A cobro
 * declared short stays reachable so the client can send the rest.
 */

/**
 * Server-shaped, not fixture-shaped: `transferred_amount` is required and
 * nullable, matching what the route's select now takes. The predicate reads the
 * balance rather than the status (#382), and a fixture that omits the money
 * columns exercises a row PostgREST would never return — which is how a
 * partial wire came to read as fully collected in the first place (#351).
 */
interface MockMilestone {
  id: string;
  label?: string;
  amount?: number;
  transferred_amount: number | string | null;
  cfdi_total?: number | null;
  cfdi_status?: string | null;
  due_date?: string;
  status?: string;
}

const state: {
  milestones: MockMilestone[];
  /** Every `record_milestone_payment` call the route made, with its arguments. */
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** Forced return, for the refusal cases. `{data: null}` is "nothing payable". */
  rpcResult: { data: unknown; error: unknown } | null;
} = { milestones: [], rpcCalls: [], rpcResult: null };

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
      throw new Error(`unexpected table ${table}`);
    },
    // The declaration is one transaction now (#381): claim, ledger row and the
    // new total all inside `record_milestone_payment`.
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (state.rpcResult) return state.rpcResult;
      return { data: String(Number(args.p_amount)), error: null };
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
  state.rpcCalls = [];
  state.rpcResult = null;
});

describe('GET — which milestone the payer sees', () => {
  it('shows the earliest still-payable milestone, not whichever the embed listed first', async () => {
    state.milestones = [
      { id: 'm-final', label: 'Liquidación', amount: 500, transferred_amount: null, due_date: '2026-10-01', status: 'pending' },
      { id: 'm-paid', label: 'Anticipo', amount: 500, transferred_amount: 500, due_date: '2026-08-01', status: 'confirmed' },
      { id: 'm-next', label: 'Segundo pago', amount: 500, transferred_amount: null, due_date: '2026-09-01', status: 'pending' },
    ];
    const { GET } = await getRoute();
    const res = await GET(new Request('https://businesshelper.app/x'), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.milestone.id).toBe('m-next');
  });

  it('answers 409 PAYMENT_ALREADY_RECORDED when nothing is open — never payment instructions', async () => {
    state.milestones = [
      { id: 'm-1', amount: 500, transferred_amount: 500, due_date: '2026-08-01', status: 'confirmed' },
      { id: 'm-2', amount: 500, transferred_amount: 200, due_date: '2026-09-01', status: 'confirmed' },
    ];
    const { GET } = await getRoute();
    const res = await GET(new Request('https://businesshelper.app/x'), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
  });

  it('serves a declared cobro that still owes money, rather than closing the link (#382)', async () => {
    // The fixture below used to answer 409: `marked_paid` was excluded whatever
    // it owed, so a client who wired part of a cobro and declared it could
    // never send the rest through the product.
    state.milestones = [
      { id: 'm-1', amount: 500, transferred_amount: 500, due_date: '2026-08-01', status: 'confirmed' },
      { id: 'm-2', amount: 500, transferred_amount: 200, due_date: '2026-09-01', status: 'marked_paid' },
    ];
    const { GET } = await getRoute();
    const res = await GET(new Request('https://businesshelper.app/x'), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.milestone.id).toBe('m-2');
    expect(body.milestone.amount).toBe(300);
  });

  it('answers 409 PAYMENT_ALREADY_SETTLED when the declared cobro is covered', async () => {
    // Open, and everything the business recorded covers it. A distinct answer
    // from the one above: "no transfieras de nuevo", not "ya fue registrado".
    state.milestones = [
      { id: 'm-2', amount: 500, transferred_amount: 500, due_date: '2026-09-01', status: 'marked_paid' },
    ];
    const { GET } = await getRoute();
    const res = await GET(new Request('https://businesshelper.app/x'), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_SETTLED');
  });
});

describe('POST — which milestone gets marked, and when it refuses', () => {
  it('targets the same earliest-payable milestone as GET, with the status filter in the write', async () => {
    state.milestones = [
      { id: 'm-paid', amount: 500, transferred_amount: 500, due_date: '2026-08-01', status: 'confirmed' },
      { id: 'm-next', amount: 500, transferred_amount: null, due_date: '2026-09-01', status: 'pending' },
    ];
    const { POST } = await getRoute();
    const res = await POST(postRequest(), params);
    expect(res.status).toBe(200);
    // The status filter and the tenant scope moved inside
    // `record_milestone_payment` (#381) — see the migration for why the three
    // writes had to become one transaction. What the route still owns is
    // *which* milestone it names.
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].name).toBe('record_milestone_payment');
    expect(state.rpcCalls[0].args.p_milestone_id).toBe('m-next');
    expect(state.rpcCalls[0].args.p_organization_id).toBe('org-1');
  });

  it('409s when every milestone is already declared or confirmed — a confirmed row is never downgraded', async () => {
    state.milestones = [{ id: 'm-1', amount: 500, transferred_amount: 500, due_date: '2026-08-01', status: 'confirmed' }];
    const { POST } = await getRoute();
    const res = await POST(postRequest(), params);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('409s — not success — when the guarded write updates zero rows (concurrent duplicate)', async () => {
    state.milestones = [{ id: 'm-1', amount: 5000, transferred_amount: null, due_date: '2026-09-01', status: 'pending' }];
    // NULL is the function's "nothing was payable" answer: someone else marked
    // it between the read and the write, so the transaction rolled back.
    state.rpcResult = { data: null, error: null };
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
  it('passes a null receipt when the body carries no receipt_path', async () => {
    state.milestones = [{ id: 'm-1', amount: 5000, transferred_amount: null, due_date: '2026-09-01', status: 'pending' }];
    const { POST } = await getRoute();

    const res = await POST(postRequest(), params);

    expect(res.status).toBe(200);
    // NULL here means "leave the column alone": the function writes
    // `receipt_url = COALESCE(p_receipt_url, receipt_url)`, so a receipt-less
    // declaration cannot erase the comprobante the owner filed. The guarantee
    // moved from an absent key to a COALESCE, and this is what checks it is
    // still a guarantee.
    expect(state.rpcCalls[0].args.p_receipt_url).toBeNull();
    expect(state.rpcCalls[0].args).toMatchObject({
      p_milestone_id: 'm-1',
      p_amount: 1000,
      p_source: 'payer_declaration',
      p_tracking_reference: 'SPEI123',
    });
  });

  it('still passes the receipt when the payer did attach one', async () => {
    state.milestones = [{ id: 'm-1', amount: 5000, transferred_amount: null, due_date: '2026-09-01', status: 'pending' }];
    const { POST } = await getRoute();

    const res = await POST(
      postRequest({ receipt_path: 'org-1/spei_m-1_1234.png' }),
      params
    );

    expect(res.status).toBe(200);
    expect(String(state.rpcCalls[0].args.p_receipt_url)).toContain('spei_m-1_1234.png');
  });
});
