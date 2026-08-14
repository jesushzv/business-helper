import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expectedSettlementAmount } from '@/lib/receivablesCalculator';

/**
 * #352 — which document governs what this cobro must be paid.
 *
 * Since #341 the base is the stamped `cfdi_total` when there is a live
 * document, and the contractual `milestones.amount` otherwise. That made two
 * previously-invisible situations load-bearing, and both are answered here.
 *
 * **1. `amount` stayed writable after stamping, and changed nothing.** An
 * owner could edit a stamped milestone from $10,000 to $15,000, see the save
 * succeed, and watch Cobranza go on showing $10,000 — the stale `cfdi_total`
 * governing. Arguably correct (the CFDI is the fiscal fact), but *silent*: a
 * screen ignoring what the owner just typed with no explanation is the #146
 * shape. Option A: refuse and name the invoice.
 *
 * **2. A cancelled CFDI left its total behind.** `expectedSettlementAmount`
 * ignores `cfdi_total` while the status reads `cancelled` — but a re-stamp
 * moves the status *off* cancelled to `pending`, and a failed attempt to
 * `failed`, which is the durable one. In both, the guard stops firing while
 * the row still carries the void document's total.
 */

const dbState = {
  milestone: null as Record<string, unknown> | null,
  updated: { data: null as Record<string, unknown> | null, error: null as unknown },
  updates: [] as Record<string, unknown>[],
};

const authState = { role: 'owner' as string };

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: authState.role,
        supabase: {
          from: () => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self;
            chain.eq = self;
            chain.update = (values: Record<string, unknown>) => {
              dbState.updates.push(values);
              return chain;
            };
            chain.maybeSingle = async () =>
              dbState.updates.length > 0
                ? dbState.updated
                : { data: dbState.milestone, error: null };
            return chain;
          },
        },
      },
    })),
  };
});

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

const params = Promise.resolve({ id: 'm-1' });

function put(body: Record<string, unknown>) {
  return new Request('http://test/api/receivables/m-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authState.role = 'owner';
  dbState.milestone = { id: 'm-1', cfdi_status: 'none', cfdi_uuid: null };
  dbState.updated = { data: { id: 'm-1' }, error: null };
  dbState.updates = [];
});

describe('a stamped cobro refuses an amount edit (#352, option A)', () => {
  it('answers 409 naming the folio fiscal, and writes nothing', async () => {
    dbState.milestone = { id: 'm-1', cfdi_status: 'issued', cfdi_uuid: 'UUID-1234' };
    const { PUT } = await import('@/app/api/receivables/[id]/route');
    const res = await PUT(put({ amount: 15000 }), { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('AMOUNT_LOCKED_BY_CFDI');
    expect(body.error.message).toContain('UUID-1234');
    // Says what to do instead, in plain Spanish (hard rule 8).
    expect(body.error.message).toMatch(/cancela la factura/i);
    // Pinned to the input that was refused, so the form can put it there (#146).
    expect(body.error.fields.amount).toBeTruthy();
    // The whole point: the edit did not silently apply-and-do-nothing.
    expect(dbState.updates).toEqual([]);
  });

  it('still refuses when the row carries no folio, without saying "undefined"', async () => {
    dbState.milestone = { id: 'm-1', cfdi_status: 'issued', cfdi_uuid: null };
    const { PUT } = await import('@/app/api/receivables/[id]/route');
    const res = await PUT(put({ amount: 15000 }), { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.message).not.toMatch(/undefined|null/i);
  });

  it.each(['none', 'pending', 'failed', 'cancelled'])(
    'lets the amount through when cfdi_status is %s',
    async (cfdi_status) => {
      // Only a live document governs. A cancelled or failed one settles
      // nothing, and the field has to stay usable for typo fixes.
      dbState.milestone = { id: 'm-1', cfdi_status, cfdi_uuid: 'UUID-OLD' };
      const { PUT } = await import('@/app/api/receivables/[id]/route');
      const res = await PUT(put({ amount: 15000 }), { params });

      expect(res.status).toBe(200);
      expect(dbState.updates).toEqual([{ amount: 15000 }]);
    }
  );

  it('does not read the milestone at all when no amount is being written', async () => {
    // The guard costs a query; it must only cost it on the edit it guards.
    dbState.milestone = { id: 'm-1', cfdi_status: 'issued', cfdi_uuid: 'UUID-1234' };
    const { PUT } = await import('@/app/api/receivables/[id]/route');
    const res = await PUT(put({ label: 'Anticipo renombrado' }), { params });

    expect(res.status).toBe(200);
    expect(dbState.updates).toEqual([{ label: 'Anticipo renombrado' }]);
  });
});

describe('a replaced document does not leave its total behind (#352)', () => {
  it('the base follows the void document while the total lingers', () => {
    // The defect, stated as arithmetic. A $9,999.99 document is cancelled;
    // the guard holds while the status says so…
    const cancelled = { amount: 10000, cfdi_total: 9999.99, cfdi_status: 'cancelled' };
    expect(expectedSettlementAmount(cancelled)).toBe(10000);

    // …and stops the moment a re-stamp moves the status off `cancelled`.
    // `failed` is the durable one, so that is the window worth caring about.
    const reattempted = { ...cancelled, cfdi_status: 'failed' };
    expect(expectedSettlementAmount(reattempted)).toBe(9999.99);

    // Which is why the issue route clears the total when it replaces the
    // document: with it gone, the contractual amount governs again.
    expect(expectedSettlementAmount({ ...reattempted, cfdi_total: null })).toBe(10000);
  });

  it('the issue route clears cfdi_total when it sets the status to pending', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(process.cwd(), 'app/api/invoices/issue/route.ts'),
      'utf8'
    );

    // The write that precedes every stamp attempt — 'pending' before the call,
    // so a timeout never leaves the milestone reading as never attempted. The
    // object literal it writes is what has to carry the clear.
    const at = source.indexOf("cfdi_status: 'pending'");
    expect(at, "the issue route no longer writes cfdi_status: 'pending'").toBeGreaterThan(-1);
    const literal = source.slice(at, source.indexOf('})', at));
    expect(literal).toContain('cfdi_total: null');
  });
});
