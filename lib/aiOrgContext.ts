/**
 * Tenant context for the assistant.
 *
 * `/api/ai/assistant` answered every query against a fixed two-client ledger
 * ("Construcciones Maya" owing 75,000, "Grupo Salinas" owing 45,000). A real
 * owner asking what a client owed them got a confident number belonging to
 * nobody. The assistant now reads the caller's own clients and open milestones.
 *
 * The rules engine computes every figure from these records; when Gemini is
 * configured it writes only the prose around them, and each response carries
 * `engine: 'rules' | 'gemini'` for whichever actually wrote the text.
 */

import type { AIOrgData } from './whatsappAI';
import { collectedAmount, expectedSettlementAmount } from './receivablesCalculator';

/** Milestone states that still represent money owed to the organization. */
const OPEN_MILESTONE_STATUSES = ['pending', 'requested', 'marked_paid'];

interface MilestoneContextRow {
  id: string;
  label: string;
  amount: number | string;
  /** Required, and nullable — see `MilestoneItem.transferred_amount` (#351). */
  transferred_amount: number | string | null;
  cfdi_total?: number | string | null;
  cfdi_status?: string | null;
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
  const [{ data: clients }, { data: milestones }, { data: confirmed }] = await Promise.all([
    supabase
      .from('clients')
      // Archived clients are kept, with the flag (#337). "¿Cuánto me debe X?"
      // must still answer for a client who left the directory but not the
      // ledger — archiving is visibility, not a soft delete — while the
      // assistant's roster of people to follow up with must not list them.
      .select('id, name, phone, archived_at')
      .eq('organization_id', organizationId),
    supabase
      .from('milestones')
      .select(
        'id, label, amount, transferred_amount, cfdi_total, cfdi_status, ' +
          'status, due_date, contracts(client_id)'
      )
      .eq('organization_id', organizationId)
      .in('status', OPEN_MILESTONE_STATUSES),
    // Confirmed payments, for "¿cuánto hemos cobrado?" (#274): the context
    // used to hold only open milestones, so the question was answered with the
    // por-cobrar total — the semantic opposite of what was asked.
    supabase
      .from('milestones')
      // What arrived, not what was billed (#351). `whatsappAI` sums this for
      // "¿Cuánto hemos cobrado este mes?" and labels the answer `engine:
      // 'rules'` — a computed fact. Summing `amount` made that fact an
      // overstatement for every partially-paid cobro.
      .select(
        'id, amount, transferred_amount, cfdi_total, cfdi_status, ' +
          'status, confirmed_at, contracts(client_id)'
      )
      .eq('organization_id', organizationId)
      .eq('status', 'confirmed'),
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
      // What this cobro must be paid to be settled — the stamped total when
      // there is a live document, else the contractual amount (#341). These
      // rows are all open, so nothing has been collected against them yet.
      amount: expectedSettlementAmount(m),
      status: m.status,
      label: m.label,
      // Carried through since #274: the due-today intent filters on it.
      due_date: m.due_date ?? null,
    })),
    collected: (confirmed || []).map((m: MilestoneContextRow & { confirmed_at?: string | null }) => ({
      clientId: contractClientId(m),
      // What arrived, clamped to what was owed — not what was billed (#351).
      amount: collectedAmount(m),
      confirmed_at: m.confirmed_at ?? null,
    })),
  };
}
