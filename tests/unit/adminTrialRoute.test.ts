import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * POST /api/admin/organizations/[id]/trial — the founder extends a trial.
 *
 * This is a cross-tenant write, so the claims pinned are the refusals and the
 * honesty of the success: Stripe-owned subscriptions (`active`/`past_due`) are
 * refused rather than silently overwritten, the response carries the row the
 * database returned — not what the caller asked for — and every grant leaves
 * an audit_logs row naming the admin who did it.
 */

type Row = Record<string, unknown>;

const gate: { result: unknown } = { result: null };

const state: {
  org: Row | null;
  updated: Row | null;
  updateError: { message: string } | null;
  updates: Array<{ values: Row; filters: Row }>;
  audits: Row[];
} = { org: null, updated: null, updateError: null, updates: [], audits: [] };

function organizationsDouble() {
  const filters: Row = {};
  let pendingUpdate: Row | null = null;

  const builder: Record<string, unknown> = {
    select: () => proxy,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return proxy;
    },
    update: (values: Row) => {
      pendingUpdate = values;
      return proxy;
    },
    not: (column: string, operator: string, value: unknown) => {
      filters[`not_${column}_${operator}`] = value;
      return proxy;
    },
    maybeSingle: async () => {
      if (pendingUpdate) {
        state.updates.push({ values: pendingUpdate, filters: { ...filters } });
        if (state.updateError) return { data: null, error: state.updateError };
        return { data: state.updated, error: null };
      }
      const match = state.org && state.org.id === filters.id ? state.org : null;
      return { data: match, error: null };
    },
  };

  const proxy: Record<string, unknown> = new Proxy(builder, {
    get(target, prop) {
      return target[prop as string];
    },
  });

  return proxy;
}

function auditLogsDouble() {
  const builder: Record<string, unknown> = {
    insert: (values: Row) => {
      state.audits.push(values);
      return {
        then: (resolve: (v: unknown) => void) => Promise.resolve({ error: null }).then(resolve),
      };
    },
  };
  return builder;
}

const service = {
  from: (table: string) => (table === 'audit_logs' ? auditLogsDouble() : organizationsDouble()),
};

vi.mock('@/lib/platformAdmin', () => ({
  requirePlatformAdmin: async () => gate.result,
}));

import { POST } from '@/app/api/admin/organizations/[id]/trial/route';

