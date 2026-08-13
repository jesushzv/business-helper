import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #142 — the WhatsApp number registration requires must land somewhere.
 *
 * Register validated it as E.164, stored it in the auth user's metadata, and
 * nothing ever read it again: `POST /api/organization` (where the org row is
 * actually born, during onboarding) inserted no phone. The field every tenant
 * was forced to fill powered nothing — including the public quote page's
 * "Solicitar Cambios por WhatsApp" button, which renders only when
 * `organizations.phone` is set.
 */

const state = {
  metadataPhone: undefined as unknown,
};

const insertCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    isDemoDeployment: () => false,
    requireUser: vi.fn(async () => ({
      ok: true,
      userId: 'user-1',
      supabase: {
        auth: {
          getUser: async () => ({
            data: { user: { id: 'user-1', user_metadata: { phone: state.metadataPhone } } },
          }),
        },
        from: () => ({
          insert: (values: Record<string, unknown>) => {
            insertCalls.push(values);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'org-1', ...values }, error: null }),
              }),
            };
          },
        }),
      },
    })),
  };
});

const { POST } = await import('@/app/api/organization/route');

function postRequest(body: Record<string, unknown> = { name: 'Ferretería La Central' }) {
  return new Request('http://localhost/api/organization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  insertCalls.length = 0;
  state.metadataPhone = undefined;
});

describe('POST /api/organization carries the registered WhatsApp number (#142)', () => {
  it('writes the E.164 phone register collected onto the organization row', async () => {
    state.metadataPhone = '+528112345678';

    const res = await POST(postRequest());

    expect(res.status).toBe(200);
    expect(insertCalls[0].phone).toBe('+528112345678');
  });

  it('writes null — never a junk value — when the metadata carries no E.164 phone', async () => {
    // Absent is absent: a pre-#142 account whose metadata has no phone, or a
    // legacy non-E.164 shape, gets no invented number on the row the public
    // page builds wa.me links from.
    for (const junk of [undefined, '', '   ', 'no-phone', '8112345678', 12345]) {
      insertCalls.length = 0;
      state.metadataPhone = junk;
      await POST(postRequest());
      expect(insertCalls[0].phone, `metadata phone ${JSON.stringify(junk)}`).toBeNull();
    }
  });

  it('never reads the phone from the request body — the session owns it', async () => {
    state.metadataPhone = '+528112345678';

    await POST(postRequest({ name: 'X', phone: '+15550001111' }));

    expect(insertCalls[0].phone).toBe('+528112345678');
  });
});
