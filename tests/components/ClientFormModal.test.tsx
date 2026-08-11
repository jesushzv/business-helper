import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientFormModal, FIELD_INPUT_IDS } from '@/components/clients/ClientFormModal';
import type { Client } from '@/types';
import { ClientWriteError } from '@/lib/clientWriteError';
import { FIELD_ORDER } from '@/lib/clientValidation';

/**
 * The reported experience: "no puedo pasar del registro de cliente, me pide
 * llenar más campos" and "no sé cuál campo falta".
 *
 * Two separate defects produced it. The form validated in sequence and stopped
 * at the first failure, so each submit revealed one more problem; and every
 * message — the form's own and the API's — went into a single banner at the top
 * of a modal that, at 375px, is taller than the viewport. Tapping "Guardar
 * Cliente" at the bottom therefore looked like nothing happened.
 *
 * A third made it worse: the RFC was a hard gate, so a half-remembered one cost
 * the whole client record.
 */

const nameInput = () => document.getElementById(FIELD_INPUT_IDS.name) as HTMLInputElement;
const rfcInput = () => document.getElementById(FIELD_INPUT_IDS.rfc) as HTMLInputElement;
const emailInput = () => document.getElementById(FIELD_INPUT_IDS.email) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /Guardar Cliente/i });

type SaveFn = (data: Partial<Client>) => Promise<void>;

const okSave = (): ReturnType<typeof vi.fn<SaveFn>> => vi.fn<SaveFn>(async () => {});

/** Rejects the way the hook does, with the API's per-field map attached. */
const failingSave = (fields: Record<string, string>, message = '...') =>
  vi.fn<SaveFn>(async () => {
    throw new ClientWriteError(message, fields, 'INVALID_INPUT');
  });

