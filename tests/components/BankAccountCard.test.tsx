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

    render(<BankAccountCard canEdit />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Banco/i)).toHaveValue('BBVA México');
    });
    // Stored unformatted, displayed in 4-digit groups.
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 90');
  });

  it('renders an empty form when the org has no account yet', async () => {
    mockFetch(() => jsonResponse({ organization: { bank_name: null, bank_clabe: null } }));

    render(<BankAccountCard canEdit />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Banco/i)).toHaveValue('');
    });
  });
});

describe('the unconfigured warning', () => {
  it('warns that payment links do not work without a CLABE', async () => {
    mockFetch(() => jsonResponse({ organization: {} }));

    render(<BankAccountCard canEdit />);

    await waitFor(() => {
      expect(screen.getByText(/no pueden pagarle por transferencia/i)).toBeInTheDocument();
    });
  });

  it('does not warn once an account is configured', async () => {
    mockFetch(() => jsonResponse(CONFIGURED_ORG));

    render(<BankAccountCard canEdit />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Banco/i)).toHaveValue('BBVA México');
    });
    expect(screen.queryByText(/no pueden pagarle por transferencia/i)).not.toBeInTheDocument();
  });
});

describe('CLABE entry', () => {
  it('strips non-digits and caps at 18 digits', async () => {
    mockFetch(() => jsonResponse({ organization: {} }));
    render(<BankAccountCard canEdit />);

    const clabe = await screen.findByLabelText(/CLABE/i);
    fireEvent.change(clabe, { target: { value: 'abc0121800012345678901234' } });

    expect(clabe).toHaveValue('0121 8000 1234 5678 90');
  });

  it('shows how many of the 18 digits have been entered', async () => {
    mockFetch(() => jsonResponse({ organization: {} }));
    render(<BankAccountCard canEdit />);

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

    render(<BankAccountCard canEdit />);

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

    render(<BankAccountCard canEdit />);

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

    render(<BankAccountCard canEdit />);

    fireEvent.change(await screen.findByLabelText(/Banco/i), { target: { value: 'BBVA' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '012180001234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cuenta Bancaria/i }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo guardar la cuenta bancaria/i)).toBeInTheDocument();
    });
  });
});

/**
 * #163 — removing the account.
 *
 * The card could replace an account but never take one away, so a tenant whose
 * bank account had closed could not stop advertising it. The removal is
 * deliberate (a confirmation step) because it stops payment links working —
 * which #64's banner and server-side 409 then say plainly.
 */
describe('removing the account (#163)', () => {
  it('offers no removal when there is no account saved', async () => {
    mockFetch(() => jsonResponse({ organization: { bank_name: null, bank_clabe: null } }));

    render(<BankAccountCard canEdit />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Banco/i)).toHaveValue('');
    });
    expect(screen.queryByRole('button', { name: /Quitar cuenta/i })).not.toBeInTheDocument();
  });

  it('asks for confirmation before removing, and names the consequence', async () => {
    mockFetch(() => jsonResponse(CONFIGURED_ORG));

    render(<BankAccountCard canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: /Quitar cuenta/i }));

    // Plain language, not "el campo se borrará": what stops working.
    expect(await screen.findByText(/tus enlaces de pago dejarán de funcionar/i)).toBeInTheDocument();
  });

  it('does not PATCH anything while the confirmation is open', async () => {
    const spy = mockFetch(() => jsonResponse(CONFIGURED_ORG));

    render(<BankAccountCard canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: /Quitar cuenta/i }));

    expect(spy.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });

  it('sends an empty CLABE and clears the form once confirmed', async () => {
    const spy = mockFetch((url, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse({
          organization: { bank_name: null, bank_clabe: null, bank_account_holder: null },
        });
      }
      return jsonResponse(CONFIGURED_ORG);
    });

    render(<BankAccountCard canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: /Quitar cuenta/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, quitar cuenta/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/CLABE/i)).toHaveValue('');
    });

    const patch = spy.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(patch![1]!.body as string).bankClabe).toBe('');
    // The form reflects the server's answer, not an optimistic local wipe.
    expect(screen.getByLabelText(/Banco/i)).toHaveValue('');
  });

  it('keeps the account on screen when the server refuses the removal', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(
          { error: { code: 'SERVER_ERROR', message: 'No se pudo guardar la cuenta bancaria' } },
          false,
          500
        );
      }
      return jsonResponse(CONFIGURED_ORG);
    });

    render(<BankAccountCard canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: /Quitar cuenta/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, quitar cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo guardar la cuenta bancaria/i)).toBeInTheDocument();
    });
    // Hard rule #1: the row still holds the account, so the form must too.
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 90');
  });
});

