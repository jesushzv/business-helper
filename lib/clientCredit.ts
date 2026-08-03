/**
 * Business Helper — Client Trade Credit Management & Validation Engine (TS Wrapper)
 */

import { ClientCreditSummary } from '@/types';

// @ts-expect-error JS file export
import clientCreditCore from './clientCredit.js';

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
  return clientCreditCore.calculateClientCreditSummary(client, receivables);
}

export function validateQuoteCreditLimit(
  quoteTotal: number,
  availableCredit: number,
  creditStatus: 'active' | 'suspended' | 'blocked' = 'active'
): { isAllowed: boolean; isExceeding: boolean; warningMessage: string | null } {
  return clientCreditCore.validateQuoteCreditLimit(quoteTotal, availableCredit, creditStatus);
}
