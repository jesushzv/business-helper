/**
 * Tenant context for the assistant.
 *
 * `/api/ai/assistant` answered every query against a fixed two-client ledger
 * ("Construcciones Maya" owing 75,000, "Grupo Salinas" owing 45,000). A real
 * owner asking what a client owed them got a confident number belonging to
 * nobody. The assistant now reads the caller's own clients and open milestones.
 *
 * This is deterministic keyword matching over those records, not a language
 * model — responses carry `engine: 'rules'` so no caller has to guess.
 */

import type { AIOrgData } from './whatsappAI';

/** Milestone states that still represent money owed to the organization. */
const OPEN_MILESTONE_STATUSES = ['pending', 'requested', 'marked_paid'];

interface MilestoneContextRow {
  id: string;
  label: string;
  amount: number | string;
  status: string;
  due_date: string;
  contracts?: { client_id?: string | null } | Array<{ client_id?: string | null }> | null;
}

function contractClientId(row: MilestoneContextRow): string | undefined {
  const contract = Array.isArray(row.contracts) ? row.contracts[0] : row.contracts;
  return contract?.client_id ?? undefined;
}

/**
 * Loads the clients and outstanding milestones the assistant may reason about.
 *
 * Returns empty collections on a query error rather than throwing: the
 * assistant then answers "$0 por cobrar", which is the honest reading of "we
 * could not find anything", and never invents a balance to fill the gap.
 */
export async function loadAIOrgContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string
): Promise<AIOrgData> {
  const [{ data: clients }, { data: milestones }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, phone')
      .eq('organization_id', organizationId),
    supabase
      .from('milestones')
      .select('id, label, amount, status, due_date, contracts(client_id)')
      .eq('organization_id', organizationId)
      .in('status', OPEN_MILESTONE_STATUSES),
  ]);

  return {
    clients: (clients || []).map((c: { id: string; name: string; phone?: string | null }) => ({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
    })),
    receivables: (milestones || []).map((m: MilestoneContextRow) => ({
      id: m.id,
      clientId: contractClientId(m),
      amount: typeof m.amount === 'string' ? Number(m.amount) : m.amount,
      status: m.status,
      label: m.label,
    })),
  };
}
