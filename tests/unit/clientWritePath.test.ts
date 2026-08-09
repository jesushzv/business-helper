import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The clients write path — pinned after #96's deployed verification found it
 * silently discarding most of the form.
 *
 * Both routes hand-destructured camelCase keys (`contactName`, `regimenFiscal`,
 * `codigoPostal`, `cfdiUse`) off a body that ClientFormModal sends in
 * snake_case. Every one of those four therefore resolved to `undefined`: on
 * create they were written as NULL, on edit they were skipped as "not
 * provided" — and both reported success. `regimen_fiscal` and `codigo_postal`
 * are required to stamp a CFDI 4.0, so a client captured through the form could
 * never be invoiced, and nothing anywhere said so.
 *
 * Nothing caught it because no test ever invoked these handlers — the existing
 * clients coverage (clientPhoneValidation.test.ts) only grepped the route
 * source for strings. Mocked `fetch` cannot see a field-name mismatch either;
 * only calling the handler and reading what reaches the DB layer can.
 *
 * The credit columns are the same story one layer down: they were declared in
 * types/database.ts and collected by the form, but no migration ever created
 * them and CLIENT_WRITABLE_FIELDS did not list them.
 */

const insertCalls: Array<Record<string, unknown>> = [];
const updateCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  // pickFields, CLIENT_WRITABLE_FIELDS and validateCreditTerms must be the real
  // ones — they are the thing under test.
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
        supabase: {
          from: () => ({
            insert: (values: Record<string, unknown>) => {
              insertCalls.push(values);
              return {
                select: () => ({
                  single: async () => ({ data: { id: 'client-1', ...values }, error: null }),
                }),
              };
            },
            update: (values: Record<string, unknown>) => {
              updateCalls.push(values);
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({ data: { id: 'client-1', ...values }, error: null }),
                    }),
                  }),
                }),
              };
            },
          }),
        },
      },
    })),
  };
});

const { POST } = await import('@/app/api/clients/route');
const { PUT } = await import('@/app/api/clients/[id]/route');

/** Exactly what ClientFormModal.handleSubmit sends. */
function formPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ferretería La Central S.A. de C.V.',
    contact_name: 'Arq. Fernando Maya',
    email: 'compras@lacentral.mx',
    phone: '8112345678',
    rfc: null,
    regimen_fiscal: '626',
    codigo_postal: '64000',
    cfdi_use: 'G01',
    credit_limit: 80000,
    credit_days: 30,
    credit_status: 'active',
    notes: 'Cliente frecuente',
    ...overrides,
  };
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost/api/clients/client-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'client-1' });

beforeEach(() => {
  insertCalls.length = 0;
  updateCalls.length = 0;
});

describe('POST /api/clients persists the whole form (#96)', () => {
  it('stores the four fields the camelCase destructuring used to drop', async () => {
    const res = await POST(postRequest(formPayload()));
    expect(res.status).toBe(201);

    // Each of these was written as NULL before, while the UI said "guardado".
    expect(insertCalls[0]).toMatchObject({
      contact_name: 'Arq. Fernando Maya',
      regimen_fiscal: '626',
      codigo_postal: '64000',
      cfdi_use: 'G01',
    });
  });

  it('does not silently substitute G03 for the chosen uso de CFDI', async () => {
    await POST(postRequest(formPayload({ cfdi_use: 'P01' })));
    expect(insertCalls[0].cfdi_use).toBe('P01');
  });

  it('stores the trade-credit terms', async () => {
    await POST(postRequest(formPayload()));
    expect(insertCalls[0]).toMatchObject({
      credit_limit: 80000,
      credit_days: 30,
      credit_status: 'active',
    });
  });

  it('keeps an unassigned credit line NULL rather than an authorized zero', async () => {
    await POST(
      postRequest(formPayload({ credit_limit: null, credit_days: null, credit_status: null }))
    );
    expect(insertCalls[0].credit_limit).toBeNull();
    expect(insertCalls[0].credit_status).toBeNull();
  });

  it('still refuses to let a caller choose its own tenant', async () => {
    await POST(postRequest(formPayload({ organization_id: 'org-somebody-else' })));
    expect(insertCalls[0].organization_id).toBe('org-1');
  });

  it('rejects an out-of-vocabulary credit status in Spanish, before the DB CHECK', async () => {
    const res = await POST(postRequest(formPayload({ credit_status: 'moroso' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CREDIT_TERMS');
    expect(body.error.message).toMatch(/crédito/i);
    expect(insertCalls).toHaveLength(0);
  });

  it('rejects a negative credit limit', async () => {
    const res = await POST(postRequest(formPayload({ credit_limit: -1 })));
    expect(res.status).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });
});

describe('PUT /api/clients/[id] persists the whole form (#96)', () => {
  it('updates the four fields that used to be skipped as "not provided"', async () => {
    const res = await PUT(putRequest(formPayload({ regimen_fiscal: '612' })), { params });
    expect(res.status).toBe(200);

    expect(updateCalls[0]).toMatchObject({
      contact_name: 'Arq. Fernando Maya',
      regimen_fiscal: '612',
      codigo_postal: '64000',
      cfdi_use: 'G01',
    });
  });

  it('lets the owner clear a field instead of silently keeping the old value', async () => {
    await PUT(putRequest({ codigo_postal: null, notes: null }), { params });
    expect(updateCalls[0]).toMatchObject({ codigo_postal: null, notes: null });
  });

  it('leaves fields the caller did not mention alone', async () => {
    await PUT(putRequest({ notes: 'solo notas' }), { params });
    expect(updateCalls[0]).not.toHaveProperty('regimen_fiscal');
    expect(updateCalls[0]).not.toHaveProperty('credit_limit');
  });

  it('does not blank the name when the body omits it or sends whitespace', async () => {
    await PUT(putRequest({ name: '   ', notes: 'x' }), { params });
    expect(updateCalls[0]).not.toHaveProperty('name');
  });

  it('can retire a credit line back to unassigned', async () => {
    await PUT(putRequest({ credit_limit: null, credit_days: null, credit_status: null }), {
      params,
    });
    expect(updateCalls[0]).toMatchObject({
      credit_limit: null,
      credit_days: null,
      credit_status: null,
    });
  });

  it('rejects an invalid credit status', async () => {
    const res = await PUT(putRequest({ credit_status: 'vip' }), { params });
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });
});

describe('the writable list covers what the form sends', () => {
  it('every key ClientFormModal submits is writable', async () => {
    const { CLIENT_WRITABLE_FIELDS } = await import('@/lib/apiAuth');
    // Fails the build if the form grows a field the routes silently drop —
    // the exact shape of this defect.
    for (const key of Object.keys(formPayload())) {
      expect(CLIENT_WRITABLE_FIELDS, `${key} is submitted but not writable`).toContain(key);
    }
  });

  it('does not make tenant or identity columns writable', async () => {
    const { CLIENT_WRITABLE_FIELDS } = await import('@/lib/apiAuth');
    for (const forbidden of ['organization_id', 'id', 'health_score', 'created_at']) {
      expect(CLIENT_WRITABLE_FIELDS).not.toContain(forbidden);
    }
  });
});
