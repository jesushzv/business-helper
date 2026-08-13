import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  acquireStampClaim,
  takeOverStaleClaim,
  releaseStampClaim,
  STAMP_CLAIM_STALE_MS,
} from '@/lib/cfdiStampClaim';
import { findInvoiceByExternalId, type PacCredentials } from '@/lib/pacClient';

/**
 * #213 — the DB-side claim that makes stamping single-flight.
 *
 * Facturapi's external_id deduplicates nothing (two POSTs with an identical
 * external_id each stamped a document, live sandbox 2026-08-12, #26), and the
 * route's ALREADY_ISSUED pre-check is check-then-act. The claim table's
 * primary key is the guard; these tests pin the claim lifecycle and the
 * reconciliation lookup a stale claim requires before it may be released.
 */

// ---------------------------------------------------------------------------
// The migration
// ---------------------------------------------------------------------------

describe('cfdi_stamp_claims migration', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20260813000000_cfdi_stamp_claims.sql'),
    'utf8'
  );

  it('makes the milestone id the primary key — the collision IS the guard', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.cfdi_stamp_claims');
    expect(migration).toMatch(/milestone_id uuid PRIMARY KEY REFERENCES public\.milestones\(id\)/);
  });

  it('enables RLS with no policy, service-role only, like stripe_webhook_events', () => {
    expect(migration).toContain(
      'ALTER TABLE public.cfdi_stamp_claims ENABLE ROW LEVEL SECURITY;'
    );
    expect(migration).not.toContain('CREATE POLICY');
  });
});

// ---------------------------------------------------------------------------
// Claim lifecycle
// ---------------------------------------------------------------------------

interface ClaimState {
  insertResults: Array<{ error: { code?: string; message?: string } | null }>;
  existingClaimedAt: string | null;
  readError: { message: string } | null;
  deletes: Array<{ milestoneId?: string; staleBefore?: string }>;
  inserted: Array<Record<string, unknown>>;
}

function makeService(state: ClaimState) {
  return {
    from: (table: string) => {
      if (table !== 'cfdi_stamp_claims') throw new Error(`unexpected table ${table}`);
      return {
        insert: async (row: Record<string, unknown>) => {
          state.inserted.push(row);
          return state.insertResults.shift() ?? { error: null };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: state.existingClaimedAt ? { claimed_at: state.existingClaimedAt } : null,
              error: state.readError,
            }),
          }),
        }),
        delete: () => ({
          eq: (_col: string, milestoneId: string) => {
            const record: { milestoneId?: string; staleBefore?: string } = { milestoneId };
            state.deletes.push(record);
            const thenable = {
              lt: async (_c: string, staleBefore: string) => {
                record.staleBefore = staleBefore;
                return { error: null };
              },
              // Awaiting the .eq() directly (releaseStampClaim's shape).
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            };
            return thenable;
          },
        }),
      };
    },
  };
}

const NOW = 1_755_000_000_000;

let state: ClaimState;

beforeEach(() => {
  state = {
    insertResults: [],
    existingClaimedAt: null,
    readError: null,
    deletes: [],
    inserted: [],
  };
});

describe('acquireStampClaim', () => {
  it('acquires when no claim exists', async () => {
    state.insertResults = [{ error: null }];
    const result = await acquireStampClaim(makeService(state), 'org-1', 'm-1', 'user-1', NOW);
    expect(result).toEqual({ ok: true });
    expect(state.inserted[0]).toMatchObject({
      milestone_id: 'm-1',
      organization_id: 'org-1',
      claimed_by: 'user-1',
    });
  });

  it('answers in_progress for a fresh collision — someone is stamping right now', async () => {
    state.insertResults = [{ error: { code: '23505' } }];
    state.existingClaimedAt = new Date(NOW - 5_000).toISOString();
    const result = await acquireStampClaim(makeService(state), 'org-1', 'm-1', 'user-1', NOW);
    expect(result).toEqual({ ok: false, reason: 'in_progress' });
  });

  it('answers stale past the stamp-timeout window — the holder died mid-flight', async () => {
    state.insertResults = [{ error: { code: '23505' } }];
    state.existingClaimedAt = new Date(NOW - STAMP_CLAIM_STALE_MS - 1_000).toISOString();
    const result = await acquireStampClaim(makeService(state), 'org-1', 'm-1', 'user-1', NOW);
    expect(result).toEqual({ ok: false, reason: 'stale' });
  });

  it('fails closed when the insert errors for any other reason', async () => {
    state.insertResults = [{ error: { code: '57014', message: 'canceling statement' } }];
    const result = await acquireStampClaim(makeService(state), 'org-1', 'm-1', 'user-1', NOW);
    expect(result).toMatchObject({ ok: false, reason: 'error' });
  });

  it('fails closed when the colliding claim cannot be read back', async () => {
    state.insertResults = [{ error: { code: '23505' } }];
    state.existingClaimedAt = null;
    const result = await acquireStampClaim(makeService(state), 'org-1', 'm-1', 'user-1', NOW);
    expect(result).toMatchObject({ ok: false, reason: 'error' });
  });
});

