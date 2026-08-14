import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildUnchangedOrganizationNotice } from '@/lib/teamInvitations';

/**
 * #269 — accepting a second invitation succeeds on the server and changes
 * nothing the user can see.
 *
 * The membership row is written, the invitation is spent, and the page said
 * "Ya formas parte del equipo. Abriendo tu panel…" — then dropped the external
 * accountant on their *first* client's dashboard, because every authenticated
 * route resolves the caller owner-first and then by oldest membership, and the
 * app has no organization switcher. Nothing on screen said the new organization
 * existed; the only signal was a `console.error`.
 *
 * The switcher is a product decision. What this pins is the honesty: when
 * joining will not change what the account opens, the route says so and the
 * page shows it instead of the countdown.
 */

const ORGANIZATIONS: Record<string, { id: string; name: string; owner_id: string | null }> = {
  'org-propia': { id: 'org-propia', name: 'Ferretería Don Roberto', owner_id: null },
  'org-cliente-1': { id: 'org-cliente-1', name: 'Constructora del Bajío', owner_id: 'otro' },
  'org-cliente-2': { id: 'org-cliente-2', name: 'Materiales del Norte', owner_id: 'otro' },
};

/** What the database holds for the accepting user, per case. */
const world = {
  ownedIds: [] as string[],
  membershipRows: [] as Array<{ organization_id: string; role: string; created_at: string }>,
  invitationOrgId: 'org-cliente-2',
};

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireUser: vi.fn(async () => ({
      ok: true,
      userId: 'user-contador',
      supabase: {
        auth: {
          getUser: async () => ({ data: { user: { email: 'contador@despacho.mx' } } }),
        },
      },
    })),
  };
});

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'organization_invitations') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          update: () => chain,
          maybeSingle: async () => ({
            data: {
              id: 'inv-1',
              organization_id: world.invitationOrgId,
              email: 'contador@despacho.mx',
              role: 'accountant',
              status: 'pending',
              expires_at: '2099-01-01T00:00:00Z',
            },
            error: null,
          }),
          then: (resolve: (v: { error: unknown }) => unknown) => resolve({ error: null }),
        };
        return chain;
      }

      if (table === 'organization_members') {
        const chain = {
          insert: async () => ({ error: null }),
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: async () => ({ data: world.membershipRows, error: null }),
        };
        return chain;
      }

      if (table === 'organizations') {
        let requestedId = '';
        const chain = {
          select: () => chain,
          eq: (column: string, value: string) => {
            if (column === 'id') requestedId = value;
            return chain;
          },
          order: () => chain,
          limit: async () => ({
            data: world.ownedIds.map((id) => ({ id })),
            error: null,
          }),
          maybeSingle: async () => ({
            data: ORGANIZATIONS[requestedId] ?? null,
            error: null,
          }),
        };
        return chain;
      }

      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { POST } = await import('@/app/api/organization/invitations/accept/route');

async function accept() {
  const res = await POST(
    new Request('http://localhost/api/organization/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok-1' }),
    })
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  world.ownedIds = [];
  world.membershipRows = [];
  world.invitationOrgId = 'org-cliente-2';
});

describe('accepting an invitation that will not change what the account opens', () => {
  it('warns the owner of their own business that the app keeps showing it', async () => {
    // Registered their own business, then accepted a client's invitation:
    // `resolveActiveOrganization` answers owner-first, forever.
    world.ownedIds = ['org-propia'];
    world.membershipRows = [
      { organization_id: 'org-cliente-2', role: 'accountant', created_at: '2026-08-14T00:00:00Z' },
    ];

    const { status, body } = await accept();

    expect(status).toBe(200);
    // The membership is real — this is not a failure, and must not read as one.
    expect(body.success).toBe(true);
    expect(body.organizationId).toBe('org-cliente-2');
    expect(body.notice?.code).toBe('ACTIVE_ORGANIZATION_UNCHANGED');
    expect(body.notice?.message).toContain('Materiales del Norte');
    expect(body.notice?.message).toContain('Ferretería Don Roberto');
    expect(body.activeOrganizationId).toBe('org-propia');
  });

  it('warns the external accountant that the older client keeps winning', async () => {
    // The persona from the issue: invited by a second client, resolves to the
    // first because that membership is older.
    world.membershipRows = [
      { organization_id: 'org-cliente-1', role: 'accountant', created_at: '2026-01-01T00:00:00Z' },
      { organization_id: 'org-cliente-2', role: 'accountant', created_at: '2026-08-14T00:00:00Z' },
    ];

    const { body } = await accept();

    expect(body.success).toBe(true);
    expect(body.notice?.code).toBe('ACTIVE_ORGANIZATION_UNCHANGED');
    expect(body.notice?.message).toContain('Constructora del Bajío');
    expect(body.activeOrganizationId).toBe('org-cliente-1');
  });

  it('sends no notice when the invitation IS the organization they will see', async () => {
    world.membershipRows = [
      { organization_id: 'org-cliente-2', role: 'accountant', created_at: '2026-08-14T00:00:00Z' },
    ];

    const { body } = await accept();

    expect(body.success).toBe(true);
    // A warning on the ordinary first-invitation path would be noise on the
    // happy flow, which is most acceptances.
    expect(body.notice).toBeNull();
    expect(body.activeOrganizationId).toBeNull();
  });
});

describe('the notice copy', () => {
  it('names both businesses and what to do about it, in plain Spanish', () => {
    const message = buildUnchangedOrganizationNotice(
      'Materiales del Norte',
      'Ferretería Don Roberto'
    );

    expect(message).toContain('«Materiales del Norte»');
    expect(message).toContain('«Ferretería Don Roberto»');
    expect(message).toMatch(/una empresa a la vez/i);
    expect(message).toMatch(/otro correo/i);
    // Developer jargon in tenant-facing copy is its own defect class (hard
    // rule #8).
    expect(message).not.toMatch(/tenant|organization_id|RLS|membership|resolve/i);
  });

  it('degrades to a description rather than inventing a business name', () => {
    const message = buildUnchangedOrganizationNotice(null, null);

    expect(message).not.toContain('«»');
    expect(message).not.toMatch(/undefined|null/i);
    expect(message).toMatch(/otra empresa/i);
  });
});
