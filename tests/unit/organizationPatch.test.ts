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
/** Every `.eq()` applied to the update, as [column, value] (#109). */
const updateFilters: Array<[string, unknown]> = [];
let updateResult: { data: unknown; error: unknown } = { data: { id: 'org-1' }, error: null };
/** The role requireOrgAccess hands back — 'owner' unless a test says otherwise. */
let callerRole = 'owner';

// PATCH resolves its target through requireOrgAccess rather than requireUser
// since #109: it needs the organization *id* to address a single row, because
// `owner_id` alone is a row set an owner can legitimately have two of.
const supabaseStub = {
  from: () => ({
    update: (values: Record<string, unknown>) => {
      updateCalls.push(values);
      const chain = {
        eq: (column: string, value: unknown) => {
          updateFilters.push([column, value]);
          return chain;
        },
        select: () => ({
          maybeSingle: async () => updateResult,
        }),
      };
      return chain;
    },
  }),
};

vi.mock('@/lib/apiAuth', () => ({
  requireUser: vi.fn(async () => ({ ok: true, userId: 'user-1', supabase: supabaseStub })),
  requireOrgAccess: vi.fn(async () => ({
    ok: true,
    ctx: {
      supabase: supabaseStub,
      userId: 'user-1',
      organizationId: 'org-1',
      role: callerRole,
    },
  })),
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
  updateFilters.length = 0;
  callerRole = 'owner';
  updateResult = { data: { id: 'org-1' }, error: null };

  // Restored every test, not just declared once in the factory: the GET block
  // below installs its own `mockResolvedValue` with a read-only supabase stub,
  // and that override outlives its describe. It was harmless while PATCH went
  // through requireUser; now that PATCH shares this mock (#109) it would hand
  // the bank tests a client with no `update()` at all. `mockImplementation`
  // rather than `mockResolvedValue` so `callerRole` is read when the route
  // calls, letting a test set it after this hook has run.
  vi.mocked(requireOrgAccess).mockImplementation(
    async () =>
      ({
        ok: true,
        ctx: {
          supabase: supabaseStub,
          userId: 'user-1',
          organizationId: 'org-1',
          role: callerRole,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
  );
});

describe('PATCH /api/organization — addresses one row, not an owner (#109)', () => {
  it('filters by organization id as well as owner_id', async () => {
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central' }));

    expect(res.status).toBe(200);
    // Both, and in that order: `id` is what makes this a single row (an owner
    // may hold several — organizations.owner_id has no unique index, #168),
    // `owner_id` is what proves the caller may write it. Dropping `id` is the
    // 404 "No se encontró una organización propia" that #109 reported.
    expect(updateFilters).toEqual([
      ['id', 'org-1'],
      ['owner_id', 'user-1'],
    ]);
  });

  it('refuses a member with a reason instead of a 404 about a missing business', async () => {
    callerRole = 'admin';
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central' }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    // Spanish, and it names who may do it — a member previously got 404 "No se
    // encontró una organización propia", which reads as "your business does not
    // exist" (#64's trap: never send a user to fix something they cannot write).
    expect(body.error.message).toMatch(/dueño/i);
    expect(updateCalls).toHaveLength(0);
  });
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