describe('takeOverStaleClaim', () => {
  it('deletes only claims older than the stale window, then claims for itself', async () => {
    state.insertResults = [{ error: null }];
    const result = await takeOverStaleClaim(makeService(state), 'org-1', 'm-1', 'user-1', NOW);

    expect(result).toEqual({ ok: true });
    expect(state.deletes[0].milestoneId).toBe('m-1');
    // The age guard: a claim refreshed between the check and this call survives.
    expect(state.deletes[0].staleBefore).toBe(new Date(NOW - STAMP_CLAIM_STALE_MS).toISOString());
  });

  it('answers in_progress when a concurrent taker won the re-insert', async () => {
    state.insertResults = [{ error: { code: '23505' } }];
    state.existingClaimedAt = new Date(NOW - 1_000).toISOString();
    const result = await takeOverStaleClaim(makeService(state), 'org-1', 'm-1', 'user-1', NOW);
    expect(result).toEqual({ ok: false, reason: 'in_progress' });
  });
});

describe('releaseStampClaim', () => {
  it('deletes the claim by milestone id', async () => {
    await releaseStampClaim(makeService(state), 'm-1');
    expect(state.deletes).toEqual([{ milestoneId: 'm-1' }]);
  });
});

// ---------------------------------------------------------------------------
// Reconciliation lookup — findInvoiceByExternalId
// ---------------------------------------------------------------------------

const CREDENTIALS: PacCredentials = {
  provider: 'facturapi',
  apiKey: 'sk_test_x',
  environment: 'sandbox',
  source: 'organization',
};

describe('findInvoiceByExternalId', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function listResponse(items: unknown[]): Response {
    return new Response(JSON.stringify({ data: items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('returns the document whose external_id matches exactly', async () => {
    // `q` is a text search: the response can carry near-misses, and only the
    // exact field match counts.
    fetchMock.mockResolvedValueOnce(
      listResponse([
        { id: 'other', uuid: 'U-0', external_id: 'milestone:m-10', status: 'valid' },
        {
          id: 'inv-1',
          uuid: 'U-1',
          external_id: 'milestone:m-1',
          status: 'valid',
          total: 1160,
          date: '2026-08-12T10:00:00Z',
        },
      ])
    );

    const result = await findInvoiceByExternalId(CREDENTIALS, 'milestone:m-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.document).toMatchObject({
        providerInvoiceId: 'inv-1',
        uuid: 'U-1',
        total: 1160,
      });
    }
  });

  it('does not count a cancelled document — re-issuing after cancellation is legitimate', async () => {
    fetchMock.mockResolvedValueOnce(
      listResponse([{ id: 'inv-1', uuid: 'U-1', external_id: 'milestone:m-1', status: 'canceled' }])
    );

    const result = await findInvoiceByExternalId(CREDENTIALS, 'milestone:m-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.document).toBeNull();
  });

  it('answers null for an empty list', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]));
    const result = await findInvoiceByExternalId(CREDENTIALS, 'milestone:m-1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.document).toBeNull();
  });

  it('reports a failed lookup as a failure — the caller must NOT release the claim on it', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    const result = await findInvoiceByExternalId(CREDENTIALS, 'milestone:m-1');
    expect(result.ok).toBe(false);
  });

  it('searches by the external_id, authenticated', async () => {
    fetchMock.mockResolvedValueOnce(listResponse([]));
    await findInvoiceByExternalId(CREDENTIALS, 'milestone:m-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/v2/invoices?');
    expect(String(url)).toContain(encodeURIComponent('milestone:m-1'));
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_x');
  });
});
