export interface QuoteData {
  id: string;
  organization_id: string;
  client_id: string;
  title: string;
  total_amount: number;
  currency?: string;
  status: string;
  line_items?: Array<{ description: string; quantity: number; unit_price: number }>;
}

/**
 * Insert-shaped rows: no `id`, no `created_at`, no `contract_id`.
 *
 * `contracts.id` and `milestones.id` are `uuid DEFAULT gen_random_uuid()`, so
 * the fabricated `c_…`/`m_…` text ids this used to emit failed every insert
 * with 22P02 — no quote ever became a contract against the live schema (#214).
 * The database owns the ids and timestamps; a milestone's `contract_id` cannot
 * be known before the contract row exists, so the convert route pins it from
 * the row the insert returns.
 */
export interface ContractResult {
  contract: {
    organization_id: string;
    quote_id: string;
    client_id: string;
    title: string;
    scope_description: string;
    total_amount: number;
    currency: string;
    status: string;
    accepted_at: string;
  };
  milestones: Array<{
    organization_id: string;
    label: string;
    amount: number;
    due_date: string;
    status: string;
  }>;
}

export function convertQuoteToContract(quote: QuoteData, splitRatio: number[] = [0.5, 0.5]): ContractResult {
  const total = Number(quote.total_amount) || 0;

  const contract = {
    organization_id: quote.organization_id,
    quote_id: quote.id,
    client_id: quote.client_id,
    title: quote.title,
    scope_description: `Contrato derivado de cotización: ${quote.title}`,
    total_amount: total,
    currency: quote.currency || 'MXN',
    status: 'client_signed',
    accepted_at: new Date().toISOString(),
  };

  const dueNow = new Date();
  const due30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const milestones: ContractResult['milestones'] = [];
  let allocatedAmount = 0;

  for (let i = 0; i < splitRatio.length; i++) {
    const isLast = i === splitRatio.length - 1;
    const isFirst = i === 0;
    const ratioVal = splitRatio[i];

    let amt: number;
    if (isLast) {
      amt = Math.round((total - allocatedAmount) * 100) / 100;
    } else {
      amt = Math.round(total * ratioVal * 100) / 100;
      allocatedAmount += amt;
    }

    const dueDate = isFirst ? dueNow : due30Days;
    const label = isFirst
      ? `Anticipo (${Math.round(ratioVal * 100)}%)`
      : `Entrega Final (${Math.round(ratioVal * 100)}%)`;

    milestones.push({
      organization_id: quote.organization_id,
      label,
      amount: amt,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'pending',
    });
  }

  return { contract, milestones };
}
