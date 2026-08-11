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
const quoteState: { account: Record<string, unknown> | null } = { account: null };

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
          bank_account_id: quoteState.account ? quoteState.account.id : null,
          bank_accounts: quoteState.account,
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
  // The quote names no account unless a test says so — the pre-#164 state.
  quoteState.account = null;
});

function bankAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acct-1',
    label: 'BBVA principal',
    bank_name: 'BBVA México',
    clabe: '012180001234567899',
    account_holder: 'Ferretería La Silla S.A. de C.V.',
    is_default: true,
    archived_at: null,
    ...overrides,
  };
}

describe('public payment details — which account the payer is sent to', () => {
  it('refuses with 409 when the organization has no account', async () => {
    orgState.organization = { name: 'Ferretería La Silla', bank_accounts: [] };

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(409);
    // Inside the envelope since #65 — it used to sit as a sibling of `error`,
    // the one public body with a fourth shape.
    expect(body.error.code).toBe('ORG_BANK_DETAILS_MISSING');
    expect(body.error.message).toContain('cuenta bancaria');
    // Nothing resembling an account number may reach the payer.
    expect(JSON.stringify(body)).not.toMatch(/\d{18}/);
  });

  it("serves the organization's default account when the quote names none", async () => {
    // Every quote written before #164 is in exactly this state.
    orgState.organization = { name: 'Ferretería La Silla', bank_accounts: [bankAccount()] };

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.milestone.clabe).toBe('012180001234567899');
    expect(body.milestone.bank_name).toBe('BBVA México');
  });

  it('serves the account the quote named, not the current default (#164)', async () => {
    // The tenant chose where this client pays. Changing the default afterwards
    // must not redirect a link already in the client's hands.
    orgState.organization = {
      name: 'Ferretería La Silla',
      bank_accounts: [bankAccount({ id: 'default-acct', clabe: '012180001234567899' })],
    };
    quoteState.account = bankAccount({
      id: 'chosen-acct',
      label: 'Santander obra',
      bank_name: 'Santander',
      clabe: '646180157012345676',
      is_default: false,
    });

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.milestone.clabe).toBe('646180157012345676');
    expect(body.milestone.bank_name).toBe('Santander');
  });

  it('refuses when the account the quote named has been archived (#164)', async () => {
    // Substituting the live default here would send a real transfer to an
    // account nobody chose for this client.
    orgState.organization = {
      name: 'Ferretería La Silla',
      bank_accounts: [bankAccount({ id: 'default-acct' })],
    };
    quoteState.account = bankAccount({
      id: 'closed-acct',
      clabe: '646180157012345676',
      is_default: false,
      archived_at: '2026-08-10T00:00:00Z',
    });

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('SETTLEMENT_ACCOUNT_UNAVAILABLE');
    // Neither the archived account nor the default may leak to the payer.
    expect(JSON.stringify(body)).not.toMatch(/\d{18}/);
  });

  it('refuses when the only account is archived', async () => {
    orgState.organization = {
      name: 'Ferretería La Silla',
      bank_accounts: [bankAccount({ archived_at: '2026-08-10T00:00:00Z', is_default: false })],
    };

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(JSON.stringify(body)).not.toMatch(/\d{18}/);
  });

  it('never serves a fallback account when the organization row is missing', async () => {
    orgState.organization = null;

    const res = await getPaymentDetails();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(JSON.stringify(body)).not.toMatch(/\d{18}/);
  });
});
