/**
 * Pre-Saved Product & Service Catalog Manager — CommonJS JS
 */

function validateProductCatalogItem(item) {
  const errors = [];

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

  const unit = item.unit && String(item.unit).trim().length > 0 ? String(item.unit).trim().toUpperCase() : 'E48';
  const sat_product_code =
    item.sat_product_code && String(item.sat_product_code).trim().length > 0
      ? String(item.sat_product_code).trim()
      : '84111506';

  return {
    isValid: errors.length === 0,
    unit,
    sat_product_code,
    errors
  };
}

function formatProductAsLineItem(product, quantity = 1) {
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

module.exports = {
  validateProductCatalogItem,
  formatProductAsLineItem
};
