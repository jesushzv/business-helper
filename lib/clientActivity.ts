/**
 * Business Helper — Client Activity Timeline Feed Transformer
 * 
 * Combines quotes sent, contracts signed, and milestone payments into a
 * chronological activity timeline for client detail views.
 */

export interface ActivityItem {
  id: string;
  type: 'quote' | 'contract' | 'payment';
  title: string;
  description: string;
  status: string;
  date: string;
  timestamp: number;
  amount?: number;
  metadata?: Record<string, unknown>;
}

export function formatClientActivity(
  quotes?: Array<Record<string, unknown>> | null,
  contracts?: Array<Record<string, unknown>> | null,
  milestones?: Array<Record<string, unknown>> | null
): ActivityItem[] {
  const items: ActivityItem[] = [];

  if (quotes && Array.isArray(quotes)) {
    for (const q of quotes) {
      const createdAt = String(q.created_at || new Date().toISOString());
      items.push({
        id: `quote-${q.id || Math.random()}`,
        type: 'quote',
        title: `Cotización: ${q.title || 'Sin Título'}`,
        description: `Monto total: $${Number(q.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
        status: String(q.status || 'draft'),
        date: createdAt,
        timestamp: new Date(createdAt).getTime(),
        amount: Number(q.total_amount || 0),
        metadata: q,
      });
    }
  }

  if (contracts && Array.isArray(contracts)) {
    for (const c of contracts) {
      const createdAt = String(c.created_at || new Date().toISOString());
      items.push({
        id: `contract-${c.id || Math.random()}`,
        type: 'contract',
        title: `Contrato: ${c.title || 'Acuerdo de Servicio'}`,
        description: `Estado del contrato: ${c.status || 'activo'}`,
        status: String(c.status || 'draft'),
        date: createdAt,
        timestamp: new Date(createdAt).getTime(),
        amount: Number(c.total_amount || 0),
        metadata: c,
      });
    }
  }

  if (milestones && Array.isArray(milestones)) {
    for (const m of milestones) {
      const eventDate = String(m.confirmed_at || m.created_at || new Date().toISOString());
      const status = String(m.status || 'pending');

      let title = `Hito Pendiente: ${m.label || 'Hito de Pago'}`;
      if (status === 'confirmed') {
        title = `Pago Recibido: ${m.label || 'Hito de Pago'}`;
      } else if (status === 'marked_paid' || status === 'requested') {
        title = `Comprobante Recibido: ${m.label || 'Hito de Pago'}`;
      }

      items.push({
        id: `milestone-${m.id || Math.random()}`,
        type: 'payment',
        title,
        description: status === 'confirmed'
          ? `Importe pagado: $${Number(m.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`
          : `Monto del hito: $${Number(m.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`,
        status,
        date: eventDate,
        timestamp: new Date(eventDate).getTime(),
        amount: Number(m.amount || 0),
        metadata: m,
      });
    }
  }

  // Sort descending by timestamp (newest first)
  return items.sort((a, b) => b.timestamp - a.timestamp);
}
