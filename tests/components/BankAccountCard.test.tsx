import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BankAccountCard } from '@/components/settings/BankAccountCard';

/**
 * The per-organization SPEI account.
 *
 * P0-4 moved bank details off a single hardcoded CLABE and onto the
 * organization, but left no way for a tenant to enter theirs — so every
 * existing tenant's payment links 409'd with no path to fix it.
 */

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => impl(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const CONFIGURED_ORG = {
  organization: {
    bank_name: 'BBVA México',
    bank_clabe: '012180001234567890',
    bank_account_holder: 'Distribuidora del Norte',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loading existing bank details', () => {
  it('populates the form from GET /api/organization', async () => {
    mockFetch(() => jsonResponse(CONFIGURED_ORG));

    render(<BankAccountCard />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Banco/i)).toHaveValue('BBVA México');
    });
    // Stored unformatted, displayed in 4-digit groups.
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 90');
  });

  it('renders an empty form when the org has no account yet', async () => {
    mockFetch(() => jsonResponse({ organization: { bank_name: null, bank_clabe: null } }));

    render(<BankAccountCard />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Banco/i)).toHaveValue('');
    });
  });
});

describe('the unconfigured warning', () => {
  it('warns that payment links do not work without a CLABE', async () => {
    mockFetch(() => jsonResponse({ organization: {} }));

    render(<BankAccountCard />);

    await waitFor(() => {
      expect(screen.getByText(/no pueden pagarle por transferencia/i)).toBeInTheDocument();
    });
  });

  it('does not warn once an account is configured', async () => {
    mockFetch(() => jsonResponse(CONFIGURED_ORG));

    render(<BankAccountCard />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Banco/i)).toHaveValue('BBVA México');
    });
    expect(screen.queryByText(/no pueden pagarle por transferencia/i)).not.toBeInTheDocument();
  });
});

describe('CLABE entry', () => {
  it('strips non-digits and caps at 18 digits', async () => {
    mockFetch(() => jsonResponse({ organization: {} }));
    render(<BankAccountCard />);

    const clabe = await screen.findByLabelText(/CLABE/i);
    fireEvent.change(clabe, { target: { value: 'abc0121800012345678901234' } });

    expect(clabe).toHaveValue('0121 8000 1234 5678 90');
  });

  it('shows how many of the 18 digits have been entered', async () => {
    mockFetch(() => jsonResponse({ organization: {} }));
    render(<BankAccountCard />);

    const clabe = await screen.findByLabelText(/CLABE/i);
    fireEvent.change(clabe, { target: { value: '01218000' } });

    expect(screen.getByText('8 de 18 dígitos')).toBeInTheDocument();
  });
});

describe('saving', () => {
  it('PATCHes the unformatted CLABE and the bank name', async () => {
    const spy = mockFetch((url, init) => {
      if (init?.method === 'PATCH') return jsonResponse({ organization: CONFIGURED_ORG.organization });
      return jsonResponse({ organization: {} });
    });

    render(<BankAccountCard />);

    fireEvent.change(await screen.findByLabelText(/Banco/i), { target: { value: 'BBVA México' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '012180001234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cuenta Bancaria/i }));

    await waitFor(() => {
      expect(screen.getByText(/se guardó correctamente/i)).toBeInTheDocument();
    });

    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch).toBeDefined();
    const body = JSON.parse(patch![1]!.body as string);
    expect(body.bankName).toBe('BBVA México');
    // The API strips whitespace too, but sending the display format would rely
    // on that; the digits are what identifies the account.
    expect(body.bankClabe.replace(/\s/g, '')).toBe('012180001234567890');
  });

  it('surfaces the API error instead of reporting a save that did not happen', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(
          { error: { code: 'INVALID_CLABE', message: 'La CLABE debe tener exactamente 18 dígitos' } },
          false,
          400
        );
      }
      return jsonResponse({ organization: {} });
    });

    render(<BankAccountCard />);

    fireEvent.change(await screen.findByLabelText(/Banco/i), { target: { value: 'BBVA' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '0121' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cuenta Bancaria/i }));

    await waitFor(() => {
      expect(screen.getByText(/exactamente 18 dígitos/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/se guardó correctamente/i)).not.toBeInTheDocument();
  });

  it('reports a network failure rather than claiming success', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') throw new Error('socket hang up');
      return jsonResponse({ organization: {} });
    });

    render(<BankAccountCard />);

    fireEvent.change(await screen.findByLabelText(/Banco/i), { target: { value: 'BBVA' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '012180001234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cuenta Bancaria/i }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo guardar la cuenta bancaria/i)).toBeInTheDocument();
    });
  });
});
