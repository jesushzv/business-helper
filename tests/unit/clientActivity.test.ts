import { describe, it, expect } from 'vitest';
import { formatClientActivity } from '@/lib/clientActivity';

describe('Client Activity Feed Transformer', () => {
  it('merges quotes, contracts and milestones newest-first', () => {
    const activity = formatClientActivity(
      [
        {
          id: 'q1',
          title: 'Cotización Materiales',
          status: 'accepted',
          total_amount: 15000,
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
      [{ id: 'c1', title: 'Contrato Suministro', status: 'accepted', created_at: '2026-08-02T12:00:00Z' }],
      [
        {
          id: 'm1',
          label: 'Anticipo 50%',
          status: 'confirmed',
          amount: 7500,
          confirmed_at: '2026-08-03T15:00:00Z',
          created_at: '2026-08-02T12:00:00Z',
        },
      ]
    );

    expect(activity.map((item) => item.type)).toEqual(['payment', 'contract', 'quote']);
  });

  it('dates a payment by its confirmation, not its creation', () => {
    const [payment] = formatClientActivity(null, null, [
      {
        id: 'm1',
        label: 'Anticipo',
        status: 'confirmed',
        amount: 5000,
        created_at: '2026-08-01T00:00:00Z',
        confirmed_at: '2026-08-09T00:00:00Z',
      },
    ]);

    expect(payment.date).toBe('2026-08-09T00:00:00Z');
  });

  it('titles milestones by payment state', () => {
    const [pending] = formatClientActivity(null, null, [
      { id: 'm1', label: 'Anticipo', amount: 5000, status: 'pending' },
    ]);
    const [confirmed] = formatClientActivity(null, null, [
      { id: 'm2', label: 'Anticipo', amount: 5000, status: 'confirmed' },
    ]);
    const [awaiting] = formatClientActivity(null, null, [
      { id: 'm3', label: 'Anticipo', amount: 5000, status: 'marked_paid' },
    ]);

    expect(pending.title).toBe('Hito Pendiente: Anticipo');
    expect(confirmed.title).toBe('Pago Recibido: Anticipo');
    expect(awaiting.title).toBe('Comprobante Recibido: Anticipo');
  });

  it('returns an empty feed when the client has no records', () => {
    expect(formatClientActivity(null, null, null)).toEqual([]);
  });
});
