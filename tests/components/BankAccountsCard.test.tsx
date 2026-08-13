import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BankAccountsCard } from '@/components/settings/BankAccountsCard';

/**
 * The organization's settlement accounts, in Ajustes (#164).
 *
 * Replaces `BankAccountCard.test.tsx`, which covered the single-account form.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is stubbed throughout: unset (the Vitest default)
 * `isClientDemoMode()` is on, the hook serves demo fixtures and never fetches,
 * and every assertion here would pass without touching the code it names.
 */

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => impl(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const BBVA = {
  id: 'acct-1',
  label: 'BBVA obra',
  bank_name: 'BBVA México',
  clabe: '012180001234567899',
  account_holder: 'Ferretería La Central',
  is_default: true,
  archived_at: null,
};

const SANTANDER = {
  id: 'acct-2',
  label: 'Santander nómina',
  bank_name: 'Santander',
  clabe: '014180001234567897',
  account_holder: null,
  is_default: false,
  archived_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('listing accounts', () => {
  it('lists every live account and marks the default', async () => {
    mockFetch(() => jsonResponse({ accounts: [BBVA, SANTANDER], role: 'owner' }));

    render(<BankAccountsCard canEdit />);

    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());
    expect(screen.getByText('Santander nómina')).toBeInTheDocument();
    // Displayed in 4-digit groups, stored unformatted.
    expect(screen.getByText('0121 8000 1234 5678 99')).toBeInTheDocument();

    const defaultRow = screen.getByText('BBVA obra').closest('li')!;
    expect(within(defaultRow).getByText('Principal')).toBeInTheDocument();
    const otherRow = screen.getByText('Santander nómina').closest('li')!;
    expect(within(otherRow).queryByText('Principal')).not.toBeInTheDocument();
  });

  it('keeps archived accounts out of the list', async () => {
    mockFetch(() =>
      jsonResponse({
        accounts: [BBVA, { ...SANTANDER, archived_at: '2026-08-01T00:00:00Z' }],
        role: 'owner',
      })
    );

    render(<BankAccountsCard canEdit />);

    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());
    expect(screen.queryByText('Santander nómina')).not.toBeInTheDocument();
  });

  /**
   * The tri-state (#64/#96): a read that failed is unknown, not "no accounts".
   * Claiming absence here tells a tenant with two banks on file that they have
   * none, and invites them to re-enter a CLABE they already have.
   */
  it('does not report "no accounts" when the read failed', async () => {
    mockFetch(() =>
      jsonResponse({ error: { code: 'SERVER_ERROR', message: 'No se pudieron cargar tus cuentas de cobro' } }, false, 500)
    );

    render(<BankAccountsCard canEdit />);

    await waitFor(() =>
      expect(screen.getByText(/No se pudieron cargar tus cuentas de cobro/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Sin una cuenta registrada/i)).not.toBeInTheDocument();
  });

  it('says the tenant has no account only when the server said so', async () => {
    mockFetch(() => jsonResponse({ accounts: [], role: 'owner' }));

    render(<BankAccountsCard canEdit />);

    await waitFor(() =>
      expect(screen.getByText(/Sin una cuenta registrada/i)).toBeInTheDocument()
    );
  });
});

describe('who is offered the actions', () => {
  /**
   * `canEdit` must stay **required, with no default**.
   *
   * The behavioural test below passes `canEdit={false}` explicitly, so it stays
   * green if the prop acquires `= true` — it cannot see the defect it looks
   * like it covers, and TypeScript cannot either: an optional prop with a
   * default is legal at every call site that omits it. That combination is how
   * the single-account card once offered "Quitar cuenta" to a manager who then
   * got a 404, and it is why #163 made the prop required in the first place.
   * Only reading the source holds it.
   */
  it('keeps canEdit required, so a render site cannot get the actions by omission', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/settings/BankAccountsCard.tsx'),
      'utf8'
    );

    expect(source).toMatch(/canEdit:\s*boolean;/);
    expect(source).not.toMatch(/canEdit\?:/);
    expect(source).not.toMatch(/canEdit\s*=\s*(true|false)/);
  });

  /**
   * Every write here gates on `billing_management`, so a member's click returns
   * 403. Offering it would send them to fix something they cannot — the
   * CLAUDE.md corollary that decided #64's design.
   */
  it('shows a member the accounts but offers no actions', async () => {
    mockFetch(() => jsonResponse({ accounts: [BBVA, SANTANDER], role: 'member' }));

    render(<BankAccountsCard canEdit={false} />);

    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Agregar cuenta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archivar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hacer principal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo el dueño de la cuenta puede/i)).toBeInTheDocument();
  });
});

