import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #32 — confirming a payment requires the confirm_payment capability.
 *
 * The role matrix withholds confirm_payment from `member`, but the confirm
 * route never checked it, and PUT /api/receivables/[id] accepts `status` as a
 * writable field — so the gate has to hold on both doors or it holds on
 * neither.
 */

const authState = {
  role: 'member' as string,
};

vi.mock('@/lib/apiAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiAuth')>('@/lib/apiAuth');
  return {
    ...actual,
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

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => false,
  createServiceClient: () => {
    throw new Error('not configured in tests');
  },
}));

function makeSupabaseMock() {
  const updated = {
    id: 'm-1',
    contract_id: 'c-1',
    label: 'Anticipo',
    amount: 1000,
    transferred_amount: null,
    tracking_reference: null,
    status: 'confirmed',
  };
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: updated, error: null }),
  };
  return { from: vi.fn(() => chain) };
}

const params = Promise.resolve({ id: 'm-1' });

describe('POST /api/receivables/[id]/confirm capability gate', () => {
  beforeEach(() => {
    authState.role = 'member';
  });

  it('rejects a member with 403 FORBIDDEN before touching the milestone', async () => {
    const { POST } = await import('@/app/api/receivables/[id]/confirm/route');
    const res = await POST(new Request('http://test/api', { method: 'POST', body: '{}' }), {
      params,
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it.each(['owner', 'manager', 'accountant'])('allows %s to confirm', async (role) => {
    authState.role = role;
    const { POST } = await import('@/app/api/receivables/[id]/confirm/route');
    const res = await POST(new Request('http://test/api', { method: 'POST', body: '{}' }), {
      params,
    });
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/receivables/[id] cannot be used to bypass the confirm gate', () => {
  beforeEach(() => {
    authState.role = 'member';
  });

  it('rejects a member setting status to confirmed', async () => {
    const { PUT } = await import('@/app/api/receivables/[id]/route');
    const res = await PUT(
      new Request('http://test/api', {
        method: 'PUT',
        body: JSON.stringify({ status: 'confirmed', transferred_amount: 1000 }),
      }),
      { params }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('still lets a member make non-confirming edits', async () => {
    const { PUT } = await import('@/app/api/receivables/[id]/route');
    const res = await PUT(
      new Request('http://test/api', {
        method: 'PUT',
        body: JSON.stringify({ label: 'Anticipo actualizado', due_date: '2026-09-01' }),
      }),
      { params }
    );
    expect(res.status).toBe(200);
  });

  it('lets a manager confirm via PUT', async () => {
    authState.role = 'manager';
    const { PUT } = await import('@/app/api/receivables/[id]/route');
    const res = await PUT(
      new Request('http://test/api', {
        method: 'PUT',
        body: JSON.stringify({ status: 'confirmed' }),
      }),
      { params }
    );
    expect(res.status).toBe(200);
  });
});

describe('source contract', () => {
  it.each([
    'app/api/receivables/[id]/confirm/route.ts',
    'app/api/receivables/[id]/route.ts',
  ])('%s checks the confirm_payment capability', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).toContain("hasCapability(role, 'confirm_payment')");
  });
});
