import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #213 — POST /api/invoices/issue holds the DB claim across the PAC call.
 *
 * The scenarios mirror the failure the live pass proved possible: stamping
 * takes up to 30s; the user's request dies after Facturapi accepted; the user
 * clicks again. Without the claim the retry passes the ALREADY_ISSUED read
 * and the client is double-invoiced with the SAT — a document that can only
 * be cancelled, never un-issued.
 */

const claimState: {
  insertResults: Array<{ error: { code?: string; message?: string } | null }>;
  existingClaimedAt: string | null;
  deletes: number;
  inserted: number;
} = { insertResults: [], existingClaimedAt: null, deletes: 0, inserted: 0 };

const milestoneState: {
  row: Record<string, unknown> | null;
  updates: Array<Record<string, unknown>>;
  updateError: { message: string } | null;
} = { row: null, updates: [], updateError: null };

const stampMock = vi.fn();
const findMock = vi.fn();

vi.mock('@/lib/apiAuth', () => ({
  requireOrgAccess: async () => ({
    ok: true,
    ctx: {
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'owner',
      supabase: {
        from: (table: string) => {
          if (table === 'milestones') {
            return {
              select: () => ({
                eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: milestoneState.row, error: null }) }) }),
              }),
              update: (values: Record<string, unknown>) => ({
                eq: () => ({
                  eq: async () => {
                    milestoneState.updates.push(values);
                    return { error: milestoneState.updateError };
                  },
                }),
              }),
            };
          }
          if (table === 'organizations') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'org-1',
                      name: 'Mi Negocio SA de CV',
                      rfc: 'AAA010101AAA',
                      regimen_fiscal: '601',
                      codigo_postal: '06600',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'quotes') {
            return {
              select: () => ({
                eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              }),
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      },
    },
  }),
}));

vi.mock('@/lib/organizationTrialGate', () => ({
  readOrganizationTrialState: async () => ({ blocksNewWork: false, endsAt: null }),
}));

vi.mock('@/lib/teamRBAC', () => ({
  hasCapability: () => true,
}));

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'cfdi_stamp_claims') {
        return {
          insert: async () => {
            claimState.inserted += 1;
            return claimState.insertResults.shift() ?? { error: null };
          },
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: claimState.existingClaimedAt
                  ? { claimed_at: claimState.existingClaimedAt }
                  : null,
                error: null,
              }),
            }),
          }),
          delete: () => ({
            eq: () => {
              claimState.deletes += 1;
              return {
                lt: async () => ({ error: null }),
                then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
              };
            },
          }),
        };
      }
      if (table === 'audit_logs') {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`unexpected service table ${table}`);
    },
  }),
}));

vi.mock('@/lib/pacConnection', () => ({
  resolvePacCredentials: async () => ({
    ok: true,
    credentials: {
      provider: 'facturapi',
      apiKey: 'sk_test_x',
      environment: 'sandbox',
      source: 'organization',
    },
  }),
}));

vi.mock('@/lib/pacClient', () => ({
  stampInvoice: (...args: unknown[]) => stampMock(...args),
  findInvoiceByExternalId: (...args: unknown[]) => findMock(...args),
  downloadCFDIDocuments: async () => ({
    ok: true,
    data: { xml: new Uint8Array([1]), pdf: new Uint8Array([2]) },
  }),
}));

vi.mock('@/lib/cfdiStorage', () => ({
  storeCFDIDocuments: async () => ({
    ok: true,
    paths: { xmlPath: 'org-1/x.xml', pdfPath: 'org-1/x.pdf' },
  }),
}));

vi.mock('@/lib/url', () => ({
  getAppBaseUrl: () => 'https://businesshelper.app',
}));

vi.mock('@/lib/analytics', () => ({
  track: () => undefined,
}));

const STAMPED = {
  ok: true,
  data: {
    providerInvoiceId: 'inv-1',
    uuid: 'UUID-NEW',
    verificationUrl: null,
    series: null,
    folioNumber: null,
    total: 1160,
    stampedAt: '2026-08-13T10:00:00Z',
  },
};

function issueRequest(): Request {
  return new Request('https://businesshelper.app/api/invoices/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ milestoneId: 'm-1' }),
  });
}

async function post() {
  const { POST } = await import('@/app/api/invoices/issue/route');
  return POST(issueRequest());
}

beforeEach(() => {
  claimState.insertResults = [];
  claimState.existingClaimedAt = null;
  claimState.deletes = 0;
  claimState.inserted = 0;
  milestoneState.row = {
    id: 'm-1',
    label: 'Anticipo 50%',
    amount: 1000,
    cfdi_status: 'none',
    cfdi_uuid: null,
    contract_id: 'c-1',
    contracts: {
      title: 'Obra Civil',
      quote_id: null,
      clients: {
        name: 'Cliente SA de CV',
        rfc: 'BBB010101BB1',
        regimen_fiscal: '601',
        codigo_postal: '06600',
        cfdi_use: 'G03',
      },
    },
  };
  milestoneState.updates = [];
  milestoneState.updateError = null;
  stampMock.mockReset();
  findMock.mockReset();
});

