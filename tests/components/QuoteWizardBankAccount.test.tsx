import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { QuoteWizardModal } from '@/components/quotes/QuoteWizardModal';
import { QUOTE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import type { Client } from '@/types';

/**
 * Naming the account a quote's client pays into (#164).
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is stubbed: unset (the Vitest default)
 * `isClientDemoMode()` is on, `useBankAccounts` serves its demo fixture and
 * never fetches, and the picker would render from one account — so the
 * multi-account assertions below would be exercising nothing.
 */

const CLIENTS: Client[] = [
  { id: 'client-1', name: 'Constructora del Valle', rfc: 'CVA850101AAA' } as unknown as Client,
];

const BBVA = {
  id: 'acct-1',
  label: 'BBVA obra',
  bank_name: 'BBVA México',
  clabe: '012180001234567899',
  account_holder: null,
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

function mockAccounts(accounts: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ accounts, role: 'owner' }) }))
  );
}

/** Fills steps 1 and 2 and lands on the confirm step, where the picker lives. */
async function reachConfirmStep() {
  const next = () => screen.getByRole('button', { name: /Siguiente/i });

  fireEvent.change(screen.getByPlaceholderText(/Suministro de Cemento/i), {
    target: { value: 'Suministro para obra' },
  });
  fireEvent.click(next());

  fireEvent.change(screen.getByPlaceholderText(/Descripción del producto/i), {
    target: { value: 'Cemento gris 50kg' },
  });
  fireEvent.change(document.getElementById('line-item-0-quantity') as HTMLInputElement, {
    target: { value: '1' },
  });
  fireEvent.change(document.getElementById('line-item-0-unit-price') as HTMLInputElement, {
    target: { value: '1000' },
  });
  fireEvent.click(next());

  await waitFor(() => expect(screen.getByText(/Resumen y Confirmación/i)).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the write path carries the choice', () => {
  /**
   * `pickFields(body, QUOTE_WRITABLE_FIELDS)` drops anything not on the list,
   * silently — the quote would insert with a NULL account while the wizard
   * reported it saved, which is #96's shape on the column that decides where
   * money lands. Asserted against the allowlist itself, because a `fetch` mock
   * proves only what was sent, not what the route would keep.
   */
  it('allows bank_account_id through to the insert', () => {
    expect(QUOTE_WRITABLE_FIELDS).toContain('bank_account_id');
  });

  /** organization_id and created_by stay off it: those come from the session. */
  it('still refuses to let a caller plant a quote in another tenant', () => {
    expect(QUOTE_WRITABLE_FIELDS).not.toContain('organization_id');
    expect(QUOTE_WRITABLE_FIELDS).not.toContain('created_by');
  });

  /**
   * The demo path spreads the payload and used to re-set `bank_account_id: null`
   * underneath it, discarding the visitor's pick. Read from the source: the
   * override sat four lines below the spread and no assertion on the returned
   * quote could see it, because the demo fixture had one account anyway.
   */
  it('does not override the chosen account in the demo-mode quote', () => {
    const source = readFileSync(join(process.cwd(), 'lib/hooks/useQuotes.ts'), 'utf8');
    const demoBlock = source.slice(source.indexOf('if (isClientDemoMode())'));
    expect(demoBlock).not.toMatch(/^\s*bank_account_id:\s*null,/m);
  });
});

describe('the picker', () => {
  it('stays hidden when there is nothing to choose between', async () => {
    mockAccounts([BBVA]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuoteWizardModal isOpen onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />);
    await reachConfirmStep();

    expect(screen.queryByLabelText(/En qué cuenta te paga/i)).not.toBeInTheDocument();
  });

  it('offers the choice once the tenant keeps more than one account', async () => {
    mockAccounts([BBVA, SANTANDER]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuoteWizardModal isOpen onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />);
    await reachConfirmStep();

    await waitFor(() =>
      expect(screen.getByLabelText(/En qué cuenta te paga/i)).toBeInTheDocument()
    );
    // The default is named, so the tenant knows where "principal" sends money.
    expect(screen.getByRole('option', { name: /Mi cuenta principal \(BBVA obra\)/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Santander nómina/i })).toBeInTheDocument();
  });

  /**
   * Untouched means NULL, not the default's id: a quote that names an account
   * is frozen to it, so writing the default in here would silently promise this
   * client a specific account the tenant never chose — and stop following the
   * default if it later changes.
   */
  it('sends null when the tenant leaves it on "principal"', async () => {
    mockAccounts([BBVA, SANTANDER]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuoteWizardModal isOpen onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />);
    await reachConfirmStep();
    await waitFor(() =>
      expect(screen.getByLabelText(/En qué cuenta te paga/i)).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /Generar y Compartir/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].bank_account_id).toBeNull();
  });

  it('sends the account the tenant picked', async () => {
    mockAccounts([BBVA, SANTANDER]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuoteWizardModal isOpen onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />);
    await reachConfirmStep();
    await waitFor(() =>
      expect(screen.getByLabelText(/En qué cuenta te paga/i)).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText(/En qué cuenta te paga/i), {
      target: { value: 'acct-2' },
    });
    // The CLABE is shown so the tenant can confirm the account by its digits,
    // not only by a label they wrote themselves.
    expect(screen.getByText('0141 8000 1234 5678 97')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Generar y Compartir/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].bank_account_id).toBe('acct-2');
  });

  /**
   * The modal is mounted permanently by the quotes page and only toggled with
   * `isOpen`, so component state survives a close. Without a reset, a quote
   * pinned to "Santander nómina" leaves the picker there and the **next**
   * client — a different business entirely — is silently pinned to the same
   * account. The money still reaches the tenant, but into a branch or partner
   * account nobody chose for that client.
   */
  it('does not carry one quote’s account over to the next', async () => {
    mockAccounts([BBVA, SANTANDER]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <QuoteWizardModal isOpen onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />
    );
    await reachConfirmStep();
    await waitFor(() =>
      expect(screen.getByLabelText(/En qué cuenta te paga/i)).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/En qué cuenta te paga/i), {
      target: { value: 'acct-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Generar y Compartir/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].bank_account_id).toBe('acct-2');

    // Closed and reopened for the next client. Since #256 a reopen starts the
    // whole wizard fresh on step 1 (not just this field), so the next quote
    // walks the steps again — and its picker must still start unpinned.
    rerender(<QuoteWizardModal isOpen={false} onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />);
    rerender(<QuoteWizardModal isOpen onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />);

    await reachConfirmStep();
    await waitFor(() =>
      expect(screen.getByLabelText(/En qué cuenta te paga/i)).toHaveValue('')
    );
  });

  /** A failed account read must not block quoting: the column is nullable. */
  it('still lets the tenant create a quote when the accounts could not be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'nope' } }) }))
    );
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QuoteWizardModal isOpen onClose={() => {}} clients={CLIENTS} onSubmit={onSubmit} />);
    await reachConfirmStep();

    expect(screen.queryByLabelText(/En qué cuenta te paga/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Generar y Compartir/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].bank_account_id).toBeNull();
  });
});
