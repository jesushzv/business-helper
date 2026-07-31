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

  const milestones = [];
  let allocatedAmount = 0;

  for (let i = 0; i < ratio.length; i++) {
    const isLast = i === ratio.length - 1;
    const isFirst = i === 0;
    const ratioVal = ratio[i];
    
    let amt;
    if (isLast) {
      amt = Math.round((total - allocatedAmount) * 100) / 100;
    } else {
      amt = Math.round(total * ratioVal * 100) / 100;
      allocatedAmount += amt;
    }

    const dueDate = isFirst ? dueNow : due30Days;
    const label = isFirst 
      ? 'Anticipo (' + Math.round(ratioVal * 100) + '%)' 
      : 'Entrega Final (' + Math.round(ratioVal * 100) + '%)';

    milestones.push({
      id: 'm_' + Date.now() + '_' + (i + 1),
      organization_id: quote.organization_id,
      contract_id: contractId,
      label: label,
      amount: amt,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'pending',
      created_at: now,
    });
  }

  return { contract: contract, milestones: milestones };
}

module.exports = {
  convertQuoteToContract: convertQuoteToContract,
};
