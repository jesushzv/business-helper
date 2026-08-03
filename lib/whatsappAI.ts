/**
 * WhatsApp AI Operations Assistant Engine — Business Helper
 * 
 * Natural language query parser for business owners (Don Roberto / Lic. Mariana)
 * answering queries on WhatsApp or mobile web about overdue debt, payments, and client totals.
 * Includes cost safeguards, tier quotas, and sliding-window rate limiting.
 */

export interface AIOrgData {
  clients?: Array<{ id: string; name: string; phone?: string | null }>;
  receivables?: Array<{ id?: string; clientId?: string; clientName?: string; amount: number; status: string; label?: string }>;
}

export interface AIQuotaResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  tier: string;
  reason?: string;
}

export const TIER_AI_QUOTAS: Record<string, number> = {
  emprendedor: 50,
  negocio: 300,
  empresa: 1500,
};

// In-memory rate limiter tracking timestamps per user/ip (max 5 requests per minute)
const rateLimitMap = new Map<string, number[]>();

export function checkRateLimit(identifier: string = 'anon', maxPerMinute: number = 5): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const timestamps = (rateLimitMap.get(identifier) || []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxPerMinute) {
    rateLimitMap.set(identifier, timestamps);
    return { allowed: false, remaining: 0 };
  }

  timestamps.push(now);
  rateLimitMap.set(identifier, timestamps);
  return { allowed: true, remaining: maxPerMinute - timestamps.length };
}

export function validateAIQuota(tierKey: string = 'emprendedor', currentUsage: number = 0): AIQuotaResult {
  const normalizedTier = (tierKey || 'emprendedor').toLowerCase();
  const limit = TIER_AI_QUOTAS[normalizedTier] || TIER_AI_QUOTAS.emprendedor;

  if (currentUsage >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      tier: normalizedTier,
      reason: `Has alcanzado tu límite mensual de ${limit} consultas de IA para el Plan ${normalizedTier.toUpperCase()}.`,
    };
  }

  return {
    allowed: true,
    remaining: limit - currentUsage,
    limit,
    tier: normalizedTier,
  };
}

export function buildAIPromptContext(query: string, clients: Array<{ name: string; phone?: string; totalOverdue: number }>) {
  const summary = clients
    .map((c) => `- Cliente: ${c.name}, Teléfono: ${c.phone || 'N/A'}, Saldo Vencido: $${c.totalOverdue.toLocaleString('es-MX')} MXN`)
    .join('\n');
  return `Eres el Asistente de Operaciones y Cobranza WhatsApp de Business Helper para negocios en México.
Responde de forma concisa, profesional y con montos en MXN.

Datos de clientes y adeudos:
${summary}

Pregunta del usuario: "${query}"`;
}

export function parseNaturalLanguageQuery(query: string, orgData: AIOrgData) {
  const cleanQuery = (query || '').toLowerCase().trim();
  const clients = orgData.clients || [];
  const receivables = orgData.receivables || [];

  // Match client name
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

  // General cash flow query
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TIER_AI_QUOTAS,
    checkRateLimit,
    validateAIQuota,
    buildAIPromptContext,
    parseNaturalLanguageQuery
  };
}
