import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpeiConfirmModal } from '@/components/receivables/SpeiConfirmModal';
import type { MilestoneWithClient, ReceivableMutationOutcome } from '@/lib/hooks/useReceivables';

/**
 * Confirming that money arrived (#149).
 *
 * #149 listed this modal as out of scope *by construction*: it owns a submit
 * handler but no `<form>`, so the gate's detector could not see it and would
 * never ask for this file. That was the wrong side of the judgment — this is
 * the control that turns "owed" into "collected", files the complemento de
 * pago behind it, and is the exact place #58/#86's fabricated confirmation
 * lived. The detector now keys on the handler as well as the tag, and this is
 * the test it asks for.
 *
 * Every case is one question: *does the screen agree with what the server
 * recorded?* A modal that closes on a rejected write tells the owner a payment
 * landed that never did — and receivables is where that becomes an invoice.
 */

const MILESTONE = {
  id: 'm-1',
  label: 'Anticipo 50%',
  amount: 24500,
  transferred_amount: null,
  due_date: '2026-09-15',
  status: 'marked_paid',
  client_name: 'Constructora del Bajío',
  contract_title: 'Impermeabilización Nave Industrial',
  tracking_reference: 'SPEI20260830123456',
} as unknown as MilestoneWithClient;

const ok = (): ReceivableMutationOutcome => ({ success: true });

function renderModal(
  onConfirm: (id: string, amount?: number) => Promise<ReceivableMutationOutcome>
) {
  const onClose = vi.fn();
  const confirm = vi.fn(onConfirm);
  render(
    <SpeiConfirmModal isOpen milestone={MILESTONE} onClose={onClose} onConfirm={confirm} />
  );
  return { onClose, confirm };
}

// Selected by its label, not by `input[type="number"]` — that selector was
// pinning the very attribute #151 removes, so the fix would have read as a
// broken test.
const amountInput = () =>
  screen.getByLabelText(/Monto Transferido Confirmado/i) as HTMLInputElement;
