import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #64 — the settlement-account gate.
 *
 * The public payment page already refuses without a CLABE, but that refusal
 * fires in front of the paying client, after the link has been shared. These
 * tests pin the refusal one step earlier: on the server path that hands a
 * `/pay/` link to a client.
 *
 * The failure this guards against is not "a 409 is missing" — it is a tenant
 * spending their credibility on a link that dead-ends, and the two holes the
 * issue names (an organization created before onboarding collected an account,
 * and one abandoned between the step-2 POST and the step-3 PATCH) both produce
 * exactly that state.
 */

import {
  hasSettlementAccount,
  requireSettlementAccount,
  SETTLEMENT_ACCOUNT_MISSING_CODE,
} from '@/lib/settlementAccount';

describe('hasSettlementAccount', () => {
  it('accepts an 18-digit CLABE', () => {
    expect(hasSettlementAccount({ bank_clabe: '012180001234567899' })).toBe(true);
  });

  it('rejects a null, missing or empty account', () => {
    expect(hasSettlementAccount({ bank_clabe: null })).toBe(false);
    expect(hasSettlementAccount({})).toBe(false);
    expect(hasSettlementAccount(null)).toBe(false);
    expect(hasSettlementAccount(undefined)).toBe(false);
    expect(hasSettlementAccount({ bank_clabe: '' })).toBe(false);
  });

  it('rejects a partial CLABE rather than treating any string as ready', () => {
    // A truthiness check would pass these. A 12-digit value in the column is
    // not an account anyone can wire to.
    expect(hasSettlementAccount({ bank_clabe: '012180001234' })).toBe(false);
    expect(hasSettlementAccount({ bank_clabe: '   ' })).toBe(false);
  });
});

/** Minimal Supabase double: `.from().select().eq().maybeSingle()`. */
function supabaseReturning(result: { data: unknown; error?: unknown }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ error: null, ...result }),
    })),
  };
}

describe('requireSettlementAccount', () => {
  it('passes through the CLABE when the organization has one', async () => {
    const result = await requireSettlementAccount(
      supabaseReturning({ data: { bank_clabe: '012180001234567899' } }),
      'org-1'
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clabe).toBe('012180001234567899');
  });

  it('refuses with 409 ORG_BANK_DETAILS_MISSING when there is no CLABE', async () => {
    const result = await requireSettlementAccount(
      supabaseReturning({ data: { bank_clabe: null } }),
      'org-1'
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.response.status).toBe(409);
    const body = await result.response.json();
    expect(body.error.code).toBe(SETTLEMENT_ACCOUNT_MISSING_CODE);
    // Spanish, and it names the thing to fix rather than the error condition.
    expect(body.error.message).toMatch(/CLABE/);
  });

  it('refuses when the lookup returns nothing', async () => {
    // Letting a payment link out on the strength of a query that found no row
    // is the fail-open half of this gate.
    const result = await requireSettlementAccount(supabaseReturning({ data: null }), 'org-1');
    expect(result.ok).toBe(false);
  });

  it('scopes the read to the caller organization', async () => {
    const eq = vi.fn().mockReturnThis();
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq,
        maybeSingle: vi.fn().mockResolvedValue({
          data: { bank_clabe: '012180001234567899' },
          error: null,
        }),
      })),
    };

    await requireSettlementAccount(supabase, 'org-42');

    // An unscoped gate would answer for whichever row came back first.
    expect(eq).toHaveBeenCalledWith('id', 'org-42');
  });
});

/* ------------------------------------------------------------------ */
/* The outbound WhatsApp reminder — the route that hands out the link. */
/* ------------------------------------------------------------------ */

const authState: {
  organization: Record<string, unknown> | null;
} = { organization: null };

const dispatchWhatsAppReminder = vi.fn();

vi.mock('@/lib/apiAuth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiAuth')>('@/lib/apiAuth');
  return {
    ...actual,
    isDemoDeployment: () => false,
    requireOrgAccess: async () => ({
      ok: true,
      ctx: {
        supabase: {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: authState.organization, error: null }),
              }),
            }),
          }),
        },
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'owner',
      },
    }),
  };
});

vi.mock('@/lib/whatsappOutbound', () => ({
  dispatchWhatsAppReminder: (...args: unknown[]) => dispatchWhatsAppReminder(...args),
}));

async function postReminder() {
  const { POST } = await import('@/app/api/whatsapp/broadcast/route');
  const req = new Request('https://businesshelper.app/api/whatsapp/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientName: 'Construcciones Maya',
      phone: '8115551234',
      amountDue: 48720,
      dueDate: '2026-09-01',
      token: 'tok-1',
    }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any);
}

beforeEach(() => {
  dispatchWhatsAppReminder.mockReset();
  dispatchWhatsAppReminder.mockResolvedValue({ success: true, mode: 'wa_me_link' });
});

describe('POST /api/whatsapp/broadcast — settlement account gate (#64)', () => {
  it('refuses to send a payment reminder when the organization has no CLABE', async () => {
    authState.organization = { bank_clabe: null };

    const res = await postReminder();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe(SETTLEMENT_ACCOUNT_MISSING_CODE);
    // The point of the gate: the message must not go out. A 409 returned after
    // dispatch would still have put a dead link in front of the client.
    expect(dispatchWhatsAppReminder).not.toHaveBeenCalled();
  });

  it('sends the reminder once the organization has an account', async () => {
    authState.organization = { bank_clabe: '012180001234567899' };

    const res = await postReminder();

    expect(res.status).toBe(200);
    expect(dispatchWhatsAppReminder).toHaveBeenCalledTimes(1);
  });
});
