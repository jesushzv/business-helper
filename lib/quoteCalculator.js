/**
 * Quote Calculator & SAT Tax Aggregator Engine (CommonJS Build for Test Runner)
 */

function calculateQuoteTotals(items, options) {
  const opts = options || { applyIva: true, applyRetencionIsr: false, applyRetencionIva: false };
  const lineItems = items || [];

  const subtotal = lineItems.reduce(function (acc, item) {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unit_price) || 0;
    return acc + qty * price;
  }, 0);

  const roundedSubtotal = Math.round(subtotal * 100) / 100;

  const applyIva = opts.applyIva !== false;
  const iva = applyIva ? Math.round(roundedSubtotal * 0.16 * 100) / 100 : 0;
  const retIsr = opts.applyRetencionIsr ? Math.round(roundedSubtotal * 0.10 * 100) / 100 : 0;
  const retIva = opts.applyRetencionIva ? Math.round(roundedSubtotal * (10.6667 / 100) * 100) / 100 : 0;

  const total = Math.round((roundedSubtotal + iva - retIsr - retIva) * 100) / 100;

  return {
    subtotal: roundedSubtotal,
    ivaAmount: iva,
    retencionIsrAmount: retIsr,
    retencionIvaAmount: retIva,
    totalAmount: total,
  };
}

module.exports = {
  calculateQuoteTotals: calculateQuoteTotals,
};
