import { describe, it, expect } from 'vitest';
import { toMilestoneWithClient } from '@/lib/hooks/useReceivables';

/**
 * The Cobranza payment link, from the API row to the field the card reads.
 *
 * `/api/receivables` returns milestone rows with the client, the contract and
 * the quote nested under `contracts`. `useReceivables` assigned those rows
 * straight to `MilestoneWithClient`, whose flat `client_name` / `client_phone` /
 * `contract_title` / `public_token` fields existed only on the demo fixtures.
 * For a real tenant every one of them was undefined, and because every field is
 * optional it was not a type error — so the card rendered "Cliente no asignado"
 * for named clients, disabled the WhatsApp reminder as though no phone were on
 * file, and pointed "Portal SPEI" at `/pay/demo`.
 *
 * These assert the flattening, and in particular that a missing token stays
 * missing rather than becoming a placeholder that looks like a working link.
 */

const API_ROW = {
  id: 'milestone-1',
  organization_id: 'org-1',
  contract_id: 'contract-1',
  label: 'Anticipo 50%',
  amount: 48720,
  due_date: '2026-08-20',
  status: 'pending',
  receipt_url: null,
  tracking_reference: null,
  transferred_amount: null,
  confirmed_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  contracts: {
    title: 'Suministro de Cemento y Varilla',
    client_id: 'client-1',
    clients: {
      id: 'client-1',
      name: 'Construcciones Maya S.A. de C.V.',
      phone: '8115551234',
      email: 'contacto@construccionesmaya.mx',
    },
    quotes: { public_token: 'a1b2c3d4e5f678901234567890abcdef' },
  },
};

describe('toMilestoneWithClient', () => {
  it('flattens the client, contract title and quote token the card reads', () => {
    const row = toMilestoneWithClient(API_ROW);

    expect(row.client_name).toBe('Construcciones Maya S.A. de C.V.');
    expect(row.client_phone).toBe('8115551234');
    expect(row.client_email).toBe('contacto@construccionesmaya.mx');
    expect(row.client_id).toBe('client-1');
    expect(row.contract_title).toBe('Suministro de Cemento y Varilla');
    expect(row.public_token).toBe('a1b2c3d4e5f678901234567890abcdef');
  });

  it('keeps the milestone fields the summary and card read', () => {
    const row = toMilestoneWithClient(API_ROW);

    expect(row.id).toBe('milestone-1');
    expect(row.amount).toBe(48720);
    expect(row.due_date).toBe('2026-08-20');
    expect(row.status).toBe('pending');
  });

  it('drops the nested contracts blob rather than carrying it into state', () => {
    const row = toMilestoneWithClient(API_ROW) as unknown as Record<string, unknown>;
    expect(row.contracts).toBeUndefined();
  });

  it('unwraps a to-one embed that arrives as a one-element array', () => {
    const row = toMilestoneWithClient({
      ...API_ROW,
      contracts: [
        {
          title: 'Contrato A',
          clients: [{ id: 'c9', name: 'Cliente A', phone: '8110000000', email: null }],
          quotes: [{ public_token: 'token_from_array' }],
        },
      ],
    });

    expect(row.contract_title).toBe('Contrato A');
    expect(row.client_name).toBe('Cliente A');
    expect(row.public_token).toBe('token_from_array');
  });

  it('leaves public_token undefined when the contract has no quote — never a placeholder', () => {
    const row = toMilestoneWithClient({
      ...API_ROW,
      contracts: { ...API_ROW.contracts, quotes: null },
    });

    expect(row.public_token).toBeUndefined();
    // The specific values the card used to substitute. Either one produces a
    // link that resolves nothing and reads as live.
    expect(row.public_token).not.toBe('demo');
    expect(row.public_token).not.toBe('demo_token');
  });

  it('survives a row with no contract embedded at all', () => {
    const row = toMilestoneWithClient({ ...API_ROW, contracts: null });

    expect(row.id).toBe('milestone-1');
    expect(row.client_name).toBeUndefined();
    expect(row.contract_title).toBeUndefined();
    expect(row.public_token).toBeUndefined();
  });
});
