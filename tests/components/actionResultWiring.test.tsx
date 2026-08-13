import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * The ActionResultDialog rollout (#146 follow-up): each adopting surface must
 * announce the outcome the *server* reported, and only that.
 *
 * The receivables case carries the money-path subtlety: `confirmPayment` can
 * come back `success: true` **with** `complementError` set — the payment
 * confirmed but the SAT complement did not stamp. That warning is a live
 * fiscal obligation which the modal holds itself open to show; a green "Pago
 * confirmado" dialog on top would bury exactly the thing the tenant must act
 * on. So the page fires the success dialog only for the clean outcome.
 */

vi.mock('@/lib/clientDemoMode', () => ({ isClientDemoMode: () => false }));

const confirmPayment = vi.fn();
vi.mock('@/lib/hooks/useReceivables', () => ({
  useReceivables: () => ({
    filteredReceivables: [],
    // The real ReceivablesSummary shape (lib/receivablesCalculator.ts) — a
    // partial here would crash the render and fail this file for the wrong
    // reason, as the first draft of this mock did.
    summary: {
      totalOverdue: 0,
      totalDueToday: 0,
      totalUpcoming: 0,
      totalConfirmed: 0,
      totalPending: 0,
      countOverdue: 0,
      countDueToday: 0,
      countUpcoming: 0,
    },
    loading: false,
    error: null,
    statusFilter: 'all',
    setStatusFilter: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    confirmPayment,
  }),
}));
vi.mock('@/lib/hooks/useSettlementAccount', () => ({
  useSettlementAccount: () => ({ ready: true, loading: false }),
}));
vi.mock('@/components/layout/Header', () => ({
  Header: () => <div />,
}));

beforeEach(() => {
  confirmPayment.mockReset();
});

describe('receivables page announces only a clean confirmation', () => {
  async function renderPage() {
    const { default: Page } = await import('@/app/(dashboard)/receivables/page');
    render(<Page />);
    return Page;
  }

  /** Reaches into the page's SpeiConfirmModal wiring through its props. */
  function pageSource(): string {
    // The modal is closed by default and there is no milestone fixture to open
    // it through the UI without the whole receivables stack; the contract that
    // matters — succeed only on `success && !complementError` — is asserted
    // against the wiring itself.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    return readFileSync(join(process.cwd(), 'app/(dashboard)/receivables/page.tsx'), 'utf8');
  }

  it('renders with the dialog mounted and no result showing', async () => {
    await renderPage();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('gates the success dialog on every outcome the modal holds itself open for', () => {
    const src = pageSource();
    // The load-bearing condition, pinned: verified red by flipping it to
    // `outcome.success` alone while a complementError fixture was in play.
    //
    // All three, not just the first (#272). The modal stays open for a
    // complement that did not stamp, for an overpayment (#81) and for the
    // unknown-método / storage warning (#213, #238) — and ActionResultDialog
    // renders at z-[60] over the modal's z-50, so a green "Pago confirmado"
    // on any of them covers the thing the tenant has to act on.
    expect(src).toMatch(/outcome\.success && !outcome\.complementError/);
    expect(src).toMatch(/overpaid <= 0/);
    expect(src).toMatch(/!complementWarning/);
    expect(src).toMatch(/if \(cleanConfirmation\)/);
    // And the outcome must still reach the modal, which renders the warning.
    expect(src).toMatch(/return outcome;/);
  });

  it('never builds the success message from anything but the server outcome', () => {
    const src = pageSource();
    const wiring = src.slice(src.indexOf('onConfirm='), src.indexOf('/>', src.indexOf('onConfirm=')));
    expect(wiring).toContain('outcome.milestone');
    // The local candidates that would fabricate: the selected row and the raw args.
    expect(wiring).not.toMatch(/selectedMilestone\.(label|amount)/);
  });
});

describe('quotes page announces the created quote from the server row', () => {
  it('names the saved row, not the wizard draft', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'app/(dashboard)/quotes/page.tsx'), 'utf8');

    const wiring = src.slice(src.indexOf('onSubmit='), src.indexOf('/>', src.indexOf('onSubmit=')));
    // The awaited return of createQuote is the announcement's only source.
    expect(wiring).toMatch(/const saved = await createQuote\(data\)/);
    expect(wiring).toMatch(/saved\.title/);
    expect(wiring).not.toMatch(/data\.title/);
  });
});
