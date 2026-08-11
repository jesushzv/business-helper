import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OnboardingPage from '@/app/onboarding/page';

/**
 * #49 — onboarding must not report success for an organization that was never
 * created. The old handler ignored the response and pushed to /dashboard in a
 * finally block, so a 401/500/validation failure delivered the user to a
 * dashboard where every route answers 403 NO_ORGANIZATION, with no way back.
 *
 * #14 — onboarding also collects the SPEI settlement account. Without a CLABE
 * the payment page answers 409 and the cash-flow loop dead-ends at its last
 * step, so the account is collected up front rather than left in Ajustes.
 */

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

const VALID_CLABE = '0121 8000 1234 5678 99';
const ORG_CREATED = { organization: { id: 'org-1', name: 'Ferretería La Silla' } };
const CREATED_ACCOUNT = {
  id: 'acct-1',
  label: 'BBVA México',
  bank_name: 'BBVA México',
  clabe: '012180001234567899',
  account_holder: null,
  is_default: true,
  archived_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Steps 1 → 2, stopping at the organization-creation submit. */
async function submitOrganization() {
  render(<OnboardingPage />);

  fireEvent.change(screen.getByPlaceholderText(/Distribuidora del Norte/i), {
    target: { value: 'Ferretería La Silla' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Continuar a Datos Fiscales/i }));
  fireEvent.click(screen.getByRole('button', { name: /Continuar a Cuenta de Cobro/i }));
}

/** Steps 1 → 3, leaving the bank form filled and ready to submit. */
async function reachBankStep(clabe: string = VALID_CLABE) {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, ORG_CREATED));
  await submitOrganization();

  await waitFor(() =>
    expect(screen.getByLabelText(/CLABE Interbancaria/i)).toBeInTheDocument()
  );

  fireEvent.change(screen.getByLabelText(/^Banco/i), { target: { value: 'BBVA México' } });
  fireEvent.change(screen.getByLabelText(/CLABE Interbancaria/i), { target: { value: clabe } });
}

describe('OnboardingPage — organization creation (#49)', () => {
  it('advances to the bank step when the organization was actually created', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ORG_CREATED));

    await submitOrganization();

    await waitFor(() =>
      expect(screen.getByLabelText(/CLABE Interbancaria/i)).toBeInTheDocument()
    );
    // Onboarding is not finished yet — nothing should have navigated.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('stays on the form and shows the API error when creation fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'No se pudo crear la organización' } })
    );

    await submitOrganization();

    await waitFor(() =>
      expect(screen.getByText('No se pudo crear la organización')).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/CLABE Interbancaria/i)).not.toBeInTheDocument();
  });

  it('stays on the form when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await submitOrganization();

    await waitFor(() =>
      expect(screen.getByText(/No se pudo conectar con el servidor/i)).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('continues to the dashboard on the demo deployment (503 BACKEND_NOT_CONFIGURED)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, {
        error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Esta operación requiere una base de datos configurada' },
      })
    );

    await submitOrganization();

    // No backend to store a bank account in either, so the bank step is skipped.
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });
});

