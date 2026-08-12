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
  // Unknown is not zero. `credit_limit` is nullable with no default, so a
  // client nobody has assessed must not read as one deliberately authorized for
  // $0 — and its status must not read as a green "Activo" the owner never
  // chose. Only a stored number counts as configured (#64's tri-state rule
  // applied to a column; #96 is where the collapsed version shipped).
  const rawLimit = client?.credit_limit;
  const hasLimit =
    rawLimit !== null && rawLimit !== undefined && Number.isFinite(Number(rawLimit));

  const status = client?.credit_status ?? null;

  // A status counts as configuration on its own. The two columns are
  // independent, so an owner who blocked a client without ever setting a limit
  // has made a real decision — keying `isConfigured` off the limit alone hid
  // that block behind "sin línea de crédito asignada" while the quote wizard
  // still refused the sale, leaving two screens disagreeing.
  const isConfigured = hasLimit || status !== null;

  const totalLimit = hasLimit ? Math.max(0, Number(rawLimit)) : 0;

  const rawDays = client?.credit_days;
  const creditDays =
    rawDays === null || rawDays === undefined || !Number.isFinite(Number(rawDays))
      ? null
      : Math.max(0, Number(rawDays));

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

  // Money actually owed is a real fact whether or not a limit was set, so it is
  // still reported — the UI just must not frame it as utilization of a line
  // that does not exist.
  const usedCredit = activeReceivables.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  const availableCredit = hasLimit ? Math.max(0, totalLimit - usedCredit) : 0;
  const isOverLimit = hasLimit && totalLimit > 0 && usedCredit > totalLimit;
  const utilizationPercentage =
    hasLimit && totalLimit > 0
      ? Math.min(100, Math.round((usedCredit / totalLimit) * 100))
      : 0;

  return {
    isConfigured,
    hasLimit,
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
  creditStatus: 'active' | 'suspended' | 'blocked' | null = 'active'
): { isAllowed: boolean; isExceeding: boolean; warningMessage: string | null } {
  // No credit line configured: there is no limit to exceed and no restriction
  // the owner has declared, so quoting proceeds without inventing a warning.
  // Permissive is the safe direction for unknown here — this gate only advises,
  // it is not the enforcement point for anything.
  if (creditStatus === null) {
    return { isAllowed: true, isExceeding: false, warningMessage: null };
  }

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

export type ClientCreditGateResult =
  | { ok: true }
  | { ok: false; status: 403; code: 'CLIENT_CREDIT_BLOCKED'; message: string };

/**
 * The server half of the credit gate (#203).
 *
 * `blocked` is the one credit state the server refuses rather than advises on:
 * the owner personally marked the client as "solo contado", and a quote for
 * them is almost always someone else in the organization not knowing. Over-limit
 * and `suspended` stay warnings in the wizard — extending trust is the owner's
 * call, and `validateQuoteCreditLimit` above words those cases.
 *
 * A read that fails answers "unknown" and does NOT refuse — the same posture as
 * the trial gate (#64's tri-state rule): this gate exists to stop the blocked
 * case, not to make quote creation depend on one more read succeeding.
 */
export async function checkClientCreditGate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  clientId: unknown
): Promise<ClientCreditGateResult> {
  if (typeof clientId !== 'string' || !clientId) return { ok: true };

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('name, credit_status')
      // Scoped by organization as well as id, so a by-id lookup cannot read
      // another tenant's row (API convention 3).
      .eq('id', clientId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error || !data) return { ok: true };

    if (data.credit_status === 'blocked') {
      return {
        ok: false,
        status: 403,
        code: 'CLIENT_CREDIT_BLOCKED',
        message:
          `El crédito de ${data.name} está bloqueado por mora o decisión comercial, ` +
          'así que solo se permiten ventas de contado. Puedes cambiar su estado de crédito en la ficha del cliente.',
      };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
