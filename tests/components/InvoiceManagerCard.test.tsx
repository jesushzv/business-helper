import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoiceManagerCard } from '@/components/invoices/InvoiceManagerCard';
import type { ComplementOutcome, InvoiceItem } from '@/lib/hooks/useInvoices';

/**
 * Facturación's client-facing actions (#251, #252, #272).
 *
 * This component had no render test at all, and the two defects it shipped were
 * both only visible at the call site: the Nota de Venta handler passed a gross
 * milestone amount into a generator whose contract is a *pre-tax* subtotal, and
 * it declared every row "PAGADO" while thanking the client for a payment. The
 * library underneath was correct and pinned the whole time — which is exactly
 * why the tests here assert what the tenant's client actually receives.
 */

const BASE_INVOICE: InvoiceItem = {
  id: 'm-1',
  milestoneId: 'm-1',
  publicToken: 'tok-1',
  clientName: 'Constructora del Bajío',
  clientRfc: 'CBA120405XYZ',
  clientPhone: '5512345678',
  concept: 'Nave Industrial — Anticipo 50%',
  amount: 48720,
  status: 'pending',
  transferredAmount: null,
  dueDate: '2026-09-15',
  cfdiStatus: 'none',
  cfdiUuid: null,
  cfdiEnvironment: null,
  cfdiError: null,
  xmlUrl: null,
  pdfUrl: null,
  paymentMethod: 'PUE',
  complements: [],
  outstandingBalance: 48720,
};

const hookState: {
  invoices: InvoiceItem[];
  complementOutcome: ComplementOutcome;
} = {
  invoices: [BASE_INVOICE],
  complementOutcome: { success: true },
};

const sendComplement = vi.fn(async () => hookState.complementOutcome);

vi.mock('@/lib/hooks/useInvoices', () => ({
  useInvoices: () => ({
    invoices: hookState.invoices,
    loading: false,
    loadError: null,
    stampingId: null,
    complementingId: null,
    exporting: false,
    reload: vi.fn(),
    stampCFDI: vi.fn(),
    sendComplement,
    downloadAccountantPackage: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/useSettlementAccount', () => ({
  useSettlementAccount: () => ({ ready: true }),
}));

const openSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  hookState.invoices = [BASE_INVOICE];
  hookState.complementOutcome = { success: true };
  vi.stubGlobal('open', openSpy);
});

/** The wa.me text the tenant's client would actually receive, decoded. */
function sharedMessage(): string {
  fireEvent.click(screen.getByRole('button', { name: /Nota de Venta/i }));
  expect(openSpy).toHaveBeenCalled();
  return decodeURIComponent(String(openSpy.mock.calls[0][0]));
}

describe('the Nota de Venta totals the cobro, not the cobro plus 16% (#251)', () => {
  it('sends the milestone amount itself, IVA already inside', () => {
    // A milestone is a slice of `quotes.total_amount` — already gross. Treated
    // as a pre-tax subtotal it went out as $56,515.20 against a $48,720 cobro,
    // matching neither the /pay page nor the CFDI for the same milestone.
    hookState.invoices = [{ ...BASE_INVOICE, status: 'confirmed', transferredAmount: 48720 }];
    render(<InvoiceManagerCard />);

    const message = sharedMessage();

    expect(message).toContain('$48,720.00 MXN');
    expect(message).not.toContain('56,515.20');
  });

  it('receipts the amount that arrived when the transfer came up short', () => {
    hookState.invoices = [{ ...BASE_INVOICE, status: 'confirmed', transferredAmount: 20000 }];
    render(<InvoiceManagerCard />);

    const message = sharedMessage();

    expect(message).toContain('$20,000.00 MXN');
    expect(message).not.toContain('48,720.00');
  });
});

describe('the Nota de Venta does not thank a client who has not paid (#252)', () => {
  it('asks a pending cobro for the transfer instead of acknowledging one', () => {
    hookState.invoices = [{ ...BASE_INVOICE, status: 'pending' }];
    render(<InvoiceManagerCard />);

    const message = sharedMessage();

    expect(message).not.toMatch(/gracias por tu pago/i);
    expect(message).not.toMatch(/Comprobante de Pago/i);
    expect(message).toMatch(/pendiente de pago/i);
  });

  it.each(['requested', 'marked_paid'])(
    'treats a %s cobro as unpaid — only a confirmation records money arriving',
    (status) => {
      // `marked_paid` is the *payer's* declaration, not the owner's
      // confirmation. It is the one status most likely to be mistaken for paid.
      hookState.invoices = [{ ...BASE_INVOICE, status }];
      render(<InvoiceManagerCard />);

      expect(sharedMessage()).not.toMatch(/gracias por tu pago/i);
    }
  );

  it('thanks the client once the payment is confirmed', () => {
    hookState.invoices = [{ ...BASE_INVOICE, status: 'confirmed', transferredAmount: 48720 }];
    render(<InvoiceManagerCard />);

    expect(sharedMessage()).toMatch(/gracias por tu pago/i);
  });
});

describe('the manual complemento reports a surplus rather than dropping it (#272)', () => {
  it('names the overpayment and what to do with it', async () => {
    // `/api/invoices/[id]/complement` has always returned `overpaidAmount`;
    // `ComplementOutcome` had no field for it, so the manual path silently
    // dropped the fact #81 exists to surface.
    hookState.invoices = [
      { ...BASE_INVOICE, cfdiStatus: 'issued', paymentMethod: 'PPD', outstandingBalance: 10000 },
    ];
    hookState.complementOutcome = {
      success: true,
      issued: true,
      uuid: 'AAA-111',
      installment: 2,
      remainingBalance: 0,
      overpaidAmount: 500,
    };
    render(<InvoiceManagerCard />);

    fireEvent.click(screen.getByRole('button', { name: /Emitir complemento de pago/i }));

    await waitFor(() =>
      expect(screen.getByText(/por encima del saldo de esta factura/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/\$500\.00 MXN/)).toBeInTheDocument();
    expect(screen.getByText(/aplica el excedente a otro cobro o devuélvelo/i)).toBeInTheDocument();
  });

  it('says nothing about a surplus when there was none', async () => {
    hookState.invoices = [
      { ...BASE_INVOICE, cfdiStatus: 'issued', paymentMethod: 'PPD', outstandingBalance: 10000 },
    ];
    hookState.complementOutcome = {
      success: true,
      issued: true,
      uuid: 'AAA-111',
      installment: 2,
      remainingBalance: 8000,
      overpaidAmount: 0,
    };
    render(<InvoiceManagerCard />);

    fireEvent.click(screen.getByRole('button', { name: /Emitir complemento de pago/i }));

    await waitFor(() => expect(screen.getByText(/Folio fiscal AAA-111/)).toBeInTheDocument());
    expect(screen.queryByText(/por encima del saldo/i)).toBeNull();
  });
});
