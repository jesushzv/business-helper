// eslint-disable-next-line @typescript-eslint/no-var-requires
/**
 * Business Helper — Client Trade Credit Management & Validation Engine
 */

function calculateClientCreditSummary(client, receivables = []) {
  const totalLimit = Math.max(0, Number(client?.credit_limit) || 0);
  const creditDays = Number(client?.credit_days) || 0;
  const status = client?.credit_status || 'active';

  const clientId = client?.id;

  const activeReceivables = receivables.filter((r) => {
    const rClientId = r.clientId || r.client_id;
    if (clientId && rClientId && rClientId !== clientId) {
      return false;
    }
    const st = (r.status || '').toLowerCase();
    return st === 'pending' || st === 'requested';
  });

  const usedCredit = activeReceivables.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  const availableCredit = Math.max(0, totalLimit - usedCredit);
  const isOverLimit = totalLimit > 0 && usedCredit > totalLimit;
  const utilizationPercentage = totalLimit > 0 ? Math.min(100, Math.round((usedCredit / totalLimit) * 100)) : 0;

  return {
    totalLimit,
    usedCredit,
    availableCredit,
    creditDays,
    status,
    isOverLimit,
    utilizationPercentage,
  };
}

function validateQuoteCreditLimit(quoteTotal, availableCredit, creditStatus = 'active') {
  if (creditStatus === 'blocked') {
    return {
      isAllowed: false,
      isExceeding: true,
      warningMessage: '🔴 Cliente con crédito bloqueado por mora o decisión comercial. Solo se permiten ventas de contado.',
    };
  }

  if (creditStatus === 'suspended') {
    return {
      isAllowed: true,
      isExceeding: false,
      warningMessage: '⚠️ El crédito de este cliente está suspendido temporalmente. Requiere autorización explícita.',
    };
  }

  if (availableCredit > 0 && quoteTotal > availableCredit) {
    const formattedTotal = quoteTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    const formattedAvail = availableCredit.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    return {
      isAllowed: true,
      isExceeding: true,
      warningMessage: `⚠️ El monto total de la cotización ($${formattedTotal} MXN) excede el crédito disponible del cliente ($${formattedAvail} MXN).`,
    };
  }

  return {
    isAllowed: true,
    isExceeding: false,
    warningMessage: null,
  };
}

module.exports = {
  calculateClientCreditSummary,
  validateQuoteCreditLimit,
};
