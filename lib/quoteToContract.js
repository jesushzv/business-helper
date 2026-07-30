/**
 * Quote-to-Contract Conversion Transformer (CommonJS)
 */

function convertQuoteToContract(quote, splitRatio) {
  const ratio = splitRatio || [0.5, 0.5];
  const now = new Date().toISOString();
  const contractId = 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const total = Number(quote.total_amount) || 0;

  const contract = {
    id: contractId,
    organization_id: quote.organization_id,
    quote_id: quote.id,
    client_id: quote.client_id,
    title: quote.title,
    scope_description: 'Contrato derivado de cotización: ' + quote.title,
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
      id: 'm_' + Date.now() + '_1',
      organization_id: quote.organization_id,
      contract_id: contractId,
      label: 'Anticipo (' + Math.round(ratio[0] * 100) + '%)',
      amount: Math.round(total * ratio[0] * 100) / 100,
      due_date: dueNow.toISOString().split('T')[0],
      status: 'pending',
      created_at: now,
    },
    {
      id: 'm_' + Date.now() + '_2',
      organization_id: quote.organization_id,
      contract_id: contractId,
      label: 'Entrega Final (' + Math.round(ratio[1] * 100) + '%)',
      amount: Math.round(total * ratio[1] * 100) / 100,
      due_date: due30Days.toISOString().split('T')[0],
      status: 'pending',
      created_at: now,
    },
  ];

  return { contract: contract, milestones: milestones };
}

module.exports = {
  convertQuoteToContract: convertQuoteToContract,
};