describe('OnboardingPage — SPEI settlement account (#14)', () => {
  /**
   * Writes through the accounts API rather than the legacy
   * `organizations.bank_*` PATCH (#164). Onboarding creates the tenant's first
   * account, which the route flags as their default, so quotes resolve to
   * something from the moment they leave this form.
   */
  it('creates the first account through the accounts API and then enters the app', async () => {
    await reachBankStep();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { account: CREATED_ACCOUNT }));
    fireEvent.click(screen.getByRole('button', { name: /Comenzar en Business Helper/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));

    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toBe('/api/organization/bank-accounts');
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(String(init?.body));
    expect(sent.clabe).toBe('012180001234567899');
    expect(sent.bankName).toBe('BBVA México');
    // Nothing asks a new tenant to name their only account; the bank's name is
    // the honest label, and Ajustes renames it when a second one arrives.
    expect(sent.label).toBe('BBVA México');
  });

  it('cannot be submitted until the CLABE is complete', async () => {
    await reachBankStep('0121 8000');

    expect(screen.getByRole('button', { name: /Comenzar en Business Helper/i })).toBeDisabled();
    expect(screen.getByText('8 de 18 dígitos')).toBeInTheDocument();
  });

  it('does not enter the app when saving the account fails', async () => {
    await reachBankStep();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: 'INVALID_CLABE', message: 'La CLABE debe tener exactamente 18 dígitos' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /Comenzar en Business Helper/i }));

    await waitFor(() =>
      expect(screen.getByText('La CLABE debe tener exactamente 18 dígitos')).toBeInTheDocument()
    );
    // Reporting a saved account that does not exist is the defect class this
    // whole cluster exists to remove.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not enter the app when the network fails on the bank write', async () => {
    await reachBankStep();

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: /Comenzar en Business Helper/i }));

    await waitFor(() =>
      expect(screen.getByText(/No se pudo conectar con el servidor/i)).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * The checksum used to be advisory here, because the legacy PATCH accepted
   * any 18 digits. Since this step writes through the accounts route (#164),
   * `validateBankAccount` refuses a failed checksum on both sides — so the
   * warning while typing is now a heads-up for a rule that is actually
   * enforced, and a transposed digit cannot become the account money is wired
   * to.
   */
  it('warns while typing a checksum-invalid CLABE, and refuses to save it', async () => {
    // Same account with the last digit off by one — 18 digits, wrong checksum.
    await reachBankStep('0121 8000 1234 5678 90');

    // "Revisa", tú form, from #194's copy pass.
    expect(screen.getByText(/Revisa la CLABE/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Comenzar en Business Helper/i }));

    await waitFor(() =>
      expect(screen.getByText(/La CLABE no parece válida/i)).toBeInTheDocument()
    );
    // Nothing was sent, and nobody was told they are ready to be paid.
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

/**
 * #64 — an organization that already exists has nothing left to do here but
 * the settlement account.
 *
 * Two populations land on this page with a live organization row and no CLABE:
 * anyone who closed the tab between the step-2 POST that creates the row and
 * the step-3 PATCH that saves the account, and anyone whose organization was
 * created before this step existed. Both were previously stranded — nothing
 * routed them back, and rerunning the form from step 1 would have created a
 * second organization.
 */
describe('OnboardingPage — resuming an existing organization (#64)', () => {
  const EXISTING_ORG = {
    organization: {
      id: 'org-1',
      name: 'Ferretería La Silla',
      rfc: 'FLS850101HD9',
      regimen_fiscal: '626',
      codigo_postal: '64000',
      industry: 'retail',
      bank_name: null,
      bank_clabe: null,
      bank_account_holder: null,
    },
    role: 'owner',
  };

  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens straight at the bank step when the organization already exists', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, EXISTING_ORG));

    render(<OnboardingPage />);

    await waitFor(() =>
      expect(screen.getByLabelText(/CLABE Interbancaria/i)).toBeInTheDocument()
    );
    // Step 2 must not be reachable again: its POST would create a second
    // organization for the same owner.
    expect(screen.queryByRole('button', { name: /Continuar a Datos Fiscales/i })).toBeNull();
  });

  /**
   * Resuming edits the account it prefilled from; it does not add a second one.
   *
   * Onboarding always POSTed, and the route flags only a *first* account as the
   * default. So an owner whose bank changed would reopen this form, see their
   * old CLABE, type the new one, get a success and a redirect — and end up with
   * a second, non-default account while every new quote kept settling at the
   * old one. They believe they changed where they get paid; they have not.
   */
  it('edits the existing default rather than adding a second account', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, EXISTING_ORG));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accounts: [CREATED_ACCOUNT], role: 'owner' })
    );

    render(<OnboardingPage />);
    await waitFor(() =>
      expect(screen.getByLabelText(/CLABE Interbancaria/i)).toHaveValue('0121 8000 1234 5678 99')
    );

    fireEvent.change(screen.getByLabelText(/CLABE Interbancaria/i), {
      target: { value: '0141 8000 1234 5678 97' },
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { account: { ...CREATED_ACCOUNT, clabe: '014180001234567897' } })
    );
    fireEvent.click(screen.getByRole('button', { name: /Comenzar en Business Helper/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));

    const write = fetchMock.mock.calls.find(([, init]) =>
      ['POST', 'PATCH'].includes(String(init?.method))
    );
    expect(write?.[1]?.method).toBe('PATCH');
    expect(String(write?.[0])).toBe('/api/organization/bank-accounts/acct-1');
    // Never a second POST: that is the duplicate this holds shut.
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  /**
   * The banner links here, so prefilling from `organizations.bank_*` — which is
   * never cleared when an account is archived — re-offered a CLABE the owner
   * had just taken out of service, one tap from re-registering a closed bank
   * account as their default.
   */
  it('prefills nothing when the tenant has no live account, even if the legacy column holds one', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        organization: {
          id: 'org-1',
          name: 'Ferretería La Silla',
          bank_name: 'Banco Viejo',
          bank_clabe: '012180001234567899',
          bank_account_holder: 'Titular Viejo',
        },
        role: 'owner',
      })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { accounts: [], role: 'owner' }));

    render(<OnboardingPage />);

    await waitFor(() =>
      expect(screen.getByLabelText(/CLABE Interbancaria/i)).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/CLABE Interbancaria/i)).toHaveValue('');
    expect(screen.getByLabelText(/^Banco/i)).toHaveValue('');
  });

  it('saves the account against the organization that already exists', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, EXISTING_ORG));
    // The resume path also reads the account list, to prefill from what this
    // step now writes rather than from the legacy columns.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { accounts: [], role: 'owner' }));

    render(<OnboardingPage />);
    await waitFor(() =>
      expect(screen.getByLabelText(/CLABE Interbancaria/i)).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText(/^Banco/i), { target: { value: 'BBVA México' } });
    fireEvent.change(screen.getByLabelText(/CLABE Interbancaria/i), {
      target: { value: VALID_CLABE },
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { account: CREATED_ACCOUNT }));
    fireEvent.click(screen.getByRole('button', { name: /Comenzar en Business Helper/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    const writeCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(writeCall?.[0])).toBe('/api/organization/bank-accounts');
  });

  it('starts at step 1 when the caller has no organization yet', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { code: 'NO_ORGANIZATION', message: 'Sin organización' } })
    );

    render(<OnboardingPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Continuar a Datos Fiscales/i })).toBeInTheDocument()
    );
  });

  it('does not skip ahead when the organization could not be read', async () => {
    // Jumping to the bank step on a failed read would strand a genuinely new
    // user on a PATCH that has no row to update.
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    render(<OnboardingPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Continuar a Datos Fiscales/i })).toBeInTheDocument()
    );
  });
});