const confirmButton = () => screen.getByRole('button', { name: /Confirmar Pago/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirming a payment', () => {
  it('proposes the milestone amount and confirms it', async () => {
    const { onClose, confirm } = renderModal(async () => ok());

    expect(amountInput().value).toBe('24500');
    fireEvent.click(confirmButton());

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('m-1', 24500));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('sends the corrected amount when the transfer differed', async () => {
    // Partial transfers are ordinary here: the owner confirms what arrived,
    // not what was owed, and that figure is what the CFDI complement carries.
    const { confirm } = renderModal(async () => ok());

    fireEvent.change(amountInput(), { target: { value: '20000' } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('m-1', 20000));
  });

  /**
   * This block replaces a test titled "falls back to the full amount rather
   * than confirming zero", which asserted `confirm('m-1', 24500)` for a cleared
   * field — pinning the defect in place (#284). The screen showed one number
   * and the write carried another, on money: `Number('') || milestone.amount`
   * substituted the full $24,500 cobro for whatever the owner had erased, and
   * that figure is what the complemento de pago declares to the SAT.
   */
  describe('an unreadable amount is a question, not a default (#284)', () => {
    it.each([
      ['cleared', ''],
      ['zero', '0'],
      ['whitespace', '   '],
    ])('refuses to confirm on a %s field instead of substituting the full cobro', async (_label, typed) => {
      const { confirm, onClose } = renderModal(async () => ok());

      fireEvent.change(amountInput(), { target: { value: typed } });
      fireEvent.click(confirmButton());

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/monto que recibiste/i);
      expect(confirm).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('confirms once a real amount is typed over the refusal', async () => {
      const { confirm } = renderModal(async () => ok());

      fireEvent.change(amountInput(), { target: { value: '' } });
      fireEvent.click(confirmButton());
      await screen.findByRole('alert');

      fireEvent.change(amountInput(), { target: { value: '18250.55' } });
      fireEvent.click(confirmButton());

      await waitFor(() => expect(confirm).toHaveBeenCalledWith('m-1', 18250.55));
    });

  });

  /**
   * #151 — the note that used to sit here said a half-typed decimal was not
   * assertable, because jsdom normalizes it away inside `input[type=number]`.
   * That was true of the input, not of the component: the field is now
   * `type="text" inputMode="decimal"`, so jsdom stops rewriting the value and
   * the keystrokes are visible to a test.
   */
  describe('the field keeps what was typed into it', () => {
    it('holds every keystroke of a decimal, including the bare point', () => {
      renderModal(async () => ok());

      for (const typed of ['1', '18', '182', '1825', '18250', '18250.', '18250.5']) {
        fireEvent.change(amountInput(), { target: { value: typed } });
        expect(amountInput().value).toBe(typed);
      }
    });

    it('offers the decimal keypad rather than a spinner', () => {
      renderModal(async () => ok());
      expect(amountInput().getAttribute('type')).toBe('text');
      expect(amountInput().getAttribute('inputMode')).toBe('decimal');
    });

    it('cannot be multiplied by a caret landing left of the prefill', () => {
      // The reported shape: `24500` prefilled, caret at the start, `0` typed.
      const { confirm } = renderModal(async () => ok());

      expect(amountInput().value).toBe('24500');
      fireEvent.change(amountInput(), { target: { value: '024500' } });
      expect(amountInput().value).toBe('24500');

      fireEvent.click(confirmButton());
      return waitFor(() => expect(confirm).toHaveBeenCalledWith('m-1', 24500));
    });

    it('leaves a cleared field empty rather than snapping it to 0', () => {
      renderModal(async () => ok());

      fireEvent.change(amountInput(), { target: { value: '' } });
      expect(amountInput().value).toBe('');
    });
  });
});

describe('a rejected confirmation is never shown as one (#58/#86)', () => {
  it('stays open with the reason when the server refuses', async () => {
    const { onClose } = renderModal(async () => ({
      success: false,
      error: 'Tu rol no permite confirmar pagos',
    }));

    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Tu rol no permite confirmar pagos/i);
    // The modal closing is what would read as "confirmed".
    expect(onClose).not.toHaveBeenCalled();
    expect(confirmButton()).toBeTruthy();
  });

  it('names a cause even when the outcome carries none', async () => {
    renderModal(async () => ({ success: false }));

    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/No se pudo confirmar el pago/i);
  });

  it('re-enables the button after a failure', async () => {
    renderModal(async () => ({ success: false, error: 'falló' }));

    fireEvent.click(confirmButton());

    await screen.findByRole('alert');
    await waitFor(() => expect((confirmButton() as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('a payment that confirmed but whose complemento did not stamp', () => {
  it('holds the modal open on the fiscal obligation left outstanding', async () => {
    // The money is recorded; the SAT complement is not. Closing quietly would
    // leave a PPD invoice owing a complemento nobody knows about.
    const { onClose } = renderModal(async () => ({
      success: true,
      complementError: {
        code: 'FOLIOS_EXHAUSTED',
        message: 'El pago quedó confirmado, pero el complemento no se timbró: no te quedan folios.',
      },
    } as ReceivableMutationOutcome));

    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/el complemento no se timbró/i);
    expect(onClose).not.toHaveBeenCalled();

    // And it takes an explicit acknowledgement to leave.
    fireEvent.click(screen.getByRole('button', { name: /Entendido — pago confirmado/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('a payment that exceeded the invoice balance (#81)', () => {
  it('holds the modal open naming the surplus and what to do with it', async () => {
    // The complement declares the balance; the extra money is real and no
    // document mentions it. Closing quietly is how the fact used to die.
    const { onClose } = renderModal(async () => ({
      success: true,
      complement: {
        uuid: 'AAA-111',
        amount: 10000,
        overpaidAmount: 500,
        settles: true,
      },
    } as ReceivableMutationOutcome));

    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/\$500\.00/);
    expect(alert.textContent).toMatch(/por encima del saldo/i);
    expect(alert.textContent).toMatch(/aplica el excedente a otro cobro o devuélvelo/i);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Entendido — pago confirmado/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('holds the modal open when the complement stamped but its copies did not store (#238)', async () => {
    // The CFDI exists at the SAT; the XML/PDF copies do not exist in storage.
    // With no overpayment the modal used to close silently over the warning,
    // and the tenant learned the copies were missing from the accountant
    // export.
    const { onClose } = renderModal(async () => ({
      success: true,
      complement: {
        uuid: 'AAA-111',
        amount: 10000,
        overpaidAmount: 0,
        settles: true,
        warning:
          'El complemento de pago se timbró, pero no se pudo guardar una copia del XML y PDF.',
      },
    } as ReceivableMutationOutcome));

    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/no se pudo guardar una copia/i);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Entendido — pago confirmado/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('says both when the payment overpaid AND the copies did not store', async () => {
    // Two independent facts the tenant must hear; surfacing one must not
    // swallow the other.
    const { onClose } = renderModal(async () => ({
      success: true,
      complement: {
        uuid: 'AAA-111',
        amount: 10000,
        overpaidAmount: 500,
        settles: true,
        warning: 'El complemento de pago se timbró, pero no se pudo guardar una copia del XML y PDF.',
      },
    } as ReceivableMutationOutcome));

    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/por encima del saldo/i);
    expect(alert.textContent).toMatch(/no se pudo guardar una copia/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes normally when the payment fit the balance', async () => {
    const { onClose } = renderModal(async () => ({
      success: true,
      complement: { uuid: 'AAA-111', amount: 10000, overpaidAmount: 0, settles: false },
    } as ReceivableMutationOutcome));

    fireEvent.click(confirmButton());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
