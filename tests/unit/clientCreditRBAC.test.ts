import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  authorizeCreditWrite,
  canManageCredit,
  CLIENT_CREDIT_FIELDS,
} from '@/lib/clientCreditAuthorization';
import { hasCapability } from '@/lib/teamRBAC';

/**
 * #123 — a client's trade-credit line is a control, and only owners and
 * managers hold it.
 *
 * Before this, `POST /api/clients` and `PUT /api/clients/[id]` called
 * `requireOrgAccess()` and no `hasCapability()`. That was harmless while
 * `CLIENT_WRITABLE_FIELDS` stripped the credit columns — they were discarded
 * for everyone — and stopped being harmless the moment #96 made them persist:
 * any member could raise a defaulting client's limit or clear the `blocked`
 * status the owner had set, after which the quote wizard stops warning.
 *
 * The two halves that matter, and that a layer-by-layer suite would miss
 * between them:
 *  - a member's *change* is refused, per field, rather than silently dropped
 *    while the modal reports the client saved (hard rule #1); and
 *  - a member's edit that merely **echoes** the stored credit values back — the
 *    form sends the whole record — still goes through, because gating that
 *    would gate the whole client rather than the credit line.
 */

const authState = { role: 'member' as string };
const stored: Record<string, unknown> = {
  credit_limit: '50000.00',
  credit_days: 30,
  credit_status: 'blocked',
};
const insertCalls: Array<Record<string, unknown>> = [];
const updateCalls: Array<Record<string, unknown>> = [];
const selectedColumns: string[] = [];

function makeSupabaseMock() {
  return {
    from: () => ({
      select: (columns: string) => {
        selectedColumns.push(columns);
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { ...stored }, error: null }),
            }),
          }),
        };
      },
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
  };
}

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    isDemoDeployment: () => false,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        supabase: makeSupabaseMock(),
        userId: 'user-1',
        organizationId: 'org-1',
        role: authState.role,
      },
    })),
  };
});

import { POST } from '@/app/api/clients/route';
import { PUT } from '@/app/api/clients/[id]/route';

const params = Promise.resolve({ id: 'client-1' });

function put(body: Record<string, unknown>) {
  return PUT(new Request('http://localhost/api/clients/client-1', { method: 'PUT', body: JSON.stringify(body) }), {
    params,
  });
}

function post(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/clients', { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  authState.role = 'member';
  insertCalls.length = 0;
  updateCalls.length = 0;
  selectedColumns.length = 0;
});

describe('the capability itself', () => {
  it('is held by owner and manager, not by member or accountant', () => {
    expect(hasCapability('owner', 'manage_credit')).toBe(true);
    expect(hasCapability('manager', 'manage_credit')).toBe(true);
    expect(hasCapability('member', 'manage_credit')).toBe(false);
    expect(hasCapability('accountant', 'manage_credit')).toBe(false);
  });

  it('treats an unknown role as unable, never as the nearest listed one', () => {
    expect(canManageCredit(null)).toBe(false);
    expect(canManageCredit(undefined)).toBe(false);
    expect(canManageCredit('')).toBe(false);
    expect(canManageCredit('propietario')).toBe(false);
  });

  it('names the same three columns the form and the write path do', () => {
    expect([...CLIENT_CREDIT_FIELDS]).toEqual(['credit_limit', 'credit_days', 'credit_status']);
  });
});

describe('authorizeCreditWrite', () => {
  it('passes a privileged caller through untouched', () => {
    const fields = { name: 'ACME', credit_limit: 90000 };
    const result = authorizeCreditWrite(fields, 'owner', stored);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields).toEqual(fields);
  });

  it('refuses each attempted change by column, in Spanish', () => {
    const result = authorizeCreditWrite(
      { name: 'ACME', credit_limit: 90000, credit_status: 'active' },
      'member',
      stored
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fields).sort()).toEqual(['credit_limit', 'credit_status']);
    expect(result.fields.credit_limit).toMatch(/no permite cambiar el límite de crédito/i);
    // No developer jargon in anything the tenant reads.
    expect(result.message).not.toMatch(/capability|role|RBAC|403/i);
  });

  it('lets an unchanged echo through, comparing the way the column would', () => {
    // numeric(12,2) reads back as '50000.00'; the form sends 50000.
    const result = authorizeCreditWrite(
      { name: 'ACME', credit_limit: 50000, credit_days: 30, credit_status: 'blocked' },
      'member',
      stored
    );
    expect(result.ok).toBe(true);
    // The no-op keys are dropped rather than written by a caller who may not set them.
    if (result.ok) expect(result.fields).toEqual({ name: 'ACME' });
  });

  it('treats blank, null and an absent column as the same "no credit line"', () => {
    const result = authorizeCreditWrite({ credit_limit: '', credit_status: null }, 'member', {
      credit_limit: null,
    });
    expect(result.ok).toBe(true);
  });

  it('counts any credit value on create as a change, since nothing is stored', () => {
    const result = authorizeCreditWrite({ name: 'ACME', credit_limit: 10000 }, 'member', null);
    expect(result.ok).toBe(false);
  });

  it('lets a member create a client with no credit terms', () => {
    const result = authorizeCreditWrite(
      { name: 'ACME', credit_limit: null, credit_days: null, credit_status: null },
      'member',
      null
    );
    expect(result.ok).toBe(true);
  });
});

describe('POST /api/clients', () => {
  it('refuses a member who sets a credit line, and stores nothing', async () => {
    const res = await post({ name: 'ACME', credit_limit: 75000 });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.fields.credit_limit).toBeTruthy();
    expect(insertCalls).toEqual([]);
  });

  it('lets a member register a client without credit terms', async () => {
    const res = await post({ name: 'ACME', credit_limit: null, credit_status: null });
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].name).toBe('ACME');
  });

  it('lets an owner set the line', async () => {
    authState.role = 'owner';
    const res = await post({ name: 'ACME', credit_limit: 75000, credit_status: 'active' });
    expect(res.status).toBe(201);
    expect(insertCalls[0].credit_limit).toBe(75000);
    expect(insertCalls[0].credit_status).toBe('active');
  });
});

describe('PUT /api/clients/[id]', () => {
  it('refuses a member raising a blocked client’s limit, and writes nothing', async () => {
    const res = await put({ name: 'ACME', credit_limit: 250000, credit_status: 'active' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.fields.credit_status).toMatch(/estatus de crédito/i);
    expect(updateCalls).toEqual([]);
  });

  it('lets a member edit the rest while echoing the stored credit values back', async () => {
    // This is what ClientFormModal sends on every edit, and refusing it would
    // gate the whole client record rather than the credit line.
    const res = await put({
      name: 'ACME',
      phone: '8112345678',
      credit_limit: 50000,
      credit_days: 30,
      credit_status: 'blocked',
    });
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].name).toBe('ACME');
    // Not rewritten by a caller who may not set them.
    for (const field of CLIENT_CREDIT_FIELDS) {
      expect(updateCalls[0]).not.toHaveProperty(field);
    }
  });

  it('reads the stored credit columns to make that comparison', async () => {
    await put({ name: 'ACME' });
    expect(selectedColumns.join(' ')).toContain('credit_limit');
  });

  it('skips the extra read for a role that may write the columns anyway', async () => {
    authState.role = 'manager';
    const res = await put({ name: 'ACME', credit_limit: 250000 });
    expect(res.status).toBe(200);
    expect(selectedColumns).toEqual([]);
    expect(updateCalls[0].credit_limit).toBe(250000);
  });
});
