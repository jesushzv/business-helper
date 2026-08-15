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

const clients = [
  { id: 'client-1', name: 'Constructora del Norte', rfc: 'CON010101AAA' },
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

describe('advancing to the review step replaces the button node', () => {
  /**
   * The step 2 → 3 transition swaps "Siguiente" for "Generar y Compartir".
   * Reconciled as the SAME DOM node, the click that advances the step mutates
   * the button it is being dispatched on from type="button" to type="submit",
   * and a real browser then runs the click's default action against the
   * morphed node — submitting the form. The tenant never saw the review step:
   * the quote was created the instant they left step 2, skipping the credit
   * warning and the bank-account picker. jsdom does not evaluate default
   * actions this way (the sibling test above clicks the same sequence and
   * stays green either way), so this pins the mechanism — the node must be
   * replaced, not morphed — and E2E scenario 02 pins the user-visible flow.
   */
  it('does not morph Siguiente into the submit button under the in-flight click', () => {
    renderWizard();
    goToLineItems();
    fillFirstItem('150', '2');

    const nextButton = next();
    fireEvent.click(nextButton);

    // We advanced to the review step…
    expect(screen.getByText(/Resumen y Confirmación/i)).toBeTruthy();

    // …and the submit button is a NEW node; the one the click landed on is
    // gone from the document, so the default action cannot re-target it.
    const submitButton = screen.getByRole('button', { name: /Generar y Compartir/i });
    expect(submitButton).not.toBe(nextButton);
    expect(nextButton.isConnected).toBe(false);
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
 * #256 — a fresh open is a fresh quote.
 *
 * The modal is mounted permanently and only toggled with isOpen, so every
 * field survived a close: reopening after creating quote A landed on step 3
 * with A's title and conceptos, one tap from a byte-identical duplicate with
 * its own public token.
 */
describe('reopening starts clean (#256)', () => {
  it('resets to step 1 with empty fields after a close and reopen', async () => {
    const onSubmit = vi.fn<SubmitFn>(async () => {});
    const onClose = vi.fn();
    const { rerender } = render(
      <QuoteWizardModal isOpen onClose={onClose} clients={clients} onSubmit={onSubmit} />
    );

    // Type a title and advance to step 2, leaving typed state everywhere.
    goToLineItems('Obra del cliente A');
    expect(screen.getByText(/Step 2 de 3/i)).toBeTruthy();
    fillFirstItem('1500');

    // Close (hide), then reopen — the old shape kept step, title and drafts.
    rerender(<QuoteWizardModal isOpen={false} onClose={onClose} clients={clients} onSubmit={onSubmit} />);
    rerender(<QuoteWizardModal isOpen onClose={onClose} clients={clients} onSubmit={onSubmit} />);

    await waitFor(() => expect(screen.getByText(/Step 1 de 3/i)).toBeTruthy());
    const title = screen.getByPlaceholderText(/Suministro de Cemento/i) as HTMLInputElement;
    expect(title.value).toBe('');
  });
});

/**
 * Editing an existing quote (#340).
 *
 * Until this, the only mutation any screen issued was `updateQuoteStatus`,
 * which sends `{ status }` alone — so raising a total was reachable from the
 * API and from nothing an owner could tap. The founder decided a quote should
 * be editable after creation; the same three steps serve both, because an
 * editor that re-implemented conceptos and taxes would be a second place for
 * the arithmetic the client is shown to diverge from the arithmetic stored.
 *
 * The question asked here is the tenant's, not the component's (#146): can an
 * owner open a quote they already made, change one figure, and save it without
 * anything else moving?
 */
describe('editing an existing quote (#340)', () => {
  const existingQuote = {
    id: 'quote-1',
    client_id: 'client-1',
    title: 'Suministro para la obra Reforma',
    status: 'sent',
    currency: 'MXN',
    valid_until: '2026-12-31',
    notes: 'Entrega en 48 horas.',
    line_items: [
      { description: 'Cemento gris 50kg', quantity: 10, unit_price: 250, sat_code: '30111500', unit: 'E48' },
    ],
    subtotal_amount: 2500,
    iva_amount: 400,
    retencion_isr_amount: 0,
    retencion_iva_amount: 0,
    total_amount: 2900,
    bank_account_id: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  function renderEditor(quote = existingQuote) {
    // Typed as `SubmitFn`, not a bare `vi.fn(async () => {})`: an untyped mock
    // has a zero-length parameter tuple, so `mock.calls[0][0]` is a type error
    // — and one `tsc` catches while `vitest` does not, because Vitest strips
    // the annotations. Green tests are not a typecheck.
    const onSubmit = vi.fn<SubmitFn>(async () => {});
    const onClose = vi.fn();
    render(
      <QuoteWizardModal
        isOpen
        onClose={onClose}
        clients={clients}
        onSubmit={onSubmit}
        quote={quote}
      />
    );
    return { onSubmit, onClose };
  }

  it('opens on the quote as it stands rather than on a blank form', () => {
    renderEditor();

    expect(
      (screen.getByPlaceholderText(/Suministro de Cemento/i) as HTMLInputElement).value
    ).toBe('Suministro para la obra Reforma');

    fireEvent.click(next());
    expect(priceInput().value).toBe('250');
    expect(quantityInput().value).toBe('10');
  });

  it('saves one changed figure without moving anything else', async () => {
    // The round trip is the point. An owner opening the form to fix a price
    // must not silently rewrite the description, the dates, or the taxes their
    // client already saw.
    const { onSubmit } = renderEditor();

    fireEvent.click(next());
    fireEvent.change(priceInput(), { target: { value: '300' } });
    fireEvent.click(next());
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0][0];

    expect(submitted.line_items[0].unit_price).toBe(300);
    expect(submitted.line_items[0].quantity).toBe(10);
    expect(submitted.line_items[0].description).toBe('Cemento gris 50kg');
    expect(submitted.title).toBe('Suministro para la obra Reforma');
    expect(submitted.valid_until).toBe('2026-12-31');
    expect(submitted.notes).toBe('Entrega en 48 horas.');
    // Inferred from the stored amounts, not reset to the create-time default —
    // otherwise a quote written without IVA would gain 16% on a title fix.
    expect(submitted.taxOptions.applyIva).toBe(true);
  });

  it('keeps a quote written without IVA free of it', async () => {
    const { onSubmit } = renderEditor({ ...existingQuote, iva_amount: 0, total_amount: 2500 });

    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].taxOptions.applyIva).toBe(false);
  });

  it('names the cost of editing a sent quote before the tap', () => {
    renderEditor();
    fireEvent.click(next());
    fireEvent.click(next());

    // The link in the client's hands stops opening. Discovering that after
    // saving is the #146 shape; it sits above the submit button, where a
    // 375px screen cannot scroll past it.
    expect(screen.getByText(/volverá a Borrador/i)).toBeTruthy();
    expect(screen.getByText(/dejará de abrir hasta que la vuelvas a enviar/i)).toBeTruthy();
  });

  it('says nothing about the link when the quote was never sent', () => {
    renderEditor({ ...existingQuote, status: 'draft' });
    fireEvent.click(next());
    fireEvent.click(next());

    expect(screen.queryByText(/volverá a Borrador/i)).toBeNull();
  });

  it('creates, rather than edits, when no quote is passed', () => {
    renderWizard();
    goToLineItems();
    fillFirstItem('100');
    fireEvent.click(next());

    expect(screen.getByRole('button', { name: /Generar y Compartir/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Guardar Cambios/i })).toBeNull();
  });
});