describe('adding an account', () => {
  it('reports every invalid field at once, each pinned under its own input', async () => {
    const spy = mockFetch(() => jsonResponse({ accounts: [BBVA], role: 'owner' }));

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));
    // Everything blank, and a CLABE too short: one submit must surface all of
    // it, not one problem per round trip (#146).
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() =>
      expect(screen.getByText(/Ponle un nombre a esta cuenta/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/El nombre del banco es obligatorio/i)).toBeInTheDocument();
    expect(screen.getByText(/La CLABE debe tener exactamente 18 dígitos/i)).toBeInTheDocument();

    // Each message is inside the same field block as the input it names, not
    // collected into a banner the tenant has to scroll up to find.
    const clabeInput = screen.getByLabelText(/CLABE/i);
    expect(
      clabeInput.parentElement!.textContent
    ).toContain('La CLABE debe tener exactamente 18 dígitos');

    // Nothing was sent: the form refused before the round trip.
    expect(spy.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')).toHaveLength(0);
  });

  it('applies the account the server returned, not the one that was typed', async () => {
    let created = false;
    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        created = true;
        // The server normalizes: the label is trimmed, the CLABE stripped of
        // spaces. What the card shows afterwards must be this row.
        return jsonResponse({ account: { ...SANTANDER, label: 'Santander nómina' } });
      }
      return jsonResponse({ accounts: created ? [BBVA, SANTANDER] : [BBVA], role: 'owner' });
    });

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));
    fireEvent.change(screen.getByLabelText(/Nombre de la cuenta/i), {
      target: { value: '  Santander nómina  ' },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), { target: { value: 'Santander' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), {
      target: { value: '0141 8000 1234 5678 97' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());
    expect(screen.getByText('0141 8000 1234 5678 97')).toBeInTheDocument();
  });

  it('keeps the form open and says why when the server refuses', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        return jsonResponse(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Solo el dueño de la cuenta puede agregar cuentas de cobro.',
            },
          },
          false,
          403
        );
      }
      return jsonResponse({ accounts: [BBVA], role: 'owner' });
    });

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));
    fireEvent.change(screen.getByLabelText(/Nombre de la cuenta/i), {
      target: { value: 'Santander nómina' },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), { target: { value: 'Santander' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '014180001234567897' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() =>
      expect(screen.getByText(/Solo el dueño de la cuenta puede agregar/i)).toBeInTheDocument()
    );
    // The refused account is not on the list, and the typed values survive so
    // the tenant does not retype 18 digits.
    expect(screen.queryByText('Santander nómina')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0141 8000 1234 5678 97');
  });

  /** A 200 whose body is not an account is not a saved account (hard rule #1). */
  it('refuses to report a save when the response carries no account', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'POST') return jsonResponse({ ok: true });
      return jsonResponse({ accounts: [BBVA], role: 'owner' });
    });

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));
    fireEvent.change(screen.getByLabelText(/Nombre de la cuenta/i), {
      target: { value: 'Santander nómina' },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), { target: { value: 'Santander' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '014180001234567897' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() => expect(screen.getByText(/No se pudo confirmar el cambio/i)).toBeInTheDocument());
  });
});