describe('saving is not a way to remove (#163)', () => {
  it('refuses an emptied CLABE in the submit handler rather than clearing the account', async () => {
    // The clear path keys on an empty CLABE, so the save button is one missing
    // guard away from being a second, unconfirmed removal — reported with "tus
    // cobros SPEI se depositarán en esta cuenta", a success for an account that
    // no longer exists. In a browser `required` and `formatClabe`'s digit strip
    // both block it; this pins the handler's own refusal, because two incidental
    // protections are thin cover for the field money arrives at.
    // Submitted directly: `fireEvent.click` cannot reach the handler here, since
    // jsdom enforces `required` and suppresses the submit event entirely.
    const spy = mockFetch(() => jsonResponse(CONFIGURED_ORG));

    const { container } = render(<BankAccountCard canEdit />);
    await waitFor(() => {
      expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 90');
    });

    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '' } });
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText(/Para quitar la cuenta/i)).toBeInTheDocument();
    });
    expect(spy.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
    expect(screen.queryByText(/se guardó correctamente/i)).not.toBeInTheDocument();
  });
});

describe('who is offered the actions (#163)', () => {
  it('offers a member neither save nor removal, and says who can', async () => {
    // PATCH /api/organization is scoped by owner_id: a member's write matches no
    // row and 404s with "No se encontró una organización propia" — after a
    // warning that their payment links will stop working. Never send a user to
    // an action they cannot complete.
    mockFetch(() => jsonResponse(CONFIGURED_ORG));

    render(<BankAccountCard canEdit={false} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 90');
    });
    expect(screen.queryByRole('button', { name: /Quitar cuenta/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Cuenta Bancaria/i })).toBeDisabled();
    expect(screen.getByText(/Solo el dueño de la cuenta puede cambiar/i)).toBeInTheDocument();
  });
});

describe('a failed read is not "no account" (#163)', () => {
  it('does not warn that no CLABE is configured when the read failed', async () => {
    // The tri-state rule at the card: unknown is not missing. This warning
    // beside an empty form reads as "your account is gone" to a tenant whose
    // row holds one perfectly well.
    mockFetch(() => jsonResponse({ error: { code: 'SERVER_ERROR' } }, false, 500));

    render(<BankAccountCard canEdit />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Guardar Cuenta Bancaria/i })).toBeEnabled();
    });
    expect(screen.queryByText(/Sin una CLABE configurada/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Quitar cuenta/i })).not.toBeInTheDocument();
  });
});

describe('the removal failure is where the user is looking (#163)', () => {
  it('renders the error inside the confirmation panel, not above the form', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(
          { error: { code: 'NOT_FOUND', message: 'No se encontró una organización propia' } },
          false,
          404
        );
      }
      return jsonResponse(CONFIGURED_ORG);
    });

    const { container } = render(<BankAccountCard canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: /Quitar cuenta/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, quitar cuenta/i }));

    const message = await screen.findByText(/No se encontró una organización propia/i);
    // The panel, not the form block above the three inputs — on a 375px screen
    // that is a card-scroll away from the button just tapped (#146).
    expect(container.querySelector('form')?.contains(message)).toBe(false);
  });

  it('does not report a removal when the row comes back still holding a CLABE', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') return jsonResponse(CONFIGURED_ORG);
      return jsonResponse(CONFIGURED_ORG);
    });

    render(<BankAccountCard canEdit />);

    fireEvent.click(await screen.findByRole('button', { name: /Quitar cuenta/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, quitar cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo quitar la cuenta bancaria/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Cuenta bancaria quitada/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 90');
  });
});
