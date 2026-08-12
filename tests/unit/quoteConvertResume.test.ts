import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #218 — the convert route resumes a partial conversion instead of dead-ending.
 *
 * `contracts.quote_id` is UNIQUE, so once any contract exists for a quote a
 * blind re-insert answers 23505 → 409 «Ya existe…» forever, while the quote
 * still reads unconverted. Two partial failures produce exactly that state:
 * a milestone insert whose hand-rolled rollback also failed (an orphan with no
 * schedule), and a full conversion whose quote-status update failed. The route
 * must finish what exists — and must not double the receivable while doing so.
 *
 * Calls the real handler and asserts on what reaches the DB layer
 * (`quoteBankAccountRoute.test.ts` is the pattern; #146 is why the seam gets
 * its own test).
 */

const contractInserts: Array<Record<string, unknown>> = [];
const milestoneInserts: Array<Array<Record<string, unknown>>> = [];
const quoteUpdates: Array<Record<string, unknown>> = [];

/** Set per test: the contract (and its milestones) already in the database. */
let existingContract: Record<string, unknown> | null = null;
let existingMilestones: Array<Record<string, unknown>> = [];

const QUOTE = {
  id: 'quote-1',
  organization_id: 'org-1',
  client_id: 'client-1',
  title: 'Suministro',
  total_amount: 116000,
  currency: 'MXN',
  status: 'accepted',
  converted_contract_id: null,
  client_otp_verified: true,
  accepted_at: '2026-08-11T04:57:49.418Z',
  accepted_by_name: 'Camila Chavez Calette',
  accepted_ip: '189.203.34.6',
  contract_hash: 'hash-1',
};

function quotesTable() {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: async () =>
      filters.id === QUOTE.id && filters.organization_id === 'org-1'
        ? { data: QUOTE, error: null }
        : { data: null, error: null },
    update: (values: Record<string, unknown>) => {
      quoteUpdates.push(values);
      return { eq: () => ({ eq: async () => ({ error: null }) }) };
    },
  };
  return builder;
}

function contractsTable() {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: async () =>
      filters.quote_id === QUOTE.id && filters.organization_id === 'org-1'
        ? { data: existingContract, error: null }
        : { data: null, error: null },
    insert: (values: Record<string, unknown>) => {
      contractInserts.push(values);
      return {
        select: () => ({
          single: async () => ({ data: { id: 'contract-new', ...values }, error: null }),
        }),
      };
    },
    delete: () => ({ eq: async () => ({ error: null }) }),
  };
  return builder;
}

function milestonesTable() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      resolve({ data: existingMilestones, error: null }),
    insert: (values: Array<Record<string, unknown>>) => {
      milestoneInserts.push(values);
      return { select: async () => ({ data: values.map((v, i) => ({ id: `ms-${i}`, ...v })), error: null }) };
    },
  };
  return builder;
}

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'member',
        supabase: {
          from: (table: string) => {
            if (table === 'quotes') return quotesTable();
            if (table === 'contracts') return contractsTable();
            if (table === 'milestones') return milestonesTable();
            throw new Error(`unexpected table ${table}`);
          },
        },
      },
    })),
  };
});

vi.mock('@/lib/organizationTrialGate', () => ({
  readOrganizationTrialState: vi.fn(async () => ({ blocksNewWork: false, endsAt: null })),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const { POST } = await import('@/app/api/quotes/[id]/convert/route');

function convert() {
  return POST(new Request('http://localhost/api/quotes/quote-1/convert', { method: 'POST' }), {
    params: Promise.resolve({ id: 'quote-1' }),
  });
}

beforeEach(() => {
  contractInserts.length = 0;
  milestoneInserts.length = 0;
  quoteUpdates.length = 0;
  existingContract = null;
  existingMilestones = [];
});

describe('POST /api/quotes/[id]/convert — fresh conversion', () => {
  it('creates the contract and milestones and flips the quote, answering 201', async () => {
    const res = await convert();

    expect(res.status).toBe(201);
    expect(contractInserts).toHaveLength(1);
    expect(milestoneInserts).toHaveLength(1);
    expect(milestoneInserts[0]).toHaveLength(2);
    expect(quoteUpdates[0]).toMatchObject({ status: 'converted' });
  });
});

describe('POST /api/quotes/[id]/convert — resume (#218)', () => {
  it('heals the orphan: contract exists, no milestones → inserts the schedule against it', async () => {
    existingContract = { id: 'contract-orphan', quote_id: QUOTE.id, organization_id: 'org-1' };

    const res = await convert();

    expect(res.status).toBe(200);
    // No second contract — the UNIQUE 23505 dead-end this exists to prevent.
    expect(contractInserts).toHaveLength(0);
    expect(milestoneInserts).toHaveLength(1);
    expect(milestoneInserts[0].every((m) => m.contract_id === 'contract-orphan')).toBe(true);
    expect(quoteUpdates[0]).toMatchObject({
      status: 'converted',
      converted_contract_id: 'contract-orphan',
    });
  });

  it('heals the half-converted quote: contract and milestones exist → only the quote update runs', async () => {
    existingContract = { id: 'contract-done', quote_id: QUOTE.id, organization_id: 'org-1' };
    existingMilestones = [
      { id: 'ms-a', contract_id: 'contract-done', amount: 58000 },
      { id: 'ms-b', contract_id: 'contract-done', amount: 58000 },
    ];

    const res = await convert();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(contractInserts).toHaveLength(0);
    // The receivable must not double: the existing schedule is returned as-is.
    expect(milestoneInserts).toHaveLength(0);
    expect(body.milestones).toHaveLength(2);
    expect(body.contract.id).toBe('contract-done');
    expect(quoteUpdates[0]).toMatchObject({
      status: 'converted',
      converted_contract_id: 'contract-done',
    });
  });
});
