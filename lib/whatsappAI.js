/**
 * WhatsApp AI Operations Assistant & Automated Support Router Engine — CommonJS JS
 */

/* eslint-disable */

const { FAQ_ITEMS, searchFAQItems } = require('./helpFAQ.js');

const TIER_AI_QUOTAS = {
  demo: 20,
  emprendedor: 50,
  negocio: 300,
  empresa: 1500,
};

const rateLimitMap = new Map();

function checkRateLimit(identifier = 'anon', maxPerMinute = 5) {
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

function sanitizeAIQuery(query = '', maxLength = 300) {
  if (!query || typeof query !== 'string') return '';
  const sanitized = query.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return sanitized.slice(0, maxLength);
}

function validateAIQuota(tierKey = 'demo', currentUsage = 0) {
  const normalizedTier = (tierKey || 'demo').toLowerCase();
  const limit = TIER_AI_QUOTAS[normalizedTier] ?? TIER_AI_QUOTAS.demo;

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

function matchFAQSupportQuery(query = '') {
  const clean = query.toLowerCase().trim();
  if (!clean) return null;

  const matches = searchFAQItems(clean);
  if (matches.length > 0) {
    return matches[0];
  }

  if (clean.includes('cotiza') || clean.includes('propuesta')) {
    return FAQ_ITEMS.find((f) => f.id === 'cot-1') || null;
  }
  if (clean.includes('spei') || clean.includes('comprobante') || clean.includes('transferencia')) {
    return FAQ_ITEMS.find((f) => f.id === 'cob-1') || null;
  }
  if (clean.includes('sat') || clean.includes('cfdi') || clean.includes('factura')) {
    return FAQ_ITEMS.find((f) => f.id === 'fac-1') || null;
  }
  if (clean.includes('contador') || clean.includes('zip') || clean.includes('csv')) {
    return FAQ_ITEMS.find((f) => f.id === 'fac-2') || null;
  }
  if (clean.includes('logo') || clean.includes('marca') || clean.includes('color')) {
    return FAQ_ITEMS.find((f) => f.id === 'cue-1') || null;
  }
  if (clean.includes('equipo') || clean.includes('rol') || clean.includes('permiso')) {
    return FAQ_ITEMS.find((f) => f.id === 'cue-2') || null;
  }

  return null;
}

function buildAIPromptContext(query, clients) {
  const cleanQuery = sanitizeAIQuery(query, 300);
  const summary = (clients || [])
    .map((c) => `- Cliente: ${c.name}, Teléfono: ${c.phone || 'N/A'}, Saldo Vencido: $${c.totalOverdue.toLocaleString('es-MX')} MXN`)
    .join('\n');
  return `Eres el Asistente de Operaciones y Cobranza WhatsApp de Business Helper para negocios en México.
Responde de forma concisa, profesional y con montos en MXN.

Datos de clientes y adeudos:
${summary}

Pregunta del usuario: "${cleanQuery}"`;
}

function buildAISupportPromptContext(query, matchedFAQ) {
  const cleanQuery = sanitizeAIQuery(query, 300);
  const faqText = matchedFAQ
    ? `Respuesta FAQ Relevante:\nPregunta: ${matchedFAQ.question}\nRespuesta: ${matchedFAQ.answer}`
    : 'No hay FAQ exacta asociada.';

  return `Eres el Asistente de IA de Soporte Técnico y Atención al Cliente de Business Helper.
Tu objetivo es resolver dudas de dueños de negocios en México sobre cotizaciones, cobranza SPEI, facturación SAT CFDI 4.0, personalización de marca y gestión de equipos.

Contexto FAQ:
${faqText}

Pregunta del usuario: "${cleanQuery}"
Responde de forma amable, clara y en español neutro (para México).`;
}

function verifyWebhookChallenge(receivedToken, expectedToken = 'business_helper_verify_token', challenge = '') {
  if (receivedToken && receivedToken === expectedToken) {
    return { status: 200, challenge };
  }
  return { status: 403, error: 'Forbidden: Invalid verify token' };
}

function parseNaturalLanguageQuery(query, orgData = {}) {
  const sanitizedQuery = sanitizeAIQuery(query, 300);
  const cleanQuery = sanitizedQuery.toLowerCase();
  const clients = (orgData && orgData.clients) || [];
  const receivables = (orgData && orgData.receivables) || [];

  // 1. Human Handoff Intent
  const humanKeywords = ['humano', 'asesor', 'persona', 'soporte tecnico', 'soporte técnico', 'atención humana', 'hablar con alguien'];
  const isHumanRequest = humanKeywords.some((k) => cleanQuery.includes(k));

  if (isHumanRequest) {
    const supportPhone = '528180000000';
    const encodedMsg = encodeURIComponent(`Solicitud de Asistencia Humana: "${sanitizedQuery}"`);
    const whatsappUrl = `https://wa.me/${supportPhone}?text=${encodedMsg}`;
    const answerText = 'Te estamos transfiriendo con un especialista de nuestro equipo de soporte humano por WhatsApp. Puedes iniciar el chat directo presionando el botón.';

    return {
      query: sanitizedQuery,
      intent: 'human_handoff_request',
      matchedClient: null,
      matchedFAQ: null,
      requiresHumanHandoff: true,
      totalOverdue: 0,
      answerText,
      whatsappUrl,
    };
  }

  // 2. App Support FAQ Intent
  const matchedFAQ = matchFAQSupportQuery(sanitizedQuery);
  if (matchedFAQ) {
    const supportPhone = '528180000000';
    const encodedMsg = encodeURIComponent(`Consulta Soporte AI: ${matchedFAQ.question}`);
    const whatsappUrl = `https://wa.me/${supportPhone}?text=${encodedMsg}`;

    return {
      query: sanitizedQuery,
      intent: 'app_support_faq',
      matchedClient: null,
      matchedFAQ,
      requiresHumanHandoff: false,
      totalOverdue: 0,
      answerText: `📌 Categoría ${matchedFAQ.category.toUpperCase()}:\n\n${matchedFAQ.answer}`,
      whatsappUrl,
    };
  }

  // 3. Client overdue balance query
  // Only the organization's own clients are matched; a query naming "salinas"
  // used to synthesize a "Grupo Salinas" client with a fixed phone number.
  const matchedClient = clients.find((c) => c.name && cleanQuery.includes(c.name.toLowerCase()));

  if (matchedClient) {
    const clientReceivables = receivables.filter(
      (r) => r.clientId === matchedClient?.id || (r.clientName && r.clientName.toLowerCase().includes(matchedClient?.name.toLowerCase() || ''))
    );
    const totalOverdue = clientReceivables.reduce((acc, r) => acc + (r.amount || 0), 0);

    const answerText = `El cliente ${matchedClient.name} tiene un saldo pendiente de $${totalOverdue.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN.`;
    const messagePayload = encodeURIComponent(`Hola ${matchedClient.name}, le compartimos su estado de cuenta actualizado con saldo pendiente de $${totalOverdue.toLocaleString()} MXN.`);

    // No phone on file means no recipient, not a fixed fallback number.
    const clientPhone = matchedClient.phone;
    const rawPhone = clientPhone
      ? (clientPhone.startsWith('52') ? clientPhone : `52${clientPhone.replace(/\D/g, '')}`)
      : '';
    const whatsappUrl = `https://wa.me/${rawPhone}?text=${messagePayload}`;

    return {
      query: sanitizedQuery,
      intent: 'client_overdue_balance',
      matchedClient: matchedClient.name,
      matchedFAQ: null,
      requiresHumanHandoff: false,
      totalOverdue,
      answerText,
      whatsappUrl,
    };
  }

  // 4. General receivables summary
  const totalDebt = receivables.reduce((acc, r) => acc + (r.amount || 0), 0);
  const answerText = `Actualmente tienes un total por cobrar de $${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN registrado en tus hitos.`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(answerText)}`;

  return {
    query: sanitizedQuery,
    intent: 'general_receivables_summary',
    matchedClient: null,
    matchedFAQ: null,
    requiresHumanHandoff: false,
    totalOverdue: totalDebt,
    answerText,
    whatsappUrl,
  };
}

module.exports = {
  TIER_AI_QUOTAS,
  checkRateLimit,
  sanitizeAIQuery,
  validateAIQuota,
  matchFAQSupportQuery,
  buildAIPromptContext,
  buildAISupportPromptContext,
  verifyWebhookChallenge,
  parseNaturalLanguageQuery,
};
