export interface QuoteData {
  id: string;
  organization_id: string;
  client_id: string;
  title: string;
  total_amount: number;
  currency?: string;
  status: string;
  line_items?: Array<{ description: string; quantity: number; unit_price: number }>;
  /**
   * OTP signature evidence, set on the quote row when the client signed it on
   * `/q/[token]`. Optional because the demo path builds a QuoteData by hand;
   * absent evidence stays absent on the contract (#215).
   */
  accepted_at?: string | null;
  accepted_by_name?: string | null;
  accepted_ip?: string | null;
  contract_hash?: string | null;
  client_otp_verified?: boolean;
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
    accepted_at: string | null;
    accepted_by_name: string | null;
    accepted_ip: string | null;
    contract_hash: string | null;
    client_otp_verified: boolean;
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
    // The signature evidence travels with the contract (#215). `client_signed`
    // is a legal claim, so it is derived from the evidence, never asserted:
    // a quote nobody OTP-verified becomes a draft contract. `accepted_at` is
    // the moment the client signed the quote — never the conversion time —
    // and a quote with no signature yields null evidence, not an invented one.
    status: quote.client_otp_verified ? 'client_signed' : 'draft',
    accepted_at: quote.accepted_at ?? null,
    accepted_by_name: quote.accepted_by_name ?? null,
    accepted_ip: quote.accepted_ip ?? null,
    contract_hash: quote.contract_hash ?? null,
    client_otp_verified: quote.client_otp_verified ?? false,
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
