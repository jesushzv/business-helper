import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #148 on the public payment route — the one whose reader is not the tenant.
 *
 * `POST /api/receivables/public/[token]` is where a payer declares a SPEI
 * transfer. Its failed-write branch returned one 500 with one sentence and
 * discarded the error, so a schema the deploy had outrun and a genuine outage
 * were the same event to the founder chasing a payment that never appeared.
 *
 * It now classifies the failure — while keeping the prose in the register of
 * someone who did not sign up (#65) and keeping the operation code the page
 * branches on. The message must never imply the declaration was recorded: the
 * write that would have recorded it is precisely what failed (#58/#86).
 */

const state: { updateError: unknown } = { updateError: null };

vi.mock('@/lib/sentry', () => ({ captureException: () => {} }));

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'quote-1',
                  title: 'Suministro',
                  contracts: {
                    id: 'contract-1',
                    title: 'Suministro',
                    milestones: [
                      { id: 'm-1', label: 'Anticipo', amount: 5000, due_date: '2026-09-01', status: 'pending' },
                    ],
                  },
                  clients: { name: 'Cliente' },
                  organizations: {
                    name: 'Org',
                    bank_name: 'Banco',
                    bank_clabe: '012180001234567897',
                    bank_account_holder: 'Org',
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        update: () => ({
          eq: () => ({
            in: () => ({
              select: async () => ({ data: null, error: state.updateError }),
            }),
          }),
        }),
      };
    },
  }),
}));

function postRequest(): Request {
  return new Request('https://businesshelper.app/api/receivables/public/tok-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracking_reference: 'SPEI123456', transferred_amount: 5000 }),
  });
}

const params = { params: Promise.resolve({ token: 'tok-1' }) };

beforeEach(() => {
  state.updateError = null;
});

describe('POST /api/receivables/public/[token] — a failed write, read by the payer', () => {
  it('separates a stale schema (503) from an outage (500) under one operation code', async () => {
    const { POST } = await import('@/app/api/receivables/public/[token]/route');

    state.updateError = {
      code: 'PGRST204',
      message: "Could not find the 'tracking_reference' column of 'milestones' in the schema cache",
    };
    const stale = await POST(postRequest(), params);
    const staleBody = await stale.json();

    state.updateError = { code: '', message: 'fetch failed' };
    const outage = await POST(postRequest(), params);
    const outageBody = await outage.json();

    expect(stale.status).toBe(503);
    expect(outage.status).toBe(500);
    // The page branches on the code; it names the step, not the SQLSTATE.
    expect(staleBody.error.code).toBe('RECEIPT_WRITE_FAILED');
    expect(outageBody.error.code).toBe('RECEIPT_WRITE_FAILED');
  });

  it('tells the payer nothing was recorded, in their register and without a column', async () => {
    state.updateError = {
      code: '42501',
      message: 'new row violates row-level security policy for table "milestones"',
    };
    const { POST } = await import('@/app/api/receivables/public/[token]/route');
    const res = await POST(postRequest(), params);
    const body = await res.json();

    // A payer is never told they lack permission, and never answered 403.
    expect(res.status).toBe(500);
    expect(body.success).toBeUndefined();
    expect(body.error.message).not.toMatch(/tu cuenta|tu organización|permiso|row-level|policy|milestones/i);
    expect(body.error.message).not.toMatch(/enviado correctamente|registrado correctamente/i);
    expect(body.error.message).toMatch(/no pudimos completar la operación/i);
  });
});
