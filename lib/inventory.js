/**
 * Inventory Stock Tracking & Alerts Engine — CommonJS JS
 */

function evaluateStockStatus(stockQuantity) {
  if (stockQuantity === null || stockQuantity === undefined) {
    return {
      isLowStock: false,
      alertBadge: 'Servicio / Infinito',
      level: 'ok'
    };
  }

  const stock = Number(stockQuantity);
  if (stock <= 0) {
    return {
      isLowStock: true,
      alertBadge: 'Aviso Stock Bajo: Agotado (0 unidades)',
      level: 'critical'
    };
  }

  if (stock <= 5) {
    return {
      isLowStock: true,
      alertBadge: `Aviso Stock Bajo: Quedan ${stock} unidades`,
      level: 'warning'
    };
  }

  return {
    isLowStock: false,
    alertBadge: `Stock Disponible: ${stock} unidades`,
    level: 'ok'
  };
}

function deductStock(currentStock, quantitySold) {
  if (currentStock === null || currentStock === undefined) return 0;
  const curr = Math.max(0, Number(currentStock) || 0);
  const sold = Math.max(0, Number(quantitySold) || 0);
  return Math.max(0, curr - sold);
}

module.exports = {
  evaluateStockStatus,
  deductStock
};
