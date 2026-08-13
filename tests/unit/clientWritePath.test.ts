import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  it('writes no health score for a client with no history (#276)', async () => {
    // The insert hardcoded `health_score: 100`, so a client registered thirty
    // seconds ago read "Excelente (100)" on the surface where the owner
    // decides how much credit to extend — defeating #108's "Sin historial"
    // state one layer down. Absent is absent.
    await POST(postRequest(formPayload()));
    expect(insertCalls[0]).not.toHaveProperty('health_score');
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

  /**
   * Validation used to coerce with `Number()` to decide, then persist the raw
   * value — so each of these passed the route and failed at the column as an
   * opaque 500 ("No se pudo crear el cliente"), with nothing telling the owner
   * their number was too large or malformed. Same shape as the #40 phone bug.
   */
  it('rejects values that would fail at the column, with a Spanish reason', async () => {
    for (const bad of [
      { credit_limit: '' },
      { credit_limit: '   ' },
      { credit_limit: true },
      { credit_limit: [] },
      { credit_limit: 10_000_000_000 }, // over numeric(12,2)
      { credit_days: 2_147_483_648 }, // over int4
      { credit_days: 1.5 },
      { credit_days: '' },
    ]) {
      insertCalls.length = 0;
      const res = await POST(postRequest(formPayload(bad)));
      expect(res.status, JSON.stringify(bad)).toBe(400);
      const body = await res.json();
      expect(body.error.message).toMatch(/crédito|plazo/i);
      expect(insertCalls, JSON.stringify(bad)).toHaveLength(0);
    }
  });

  it('stores a numeric-string limit as a number, not as the string', async () => {
    await POST(postRequest(formPayload({ credit_limit: '80000', credit_days: '30' })));
    expect(insertCalls[0].credit_limit).toBe(80000);
    expect(insertCalls[0].credit_days).toBe(30);
  });

  it('lets the column default supply cfdi_use rather than writing NULL over it', async () => {
    // An explicit null overrides a column DEFAULT; cfdi_use feeds CFDI
    // stamping, so a NULL here resurfaces as an invoice that cannot be issued.
    await POST(postRequest(formPayload({ cfdi_use: null })));
    expect(insertCalls[0]).not.toHaveProperty('cfdi_use');
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

  it('does not rename the client to the literal string "null"', async () => {
    // `String(null).trim()` is the truthy string "null", so the old guard let
    // a `{"name": null}` body through and renamed the client to "null".
    for (const name of [null, 0, false]) {
      updateCalls.length = 0;
      await PUT(putRequest({ name, notes: 'x' }), { params });
      expect(updateCalls[0], String(name)).not.toHaveProperty('name');
    }
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

describe('the phone is validated on the way into the column (#40, #94)', () => {
  // Moved here from clientPhoneValidation.test.ts, which asserted these by
  // grepping the route files for `normalizeClientPhone` — a spelling, not a
  // behaviour. Invoking the handler is what can actually see the value that
  // reaches the DB layer.
  it('stores the normalized E.164 value, not the raw text', async () => {
    await POST(postRequest(formPayload({ phone: '(81) 1234-5678' })));
    expect(insertCalls[0].phone).toBe('+528112345678');
  });

  it('refuses a value the OTP route could never deliver to', async () => {
    const res = await POST(postRequest(formPayload({ phone: 'llamar a la oficina' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PHONE');
    expect(body.error.fields.phone).toContain('10 dígitos');
    expect(insertCalls).toHaveLength(0);
  });

  it('keeps the phone optional', async () => {
    await POST(postRequest(formPayload({ phone: null })));
    expect(insertCalls[0].phone).toBeNull();
  });

  it('PUT only rejects when the caller is actually setting the phone', async () => {
    // A patch of `notes` on a client whose stored phone predates this
    // validation must still succeed rather than fail over a column it never
    // touched. Verified by planting `'phone' in fields` → `true` in
    // validateClientWrite and watching this go red.
    const res = await PUT(putRequest({ notes: 'solo notas' }), { params });
    expect(res.status).toBe(200);
    expect(updateCalls[0]).not.toHaveProperty('phone');
  });

  it('PUT rejects a bad phone when it is being set', async () => {
    const res = await PUT(putRequest({ phone: '1234567' }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.phone).toBeTruthy();
    expect(updateCalls).toHaveLength(0);
  });
});

describe('every bad field is reported at once, keyed by column', () => {
  /**
   * The complaint this closes: "me pide llenar más campos" one at a time, with
   * no way to tell which input each message meant. The routes validated in
   * sequence and returned on the first failure, so a form with three problems
   * took three round trips to discover — and the envelope carried only prose.
   */
  it('names all of them in one 400', async () => {
    const res = await POST(
      postRequest(
        formPayload({
          name: '   ',
          phone: '1234567',
          credit_limit: -5,
          credit_status: 'moroso',
        })
      )
    );

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(Object.keys(error.fields).sort()).toEqual([
      'credit_limit',
      'credit_status',
      'name',
      'phone',
    ]);
    // Every message is Spanish and free of developer jargon (hard rule 8).
    for (const message of Object.values(error.fields) as string[]) {
      expect(message).not.toMatch(/\b(null|undefined|constraint|column|RLS|invalid)\b/i);
    }
    expect(insertCalls).toHaveLength(0);
  });

  it('summarizes the count so the banner is worth reading', async () => {
    const res = await POST(postRequest(formPayload({ name: '  ', phone: 'x' })));
    const { error } = await res.json();
    expect(error.message).toMatch(/Revisa 2 campos/);
    expect(error.message).toMatch(/Nombre o Razón Social/);
    expect(error.message).toMatch(/Teléfono WhatsApp/);
  });

  it('reads as itself when only one field is wrong', async () => {
    const res = await POST(postRequest(formPayload({ credit_limit: -1 })));
    const { error } = await res.json();
    expect(error.message).toBe(error.fields.credit_limit);
  });

  it('registers a client from the name alone', async () => {
    // The floor the product has to clear: an owner on a phone who has a name
    // and nothing else must end up with a client.
    const res = await POST(postRequest({ name: 'Ferretería Don Roberto' }));
    expect(res.status).toBe(201);
    expect(insertCalls[0]).toMatchObject({
      name: 'Ferretería Don Roberto',
      organization_id: 'org-1',
    });
  });
});

describe('optional contact and fiscal details never cost the client record', () => {
  /**
   * The first pass at #146 removed the RFC gate and, in the same change, added
   * blocking gates on `email` and `codigo_postal` — the identical mistake with
   * different fields. Neither is load-bearing at registration: a malformed CP
   * is refused by `lib/facturapi.ts` at stamping, loudly, where it matters.
   */
  it('stores a malformed email and a short código postal rather than refusing', async () => {
    const res = await POST(
      postRequest(formPayload({ email: 'no-es-un-correo', codigo_postal: '640' }))
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].email).toBe('no-es-un-correo');
    expect(insertCalls[0].codigo_postal).toBe('640');
  });

  it('never names either of them in a field error', async () => {
    const res = await POST(postRequest(formPayload({ email: 'x', codigo_postal: '1', phone: 'no' })));
    const { error } = await res.json();
    expect(error.fields).not.toHaveProperty('email');
    expect(error.fields).not.toHaveProperty('codigo_postal');
    expect(error.fields).toHaveProperty('phone');
  });

  it('still treats blank as cleared, storing NULL', async () => {
    const res = await POST(postRequest(formPayload({ email: null, codigo_postal: '   ' })));
    expect(res.status).toBe(201);
    expect(insertCalls[0].email).toBeNull();
    expect(insertCalls[0].codigo_postal).toBeNull();
  });

  /**
   * The phone is the deliberate exception. It is the channel a signature is
   * delivered to, and an unusable value stored here resurfaces days later as a
   * 502 from the OTP route, phrased as though the provider were at fault (#40).
   */
  it('but the phone still blocks, because an unusable one breaks signing later', async () => {
    const res = await POST(postRequest(formPayload({ phone: 'llamar a la oficina' })));
    expect(res.status).toBe(400);
    expect(insertCalls).toHaveLength(0);
  });
});

describe('the RFC does not block registration', () => {
  /**
   * It used to: both routes 400'd on anything that missed the SAT pattern, so
   * a half-remembered RFC cost the whole client record. The RFC is only
   * load-bearing at stamping time, and `lib/facturapi.ts` refuses a CFDI whose
   * receptor RFC is malformed and says so — which is where the refusal belongs.
   */
  it('stores a malformed RFC instead of refusing the client', async () => {
    const res = await POST(postRequest(formPayload({ rfc: 'ABC12' })));
    expect(res.status).toBe(201);
    expect(insertCalls[0].rfc).toBe('ABC12');
  });

  it('still normalizes case and whitespace', async () => {
    await POST(postRequest(formPayload({ rfc: '  cma120315hd9 ' })));
    expect(insertCalls[0].rfc).toBe('CMA120315HD9');
  });

  it('treats blank as absent', async () => {
    await POST(postRequest(formPayload({ rfc: '   ' })));
    expect(insertCalls[0].rfc).toBeNull();
  });

  it('lets an edit save a malformed RFC too', async () => {
    const res = await PUT(putRequest({ rfc: 'XX' }), { params });
    expect(res.status).toBe(200);
    expect(updateCalls[0].rfc).toBe('XX');
  });

  it('is never named in a field error', async () => {
    // Forced to 400 by the phone, which does still block — so there is an
    // `error.fields` to inspect at all. A malformed RFC alongside it must not
    // appear in it.
    const res = await POST(postRequest(formPayload({ rfc: 'no-es-un-rfc', phone: 'no' })));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.fields).toHaveProperty('phone');
    expect(error.fields).not.toHaveProperty('rfc');
  });
});

describe('the writable list covers what the form sends', () => {
  /**
   * Read out of the modal source, not out of the fixture above.
   *
   * A previous version of this test iterated `Object.keys(formPayload())` — a
   * hand-maintained local object — while claiming to fail the build if the form
   * grew a field the routes drop. It could not: if ClientFormModal grew a key,
   * the fixture would not, and the test stayed green. That is an assertion that
   * cannot fail for the reason it names (CLAUDE.md rule 7).
   */
  function keysClientFormModalSubmits(): string[] {
    const src = readFileSync(join(process.cwd(), 'components/clients/ClientFormModal.tsx'), 'utf8');
    const call = src.slice(src.indexOf('await onSave({'));
    const body = call.slice(0, call.indexOf('\n      });'));
    // `\s{8,}`, not `\s{8}`: the credit columns moved inside a conditional
    // spread when they were gated (#123), so they sit one indent deeper. They
    // are still keys the form submits, and a scan that stopped seeing them
    // would go quietly vacuous — which is what the count assertion below
    // caught the first time.
    return [...new Set([...body.matchAll(/^\s{8,}([a-z_]+):/gm)].map((m) => m[1]))];
  }

  it('reads a non-trivial key set out of the modal (guards the guard)', () => {
    const keys = keysClientFormModalSubmits();
    // If the parse silently matched nothing, every assertion below would pass
    // vacuously — the exact failure mode this test exists to prevent.
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(keys).toContain('regimen_fiscal');
    expect(keys).toContain('credit_limit');
  });

  it('every key ClientFormModal submits is writable', async () => {
    const { CLIENT_WRITABLE_FIELDS } = await import('@/lib/apiAuth');
    // Fails the build if the form grows a field the routes silently drop —
    // the exact shape of this defect.
    for (const key of keysClientFormModalSubmits()) {
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
