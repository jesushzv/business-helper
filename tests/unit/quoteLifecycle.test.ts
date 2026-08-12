import { describe, it, expect } from 'vitest';
import { calculateQuoteTotals } from '@/lib/quoteCalculator';
import { generatePublicToken } from '@/lib/quoteToken';
import { convertQuoteToContract } from '@/lib/quoteToContract';

describe('Quote Line-Item & SAT Tax Calculator', () => {
  it('aggregates multi-line items and applies 16% IVA', () => {
    const totals = calculateQuoteTotals(
      [
        { description: 'Desarrollo Web', quantity: 1, unit_price: 10000 },
        { description: 'Hosting Anual', quantity: 2, unit_price: 1500 },
      ],
      { applyIva: true, applyRetencionIsr: false, applyRetencionIva: false }
    );

    expect(totals.subtotal).toBe(13000);
    expect(totals.ivaAmount).toBe(2080);
    expect(totals.retencionIsrAmount).toBe(0);
    expect(totals.totalAmount).toBe(15080);
  });

  it('applies RESICO withholdings (10% ISR and 10.6667% IVA)', () => {
    const totals = calculateQuoteTotals(
      [{ description: 'Servicios Profesionales', quantity: 1, unit_price: 20000 }],
      { applyIva: true, applyRetencionIsr: true, applyRetencionIva: true }
    );

    expect(totals.subtotal).toBe(20000);
    expect(totals.ivaAmount).toBe(3200);
    expect(totals.retencionIsrAmount).toBe(2000);
    expect(totals.retencionIvaAmount).toBe(2133.34);
    expect(totals.totalAmount).toBe(19066.66);
  });

  it('rounds fractional unit prices to two decimals before taxing', () => {
    const totals = calculateQuoteTotals(
      [
        { description: 'Varilla', quantity: 10, unit_price: 150.5 },
        { description: 'Cemento', quantity: 5, unit_price: 200 },
      ],
      { applyIva: true }
    );

    expect(totals.subtotal).toBe(2505);
    expect(totals.ivaAmount).toBe(400.8);
    expect(totals.totalAmount).toBe(2905.8);
  });
});

describe('Public Quote Token Generator', () => {
  it('generates a unique 32-character hexadecimal token', () => {
    const first = generatePublicToken();
    const second = generatePublicToken();

    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
  });
});

describe('Quote-to-Contract Conversion', () => {
  const acceptedQuote = {
    id: 'q_123',
    organization_id: 'org_456',
    client_id: 'client_789',
    title: 'Cotización Sitio Web',
    total_amount: 20000,
    currency: 'MXN',
    status: 'accepted',
    line_items: [{ description: 'Desarrollo Web', quantity: 1, unit_price: 20000 }],
  };

  it('carries the quote, organization and client onto the contract', () => {
    const { contract } = convertQuoteToContract(acceptedQuote);

    expect(contract.quote_id).toBe('q_123');
    expect(contract.organization_id).toBe('org_456');
    expect(contract.client_id).toBe('client_789');
    expect(contract.total_amount).toBe(20000);
    expect(contract.status).toBe('client_signed');
  });

  it('splits the total into a 50/50 anticipo and entrega final by default', () => {
    const { milestones } = convertQuoteToContract(acceptedQuote);

    expect(milestones).toHaveLength(2);
    expect(milestones[0].label).toBe('Anticipo (50%)');
    expect(milestones[0].amount).toBe(10000);
    expect(milestones[1].label).toBe('Entrega Final (50%)');
    expect(milestones[1].amount).toBe(10000);
  });

  it('assigns the remainder to the last milestone so no cent is lost', () => {
    const { contract, milestones } = convertQuoteToContract(
      { ...acceptedQuote, total_amount: 100.01 },
      [0.5, 0.5]
    );

    const summed = Math.round(milestones.reduce((acc, m) => acc + m.amount, 0) * 100) / 100;
    expect(summed).toBe(contract.total_amount);
  });

  // #214 — `contracts.id` and `milestones.id` are `uuid DEFAULT gen_random_uuid()`
  // in the live schema, so a fabricated `c_…`/`m_…` text id fails every insert
  // with 22P02 and no quote could ever become a contract. The rows must be
  // insert-shaped: the database owns the ids and timestamps, and a milestone's
  // contract_id cannot be known before the contract row exists.
  it('does not fabricate identifiers or timestamps the database owns (#214)', () => {
    const { contract, milestones } = convertQuoteToContract(acceptedQuote);

    expect(contract).not.toHaveProperty('id');
    expect(contract).not.toHaveProperty('created_at');
    for (const milestone of milestones) {
      expect(milestone).not.toHaveProperty('id');
      expect(milestone).not.toHaveProperty('contract_id');
      expect(milestone).not.toHaveProperty('created_at');
    }
  });

  it('keeps a three-way split exact against the contract total', () => {
    const { milestones } = convertQuoteToContract(
      { ...acceptedQuote, total_amount: 2905.8 },
      [0.33, 0.33, 0.34]
    );

    const summed = milestones.reduce((acc, m) => acc + m.amount, 0);
    expect(Math.abs(summed - 2905.8)).toBeLessThan(0.001);
  });
});
