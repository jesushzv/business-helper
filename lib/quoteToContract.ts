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

export interface ContractResult {
  contract: {
    id: string;
    organization_id: string;
    quote_id: string;
    client_id: string;
    title: string;
    scope_description: string;
    total_amount: number;
    currency: string;
    status: string;
    accepted_at: string;
    created_at: string;
  };
  milestones: Array<{
    id: string;
    organization_id: string;
    contract_id: string;
    label: string;
    amount: number;
    due_date: string;
    status: string;
    created_at: string;
  }>;
}

export function convertQuoteToContract(quote: QuoteData, splitRatio: number[] = [0.5, 0.5]): ContractResult {
  const now = new Date().toISOString();
  const contractId = `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const total = Number(quote.total_amount) || 0;

  const contract = {
    id: contractId,
    organization_id: quote.organization_id,
    quote_id: quote.id,
    client_id: quote.client_id,
    title: quote.title,
    scope_description: `Contrato derivado de cotización: ${quote.title}`,
    total_amount: total,
    currency: quote.currency || 'MXN',
    status: 'client_signed',
    accepted_at: now,
    created_at: now,
  };

  const dueNow = new Date();
  const due30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const milestones = [
    {
      id: `m_${Date.now()}_1`,
      organization_id: quote.organization_id,
      contract_id: contractId,
      label: `Anticipo (${Math.round(splitRatio[0] * 100)}%)`,
      amount: Math.round(total * splitRatio[0] * 100) / 100,
      due_date: dueNow.toISOString().split('T')[0],
      status: 'pending',
      created_at: now,
    },
    {
      id: `m_${Date.now()}_2`,
      organization_id: quote.organization_id,
      contract_id: contractId,
      label: `Entrega Final (${Math.round(splitRatio[1] * 100)}%)`,
      amount: Math.round(total * splitRatio[1] * 100) / 100,
      due_date: due30Days.toISOString().split('T')[0],
      status: 'pending',
      created_at: now,
    },
  ];

  return { contract, milestones };
}
