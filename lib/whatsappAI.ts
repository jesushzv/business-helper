/**
 * WhatsApp AI Operations Assistant & Automated Support Router Engine — Business Helper
 * 
 * Natural language query parser for business owners (Don Roberto / Lic. Mariana)
 * answering queries on WhatsApp or mobile web about overdue debt, payments, client totals,
 * and product support FAQs (Quotes, SPEI, SAT CFDI 4.0, Branding, RBAC).
 * Includes cost safeguards, tier quotas, input sanitization, sliding-window rate limiting,
 * and automated Meta/Twilio WhatsApp webhook challenge verification.
 */

import { FAQ_ITEMS, searchFAQItems, FAQItem } from './helpFAQ';

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
  demo: 20,
  inicial: 50,
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

export function sanitizeAIQuery(query: string = '', maxLength: number = 300): string {
  if (!query || typeof query !== 'string') return '';
  // Remove control characters and trim whitespace
  const sanitized = query.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return sanitized.slice(0, maxLength);
}

export function validateAIQuota(tierKey: string = 'demo', currentUsage: number = 0): AIQuotaResult {
  // 'demo' here is a quota tier key, not an identifier a tenant can tap.
  const normalizedTier = tierKey ? tierKey.toLowerCase() : 'demo';
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

export function matchFAQSupportQuery(query: string = ''): FAQItem | null {
  const clean = query.toLowerCase().trim();
  if (!clean) return null;

  // Direct match using searchFAQItems
  const matches = searchFAQItems(clean);
  if (matches.length > 0) {
    return matches[0];
  }

  // Keyword heuristic matching
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

export function buildAIPromptContext(query: string, clients: Array<{ name: string; phone?: string; totalOverdue: number }>) {
  const cleanQuery = sanitizeAIQuery(query, 300);
  const summary = clients
    .map((c) => `- Cliente: ${c.name}, Teléfono: ${c.phone || 'N/A'}, Saldo Vencido: $${c.totalOverdue.toLocaleString('es-MX')} MXN`)
    .join('\n');
  return `Eres el Asistente de Operaciones y Cobranza WhatsApp de Business Helper para negocios en México.
Responde de forma concisa, profesional y con montos en MXN.

Datos de clientes y adeudos:
${summary}

Pregunta del usuario: "${cleanQuery}"`;
}

export function buildAISupportPromptContext(query: string, matchedFAQ?: FAQItem | null): string {
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

/** The shape `parseNaturalLanguageQuery` returns; the model rewrites only its prose. */
export interface RulesAnswer {
  query: string;
  intent: string;
  matchedClient: string | null;
  totalOverdue: number;
  answerText: string;
  whatsappUrl: string;
}

/**
 * Prompt for the model half of the assistant. Every figure the model may use
 * is computed deterministically first (per-client totals from the tenant's own
 * rows, plus the rules engine's own answer) and pinned in the prompt — the
 * model writes prose around verified numbers, it never produces one. That
 * division is what keeps hard rule #1 intact with an LLM in the loop.
 */
export function buildGroundedAssistantPrompt(query: string, rules: RulesAnswer, orgData: AIOrgData = {}): string {
  const cleanQuery = sanitizeAIQuery(query, 300);
  const clients = orgData.clients || [];
  const receivables = orgData.receivables || [];

  const perClient = clients.map((client) => {
    const total = receivables
      .filter((r) => r.clientId === client.id)
      .reduce((acc, r) => acc + (r.amount || 0), 0);
    return `- ${client.name}: $${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN pendientes`;
  });
  const totalPending = receivables.reduce((acc, r) => acc + (r.amount || 0), 0);

  return `Eres el Asistente de Operaciones y Cobranza de Business Helper para un negocio en México.

Reglas estrictas:
- Usa ÚNICAMENTE las cifras y clientes listados abajo. Nunca inventes montos, clientes, fechas ni promesas.
- Si los datos no alcanzan para responder, dilo con claridad.
- Responde en español de México, tono claro y profesional, máximo 3 oraciones, montos en MXN.
- No uses formato Markdown.

Datos verificados del negocio:
${perClient.length > 0 ? perClient.join('\n') : '- (sin clientes registrados)'}
- Total por cobrar: $${totalPending.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN

Respuesta calculada por el sistema: "${rules.answerText}"

Pregunta del dueño: "${cleanQuery}"`;
}

export function verifyWebhookChallenge(
  receivedToken: string,
  expectedToken: string = 'business_helper_verify_token',
  challenge: string = ''
): { status: number; challenge?: string; error?: string } {
  if (receivedToken && receivedToken === expectedToken) {
    return { status: 200, challenge };
  }
  return { status: 403, error: 'Forbidden: Invalid verify token' };
}

export function parseNaturalLanguageQuery(query: string, orgData: AIOrgData = {}) {
  const sanitizedQuery = sanitizeAIQuery(query, 300);
  const cleanQuery = sanitizedQuery.toLowerCase();
  const clients = orgData.clients || [];
  const receivables = orgData.receivables || [];

  // 1. Check for Human Handoff Intent
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

  // 2. Check for App Support FAQ Intent
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

  // 3. Match client name for overdue balance.
  //
  // A query naming "salinas" used to synthesize a "Grupo Salinas" client with a
  // fixed phone number when no client matched, so an owner asking about a
  // company they had never entered got a balance and a WhatsApp link for it.
  // Only the organization's own clients are matched now.
  const matchedClient = clients.find((c) => c.name && cleanQuery.includes(c.name.toLowerCase()));

  if (matchedClient) {
    const clientReceivables = receivables.filter(
      (r) => r.clientId === matchedClient?.id || (r.clientName && r.clientName.toLowerCase().includes(matchedClient?.name.toLowerCase() || ''))
    );
    const totalOverdue = clientReceivables.reduce((acc, r) => acc + (r.amount || 0), 0);

    const answerText = `El cliente ${matchedClient.name} tiene un saldo pendiente de $${totalOverdue.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN.`;
    const messagePayload = encodeURIComponent(`Hola ${matchedClient.name}, le compartimos su estado de cuenta actualizado con saldo pendiente de $${totalOverdue.toLocaleString()} MXN.`);

    // A client with no phone on file used to fall back to a fixed number
    // (8112223344), so the reminder button opened a chat with a stranger. The
    // link now opens the WhatsApp share sheet with no recipient instead.
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

  // 4. General cash flow / receivables fallback
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
