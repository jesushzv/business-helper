/**
 * Pre-Saved Product & Service Catalog Manager — Business Helper
 * 
 * Manages standard products/services with SAT unit keys ('E48') and product codes ('84111506')
 * for fast line-item selection during quote creation.
 */

export interface ProductCatalogItem {
  id?: string;
  name: string;
  description?: string | null;
  unit_price: number;
  unit?: string;
  sat_product_code?: string;
  stock_quantity?: number | null;
}

export function validateProductCatalogItem(item: ProductCatalogItem): {
  isValid: boolean;
  unit: string;
  sat_product_code: string;
  errors: string[];
} {
  const errors: string[] = [];

  if (!item || typeof item !== 'object') {
    return {
      isValid: false,
      unit: 'E48',
      sat_product_code: '84111506',
      errors: ['Producto inválido']
    };
  }

  if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
    errors.push('Nombre del producto o servicio es requerido');
  }

  const price = Number(item.unit_price);
  if (isNaN(price) || price <= 0) {
    errors.push('Precio unitario debe ser un número mayor a 0');
  }

  const unit = item.unit && item.unit.trim().length > 0 ? item.unit.trim().toUpperCase() : 'E48';
  const sat_product_code =
    item.sat_product_code && item.sat_product_code.trim().length > 0
      ? item.sat_product_code.trim()
      : '84111506';

  return {
    isValid: errors.length === 0,
    unit,
    sat_product_code,
    errors
  };
}

export function formatProductAsLineItem(product: ProductCatalogItem, quantity: number = 1) {
  const qty = Math.max(1, Number(quantity) || 1);
  const price = Math.max(0, Number(product.unit_price) || 0);

  return {
    description: product.name,
    quantity: qty,
    unit_price: price,
    unit: product.unit || 'E48',
    sat_product_code: product.sat_product_code || '84111506',
    total: Math.round(qty * price * 100) / 100
  };
}