function request(body: unknown): Request {
  return new Request('http://localhost/api/admin/organizations/org-1/trial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function call(body: unknown, id = 'org-1') {
  return POST(request(body), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  gate.result = { ok: true, ctx: { service, userId: 'uid-admin' } };
  state.org = {
    id: 'org-1',
    name: 'Constructora Norte',
    subscription_status: 'trialing',
    trial_ends_at: '2027-01-10T00:00:00.000Z',
  };
  state.updated = {
    id: 'org-1',
    name: 'Constructora Norte (servidor)',
    subscription_status: 'trialing',
    trial_ends_at: '2027-02-09T00:00:00.000Z',
  };
  state.updateError = null;
  state.updates = [];
  state.audits = [];
});

describe('POST /api/admin/organizations/[id]/trial', () => {
  it('returns the gate refusal verbatim and writes nothing', async () => {
    gate.result = {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } },
        { status: 404 }
      ),
    };
    const response = await call({ days: 30 });
    expect(response.status).toBe(404);
    expect(state.updates).toHaveLength(0);
  });

  it.each([
    ['missing', {}],
    ['zero', { days: 0 }],
    ['negative', { days: -5 }],
    ['fractional', { days: 1.5 }],
    ['not a number', { days: 'treinta' }],
    ['above the cap', { days: 366 }],
  ])('422s on %s days with a Spanish message and writes nothing', async (_label, body) => {
    const response = await call(body);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.error.code).toBe('INVALID_DAYS');
    expect(json.error.message).toMatch(/días/);
    expect(state.updates).toHaveLength(0);
  });

  it('404s an organization that does not exist, without writing', async () => {
    const response = await call({ days: 30 }, 'org-ghost');
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error.code).toBe('ORGANIZATION_NOT_FOUND');
    expect(state.updates).toHaveLength(0);
  });

  it.each([['active'], ['past_due']])(
    'refuses to touch a %s subscription — Stripe owns it',
    async (status) => {
      state.org = { ...state.org!, subscription_status: status };
      const response = await call({ days: 30 });
      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.error.code).toBe('SUBSCRIPTION_ACTIVE');
      expect(state.updates).toHaveLength(0);
    }
  );

  it('extends from the current end when the trial is still running', async () => {
    const response = await call({ days: 30 });
    expect(response.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values.trial_ends_at).toBe('2027-02-09T00:00:00.000Z');
    expect(state.updates[0].values.subscription_status).toBe('trialing');
    expect(state.updates[0].filters.id).toBe('org-1');
  });

  it('re-states the Stripe refusal as an UPDATE filter, so the check cannot race stale', async () => {
    await call({ days: 30 });
    expect(state.updates[0].filters.not_subscription_status_in).toBe('("active","past_due")');
  });

  it('409s when the webhook wins the race — zero rows matched is a refusal, not success', async () => {
    state.updated = null; // The guard filtered the row out between read and write.
    const response = await call({ days: 30 });
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error.code).toBe('SUBSCRIPTION_ACTIVE');
    expect(json.organization).toBeUndefined();
    expect(state.audits).toHaveLength(0);
  });

  it('extends from today when the trial already expired', async () => {
    state.org = { ...state.org!, trial_ends_at: '2020-01-01T00:00:00.000Z' };
    const before = Date.now();
    const response = await call({ days: 10 });
    const after = Date.now();

    expect(response.status).toBe(200);
    const written = new Date(state.updates[0].values.trial_ends_at as string).getTime();
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    expect(written).toBeGreaterThanOrEqual(before + tenDays);
    expect(written).toBeLessThanOrEqual(after + tenDays);
  });

  it.each([['unpaid'], ['incomplete'], ['trialing']])(
    'refuses an org with a live Stripe subscription even in status %s — Stripe owns it',
    async (status) => {
      state.org = {
        ...state.org!,
        subscription_status: status,
        stripe_subscription_id: 'sub_live_123',
      };
      const response = await call({ days: 30 });
      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.error.code).toBe('STRIPE_OWNED');
      expect(state.updates).toHaveLength(0);
    }
  );

  it('restarts a canceled organization as trialing (win-back)', async () => {
    state.org = { ...state.org!, subscription_status: 'canceled', trial_ends_at: null };
    const response = await call({ days: 15 });
    expect(response.status).toBe(200);
    expect(state.updates[0].values.subscription_status).toBe('trialing');
  });

  it('answers with the row the database returned, not what was asked', async () => {
    const response = await call({ days: 30 });
    const json = await response.json();
    expect(json.organization.name).toBe('Constructora Norte (servidor)');
    expect(json.organization.trial_ends_at).toBe('2027-02-09T00:00:00.000Z');
    expect(json.previous_trial_ends_at).toBe('2027-01-10T00:00:00.000Z');
  });

  it('leaves an audit_logs row naming the admin and the change', async () => {
    await call({ days: 30 });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].organization_id).toBe('org-1');
    expect(state.audits[0].actor).toBe('uid-admin');
    expect(String(state.audits[0].action)).toContain('trial');
    expect(String(state.audits[0].details)).toContain('2027-02-09');
  });

  it('reports a failed write as a 500, never success (#96 shape)', async () => {
    state.updateError = { message: 'write refused' };
    const response = await call({ days: 30 });
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error.code).toBe('ADMIN_TRIAL_UPDATE_FAILED');
    expect(json.organization).toBeUndefined();
  });
});