describe('claim held by a concurrent request', () => {
  it('answers 409 STAMP_IN_PROGRESS and never calls the PAC', async () => {
    claimState.insertResults = [{ error: { code: '23505' } }];
    claimState.existingClaimedAt = new Date(Date.now() - 5_000).toISOString();

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('STAMP_IN_PROGRESS');
    expect(stampMock).not.toHaveBeenCalled();
  });
});

describe('stale claim — a previous attempt died mid-flight', () => {
  const stale = () => {
    claimState.insertResults = [{ error: { code: '23505' } }];
    claimState.existingClaimedAt = new Date(Date.now() - 120_000).toISOString();
  };

  it('adopts the document the PAC already has instead of stamping a second one', async () => {
    stale();
    findMock.mockResolvedValueOnce({
      ok: true,
      data: {
        document: {
          providerInvoiceId: 'inv-old',
          uuid: 'UUID-OLD',
          verificationUrl: null,
          series: null,
          folioNumber: null,
          total: 1160,
          stampedAt: '2026-08-13T09:00:00Z',
        },
      },
    });

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('ALREADY_ISSUED');
    expect(body.uuid).toBe('UUID-OLD');
    expect(stampMock).not.toHaveBeenCalled();
    // The milestone leaves limbo: the found document is recorded on it.
    const adopted = milestoneState.updates.find((u) => u.cfdi_uuid === 'UUID-OLD');
    expect(adopted).toMatchObject({ cfdi_status: 'issued', cfdi_id: 'inv-old' });
    expect(claimState.deletes).toBeGreaterThan(0);
  });

  it('takes the claim over and stamps when the PAC has nothing', async () => {
    stale();
    findMock.mockResolvedValueOnce({ ok: true, data: { document: null } });
    claimState.insertResults.push({ error: null }); // the takeover's re-insert
    stampMock.mockResolvedValueOnce(STAMPED);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.uuid).toBe('UUID-NEW');
    expect(stampMock).toHaveBeenCalledTimes(1);
  });

  it('refuses to stamp when the reconciliation lookup itself fails', async () => {
    // Releasing the claim without the PAC's answer would re-open the exact
    // double-stamp the claim exists to prevent.
    stale();
    findMock.mockResolvedValueOnce({ ok: false, code: 'UNAVAILABLE', message: 'PAC caído' });

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.code).toBe('STAMP_RECONCILIATION_FAILED');
    expect(stampMock).not.toHaveBeenCalled();
    expect(claimState.deletes).toBe(0);
  });
});

describe('claim lifecycle around the stamp call', () => {
  it('fails closed when the claim cannot be established', async () => {
    claimState.insertResults = [{ error: { code: '57014', message: 'statement timeout' } }];

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.code).toBe('STAMP_CLAIM_FAILED');
    expect(stampMock).not.toHaveBeenCalled();
  });

  it('releases the claim on a definitive PAC rejection so a real retry can proceed', async () => {
    claimState.insertResults = [{ error: null }];
    stampMock.mockResolvedValueOnce({ ok: false, code: 'REJECTED', message: 'RFC inválido' });

    const res = await post();

    expect(res.status).toBe(400);
    expect(claimState.deletes).toBe(1);
  });

  it('keeps the claim on a timeout — the document may exist at the SAT', async () => {
    claimState.insertResults = [{ error: null }];
    stampMock.mockResolvedValueOnce({
      ok: false,
      code: 'TIMEOUT',
      message: 'El PAC tardó demasiado en responder.',
    });

    const res = await post();

    expect(res.status).toBe(502);
    expect(claimState.deletes).toBe(0);
  });

  it('keeps the claim when the stamp was recorded nowhere — STAMP_NOT_RECORDED', async () => {
    // The document exists and the milestone does not say so; without the
    // claim, a retry stamps a second one. Held, the retry reconciles and
    // adopts this document instead.
    claimState.insertResults = [{ error: null }];
    stampMock.mockResolvedValueOnce(STAMPED);
    milestoneState.updateError = { message: 'connection reset' };

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('STAMP_NOT_RECORDED');
    expect(claimState.deletes).toBe(0);
  });

  it('releases the claim once the stamp is recorded on the milestone', async () => {
    claimState.insertResults = [{ error: null }];
    stampMock.mockResolvedValueOnce(STAMPED);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.uuid).toBe('UUID-NEW');
    expect(claimState.deletes).toBe(1);
    // And the stamp went out with the milestone-keyed external_id the
    // reconciliation searches for.
    expect(stampMock.mock.calls[0][2]).toBe('milestone:m-1');
  });
});
