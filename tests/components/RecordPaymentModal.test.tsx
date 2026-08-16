import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordPaymentModal } from '@/components/receivables/RecordPaymentModal';
import type { MilestoneWithClient, ReceivableMutationOutcome } from '@/lib/hooks/useReceivables';

/**
 * Registrar pago (#394, option A).
 *
 * The question each case asks is the owner's: *can I tell the product what
 * actually landed in my bank, and does it agree with me afterwards?*
 *
 * The distinction the whole feature rests on is that the amount here is **one
 * payment**, not the running total. Typing a total into an append-only ledger
 * is what made `milestone_payments` a partial record in the first place, so the
 * cases below pin the copy that says so as well as the value that is sent.
 */

const MILESTONE = {
  id: 'm-1',
  label: 'Anticipo 50%',
  amount: 48720,
  transferred_amount: 20000,
  cfdi_total: null,
  cfdi_status: null,
  due_date: '2026-09-15',
  status: 'confirmed',
  client_name: 'Constructora del Bajío',
} as unknown as MilestoneWithClient;

const ok = (): ReceivableMutationOutcome => ({ success: true });

function renderModal(
  onRecord: (
    id: string,
    payment: { amount: number; trackingReference?: string | null; declaredAt?: string | null }
  ) => Promise<ReceivableMutationOutcome> = async () => ok()
) {
  const onClose = vi.fn();
  const record = vi.fn(onRecord);
  render(
    <RecordPaymentModal isOpen milestone={MILESTONE} onClose={onClose} onRecord={record} />
  );
  return { onClose, record };
}

const amountInput = () => screen.getByLabelText(/Monto de este pago/i) as HTMLInputElement;
// Exact, not a substring: the Modal's own close control is labelled
// "Cerrar Registrar pago recibido", which /Registrar pago/i also matches.
const submit = () => screen.getByRole('button', { name: 'Registrar pago' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('what the owner is shown before typing', () => {
  it('states the total, what is already recorded, and what is left', () => {
    renderModal();

    expect(screen.getByText(/\$48,720\.00/)).toBeTruthy();
    expect(screen.getByText(/\$20,000\.00/)).toBeTruthy();
    // The figure that decides whether this cobro is still owed anything.
    expect(screen.getByText(/\$28,720\.00/)).toBeTruthy();
  });

  it('prefills nothing — a suggested amount is a suggestion to record money that may not have arrived', () => {
    renderModal();
    expect(amountInput().value).toBe('');
  });

  it('says in words that this is one payment, not the total', () => {
    renderModal();
    expect(screen.getByText(/Solo lo que llegó en esta transferencia/i)).toBeTruthy();
    expect(screen.getByText(/registra cada pago por separado/i)).toBeTruthy();
  });
});

describe('recording a payment', () => {
  it('sends this wire’s amount, not the running total', () => {
    const { record, onClose } = renderModal();

    fireEvent.change(amountInput(), { target: { value: '28720' } });
    fireEvent.click(submit());

    return waitFor(() => {
      expect(record).toHaveBeenCalledTimes(1);
      const [id, payment] = record.mock.calls[0];
      expect(id).toBe('m-1');
      // 28,720 — the remainder that arrived — never 48,720, the new total.
      expect(payment.amount).toBe(28720);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('keeps a half-typed decimal and refuses to let a leading zero multiply it (#151)', () => {
    renderModal();

    for (const typed of ['2', '28', '287', '2872', '28720', '28720.', '28720.5']) {
      fireEvent.change(amountInput(), { target: { value: typed } });
      expect(amountInput().value).toBe(typed);
    }

    fireEvent.change(amountInput(), { target: { value: '028720' } });
    expect(amountInput().value).toBe('28720');
    expect(amountInput().getAttribute('inputMode')).toBe('decimal');
  });

  it('sends the date the money landed, not today', async () => {
    const { record } = renderModal();

    fireEvent.change(amountInput(), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/¿Cuándo llegó\?/i), {
      target: { value: '2026-08-01' },
    });
    fireEvent.click(submit());

    await waitFor(() => expect(record).toHaveBeenCalled());
    // Parcialidad numbering is chronological and a complemento's FechaPago
    // comes from it (#395), so a wire entered late must carry its real date.
    expect(String(record.mock.calls[0][1].declaredAt)).toContain('2026-08-01');
  });

  it('sends the clave when there is one, and null when there is not', async () => {
    const { record } = renderModal();

    fireEvent.change(amountInput(), { target: { value: '5000' } });
    fireEvent.click(submit());
    await waitFor(() => expect(record).toHaveBeenCalled());
    expect(record.mock.calls[0][1].trackingReference).toBeNull();
  });
});

describe('nothing is recorded that the server did not take', () => {
  it('refuses an empty or zero amount without calling the server', () => {
    const { record } = renderModal();

    for (const typed of ['', '0']) {
      fireEvent.change(amountInput(), { target: { value: typed } });
      fireEvent.click(submit());
    }

    expect(record).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/mayor a cero/i);
  });

  it('stays open with the reason when the write is refused', async () => {
    const { onClose } = renderModal(async () => ({
      success: false,
      error: 'Tu rol no permite registrar pagos',
    }));

    fireEvent.change(amountInput(), { target: { value: '5000' } });
    fireEvent.click(submit());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Tu rol no permite registrar pagos/i);
    // Closing here would report a payment the ledger never took (#58/#86).
    expect(onClose).not.toHaveBeenCalled();
  });
});
