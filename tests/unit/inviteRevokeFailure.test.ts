import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #314 — a failed revocation of the previous invitation must stop the
 * re-invite, not be discarded.
 *
 * The revoke UPDATE's result was never read: on failure, execution continued
 * into the INSERT, which collides 23505 with the still-pending row
 * (`uq_org_invitation_pending_email`) — a confusing failure whose real cause
 * was never named — and without that index it would have left two redeemable
 * invitation links outstanding. Found by the money-path review of PR #312.
 */

let revokeError: { code: string; message: string } | null = null;
let revokeCalls = 0;
let insertCalls = 0;

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'owner',
        supabase: {
          from: (table: string) => {
            if (table !== 'organization_invitations') throw new Error(`unexpected table ${table}`);
            const updateChain = {
              eq: () => updateChain,
              then: (resolve: (v: { error: unknown }) => unknown) => {
                revokeCalls += 1;
                return resolve({ error: revokeError });
              },
            };
            return {
              update: () => updateChain,
              insert: () => {
                insertCalls += 1;
                return {
                  select: () => ({
                    single: async () => ({
                      data: {
                        id: 'inv-1',
                        email: 'socio@negocio.mx',
                        role: 'member',
                        status: 'pending',
                        expires_at: '2026-08-21T00:00:00Z',
                        created_at: '2026-08-14T00:00:00Z',
                      },
                      error: null,
                    }),
                  }),
                };
              },
            };
          },
        },
      },
    })),
  };
});

const { POST } = await import('@/app/api/organization/members/route');

function invite() {
  return POST(
    new Request('http://localhost/api/organization/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'socio@negocio.mx', role: 'member' }),
    })
  );
}

beforeEach(() => {
  revokeError = null;
  revokeCalls = 0;
  insertCalls = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/organization/members revoke failure (#314)', () => {
  it('answers the DB-write envelope and never attempts the insert', async () => {
    revokeError = { code: '57014', message: 'canceling statement due to statement timeout' };

    const res = await invite();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('SERVER_ERROR');
    expect(body.error.message).toMatch(/invitación anterior/);
    expect(insertCalls).toBe(0);
  });

  it('still creates the invitation when the revoke succeeds', async () => {
    const res = await invite();

    expect(res.status).toBe(201);
    expect(revokeCalls).toBe(1);
    expect(insertCalls).toBe(1);
    const body = await res.json();
    expect(body.invitation.email).toBe('socio@negocio.mx');
  });
});
