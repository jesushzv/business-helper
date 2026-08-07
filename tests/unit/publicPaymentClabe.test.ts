import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #14 — an organization with no CLABE must be refused, not defaulted.
 *
 * The route previously served one hardcoded CLABE to every tenant's customers,
 * so payers wired funds to a fixed account regardless of who they owed. The
 * refusal that replaced it had no behavioural coverage: the only test naming
 * `bank_clabe` asserts that a migration file contains the string. This pins the
 * actual response, because falling back here misdirects real money.
 */

const orgState: { organization: Record<string, unknown> | null } = { organization: null };

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => true,
  createServiceClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'quote-1',
          title: 'Suministro de Cemento',
          contracts: {
            id: 'contract-1',
            title: 'Suministro de Cemento',
            milestones: [
              {
                id: 'milestone-1',
                label: 'Anticipo 50%',
                amount: 48720,
                due_date: '2026-09-01',
                status: 'pending',
              },
            ],
          },
          clients: { name: 'Construcciones Maya' },
          organizations: orgState.organization,
        },
        error: null,
      }),
    })),
  }),
}));

async function getPaymentDetails() {
  const { GET } = await import('@/app/api/receivables/public/[token]/route');
  return GET(new Request('https://businesshelper.app/api/receivables/public/tok-1'), {
    params: Promise.resolve({ token: 'tok-1' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('public payment details — organization CLABE', () => {
  it('refuses with 409 when the organization has no CLABE', async () => {
    orgState.organization = {
      name: 'Ferretería La Silla',
      bank_name: null,
      bank_clabe: null,
      bank_account_holder: null,
    };

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('ORG_BANK_DETAILS_MISSING');
    // Nothing resembling an account number may reach the payer.
    expect(JSON.stringify(body)).not.toMatch(/\d{18}/);
  });

  it('serves the organization own CLABE when it has one', async () => {
    orgState.organization = {
      name: 'Ferretería La Silla',
      bank_name: 'BBVA México',
      bank_clabe: '012180001234567899',
      bank_account_holder: 'Ferretería La Silla S.A. de C.V.',
    };

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.milestone.clabe).toBe('012180001234567899');
    expect(body.milestone.bank_name).toBe('BBVA México');
  });

  it('never serves a fallback account when the organization row is missing', async () => {
    orgState.organization = null;

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(JSON.stringify(body)).not.toMatch(/\d{18}/);
  });
});
