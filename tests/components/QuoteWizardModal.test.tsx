import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuoteWizardModal } from '@/components/quotes/QuoteWizardModal';
import type { Client } from '@/types';

/**
 * The reported experience: "Precio Unitario ($) has a trailing 0 when putting
 * the price which persists and it's confusing for users".
 *
 * The field was bound to the numeric line item, so an untouched concepto
 * rendered a literal "0"; typing to the left of it — where a tap on the left
 * half of the field lands — made $150 into $1,500, and the value was written
 * back through `Number()` so it stuck. This is the money the client is quoted,
 * so the check is the tenant's question, not the function's: can an owner type
 * a price and have the quote carry that price?
 */

vi.mock('@/lib/hooks/useReceivables', () => ({
  useReceivables: () => ({ receivables: [], loading: false, error: null }),
}));

// Carries a phone since #104: the submit button now promises a share only when
// one is possible, so a client without a phone reads "Generar Cotización". The
// no-phone case gets its own test below rather than being the default fixture,
// because a client the tenant can actually reach is the ordinary case.
const clients = [
  { id: 'client-1', name: 'Constructora del Norte', rfc: 'CON010101AAA', phone: '+528112345678' },
] as unknown as Client[];

const clientsWithoutPhone = [
  { id: 'client-1', name: 'Constructora del Norte', rfc: 'CON010101AAA', phone: null },
] as unknown as Client[];

type SubmitFn = Parameters<typeof QuoteWizardModal>[0]['onSubmit'];

function renderWizard(onSubmit: ReturnType<typeof vi.fn<SubmitFn>> = vi.fn<SubmitFn>(async () => {})) {
  const onClose = vi.fn();
  render(<QuoteWizardModal isOpen onClose={onClose} clients={clients} onSubmit={onSubmit} />);
  return { onSubmit, onClose };
}

const priceInput = () => document.getElementById('line-item-0-unit-price') as HTMLInputElement;
const quantityInput = () => document.getElementById('line-item-0-quantity') as HTMLInputElement;
const next = () => screen.getByRole('button', { name: /Siguiente/i });

/** Step 1 → step 2, with the title the first step requires. */
function goToLineItems(title = 'Suministro para obra') {
  fireEvent.change(screen.getByPlaceholderText(/Suministro de Cemento/i), {
    target: { value: title },
  });
  fireEvent.click(next());
}

/** Fills the one concepto step 2 starts with. */
function fillFirstItem(price: string, quantity?: string) {
  fireEvent.change(screen.getByPlaceholderText(/Descripción del producto/i), {
    target: { value: 'Cemento gris 50kg' },
  });
  if (quantity !== undefined) fireEvent.change(quantityInput(), { target: { value: quantity } });
  fireEvent.change(priceInput(), { target: { value: price } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Precio Unitario carries the price the owner typed', () => {
  it('starts empty — no prefilled zero to type around', () => {
    renderWizard();
    goToLineItems();

    expect(priceInput().value).toBe('');
    expect(priceInput().placeholder).toBe('0.00');
  });

  it('keeps "150" as 150 when the caret sits before the digits', () => {
    renderWizard();
    goToLineItems();

    // What the old prefill did on a left-half tap: the typed digits land in
    // front of the zero. With no zero there is nothing to inherit.
    fireEvent.change(priceInput(), { target: { value: '150' } });
    expect(priceInput().value).toBe('150');
  });

  it('strips a leading zero instead of letting it multiply the price', () => {
    renderWizard();
    goToLineItems();

    fireEvent.change(priceInput(), { target: { value: '0150' } });
    expect(priceInput().value).toBe('150');
  });

  it('survives a half-typed decimal', () => {
    renderWizard();
    goToLineItems();

    fireEvent.change(priceInput(), { target: { value: '1500.' } });
    expect(priceInput().value).toBe('1500.');
    fireEvent.change(priceInput(), { target: { value: '1500.5' } });
    expect(priceInput().value).toBe('1500.5');
  });

  it('quotes the typed amount, and totals it with IVA', async () => {
    const { onSubmit } = renderWizard();
    goToLineItems();
    fillFirstItem('150', '2');
    fireEvent.click(next());

    // Step 3 shows the total the client will see: 2 × 150 + 16% IVA.
    expect(screen.getByText('$348.00 MXN')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Generar y Compartir/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].line_items).toEqual([
      {
        description: 'Cemento gris 50kg',
        quantity: 2,
        unit_price: 150,
        sat_code: '30111500',
        unit: 'E48',
      },
    ]);
  });
});

describe('an incomplete concepto says so', () => {
  it('names the field instead of leaving Siguiente inert', () => {
    renderWizard();
    goToLineItems();

    fireEvent.change(screen.getByPlaceholderText(/Descripción del producto/i), {
      target: { value: 'Cemento gris 50kg' },
    });
    fireEvent.click(next());

    // Still on step 2, and now with a reason.
    expect(screen.getByRole('alert').textContent).toMatch(
      /Escribe el precio unitario del concepto #1/i
    );
    expect(screen.getByText(/Conceptos y Cálculo de Impuestos SAT/i)).toBeTruthy();
  });

  it('clears the message once the price is typed, and advances', () => {
    renderWizard();
    goToLineItems();
    fireEvent.change(screen.getByPlaceholderText(/Descripción del producto/i), {
      target: { value: 'Cemento gris 50kg' },
    });
    fireEvent.click(next());

    fireEvent.change(priceInput(), { target: { value: '150' } });
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(next());
    expect(screen.getByText(/Resumen y Confirmación/i)).toBeTruthy();
  });
});

/**
 * #104 — the submit button said "Generar y Compartir" for every client,
 * including one with no phone on record, where no share is possible at all.
 * A label is a promise; this is the same rule as the disabled WhatsApp button
 * on `QuoteCard`, applied to the wizard.
 */
describe('the submit label promises only what it can do (#104)', () => {
  it('offers to share when the client has a phone', () => {
    renderWizard();
    goToLineItems();
    fillFirstItem('1500');
    fireEvent.click(next());

    expect(screen.getByRole('button', { name: /Generar y Compartir/i })).toBeTruthy();
  });

  it('drops the share promise when the client has no phone', () => {
    render(
      <QuoteWizardModal
        isOpen
        onClose={vi.fn()}
        clients={clientsWithoutPhone}
        onSubmit={vi.fn<SubmitFn>(async () => {})}
      />
    );
    goToLineItems();
    fillFirstItem('1500');
    fireEvent.click(next());

    expect(screen.getByRole('button', { name: /Generar Cotización/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Generar y Compartir/i })).toBeNull();
  });
});
