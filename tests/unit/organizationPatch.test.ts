import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '@/app/api/organization/route';
import { requireOrgAccess } from '@/lib/apiAuth';

/**
 * #95 — PATCH /api/organization grew a profile payload (name, rfc,
 * regimenFiscal, codigoPostal, phone, logoUrl) next to the pre-existing bank
 * payload. These pin the contract:
 * - a profile save is not rejected for a missing CLABE (the old all-bank
 *   validation would have 400'd every profile save);
 * - fiscal inputs fail loudly, never null out silently — regimen_fiscal feeds
 *   CFDI 4.0 stamping;
 * - the bank payload keeps its exact prior behaviour.
 */

const updateCalls: Array<Record<string, unknown>> = [];
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
let updateResult: { data: unknown; error: unknown } = { data: { id: 'org-1' }, error: null };

vi.mock('@/lib/apiAuth', () => ({
  requireUser: vi.fn(async () => ({
    ok: true,
    userId: 'user-1',
    supabase: {
      from: (table: string) => ({
        update: (values: Record<string, unknown>) => {
          updateCalls.push(values);
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => updateResult,
              }),
            }),
          };
        },
        insert: async (values: Record<string, unknown>) => {
          insertCalls.push({ table, values });
          return { data: null, error: null };
        },
      }),
    },
  })),
  requireOrgAccess: vi.fn(),
  isDemoDeployment: () => false,
}));

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/organization', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  updateResult = { data: { id: 'org-1' }, error: null };
});

