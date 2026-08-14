/**
 * MXN display formatting — the one place the es-MX currency format lives.
 *
 * Five components each carried their own `formatCurrency` closure while the
 * old multi-currency module sat unused (removed with it). This is
 * deliberately display-only: no conversion, no currency parameter — every
 * figure in the product is Mexican pesos.
 */

const FULL = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const WHOLE = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

export function formatMXN(amount: number, options: { wholePesos?: boolean } = {}): string {
  return (options.wholePesos ? WHOLE : FULL).format(amount);
}
