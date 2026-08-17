import { describe, it, expect } from 'vitest';
import {
  calculateQuoteTotals,
  normalizeQuoteTaxTreatment,
  QUOTE_TAX_TREATMENTS,
} from '@/lib/quoteCalculator';
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

  // #215 (option 1) — the OTP signature evidence lives on the quote row; a
  // contract claiming `client_signed` must carry it, and its accepted_at is
  // the moment the client signed, not the moment the tenant clicked convert.
  it('carries the signature evidence from the quote onto the contract (#215)', () => {
    const { contract } = convertQuoteToContract({
      ...acceptedQuote,
      accepted_at: '2026-08-11T04:57:49.418Z',
      accepted_by_name: 'Camila Chavez Calette',
      accepted_ip: '189.203.34.6',
      contract_hash: '7f671c6b91464a7bb20016ee03a15991',
      client_otp_verified: true,
    });

    expect(contract.accepted_at).toBe('2026-08-11T04:57:49.418Z');
    expect(contract.accepted_by_name).toBe('Camila Chavez Calette');
    expect(contract.accepted_ip).toBe('189.203.34.6');
    expect(contract.contract_hash).toBe('7f671c6b91464a7bb20016ee03a15991');
    expect(contract.client_otp_verified).toBe(true);
    expect(contract.status).toBe('client_signed');
  });

  it('does not invent evidence the quote does not have (#215)', () => {
    // Absent is absent: a quote with no signature yields null evidence, never
    // a fabricated timestamp or a true flag nothing verified.
    const { contract } = convertQuoteToContract(acceptedQuote);

    expect(contract.accepted_at).toBeNull();
    expect(contract.accepted_by_name).toBeNull();
    expect(contract.accepted_ip).toBeNull();
    expect(contract.contract_hash).toBeNull();
    expect(contract.client_otp_verified).toBe(false);
    // `client_signed` is a legal claim; with no verified signature the
    // contract is a draft, never a signature nobody performed.
    expect(contract.status).toBe('draft');
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

/**
 * #407 — the tenant states the tax category rather than the payload guessing it.
 *
 * The wizard's single IVA checkbox produced two states; CFDI 4.0 has three
 * (SAT Anexo 20 `TipoFactor`: Tasa 16%, Tasa 0%, Exento). `iva_amount = 0`
 * covered the last two indistinguishably, so `deriveCFDITaxTreatment` had to
 * guess — and guessed zero-rate.
 *
 * `applyIva` is kept working for callers that predate the choice, because the
 * quotes already in the database were created that way.
 */
describe('Quote tax treatment (#407)', () => {
  const items = [{ description: 'Servicio', quantity: 1, unit_price: 10000 }];

  it('charges 16% for the ordinary case', () => {
    const totals = calculateQuoteTotals(items, { taxTreatment: 'iva_16' });
    expect(totals.ivaAmount).toBe(1600);
    expect(totals.totalAmount).toBe(11600);
  });

  it('charges nothing for a zero-rated quote', () => {
    const totals = calculateQuoteTotals(items, { taxTreatment: 'tasa_0' });
    expect(totals.ivaAmount).toBe(0);
    expect(totals.totalAmount).toBe(10000);
  });

  it('charges nothing for an exempt quote either — the money is identical', () => {
    const totals = calculateQuoteTotals(items, { taxTreatment: 'exento' });
    expect(totals.ivaAmount).toBe(0);
    expect(totals.totalAmount).toBe(10000);
  });

  it('still honours applyIva when no treatment is stated', () => {
    expect(calculateQuoteTotals(items, { applyIva: false }).ivaAmount).toBe(0);
    expect(calculateQuoteTotals(items, { applyIva: true }).ivaAmount).toBe(1600);
  });

  it('lets the treatment win over a contradicting applyIva', () => {
    // The wizard sends the treatment; a stale applyIva must not override it.
    const totals = calculateQuoteTotals(items, { taxTreatment: 'exento', applyIva: true });
    expect(totals.ivaAmount).toBe(0);
  });
});

/**
 * The vocabulary the database enforces exists once in code, and anything
 * unrecognised becomes null rather than the nearest listed value (#95/#116 —
 * mapping `'free'` to the nearest tier is how unpaid tenants saw a $299 plan).
 */
describe('normalizeQuoteTaxTreatment (#407)', () => {
  it('accepts exactly the three values the CHECK constraint allows', () => {
    expect(normalizeQuoteTaxTreatment('iva_16')).toBe('iva_16');
    expect(normalizeQuoteTaxTreatment('tasa_0')).toBe('tasa_0');
    expect(normalizeQuoteTaxTreatment('exento')).toBe('exento');
  });

  it('returns null for anything else, including near misses', () => {
    expect(normalizeQuoteTaxTreatment('iva16')).toBeNull();
    expect(normalizeQuoteTaxTreatment('IVA_16')).toBe('iva_16'); // case is forgiven
    expect(normalizeQuoteTaxTreatment('exempt')).toBeNull();
    expect(normalizeQuoteTaxTreatment('tasa0')).toBeNull();
    expect(normalizeQuoteTaxTreatment('')).toBeNull();
    expect(normalizeQuoteTaxTreatment(null)).toBeNull();
    expect(normalizeQuoteTaxTreatment(undefined)).toBeNull();
  });

  it('exports the vocabulary the migration CHECK pins', () => {
    expect([...QUOTE_TAX_TREATMENTS].sort()).toEqual(['exento', 'iva_16', 'tasa_0']);
  });
});
