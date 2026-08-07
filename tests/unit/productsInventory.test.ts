import { describe, it, expect } from 'vitest';
import { validateProductCatalogItem, formatProductAsLineItem } from '@/lib/products';
import { evaluateStockStatus, deductStock } from '@/lib/inventory';

describe('Pre-Saved Product & Service Catalog', () => {
  it('accepts a catalog item and keeps its SAT unit and product code', () => {
    const result = validateProductCatalogItem({
      name: 'Mantenimiento Mensual',
      unit_price: 2500,
      unit: 'E48',
      sat_product_code: '84111506',
    });

    expect(result.isValid).toBe(true);
    expect(result.unit).toBe('E48');
    expect(result.sat_product_code).toBe('84111506');
  });

  it('defaults the SAT unit and product code when the item omits them', () => {
    const result = validateProductCatalogItem({ name: 'Consultoría', unit_price: 900 });

    expect(result.unit).toBe('E48');
    expect(result.sat_product_code).toBe('84111506');
  });

  it('rejects a nameless item and a non-positive price', () => {
    const result = validateProductCatalogItem({ name: '', unit_price: -50 });

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('formats a catalog entry into a quote line item', () => {
    const item = formatProductAsLineItem(
      { id: 'p1', name: 'Varilla 1/2 pulgada', unit_price: 150, unit: 'H87', sat_product_code: '30101800' },
      20
    );

    expect(item).toMatchObject({
      description: 'Varilla 1/2 pulgada',
      quantity: 20,
      unit_price: 150,
      sat_product_code: '30101800',
      total: 3000,
    });
  });
});

describe('Inventory Stock Tracking & Low-Stock Alerts', () => {
  it('treats stock above the 5-unit threshold as normal', () => {
    expect(evaluateStockStatus(25).isLowStock).toBe(false);
  });

  it('raises a low-stock alert at or below 5 units', () => {
    const low = evaluateStockStatus(3);

    expect(low.isLowStock).toBe(true);
    expect(low.level).toBe('warning');
    expect(low.alertBadge).toContain('Aviso Stock Bajo');
  });

  it('treats zero stock as critical rather than merely low', () => {
    const zero = evaluateStockStatus(0);

    expect(zero.isLowStock).toBe(true);
    expect(zero.level).toBe('critical');
  });

  it('reports a service (null stock) as unlimited', () => {
    expect(evaluateStockStatus(null).isLowStock).toBe(false);
    expect(evaluateStockStatus(null).alertBadge).toBe('Servicio / Infinito');
  });

  it('deducts sold quantity and clamps at zero instead of going negative', () => {
    expect(deductStock(10, 3)).toBe(7);
    expect(deductStock(2, 5)).toBe(0);
  });

  it('leaves a service item (null stock) untracked', () => {
    expect(deductStock(null, 2)).toBeNull();
  });
});
