import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BankAccountForm } from '@/components/settings/BankAccountForm';

/**
 * The add/edit form for a settlement account (#164).
 *
 * Asks the tenant's question rather than the function's (#146): *can I fill
 * this in and finish?* The defects that rule was written for all lived in the
 * seam between a form and its API — a message with nowhere to land, a submit
 * that looked like nothing happened — while every function involved passed its
 * own tests.
 */

/** A CLABE whose check digit is real; the form refuses invented ones. */
const VALID_CLABE = '012180001234567899';

function fill() {
  fireEvent.change(screen.getByLabelText(/Nombre de la cuenta/i), {
    target: { value: 'BBVA obra' },
  });
  fireEvent.change(screen.getByLabelText(/^Banco$/i), { target: { value: 'BBVA México' } });
  fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: VALID_CLABE } });
}

describe('completing the form', () => {
  it('submits the minimum a tenant must supply', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <BankAccountForm account={null} onSubmit={onSubmit} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fill();
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Normalized on the way out: the CLABE is digits only, the strings trimmed.
    expect(onSubmit).toHaveBeenCalledWith({
      label: 'BBVA obra',
      bankName: 'BBVA México',
      clabe: VALID_CLABE,
      accountHolder: '',
    });
  });

  it('does not require the optional account holder', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <BankAccountForm account={null} onSubmit={onSubmit} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fill();
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });
});

describe('what the tenant is told when it will not submit', () => {
  it('names every problem in one pass, not one per submit', async () => {
    const onSubmit = vi.fn();
    render(
      <BankAccountForm account={null} onSubmit={onSubmit} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() =>
      expect(screen.getByText(/Ponle un nombre a esta cuenta/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/El nombre del banco es obligatorio/i)).toBeInTheDocument();
    expect(screen.getByText(/La CLABE debe tener exactamente 18 dígitos/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /**
   * A transposed digit passes a length check and fails the checksum — and it is
   * the digit money would have been wired to.
   */
  it('refuses a CLABE whose check digit does not hold', async () => {
    const onSubmit = vi.fn();
    render(
      <BankAccountForm account={null} onSubmit={onSubmit} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fireEvent.change(screen.getByLabelText(/Nombre de la cuenta/i), { target: { value: 'BBVA obra' } });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), { target: { value: 'BBVA México' } });
    // Same 18 digits, last one wrong.
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '012180001234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() => expect(screen.getByText(/La CLABE no parece válida/i)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /** Each message belongs to its input, not to a banner above the fold. */
  it('pins each message inside the block holding the input it names', async () => {
    render(
      <BankAccountForm account={null} onSubmit={vi.fn()} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() => expect(screen.getByText(/Ponle un nombre a esta cuenta/i)).toBeInTheDocument());

    const labelInput = screen.getByLabelText(/Nombre de la cuenta/i);
    expect(labelInput.parentElement!.textContent).toContain('Ponle un nombre a esta cuenta');
    // And is announced, not merely coloured.
    expect(labelInput).toHaveAttribute('aria-invalid', 'true');

    const bankInput = screen.getByLabelText(/^Banco$/i);
    expect(bankInput.parentElement!.textContent).toContain('El nombre del banco es obligatorio');
  });

  it('moves focus to the first field with a problem, so the message is on screen', async () => {
    render(
      <BankAccountForm account={null} onSubmit={vi.fn()} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/Nombre de la cuenta/i)).toHaveFocus()
    );
  });

  /** A refusal the server keyed to a field lands on that field, not in a banner. */
  it('pins a server refusal to the input it names', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      Object.assign(new Error('Revisa los datos'), {
        fields: { clabe: 'Ya tienes una cuenta con esta CLABE' },
      })
    );
    render(
      <BankAccountForm account={null} onSubmit={onSubmit} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fill();
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() =>
      expect(screen.getByText(/Ya tienes una cuenta con esta CLABE/i)).toBeInTheDocument()
    );
    const clabeInput = screen.getByLabelText(/CLABE/i);
    expect(clabeInput.parentElement!.textContent).toContain('Ya tienes una cuenta con esta CLABE');
  });

  /** A refusal about no particular field still has to be said somewhere. */
  it('states a refusal that names no field', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('Solo el dueño de la cuenta puede agregar cuentas de cobro.'));
    render(
      <BankAccountForm account={null} onSubmit={onSubmit} onCancel={() => {}} submitLabel="Agregar cuenta" />
    );

    fill();
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() =>
      expect(screen.getByText(/Solo el dueño de la cuenta puede agregar/i)).toBeInTheDocument()
    );
    // The typed values survive a refusal: nobody retypes 18 digits.
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 99');
  });
});

describe('editing an existing account', () => {
  it('opens with the account it was given', () => {
    render(
      <BankAccountForm
        account={{
          id: 'acct-1',
          label: 'BBVA obra',
          bank_name: 'BBVA México',
          clabe: VALID_CLABE,
          account_holder: 'Ferretería La Central',
          is_default: true,
          archived_at: null,
        }}
        onSubmit={vi.fn()}
        onCancel={() => {}}
        submitLabel="Guardar cambios"
      />
    );

    expect(screen.getByLabelText(/Nombre de la cuenta/i)).toHaveValue('BBVA obra');
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 99');
  });

  /**
   * `useState(prop)` keeps its first value forever, so a form pointed at a
   * second account would show the first one's digits beside the second one's
   * label — a CLABE next to a name it does not belong to (#95).
   */
  it('re-syncs when pointed at a different account', () => {
    const first = {
      id: 'acct-1',
      label: 'BBVA obra',
      bank_name: 'BBVA México',
      clabe: VALID_CLABE,
      account_holder: null,
      is_default: true,
      archived_at: null,
    };
    const second = {
      id: 'acct-2',
      label: 'Santander nómina',
      bank_name: 'Santander',
      clabe: '014180001234567897',
      account_holder: null,
      is_default: false,
      archived_at: null,
    };

    const { rerender } = render(
      <BankAccountForm account={first} onSubmit={vi.fn()} onCancel={() => {}} submitLabel="Guardar cambios" />
    );
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 99');

    rerender(
      <BankAccountForm account={second} onSubmit={vi.fn()} onCancel={() => {}} submitLabel="Guardar cambios" />
    );
    expect(screen.getByLabelText(/Nombre de la cuenta/i)).toHaveValue('Santander nómina');
    expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0141 8000 1234 5678 97');
  });
});
