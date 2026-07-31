/**
 * Inventory Stock Tracking & Alerts Engine — Business Helper
 * 
 * Tracks inventory levels and evaluates low-stock warning thresholds (<= 5 units).
 */

export interface StockStatusResult {
  isLowStock: boolean;
  alertBadge: string;
  level: 'ok' | 'warning' | 'critical';
}

export function evaluateStockStatus(stockQuantity: number | null | undefined): StockStatusResult {
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

export function deductStock(currentStock: number | null, quantitySold: number): number {
  if (currentStock === null || currentStock === undefined) return 0;
  const curr = Math.max(0, Number(currentStock) || 0);
  const sold = Math.max(0, Number(quantitySold) || 0);
  return Math.max(0, curr - sold);
}
