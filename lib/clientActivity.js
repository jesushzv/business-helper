/**
 * Business Helper — Client Activity Timeline Feed Transformer (CommonJS wrapper)
 */

function formatClientActivity(quotes, contracts, milestones) {
  const items = [];

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

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

module.exports = { formatClientActivity };
