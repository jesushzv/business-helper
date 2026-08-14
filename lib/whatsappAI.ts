/**
 * WhatsApp AI Operations Assistant & Automated Support Router Engine — Business Helper
 * 
 * Natural language query parser for business owners (Don Roberto / Lic. Mariana)
 * answering queries on WhatsApp or mobile web about overdue debt, payments, client totals,
 * and product support FAQs (Quotes, SPEI, SAT CFDI 4.0, Branding, RBAC).
 * Includes cost safeguards, tier quotas, input sanitization, sliding-window rate limiting,
 * and automated Meta/Twilio WhatsApp webhook challenge verification.
 */

import { productMonthStr, productTodayStr } from './dates';
import { FAQ_ITEMS, searchFAQItems, FAQItem, faqCategoryLabel, getSupportWhatsAppNumber } from './helpFAQ';
import { generateWhatsAppLink } from './whatsappLink';

export interface AIOrgData {
  clients?: Array<{ id: string; name: string; phone?: string | null }>;
  receivables?: Array<{ id?: string; clientId?: string; clientName?: string; amount: number; status: string; label?: string; due_date?: string | null }>;
  /** Confirmed payments, for the "¿cuánto hemos cobrado?" intent (#274). */
  collected?: Array<{ clientId?: string; amount: number; confirmed_at?: string | null }>;
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

const mxn = (value: number) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

/** Per-client open balances, largest first — the fact three intents share. */
function rankClientBalances(orgData: AIOrgData) {
  const clients = orgData.clients || [];
  const receivables = orgData.receivables || [];
  return clients
    .map((client) => ({
      client,
      total: receivables
        .filter(
          (r) =>
            r.clientId === client.id ||
            (r.clientName && r.clientName.toLowerCase().includes(client.name.toLowerCase()))
        )
        .reduce((acc, r) => acc + (r.amount || 0), 0),
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
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
    // The line is configuration, not a literal (#296): with one set, the
    // button opens that chat; with none, the answer promises no live transfer
    // it cannot make — it names the channel that does exist.
    const supportPhone = getSupportWhatsAppNumber();
    const encodedMsg = encodeURIComponent(`Solicitud de Asistencia Humana: "${sanitizedQuery}"`);
    const whatsappUrl = supportPhone ? `https://wa.me/${supportPhone}?text=${encodedMsg}` : '';
    const answerText = supportPhone
      ? 'Te estamos transfiriendo con un especialista de nuestro equipo de soporte humano por WhatsApp. Puedes iniciar el chat directo presionando el botón.'
      : 'Con gusto te conectamos con una persona: escríbenos a soporte@businesshelper.app contando tu caso y te respondemos por correo.';

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

  // 2. Match client name for overdue balance — BEFORE the FAQ heuristic.
  //
  // A query naming "salinas" used to synthesize a "Grupo Salinas" client with a
  // fixed phone number when no client matched, so an owner asking about a
  // company they had never entered got a balance and a WhatsApp link for it.
  // Only the organization's own clients are matched now.
  //
  // Ordered above the FAQ matcher (#274): a client named "Facturas del Norte"
  // must resolve as the client, not as the Facturapi how-to.
  const matchedClient = clients.find((c) => c.name && cleanQuery.includes(c.name.toLowerCase()));

  if (matchedClient) {
    const clientReceivables = receivables.filter(
      (r) => r.clientId === matchedClient?.id || (r.clientName && r.clientName.toLowerCase().includes(matchedClient?.name.toLowerCase() || ''))
    );
    const totalOverdue = clientReceivables.reduce((acc, r) => acc + (r.amount || 0), 0);

    const answerText = `El cliente ${matchedClient.name} tiene un saldo pendiente de ${mxn(totalOverdue)}.`;
    const reminderText = `Hola ${matchedClient.name}, le compartimos su estado de cuenta actualizado con saldo pendiente de $${totalOverdue.toLocaleString()} MXN.`;

    // generateWhatsAppLink owns phone normalization (#257): the hand-rolled
    // `startsWith('52')` check here prefixed 52 onto E.164 numbers that
    // already carry +52, so every real tenant's reminder opened wa.me/5252….
    // A client with no phone on file gets the share sheet with no recipient,
    // never a stranger's number.
    const whatsappUrl = matchedClient.phone
      ? generateWhatsAppLink(matchedClient.phone, reminderText)
      : `https://wa.me/?text=${encodeURIComponent(reminderText)}`;

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

  // 3. The data intents the assistant's own chips ask (#274). Each computes
  // from the context deterministically; before these existed, "¿cuánto hemos
  // cobrado?" was answered with the por-cobrar total — the semantic opposite —
  // and "facturas pendientes" was hijacked by the FAQ keyword `factura` into a
  // Facturapi how-to.

  // 3a. Collected: "¿Cuánto hemos cobrado este mes?"
  if (/\bcobrad|\bcobramos\b|hemos cobrado|llevamos cobrado/.test(cleanQuery)) {
    const collected = orgData.collected || [];
    // "Este mes" is the product's month, and both sides are read through the
    // same zone: the server's own month is UTC's, and `getMonth()` on a parsed
    // `confirmed_at` is the server's local month again — so a payment confirmed
    // at 19:00 on the last day of the month fell out of the total the tenant
    // was asking about (#334).
    const thisMonth = productMonthStr();
    const monthly = collected.filter((c) => {
      if (!c.confirmed_at) return false;
      const at = new Date(c.confirmed_at);
      return !Number.isNaN(at.getTime()) && productMonthStr(at) === thisMonth;
    });
    const total = monthly.reduce((acc, c) => acc + (c.amount || 0), 0);
    const answerText =
      monthly.length > 0
        ? `Este mes has confirmado ${monthly.length} ${monthly.length === 1 ? 'pago' : 'pagos'} por un total de ${mxn(total)}.`
        : 'Este mes todavía no has confirmado ningún pago. Cuando confirmes un cobro en Cobranza, aparecerá aquí.';
    return {
      query: sanitizedQuery,
      intent: 'collected_this_month',
      matchedClient: null,
      matchedFAQ: null,
      requiresHumanHandoff: false,
      totalOverdue: 0,
      answerText,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(answerText)}`,
    };
  }

  // 3b. Due today: "¿Cuáles pagos vencen hoy?"
  if (/vencen? hoy|para hoy/.test(cleanQuery)) {
    const today = productTodayStr();
    const dueToday = receivables.filter((r) => (r.due_date || '').substring(0, 10) === today);
    const total = dueToday.reduce((acc, r) => acc + (r.amount || 0), 0);
    const names = dueToday
      .map((r) => clients.find((c) => c.id === r.clientId)?.name || r.label || 'Cobro')
      .slice(0, 3);
    const answerText =
      dueToday.length > 0
        ? `Hoy vencen ${dueToday.length} ${dueToday.length === 1 ? 'cobro' : 'cobros'} por ${mxn(total)}: ${names.join(', ')}${dueToday.length > 3 ? '…' : '.'}`
        : 'Hoy no vence ningún cobro registrado.';
    return {
      query: sanitizedQuery,
      intent: 'due_today',
      matchedClient: null,
      matchedFAQ: null,
      requiresHumanHandoff: false,
      totalOverdue: total,
      answerText,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(answerText)}`,
    };
  }

  // 3c. Who owes / pending by client: "¿Qué cliente me debe más?",
  // "¿Qué clientes tienen facturas pendientes?" — must win over the FAQ
  // heuristic, whose `factura` keyword hijacked the second one.
  const asksWhoOwes = /debe m[aá]s|qui[eé]n (me )?debe|deben (m[aá]s|dinero)/.test(cleanQuery);
  const asksPendingList = /(factura|pago|cobro|saldo)s? pendiente/.test(cleanQuery) && /cliente|qui[eé]n/.test(cleanQuery);

  if (asksWhoOwes || asksPendingList) {
    const ranked = rankClientBalances(orgData);
    if (ranked.length === 0) {
      const answerText = 'Ninguno de tus clientes tiene saldo pendiente registrado.';
      return {
        query: sanitizedQuery,
        intent: asksWhoOwes ? 'top_debtor' : 'pending_by_client',
        matchedClient: null,
        matchedFAQ: null,
        requiresHumanHandoff: false,
        totalOverdue: 0,
        answerText,
        whatsappUrl: `https://wa.me/?text=${encodeURIComponent(answerText)}`,
      };
    }

    const top = ranked[0];
    const answerText = asksWhoOwes
      ? `Tu cliente con mayor saldo pendiente es ${top.client.name}, con ${mxn(top.total)}.`
      : `${ranked.length} ${ranked.length === 1 ? 'cliente tiene' : 'clientes tienen'} saldo pendiente: ${ranked
          .slice(0, 3)
          .map((e) => `${e.client.name} (${mxn(e.total)})`)
          .join(', ')}${ranked.length > 3 ? '…' : '.'}`;
    const reminderText = `Hola ${top.client.name}, le compartimos su estado de cuenta actualizado con saldo pendiente de $${top.total.toLocaleString()} MXN.`;

    return {
      query: sanitizedQuery,
      intent: asksWhoOwes ? 'top_debtor' : 'pending_by_client',
      matchedClient: top.client.name,
      matchedFAQ: null,
      requiresHumanHandoff: false,
      totalOverdue: asksWhoOwes ? top.total : ranked.reduce((acc, e) => acc + e.total, 0),
      answerText,
      whatsappUrl: top.client.phone
        ? generateWhatsAppLink(top.client.phone, reminderText)
        : `https://wa.me/?text=${encodeURIComponent(answerText)}`,
    };
  }

  // 4. App Support FAQ Intent — after the data intents, so a keyword like
  // `factura` inside a question about the tenant's own numbers cannot hijack
  // the answer into a how-to (#274).
  const matchedFAQ = matchFAQSupportQuery(sanitizedQuery);
  if (matchedFAQ) {
    const supportPhone = getSupportWhatsAppNumber();
    const encodedMsg = encodeURIComponent(`Consulta Soporte AI: ${matchedFAQ.question}`);
    const whatsappUrl = supportPhone ? `https://wa.me/${supportPhone}?text=${encodedMsg}` : '';

    return {
      query: sanitizedQuery,
      intent: 'app_support_faq',
      matchedClient: null,
      matchedFAQ,
      requiresHumanHandoff: false,
      totalOverdue: 0,
      // The category as copy ("Facturación SAT"), not the raw uppercased slug
      // the screen used to open with (#274).
      answerText: `📌 ${faqCategoryLabel(matchedFAQ.category)}:\n\n${matchedFAQ.answer}`,
      whatsappUrl,
    };
  }

  // 5. General cash flow / receivables fallback
  const totalDebt = receivables.reduce((acc, r) => acc + (r.amount || 0), 0);
  const answerText = `Actualmente tienes un total por cobrar de ${mxn(totalDebt)} registrado en tus hitos.`;
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
