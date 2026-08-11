import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #148 — the eleven routes that discarded the error object now classify it.
 *
 * `writeErrorLegibility.test.ts` is the scan: it proves no route *ignores* a
 * failed write. It cannot prove the answer that replaced the hardcoded 500 is
 * any good — a route could call the describer and still hand the tenant nine
 * useless words, and on the two public routes it could hand a *paying client*
 * prose written for the tenant ("tu organización", a column name), which is
 * #65's defect wearing #148's clothes.
 *
 * So this file asserts on the answers themselves: what the tenant reads, what
 * the signer reads, and the status each cause produces. The route cases invoke
 * real handlers with a Supabase double that fails the write, because a mocked
 * `fetch` cannot see any of this.
 */

const captured: Array<{ error: unknown; context: unknown }> = [];

vi.mock('@/lib/sentry', () => ({
  captureException: (error: unknown, context: unknown) => {
    captured.push({ error, context });
  },
}));

const {
  describeDbWriteError,
  dbWriteErrorResponse,
  publicDbWriteErrorResponse,
} = await import('@/lib/dbWriteError');

/** The shapes Supabase actually returns, not invented ones. */
const SCHEMA_STALE = {
  code: 'PGRST204',
  message: "Could not find the 'transferred_amount' column of 'milestones' in the schema cache",
};
const RLS_DENIED = { code: '42501', message: 'new row violates row-level security policy' };
const CHECK_FAILED = {
  code: '23514',
  message: 'new row for relation "clients" violates check constraint "chk_client_credit_limit_non_negative"',
};
const OUTAGE = { code: '', message: 'fetch failed' };

/** Jargon that must never reach a user-facing message (hard rule 8). */
const JARGON = /RLS|row-level|SQLSTATE|PGRST|constraint|policy|schema cache|null value/i;

beforeEach(() => {
  captured.length = 0;
});

describe('dbWriteErrorResponse — what the tenant gets back', () => {
  it('separates a stale schema (503) from a refused value (400) from an outage (500)', async () => {
    const stale = dbWriteErrorResponse(SCHEMA_STALE, 'el cobro', 'PUT /api/receivables/[id]');
    const refused = dbWriteErrorResponse(CHECK_FAILED, 'el cliente', 'POST /api/clients');
    const outage = dbWriteErrorResponse(OUTAGE, 'el cobro', 'PUT /api/receivables/[id]');

    expect(stale.status).toBe(503);
    expect(refused.status).toBe(400);
    expect(outage.status).toBe(500);

    // The three were one indistinguishable 500 before.
    const codes = await Promise.all(
      [stale, refused, outage].map(async (r) => (await r.json()).error.code)
    );
    expect(new Set(codes).size).toBe(3);
  });

  it('names the missing column, and pins it to its input through error.fields', async () => {
    const body = await dbWriteErrorResponse(
      SCHEMA_STALE,
      'el cobro',
      'PUT /api/receivables/[id]'
    ).json();
    expect(body.error.message).toContain('transferred_amount');

    const check = await dbWriteErrorResponse(CHECK_FAILED, 'el cliente', 'POST /api/clients').json();
    expect(check.error.fields).toEqual({ credit_limit: expect.any(String) });
  });

  it('uses the verb of the operation that failed', async () => {
    const del = await dbWriteErrorResponse(OUTAGE, 'el producto', 'DELETE /api/products/[id]', {
      verb: 'eliminar',
    }).json();
    expect(del.error.message).toContain('No se pudo eliminar el producto');

    const denied = await dbWriteErrorResponse(RLS_DENIED, 'el producto', 'DELETE /api/products/[id]', {
      verb: 'eliminar',
    }).json();
    expect(denied.error.message).toContain('eliminar el producto');
  });

  it('logs the original error rather than discarding it', () => {
    dbWriteErrorResponse(RLS_DENIED, 'el cobro', 'PUT /api/receivables/[id]');
    expect(captured).toHaveLength(1);
    expect(captured[0].error).toBe(RLS_DENIED);
    expect(captured[0].context).toMatchObject({
      route: 'PUT /api/receivables/[id]',
      tags: { db_error_code: '42501' },
    });
  });
});

describe('publicDbWriteErrorResponse — what the tenant’s client gets back', () => {
  it('keeps the operation code the page branches on', async () => {
    const res = publicDbWriteErrorResponse(OUTAGE, {
      code: 'RECEIPT_WRITE_FAILED',
      entity: 'el comprobante',
      route: 'POST /api/receivables/public/[token]',
      verb: 'registrar',
    });
    expect((await res.json()).error.code).toBe('RECEIPT_WRITE_FAILED');
  });

  it('never blames the reader for a permission failure, and never answers 403', async () => {
    // A payer told "tu cuenta no tiene permiso" would read it as their bank
    // refusing them. It is the platform's problem, and it is a 500 from here.
    const res = publicDbWriteErrorResponse(RLS_DENIED, {
      code: 'SIGNATURE_WRITE_FAILED',
      entity: 'la firma',
      route: 'POST /api/quotes/public/[token]',
      verb: 'registrar',
    });
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error.message).not.toMatch(/tu cuenta|tu organización|permiso/i);
    expect(error.message).toMatch(/problema del sistema/i);
  });

  it('names no column and no jargon, whatever the cause', async () => {
    for (const raw of [SCHEMA_STALE, RLS_DENIED, CHECK_FAILED, OUTAGE]) {
      const { error } = await publicDbWriteErrorResponse(raw, {
        code: 'RECEIPT_WRITE_FAILED',
        entity: 'el comprobante',
        route: 'POST /api/receivables/public/[token]',
      }).json();
      expect(error.message).not.toMatch(JARGON);
      expect(error.message).not.toContain('transferred_amount');
      // Nothing may read as "we recorded it" — the write is what just failed.
      expect(error.message).not.toMatch(/registrad[oa] correctamente|recibimos tu pago/i);
    }
  });

  it('still separates a stale schema from a genuine outage', () => {
    const stale = publicDbWriteErrorResponse(SCHEMA_STALE, {
      code: 'RECEIPT_WRITE_FAILED',
      entity: 'el comprobante',
      route: 'POST /api/receivables/public/[token]',
    });
    const outage = publicDbWriteErrorResponse(OUTAGE, {
      code: 'RECEIPT_WRITE_FAILED',
      entity: 'el comprobante',
      route: 'POST /api/receivables/public/[token]',
    });
    expect(stale.status).toBe(503);
    expect(outage.status).toBe(500);
  });
});

describe('the tenant messages stay in Spanish and out of the machine room', () => {
  it('carries no jargon for any cause, on any audience', () => {
    const causes = [SCHEMA_STALE, RLS_DENIED, CHECK_FAILED, OUTAGE, { code: '23505' }, { code: '22001' }];
    for (const raw of causes) {
      for (const audience of ['tenant', 'client'] as const) {
        const { message } = describeDbWriteError(raw, 'el cobro', 'test', { audience });
        // The column name in the schema-stale tenant message is the one
        // deliberate exception: it is the answer, and it goes to the owner.
        const withoutColumn = message.replace(/«[a-z0-9_]+»/g, '«…»');
        expect(withoutColumn, `${raw.code} / ${audience}`).not.toMatch(JARGON);
        expect(message.length).toBeGreaterThan(20);
      }
    }
  });
});
