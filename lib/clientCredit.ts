/**
 * Business Helper — Client Trade Credit Management & Validation Engine
 */

import { ClientCreditSummary } from '@/types';

export interface MilestoneRecordInput {
  clientId?: string | null;
  client_id?: string | null;
  amount?: number | null;
  status?: string | null;
}

export interface ClientCreditInput {
  id?: string;
  credit_limit?: number | null;
  credit_days?: number | null;
  credit_status?: 'active' | 'suspended' | 'blocked' | null;
}

export function calculateClientCreditSummary(
  client?: ClientCreditInput | null,
  receivables: MilestoneRecordInput[] = []
): ClientCreditSummary {
  const totalLimit = Math.max(0, Number(client?.credit_limit) || 0);
  const creditDays = Number(client?.credit_days) || 0;
  const status = client?.credit_status || 'active';

  const clientId = client?.id;

  // Credit is consumed by receivables that are still owed. Only an
  // owner-CONFIRMED payment releases it: `marked_paid` is the payer's own
  // unverified declaration on the public portal, so counting it as settled
  // would let a client free their whole credit line by declaring transfers the
  // owner never received (money-path review of #96). Whether a declared
  // payment should ever release credit early is a product decision; the
  // fail-closed default is no.
  const activeReceivables = receivables.filter((r) => {
    const rClientId = r.clientId || r.client_id;
    if (clientId && rClientId && rClientId !== clientId) {
      return false;
    }
    const st = (r.status || '').toLowerCase();
    return st === 'pending' || st === 'requested' || st === 'marked_paid';
  });

  const usedCredit = activeReceivables.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  const availableCredit = Math.max(0, totalLimit - usedCredit);
  const isOverLimit = totalLimit > 0 && usedCredit > totalLimit;
  const utilizationPercentage =
    totalLimit > 0 ? Math.min(100, Math.round((usedCredit / totalLimit) * 100)) : 0;

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

export function validateQuoteCreditLimit(
  quoteTotal: number,
  availableCredit: number,
  creditStatus: 'active' | 'suspended' | 'blocked' = 'active'
): { isAllowed: boolean; isExceeding: boolean; warningMessage: string | null } {
  if (creditStatus === 'blocked') {
    return {
      isAllowed: false,
      isExceeding: true,
      warningMessage:
        '🔴 Cliente con crédito bloqueado por mora o decisión comercial. Solo se permiten ventas de contado.',
    };
  }

  if (creditStatus === 'suspended') {
    return {
      isAllowed: true,
      isExceeding: false,
      warningMessage:
        '⚠️ El crédito de este cliente está suspendido temporalmente. Requiere autorización explícita.',
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
