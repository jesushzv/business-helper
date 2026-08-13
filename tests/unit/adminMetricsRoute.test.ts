import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * GET /api/admin/metrics — the founder's cross-tenant read.
 *
 * The route runs behind `requirePlatformAdmin()` and must return its refusal
 * verbatim; past the gate, every figure is computed from service-role reads.
 * The claims pinned here: the gate response passes through untouched, an
 * unknown user count is `null` and never `0` (the #64 tri-state rule — a
 * failed read is not an empty platform), and a failed query is a 500, never
 * demo-shaped data.
 */

type Row = Record<string, unknown>;

const gate: { result: unknown } = { result: null };

const state: {
  orgs: Row[] | 'fail';
  orgCount: number;
  headCounts: Record<string, number>;
  confirmedMilestones: Row[];
  usersTotal: number | 'fail';
} = {
  orgs: [],
  orgCount: 0,
  headCounts: {},
  confirmedMilestones: [],
  usersTotal: 0,
};

/**
 * A chainable double for the three query shapes the route issues: the
 * organizations list (select + order + range, count exact), head-only counts,
 * and the confirmed-milestones amount read (select + eq).
 */
function tableDouble(tableName: string) {
  let wantsHead = false;
  const filters: Row = {};

  const settle = () => {
    if (wantsHead) {
      return { count: state.headCounts[tableName] ?? 0, error: null, data: null };
    }
    if (tableName === 'organizations') {
      if (state.orgs === 'fail') {
        return { data: null, count: null, error: { message: 'read failed' } };
      }
      return { data: state.orgs, count: state.orgCount, error: null };
    }
    if (tableName === 'milestones' && filters.status === 'confirmed') {
      return { data: state.confirmedMilestones, count: null, error: null };
    }
    return { data: [], count: null, error: null };
  };

  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) wantsHead = true;
      return proxy;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return proxy;
    },
    order: () => proxy,
    range: () => proxy,
  };

  const proxy: Record<string, unknown> = new Proxy(builder, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => Promise.resolve(settle()).then(resolve);
      }
      return target[prop as string];
    },
  });

  return proxy;
}

const service = {
  from: (table: string) => tableDouble(table),
  auth: {
    admin: {
      listUsers: async () => {
        if (state.usersTotal === 'fail') {
          return { data: { users: [] }, error: { message: 'admin api down' } };
        }
        return { data: { users: [], total: state.usersTotal }, error: null };
      },
    },
  },
};

vi.mock('@/lib/platformAdmin', () => ({
  requirePlatformAdmin: async () => gate.result,
}));

import { GET } from '@/app/api/admin/metrics/route';

beforeEach(() => {
  gate.result = { ok: true, ctx: { service, userId: 'uid-admin' } };
  state.orgs = [
    {
      id: 'org-1',
      name: 'Constructora Norte',
      subscription_tier: 'inicial',
      subscription_status: 'trialing',
      trial_ends_at: '2026-09-01T00:00:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'org-2',
      name: 'Taller del Sur',
      subscription_tier: 'negocio',
      subscription_status: 'active',
      trial_ends_at: null,
      created_at: '2026-07-01T00:00:00.000Z',
    },
  ];
  state.orgCount = 2;
  state.headCounts = { clients: 7, quotes: 5, contracts: 3, milestones: 9 };
  state.confirmedMilestones = [{ amount: 1500.5 }, { amount: 2000 }, { amount: null }];
  state.usersTotal = 4;
});

describe('GET /api/admin/metrics', () => {
  it('returns the gate refusal verbatim', async () => {
    const refusal = NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } },
      { status: 404 }
    );
    gate.result = { ok: false, response: refusal };

    const response = await GET();
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('computes platform totals and breakdowns from service-role reads', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.totals.organizations).toBe(2);
    expect(body.totals.users).toBe(4);
    expect(body.totals.clients).toBe(7);
    expect(body.totals.quotes).toBe(5);
    expect(body.totals.contracts).toBe(3);
    expect(body.totals.milestones).toBe(9);
    expect(body.totals.confirmed_payments).toBe(3);
    expect(body.totals.confirmed_amount_mxn).toBeCloseTo(3500.5);

    expect(body.subscriptions).toEqual({ trialing: 1, active: 1 });
    expect(body.tiers).toEqual({ inicial: 1, negocio: 1 });

    expect(body.organizations).toHaveLength(2);
    expect(body.organizations[0].name).toBe('Constructora Norte');
    expect(body.organizations_total).toBe(2);
  });

  it('reports the user count as null — never 0 — when the admin API fails (#64 tri-state)', async () => {
    state.usersTotal = 'fail';
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.totals.users).toBeNull();
  });

  it('answers a failed read with a 500 error envelope, never demo-shaped data', async () => {
    state.orgs = 'fail';
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe('ADMIN_METRICS_FAILED');
    expect(typeof body.error.message).toBe('string');
    expect(body.totals).toBeUndefined();
    expect(body.organizations).toBeUndefined();
  });
});
