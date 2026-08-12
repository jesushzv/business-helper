import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #218 / #222 — the convert route resumes a partial conversion instead of
 * dead-ending, and a concurrent twin cannot double the receivable.
 *
 * `contracts.quote_id` is UNIQUE, so once any contract exists for a quote a
 * blind re-insert answers 23505 → 409 «Ya existe…» forever, while the quote
 * still reads unconverted (#218). And because the resume is check-then-act,
 * a concurrent double-POST could insert the milestone schedule twice — the
 * partial unique index `uq_milestones_contract_conversion_position` makes the
 * second insert collide, and the route reads the winner's schedule back
 * instead of erroring (#222).
 *
 * Calls the real handler and asserts on what reaches the DB layer
 * (`quoteBankAccountRoute.test.ts` is the pattern; #146 is why the seam gets
 * its own test).
 */

const contractInserts: Array<Record<string, unknown>> = [];
const contractDeletes: Array<Record<string, unknown>> = [];
const milestoneInserts: Array<Array<Record<string, unknown>>> = [];
const quoteUpdates: Array<Record<string, unknown>> = [];

/** Set per test: the contract (and its milestones) already in the database. */
let existingContract: Record<string, unknown> | null = null;
let existingMilestones: Array<Record<string, unknown>> = [];
/** Set per test: the error the milestone insert answers with. */
let milestoneInsertError: { code: string; message: string } | null = null;

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
    delete: () => {
      const deleteFilters: Record<string, unknown> = {};
      const chain = {
        eq: (column: string, value: unknown) => {
          deleteFilters[column] = value;
          return chain;
        },
        then: (resolve: (value: { error: null }) => unknown) => {
          contractDeletes.push({ ...deleteFilters });
          return resolve({ error: null });
        },
      };
      return chain;
    },
  };
  return builder;
}

function milestonesTable() {
  // The lookup's filters decide whether money gets inserted, so the mock pins
  // them the way contractsTable does — deleting an `.eq()` from the route must
  // go red here, not stay green.
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const scoped =
        filters.contract_id === (existingContract?.id ?? 'contract-new') &&
        filters.organization_id === 'org-1';
      return resolve({ data: scoped ? existingMilestones : [], error: null });
    },
    insert: (values: Array<Record<string, unknown>>) => {
      milestoneInserts.push(values);
      return {
        select: async () =>
          milestoneInsertError
            ? { data: null, error: milestoneInsertError }
            : { data: values.map((v, i) => ({ id: `ms-${i}`, ...v })), error: null },
      };
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
  contractDeletes.length = 0;
  milestoneInserts.length = 0;
  quoteUpdates.length = 0;
  existingContract = null;
  existingMilestones = [];
  milestoneInsertError = null;
});

describe('POST /api/quotes/[id]/convert — fresh conversion', () => {
  it('creates the contract and milestones and flips the quote, answering 201', async () => {
    const res = await convert();

    expect(res.status).toBe(201);
    expect(contractInserts).toHaveLength(1);
    expect(milestoneInserts).toHaveLength(1);
    expect(milestoneInserts[0]).toHaveLength(2);
    // The positions are what the #222 unique index collides on.
    expect(milestoneInserts[0].map((m) => m.conversion_position)).toEqual([1, 2]);
    expect(quoteUpdates[0]).toMatchObject({ status: 'converted' });
  });
});

describe('POST /api/quotes/[id]/convert — resume (#218)', () => {
  it('heals the orphan: contract exists, no milestones → inserts the schedule against it', async () => {
    existingContract = {
      id: 'contract-orphan',
      quote_id: QUOTE.id,
      organization_id: 'org-1',
      client_id: QUOTE.client_id,
      total_amount: QUOTE.total_amount,
    };

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
    existingContract = {
      id: 'contract-done',
      quote_id: QUOTE.id,
      organization_id: 'org-1',
      client_id: QUOTE.client_id,
      total_amount: QUOTE.total_amount,
    };
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

describe('POST /api/quotes/[id]/convert — concurrent twin (#222)', () => {
  it('treats the unique-index 23505 as the twin having won: reads the schedule back, no rollback', async () => {
    // This request created the contract; a concurrent twin resumed it and
    // inserted the schedule first, so this insert collides.
    milestoneInsertError = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint "uq_milestones_contract_conversion_position"',
    };
    // What the read-back finds: the twin's schedule. The mock scopes the
    // lookup to contract-new — the id this request's own insert returned.
    existingMilestones = [
      { id: 'twin-1', contract_id: 'contract-new', amount: 58000 },
      { id: 'twin-2', contract_id: 'contract-new', amount: 58000 },
    ];

    const res = await convert();
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.milestones).toHaveLength(2);
    expect(body.milestones[0].id).toBe('twin-1');
    // The twin's milestones hang off this contract — deleting it would strand
    // them. Nothing may be rolled back.
    expect(contractDeletes).toHaveLength(0);
    expect(quoteUpdates[0]).toMatchObject({ status: 'converted' });
  });
});

describe('POST /api/quotes/[id]/convert — quote edited mid-window (#222 F2)', () => {
  it('recreates a stale orphan from the quote as it reads today', async () => {
    existingContract = {
      id: 'contract-stale-orphan',
      quote_id: QUOTE.id,
      organization_id: 'org-1',
      client_id: QUOTE.client_id,
      total_amount: 99000, // the quote said this when the orphan was created
    };

    const res = await convert();

    expect(res.status).toBe(201);
    // The stale snapshot is deleted and the contract recreated at the current
    // total — milestones must derive from the same numbers as the contract.
    expect(contractDeletes).toHaveLength(1);
    expect(contractDeletes[0]).toMatchObject({ id: 'contract-stale-orphan' });
    expect(contractInserts).toHaveLength(1);
    expect(contractInserts[0].total_amount).toBe(116000);
    expect(milestoneInserts[0].every((m) => m.contract_id === 'contract-new')).toBe(true);
  });

  it('refuses a completed conversion whose quote has since changed, touching nothing', async () => {
    existingContract = {
      id: 'contract-done-stale',
      quote_id: QUOTE.id,
      organization_id: 'org-1',
      client_id: QUOTE.client_id,
      total_amount: 99000,
    };
    existingMilestones = [
      { id: 'ms-a', contract_id: 'contract-done-stale', amount: 49500 },
      { id: 'ms-b', contract_id: 'contract-done-stale', amount: 49500 },
    ];

    const res = await convert();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('CONVERTED_QUOTE_MODIFIED');
    // Refusal must be inert: no delete, no insert, no status flip.
    expect(contractDeletes).toHaveLength(0);
    expect(contractInserts).toHaveLength(0);
    expect(milestoneInserts).toHaveLength(0);
    expect(quoteUpdates).toHaveLength(0);
  });
});
