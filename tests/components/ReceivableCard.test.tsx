import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ReceivableCard } from '@/components/receivables/ReceivableCard';
import type { MilestoneWithClient } from '@/lib/hooks/useReceivables';

/**
 * #44 — a payment reminder must never fall back to a hardcoded phone number.
 *
 * The card used `milestone.client_phone || '8115551234'`, so a client with no
 * phone on record produced a WhatsApp reminder — amount owed, due date and the
 * /pay/ link — addressed to a real, dialable Monterrey number.
 */

const BASE_MILESTONE: MilestoneWithClient = {
  id: 'm-1',
  contract_id: 'c-1',
  organization_id: 'org-1',
  label: 'Anticipo',
  amount: 15000,
  due_date: '2026-09-01',
  status: 'pending',
  receipt_url: null,
  tracking_reference: null,
  transferred_amount: null,
  confirmed_at: null,
  created_at: '2026-08-01T00:00:00Z',
  client_name: 'Constructora Río Bravo',
  client_phone: '8187654321',
  client_email: undefined,
  contract_title: 'Obra Nave 2',
  public_token: 'paytoken123',
} as MilestoneWithClient;

describe('ReceivableCard reminder phone (#44)', () => {
  it('links the WhatsApp reminder to the phone on record', () => {
    render(<ReceivableCard milestone={BASE_MILESTONE} todayStr="2026-08-07" />);

    const reminder = screen.getByRole('link', { name: /Recordar WhatsApp/i });
    expect(reminder.getAttribute('href')).toContain('8187654321');
    expect(reminder.getAttribute('href')).not.toContain('8115551234');
  });

  it('disables the reminder — and dials nobody — when the client has no phone', () => {
    render(
      <ReceivableCard
        milestone={{ ...BASE_MILESTONE, client_phone: undefined } as MilestoneWithClient}
        todayStr="2026-08-07"
      />
    );

    expect(screen.queryByRole('link', { name: /Recordar WhatsApp/i })).toBeNull();
    const disabled = screen.getByRole('button', { name: /Agrega un teléfono/i });
    expect(disabled).toBeDisabled();
    // The fallback number must not appear anywhere in the rendered output.
    expect(document.body.innerHTML).not.toContain('8115551234');
  });
});

/**
 * #64 — neither share action may hand out a /pay/ link the organization cannot
 * be paid through. Without a CLABE that page answers 409 in front of the
 * client, so the card refuses at the point of sharing instead.
 */
describe('ReceivableCard share actions without a settlement account (#64)', () => {
  it('shares freely when the organization has an account', () => {
    render(<ReceivableCard milestone={BASE_MILESTONE} todayStr="2026-08-07" canShare />);

    expect(screen.getByRole('link', { name: /Recordar WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Portal SPEI/i })).toHaveAttribute(
      'href',
      '/pay/paytoken123'
    );
  });

  it('offers no shareable link at all when the CLABE is missing', () => {
    render(<ReceivableCard milestone={BASE_MILESTONE} todayStr="2026-08-07" canShare={false} />);

    expect(screen.queryByRole('link', { name: /Recordar WhatsApp/i })).toBeNull();
    // Rendered as a disabled control rather than a link: this is the URL the
    // owner would copy and send.
    expect(screen.queryByRole('link', { name: /Portal SPEI/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Portal SPEI/i })).toBeDisabled();
    expect(document.body.innerHTML).not.toContain('/pay/paytoken123');
  });

  it('names the CLABE as the blocker, not the phone number', () => {
    // The reason has to point at the record the owner must actually fix.
    render(<ReceivableCard milestone={BASE_MILESTONE} todayStr="2026-08-07" canShare={false} />);

    expect(screen.getByRole('button', { name: /CLABE/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Agrega un teléfono/i })).toBeNull();
  });

  it('still shares when the settlement state is unknown', () => {
    // The default keeps the page usable while the organization read is in
    // flight or has failed; the server gate refuses regardless.
    render(<ReceivableCard milestone={BASE_MILESTONE} todayStr="2026-08-07" />);

    expect(screen.getByRole('link', { name: /Portal SPEI/i })).toBeInTheDocument();
  });
});