describe('PATCH /api/organization — profile payload (#95)', () => {
  it('saves a profile without any bank fields (no CLABE required)', async () => {
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central', codigoPostal: '44100' }));
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ name: 'Ferretería La Central', codigo_postal: '44100' });
    expect(updateCalls[0]).not.toHaveProperty('bank_clabe');
  });

  it('reduces a régimen display label to its SAT code', async () => {
    const res = await PATCH(patchRequest({ regimenFiscal: '601 — General de Ley Personas Morales' }));
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ regimen_fiscal: '601' });
  });

  it('rejects a non-empty régimen that has no code — never a silent NULL on a CFDI field', async () => {
    const res = await PATCH(patchRequest({ regimenFiscal: 'General de Ley Personas Morales' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects a four-digit régimen instead of truncating it to a different code', async () => {
    const res = await PATCH(patchRequest({ regimenFiscal: '6012' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects an invalid RFC with the Spanish envelope', async () => {
    const res = await PATCH(patchRequest({ rfc: 'NOPE' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_RFC');
  });

  it('rejects a phone that cannot receive WhatsApp', async () => {
    const res = await PATCH(patchRequest({ phone: 'llamar a la oficina' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PHONE');
  });

  it('rejects a non-https logo URL — it renders on client-facing pages', async () => {
    // eslint-disable-next-line no-script-url
    const res = await PATCH(patchRequest({ logoUrl: 'javascript:alert(1)' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects an empty payload instead of issuing a no-op update', async () => {
    const res = await PATCH(patchRequest({}));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });
});

describe('GET /api/organization — the browser gets the columns it needs and no others', () => {
  const ROW = { id: 'org-1', name: 'Ferretería La Central' };
  let selectedColumns = '';

  beforeEach(() => {
    selectedColumns = '';
    vi.mocked(requireOrgAccess).mockResolvedValue({
      ok: true,
      ctx: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'owner',
        supabase: {
          from: () => ({
            select: (columns: string) => {
              selectedColumns = columns;
              return { eq: () => ({ maybeSingle: async () => ({ data: ROW, error: null }) }) };
            },
          }),
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it('names its columns instead of selecting *', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(selectedColumns).not.toBe('*');
    // Every field a client of this route reads today.
    for (const column of [
      'id',
      'name',
      'rfc',
      'regimen_fiscal',
      'codigo_postal',
      'phone',
      'logo_url',
      'industry',
      'subscription_tier',
      'subscription_status',
      'bank_name',
      'bank_clabe',
      'bank_account_holder',
    ]) {
      expect(selectedColumns.split(/\s*,\s*/)).toContain(column);
    }
  });

  it('does not ship billing- or PAC-linkage columns no client reads', async () => {
    await GET();
    for (const column of [
      'owner_id',
      'stripe_customer_id',
      'stripe_subscription_id',
      'facturapi_organization_id',
    ]) {
      expect(selectedColumns).not.toContain(column);
    }
  });
});

describe('PATCH /api/organization — bank payload keeps its contract', () => {
  it('still validates the CLABE when any bank field is present', async () => {
    const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: '123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CLABE');
  });

  it('rejects an 18-digit CLABE whose check digit fails (#66)', async () => {
    // Same digits as the valid fixture below with the checksum broken: a
    // single-digit typo in the account a tenant's clients wire money to.
    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567897', bankAccountHolder: 'X' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CLABE');
    expect(updateCalls).toHaveLength(0);
  });

  it('still saves a valid bank payload', async () => {
    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567899', bankAccountHolder: 'X' })
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_name: 'BBVA', bank_clabe: '012180001234567899' });
  });
});

/**
 * #163 — a saved account could be replaced but never removed.
 *
 * Any bank payload was required to carry a valid 18-digit CLABE, so the only
 * route back to "no account" was a hand edit against production. The database
 * always allowed the state (`chk_org_bank_clabe_format` is
 * `bank_clabe IS NULL OR ~ '^[0-9]{18}$'`); only this route refused it.
 *
 * The distinction that makes it safe: an *explicitly empty* CLABE is a
 * deliberate clear, while an absent key stays absent — a profile save must
 * never wipe the account as a side effect. #64's gate is what makes the empty
 * state honest rather than a silent hole: no CLABE means a banner, disabled
 * share actions, and a 409 before any /pay/ link leaves the server.
 */
describe('PATCH /api/organization — removing the account (#163)', () => {
  it('clears all three bank columns when the CLABE is explicitly emptied', async () => {
    const res = await PATCH(patchRequest({ bankName: '', bankClabe: '', bankAccountHolder: '' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({
      bank_clabe: null,
      bank_name: null,
      bank_account_holder: null,
    });
  });

  it('clears on an empty CLABE even when a bank name is still filled in', async () => {
    // The card sends whatever is in the inputs. An emptied CLABE is the signal;
    // leaving "BBVA" in the name field must not resurrect a half-account, which
    // hasSettlementAccount would read as not-ready anyway.
    const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: '' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_clabe: null, bank_name: null });
  });

  it('treats a whitespace-only CLABE as a clear, not as an invalid account', async () => {
    const res = await PATCH(patchRequest({ bankClabe: '   ' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_clabe: null });
  });

  it('does not touch the account when no bank key is present at all', async () => {
    // The regression this guards: a profile save silently wiping the CLABE.
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).not.toHaveProperty('bank_clabe');
    expect(updateCalls[0]).not.toHaveProperty('bank_name');
  });

  it('rejects a digit-free value instead of reading it as a removal', async () => {
    // `normalizeClabe` strips non-digits, so a clear keyed on the *normalized*
    // length would delete the account for 'pendiente', 'N/A' or 'CLABE' and
    // answer 200. The raw string is what distinguishes an empty field from a
    // typed mistake.
    for (const typo of ['pendiente', 'N/A', 'CLABE', '---- ---- ----']) {
      updateCalls.length = 0;
      const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: typo }));
      expect(res.status, `expected 400 for ${typo}`).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_CLABE');
      expect(updateCalls).toHaveLength(0);
    }
  });

  it('still rejects a partial CLABE — a typo is not a removal', async () => {
    const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: '01218000123' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CLABE');
    expect(updateCalls).toHaveLength(0);
  });
});

describe('PATCH /api/organization — the removal is recorded (#163)', () => {
  it('writes an audit row naming the removal', async () => {
    updateResult = { data: { id: 'org-1' }, error: null };

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(200);
    const audit = insertCalls.find((c) => c.table === 'audit_logs');
    expect(audit?.values).toMatchObject({
      organization_id: 'org-1',
      action: 'settlement_account.removed',
      actor: 'user-1',
    });
  });

  it('does not record an audit row for an ordinary save', async () => {
    await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567899', bankAccountHolder: 'X' })
    );

    expect(insertCalls.find((c) => c.table === 'audit_logs')).toBeUndefined();
  });

  it('does not record a removal the UPDATE never made', async () => {
    // A member's PATCH matches no row under the owner_id filter.
    updateResult = { data: null, error: null };

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(404);
    expect(insertCalls.find((c) => c.table === 'audit_logs')).toBeUndefined();
  });
});