function renderModal(onSave: ReturnType<typeof vi.fn<SaveFn>> = okSave()) {
  const onClose = vi.fn();
  render(<ClientFormModal isOpen onClose={onClose} onSave={onSave} />);
  return { onSave, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a client can be registered from the name alone', () => {
  it('saves with every optional field left blank', async () => {
    const { onSave, onClose } = renderModal();

    fireEvent.change(nameInput(), { target: { value: 'Ferretería Don Roberto' } });
    fireEvent.click(submit());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      name: 'Ferretería Don Roberto',
      email: null,
      phone: null,
      rfc: null,
      credit_limit: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('says up front that the name is the only requirement', () => {
    renderModal();
    expect(screen.getByText(/Solo el nombre es obligatorio/i)).toBeTruthy();
  });

  it('names the missing field next to the input, not only in the banner', async () => {
    const { onSave } = renderModal();
    fireEvent.click(submit());

    await waitFor(() => {
      expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    });
    const describedBy = nameInput().getAttribute('aria-describedby');
    expect(describedBy).toBe(`${FIELD_INPUT_IDS.name}-error`);
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/nombre o razón social/i);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('the RFC never blocks the save', () => {
  it('submits a malformed RFC instead of refusing the client', async () => {
    const { onSave } = renderModal();

    fireEvent.change(nameInput(), { target: { value: 'Cliente Nuevo' } });
    fireEvent.change(rfcInput(), { target: { value: 'ABC12' } });
    fireEvent.click(submit());

    // The old form returned here with "El RFC ingresado no tiene una sintaxis
    // válida de SAT" and never called onSave.
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].rfc).toBe('ABC12');
  });

  it('warns about the format without calling it an error', async () => {
    renderModal();
    fireEvent.change(rfcInput(), { target: { value: 'ABC12' } });

    // Guidance, so a bad value is visible at entry rather than silently
    // blessed — but it says the save will go through.
    expect(screen.getByText(/Puedes guardar el cliente así/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('confirms a well-formed one', () => {
    renderModal();
    fireEvent.change(rfcInput(), { target: { value: 'CMA120315HD9' } });
    expect(screen.getByText(/RFC válido/i)).toBeTruthy();
  });

  it('marks the field optional in its label', () => {
    renderModal();
    const label = document.querySelector(`label[for="${FIELD_INPUT_IDS.rfc}"]`);
    expect(label?.textContent).toMatch(/opcional/i);
  });
});

describe('server-reported failures land on their own inputs', () => {
  it('pins every returned field message under its input, all at once', async () => {
    renderModal(
      failingSave(
        {
          email: 'El correo debe tener la forma nombre@dominio.com, o déjalo vacío.',
          codigo_postal: 'El código postal son 5 dígitos (ej. 64000), o déjalo vacío.',
        },
        'Revisa 2 campos: Correo Electrónico y Código Postal.'
      )
    );

    fireEvent.change(nameInput(), { target: { value: 'Cliente Nuevo' } });
    fireEvent.click(submit());

    await waitFor(() => {
      expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    });
    // Both, from one submit — the whole point. The old form showed one prose
    // banner and the tenant resubmitted to discover the next problem.
    expect(
      document.getElementById(`${FIELD_INPUT_IDS.email}-error`)?.textContent
    ).toMatch(/nombre@dominio/);
    expect(
      document.getElementById(`${FIELD_INPUT_IDS.codigo_postal}-error`)?.textContent
    ).toMatch(/5 dígitos/);
  });

  it('moves focus to the first bad field so a phone user sees it', async () => {
    renderModal(failingSave({ email: 'Correo inválido.' }));

    fireEvent.change(nameInput(), { target: { value: 'Cliente Nuevo' } });
    fireEvent.click(submit());

    // Without this the messages exist but are off-screen: the banner is above
    // the fold and the submit button is below it.
    await waitFor(() => expect(document.activeElement).toBe(emailInput()));
  });

  it('clears a field message as soon as that field is edited', async () => {
    renderModal(failingSave({ email: 'Correo inválido.' }));

    fireEvent.change(nameInput(), { target: { value: 'Cliente Nuevo' } });
    fireEvent.click(submit());
    await waitFor(() => expect(emailInput().getAttribute('aria-invalid')).toBe('true'));

    fireEvent.change(emailInput(), { target: { value: 'contacto@cliente.com' } });
    expect(emailInput().getAttribute('aria-invalid')).toBeNull();
  });

  it('keeps a failure with no field to blame in the banner alone', async () => {
    // A plain Error — the shape a network failure or a non-field 500 produces.
    renderModal(
      vi.fn<SaveFn>(async () => {
        throw new Error('No se pudo guardar el cliente. Vuelve a intentarlo.');
      })
    );

    fireEvent.change(nameInput(), { target: { value: 'Cliente Nuevo' } });
    fireEvent.click(submit());

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/No se pudo guardar el cliente/);
    });
    expect(nameInput().getAttribute('aria-invalid')).toBeNull();
  });

  it('does not close the modal on a failed save', async () => {
    const { onClose } = renderModal(failingSave({ email: 'Correo inválido.' }));

    fireEvent.change(nameInput(), { target: { value: 'Cliente Nuevo' } });
    fireEvent.click(submit());

    await waitFor(() => expect(emailInput().getAttribute('aria-invalid')).toBe('true'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('every validated column has an input to point at', () => {
  /**
   * The gate behind `focusFirstError`. A column the API can reject but the form
   * cannot locate leaves its message stranded in the banner — which is the
   * defect this whole change exists to remove, reintroduced one field at a
   * time. Derived from `FIELD_ORDER` in lib/clientValidation.ts, not from a
   * hand-kept list here, so adding a validated column is what trips it.
   */
  it('reads a plausible set of validated columns (guards the guard)', () => {
    // Five: name, phone and the three credit columns. email and codigo_postal
    // left this list deliberately — they are warned about, never refused.
    expect(FIELD_ORDER.length).toBeGreaterThanOrEqual(5);
    expect(FIELD_ORDER).toContain('phone');
    expect(FIELD_ORDER).toContain('credit_limit');
    expect(FIELD_ORDER).not.toContain('codigo_postal');
  });

  it('maps each one to an input that is actually rendered', () => {
    renderModal();
    for (const field of FIELD_ORDER) {
      const id = FIELD_INPUT_IDS[field];
      expect(id, `${field} has no input id`).toBeTruthy();
      expect(document.getElementById(id), `${field} → #${id} is not rendered`).toBeTruthy();
    }
  });

  it('does not claim an input for a column the form does not render', () => {
    renderModal();
    for (const [field, id] of Object.entries(FIELD_INPUT_IDS)) {
      expect(document.getElementById(id), `${field} → #${id} is a dead pointer`).toBeTruthy();
    }
  });
});
