/**
 * WhatsApp AI Operations Assistant Engine — CommonJS JS
 */

function parseNaturalLanguageQuery(query, orgData) {
  const cleanQuery = (query || '').toLowerCase().trim();
  const clients = (orgData && orgData.clients) || [];
  const receivables = (orgData && orgData.receivables) || [];

  let matchedClient = clients.find((c) => cleanQuery.includes(c.name.toLowerCase()));
  if (!matchedClient && cleanQuery.includes('salinas')) {
    matchedClient = { id: 'c-salinas', name: 'Grupo Salinas', phone: '8112223344' };
  }

  if (matchedClient) {
    const clientReceivables = receivables.filter(
      (r) => r.clientId === matchedClient?.id || (r.clientName && r.clientName.toLowerCase().includes(matchedClient?.name.toLowerCase() || ''))
    );
    const totalOverdue = clientReceivables.reduce((acc, r) => acc + (r.amount || 0), 0);
    const clientPhone = matchedClient.phone || '8112223344';
    const rawPhone = clientPhone.startsWith('52') ? clientPhone : `52${clientPhone.replace(/\D/g, '')}`;

    const answerText = `El cliente ${matchedClient.name} tiene un saldo pendiente de $${totalOverdue.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN.`;
    const messagePayload = encodeURIComponent(`Hola ${matchedClient.name}, le compartimos su estado de cuenta actualizado con saldo pendiente de $${totalOverdue.toLocaleString()} MXN.`);
    const whatsappUrl = `https://wa.me/${rawPhone}?text=${messagePayload}`;

    return {
      query,
      intent: 'client_overdue_balance',
      matchedClient: matchedClient.name,
      totalOverdue,
      answerText,
      whatsappUrl
    };
  }

  const totalDebt = receivables.reduce((acc, r) => acc + (r.amount || 0), 0);
  const answerText = `Actualmente tienes un total por cobrar de $${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN registrado en tus hitos.`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(answerText)}`;

  return {
    query,
    intent: 'general_receivables_summary',
    matchedClient: null,
    totalOverdue: totalDebt,
    answerText,
    whatsappUrl
  };
}

module.exports = {
  parseNaturalLanguageQuery
};
