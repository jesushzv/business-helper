/**
 * Business Helper — Multi-Currency Engine (CommonJS)
 */

const SUPPORTED_CURRENCIES = ['MXN', 'USD'];
const DEFAULT_EXCHANGE_RATE_USD_MXN = 18.50;

function formatCurrency(amount, currency = 'MXN', options = {}) {
  const num = Number(amount) || 0;
  const curr = (currency || 'MXN').toUpperCase();
  const locale = curr === 'USD' ? 'en-US' : 'es-MX';
  
  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });

  const symbol = '$';
  const showIso = options.showIsoCode !== false;
  return `${symbol}${formatted}${showIso ? ` ${curr}` : ''}`;
}

function convertCurrency(amount, fromCurrency = 'MXN', toCurrency = 'MXN', exchangeRate = DEFAULT_EXCHANGE_RATE_USD_MXN) {
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

function aggregateMultiCurrencyTotals(items, baseCurrency = 'MXN', exchangeRate = DEFAULT_EXCHANGE_RATE_USD_MXN) {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const total = items.reduce((acc, item) => {
    const itemCurrency = item.currency || 'MXN';
    const converted = convertCurrency(item.amount, itemCurrency, baseCurrency, exchangeRate);
    return acc + converted;
  }, 0);

  return Math.round(total * 100) / 100;
}

module.exports = {
  SUPPORTED_CURRENCIES,
  DEFAULT_EXCHANGE_RATE_USD_MXN,
  formatCurrency,
  convertCurrency,
  aggregateMultiCurrencyTotals,
};
