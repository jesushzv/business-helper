/**
 * Business Helper — Multi-Currency Engine (USD / MXN)
 * 
 * Manages currency formatting, exchange rate conversions, and multi-currency aggregations
 * for international B2B quotes and contracts.
 */

export type CurrencyCode = 'MXN' | 'USD';

export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['MXN', 'USD'];
export const DEFAULT_EXCHANGE_RATE_USD_MXN = 18.50;

export interface CurrencyFormatOptions {
  showIsoCode?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * Formats monetary amounts with ISO currency codes (e.g., "$1,500.00 MXN", "$100.00 USD")
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode | string = 'MXN',
  options: CurrencyFormatOptions = {}
): string {
  const num = Number(amount) || 0;
  const curr = (currency || 'MXN').toUpperCase() as CurrencyCode;
  const locale = curr === 'USD' ? 'en-US' : 'es-MX';
  
  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });

  const symbol = '$';
  const showIso = options.showIsoCode !== false;
  return `${symbol}${formatted}${showIso ? ` ${curr}` : ''}`;
}

/**
 * Converts monetary amount from one currency to another using the provided exchange rate
 */
export function convertCurrency(
  amount: number,
  fromCurrency: CurrencyCode | string = 'MXN',
  toCurrency: CurrencyCode | string = 'MXN',
  exchangeRate: number = DEFAULT_EXCHANGE_RATE_USD_MXN
): number {
  const num = Number(amount) || 0;
  const from = (fromCurrency || 'MXN').toUpperCase();
  const to = (toCurrency || 'MXN').toUpperCase();

  if (from === to) return Math.round(num * 100) / 100;

  if (from === 'USD' && to === 'MXN') {
    return Math.round(num * exchangeRate * 100) / 100;
  }

  if (from === 'MXN' && to === 'USD') {
    return Math.round((num / exchangeRate) * 100) / 100;
  }

  return Math.round(num * 100) / 100;
}

/**
 * Aggregates an array of multi-currency items into a single base currency total
 */
export function aggregateMultiCurrencyTotals(
  items: Array<{ amount: number; currency?: string }>,
  baseCurrency: CurrencyCode | string = 'MXN',
  exchangeRate: number = DEFAULT_EXCHANGE_RATE_USD_MXN
): number {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const total = items.reduce((acc, item) => {
    const itemCurrency = item.currency || 'MXN';
    const converted = convertCurrency(item.amount, itemCurrency, baseCurrency, exchangeRate);
    return acc + converted;
  }, 0);

  return Math.round(total * 100) / 100;
}