describe('archiving', () => {
  it('asks first, naming what stops working for already-sent quotes', async () => {
    mockFetch(() => jsonResponse({ accounts: [BBVA, SANTANDER], role: 'owner' }));

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Archivar/i }));

    expect(
      screen.getByText(/cotizaciones que ya enviaste con esta cuenta dejarán de aceptar pagos/i)
    ).toBeInTheDocument();
  });

  /**
   * The route refuses to archive the default while other live accounts exist,
   * because unassigned quotes would resolve to nothing. The card must show that
   * refusal rather than swallow it.
   */
  it('surfaces the refusal when archiving the default with others live', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'DELETE') {
        return jsonResponse(
          {
            error: {
              code: 'DEFAULT_ACCOUNT',
              message: 'Esta es tu cuenta principal. Marca otra como principal antes de archivarla.',
            },
          },
          false,
          409
        );
      }
      return jsonResponse({ accounts: [BBVA, SANTANDER], role: 'owner' });
    });

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());

    const row = screen.getByText('BBVA obra').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Archivar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, archivar/i }));

    await waitFor(() =>
      expect(screen.getByText(/Marca otra como principal antes de archivarla/i)).toBeInTheDocument()
    );
    // Still listed: the row is exactly as the database still holds it.
    expect(screen.getByText('BBVA obra')).toBeInTheDocument();
  });

  /** A 200 that comes back un-archived is not an archive. */
  it('refuses to report an archive the server did not perform', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'DELETE') return jsonResponse({ account: SANTANDER });
      return jsonResponse({ accounts: [BBVA, SANTANDER], role: 'owner' });
    });

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Archivar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, archivar/i }));

    await waitFor(() =>
      expect(screen.getByText(/No se pudo confirmar que la cuenta quedara archivada/i)).toBeInTheDocument()
    );
  });
});

describe('editing', () => {
  it('saves the row the server returned', async () => {
    let edited = false;
    mockFetch((url, init) => {
      if (init?.method === 'PATCH') {
        edited = true;
        return jsonResponse({ account: { ...SANTANDER, label: 'Santander obra' } });
      }
      return jsonResponse({
        accounts: [BBVA, edited ? { ...SANTANDER, label: 'Santander obra' } : SANTANDER],
        role: 'owner',
      });
    });

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Editar/i }));

    fireEvent.change(screen.getByLabelText(/Nombre de la cuenta/i), {
      target: { value: 'Santander obra' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => expect(screen.getByText('Santander obra')).toBeInTheDocument());
  });
});

describe('the archive confirmation names its blast radius (#196)', () => {
  it('counts and names the live quotes settling at the account', async () => {
    mockFetch(() =>
      jsonResponse({
        accounts: [
          BBVA,
          {
            ...SANTANDER,
            live_quotes: {
              count: 3,
              client_names: ['Constructora del Valle', 'Ferretería Central'],
            },
          },
        ],
        role: 'owner',
      })
    );

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Archivar/i }));

    expect(
      screen.getByText(/3 cotizaciones activas cobran en esta cuenta/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Constructora del Valle/)).toBeInTheDocument();
  });

  it('says so when no live quote settles here — a known zero', async () => {
    mockFetch(() =>
      jsonResponse({
        accounts: [BBVA, { ...SANTANDER, live_quotes: { count: 0, client_names: [] } }],
        role: 'owner',
      })
    );

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Archivar/i }));

    expect(screen.getByText(/Ninguna cotización activa cobra en esta cuenta/i)).toBeInTheDocument();
  });

  it('falls back to the generic wording when the exposure is unknown — never an invented zero', async () => {
    mockFetch(() =>
      jsonResponse({
        accounts: [BBVA, { ...SANTANDER, live_quotes: null }],
        role: 'owner',
      })
    );

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Archivar/i }));

    expect(
      screen.getByText(/cotizaciones que ya enviaste con esta cuenta dejarán de aceptar pagos/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ninguna cotización/i)).not.toBeInTheDocument();
  });
});

describe('editing warns before rewriting sent payment instructions (#197)', () => {
  it('tells the tenant how many sent quotes will show the new CLABE', async () => {
    mockFetch(() =>
      jsonResponse({
        accounts: [
          BBVA,
          { ...SANTANDER, live_quotes: { count: 2, client_names: ['Constructora del Valle'] } },
        ],
        role: 'owner',
      })
    );

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Editar/i }));

    expect(
      screen.getByText(/2 cotizaciones ya enviadas cobran en esta cuenta y mostrarán la CLABE nueva/i)
    ).toBeInTheDocument();
  });

  it('stays quiet when nothing sent settles at the account', async () => {
    mockFetch(() =>
      jsonResponse({
        accounts: [BBVA, { ...SANTANDER, live_quotes: { count: 0, client_names: [] } }],
        role: 'owner',
      })
    );

    render(<BankAccountsCard canEdit />);
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());

    const row = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /Editar/i }));

    expect(screen.queryByText(/mostrarán la CLABE nueva/i)).not.toBeInTheDocument();
  });
});
