import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '@/app/api/organization/route';

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
let updateResult: { data: unknown; error: unknown } = { data: { id: 'org-1' }, error: null };

vi.mock('@/lib/apiAuth', () => ({
  requireUser: vi.fn(async () => ({
    ok: true,
    userId: 'user-1',
    supabase: {
      from: () => ({
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

describe('PATCH /api/organization — bank payload keeps its contract', () => {
  it('still validates the CLABE when any bank field is present', async () => {
    const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: '123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CLABE');
  });

  it('still saves a valid bank payload', async () => {
    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567897', bankAccountHolder: 'X' })
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_name: 'BBVA', bank_clabe: '012180001234567897' });
  });
});
