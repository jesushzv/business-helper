import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  checkRateLimit,
  sanitizeAIQuery,
  validateAIQuota,
  matchFAQSupportQuery,
  buildAIPromptContext,
  buildAISupportPromptContext,
  buildGroundedAssistantPrompt,
  parseNaturalLanguageQuery,
  TIER_AI_QUOTAS,
  type AIOrgData,
} from '@/lib/whatsappAI';

describe('AI monthly tier quotas', () => {
  it('allows a query while under the plan limit and reports what is left', () => {
    const result = validateAIQuota('inicial', TIER_AI_QUOTAS.inicial - 1);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('blocks once usage reaches the plan limit', () => {
    const result = validateAIQuota('inicial', TIER_AI_QUOTAS.inicial);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.reason).toContain('límite mensual');
  });

  it('gives higher tiers larger allowances', () => {
    expect(validateAIQuota('negocio', 100).remaining).toBe(TIER_AI_QUOTAS.negocio - 100);
    expect(TIER_AI_QUOTAS.empresa).toBeGreaterThan(TIER_AI_QUOTAS.negocio);
  });

  it('falls back to the demo allowance for an unknown tier', () => {
    expect(validateAIQuota('no_such_tier', 0).limit).toBe(TIER_AI_QUOTAS.demo);
  });
});

describe('AI cost safeguards', () => {
  it('truncates an oversized prompt to the character cap', () => {
    const sanitized = sanitizeAIQuery('¿Cuánto me debe Grupo Salinas? ' + 'x'.repeat(1000), 300);

    expect(sanitized).toHaveLength(300);
    expect(sanitized.startsWith('¿Cuánto me debe Grupo Salinas?')).toBe(true);
  });

  it('strips control characters and surrounding whitespace', () => {
    expect(sanitizeAIQuery('  hola\u0000 mundo  ')).toBe('hola mundo');
  });

  it('blocks the request past the per-minute rate limit', () => {
    const identifier = 'rate_limit_spec';

    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(identifier, 5).allowed).toBe(true);
    }

    expect(checkRateLimit(identifier, 5).allowed).toBe(false);
  });

  it('meters each caller separately', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('caller_a', 5);

    expect(checkRateLimit('caller_b', 5).allowed).toBe(true);
  });
});

describe('In-app AI support routing', () => {
  it('answers a product question from the FAQ catalogue', () => {
    const result = parseNaturalLanguageQuery('¿Cómo creo y envío una cotización?', {});

    expect(result.intent).toBe('app_support_faq');
    expect(result.matchedFAQ).not.toBeNull();
    expect(result.answerText).toContain('Cotizaciones:'); // the category as copy, not the raw slug (#274)
  });

  it('hands off to a human when one is asked for', () => {
    const result = parseNaturalLanguageQuery('Quiero hablar con un asesor humano', {});

    expect(result.intent).toBe('human_handoff_request');
    expect(result.requiresHumanHandoff).toBe(true);
  });

  it('matches SPEI and CFDI wording onto their FAQ entries', () => {
    expect(matchFAQSupportQuery('¿Cómo subo un comprobante SPEI?')).not.toBeNull();
    expect(matchFAQSupportQuery('')).toBeNull();
  });

  it('puts the matched FAQ into the support prompt context', () => {
    const prompt = buildAISupportPromptContext('¿Cómo subo un SPEI?', {
      id: 'cob-1',
      category: 'cobranza',
      question: 'SPEI',
      answer: 'Subir comprobante',
      tags: [],
    });

    expect(prompt).toContain('SPEI');
    expect(prompt).toContain('Subir comprobante');
  });

  it('puts client balances into the collections prompt context', () => {
    const prompt = buildAIPromptContext('¿Cuánto me debe Grupo Salinas?', [
      { name: 'Grupo Salinas', phone: '8112223344', totalOverdue: 45000 },
    ]);

    expect(prompt).toContain('Grupo Salinas');
    expect(prompt).toContain('45,000');
  });
});

describe('Grounded model prompt', () => {
  const orgData = {
    clients: [{ id: 'c1', name: 'Constructora Maya', phone: '8112223344' }],
    receivables: [{ clientId: 'c1', amount: 45000, status: 'pending' as const, label: 'Anticipo' }],
  };

  it('pins the tenant figures and the rules answer, and forbids inventing numbers', () => {
    const rules = parseNaturalLanguageQuery('¿Cuánto debe Constructora Maya?', orgData);
    const prompt = buildGroundedAssistantPrompt('¿Cuánto debe Constructora Maya?', rules, orgData);

    expect(prompt).toContain('Constructora Maya: $45,000.00 MXN');
    expect(prompt).toContain('Total por cobrar: $45,000.00 MXN');
    expect(prompt).toContain(rules.answerText);
    expect(prompt).toContain('ÚNICAMENTE');
    expect(prompt).toContain('Nunca inventes montos');
  });

  it('states that there is no data instead of leaving a gap the model could fill', () => {
    const rules = parseNaturalLanguageQuery('¿Cuánto me deben?', {});
    const prompt = buildGroundedAssistantPrompt('¿Cuánto me deben?', rules, {});

    expect(prompt).toContain('(sin clientes registrados)');
    expect(prompt).toContain('Total por cobrar: $0.00 MXN');
  });
});

describe('Client balance queries', () => {
  it('answers with the balance of a client the organization actually has', () => {
    const result = parseNaturalLanguageQuery('¿Cuánto debe Constructora Maya?', {
      clients: [{ id: 'c1', name: 'Constructora Maya', phone: '8112223344' }],
      receivables: [{ clientId: 'c1', amount: 45000, status: 'overdue', label: 'Hito 1' }],
    });

    expect(result.matchedClient).toBe('Constructora Maya');
    expect(result.totalOverdue).toBe(45000);
    expect(result.answerText).toContain('45,000');
  });

  it('reports a settled client as owing zero rather than omitting them', () => {
    const result = parseNaturalLanguageQuery('¿Cuánto debe Don Roberto?', {
      clients: [{ id: 'c1', name: 'Don Roberto', phone: '8112223344' }],
      receivables: [{ clientId: 'c1', amount: 0, status: 'confirmed' }],
    });

    expect(result.totalOverdue).toBe(0);
  });
});

/**
 * #274 — the assistant must answer the questions its own chips ask.
 *
 * Three of the four suggested chips got answers to different questions: the
 * FAQ keyword `factura` hijacked "facturas pendientes" into a Facturapi
 * how-to; "¿cuánto hemos cobrado?" was answered with the por-cobrar total —
 * the semantic opposite — because collected rows were never even loaded; and
 * "¿qué cliente me debe más?" fell to the same generic total with no client
 * named.
 */
describe('the chips get answers to their own questions (#274)', () => {
  const today = new Date().toISOString().split('T')[0];
  const CHIP_ORG: AIOrgData = {
    clients: [
      { id: 'c-1', name: 'Constructora del Bajío', phone: '+528112345678' },
      { id: 'c-2', name: 'Materiales del Norte', phone: null },
    ],
    receivables: [
      { id: 'm-1', clientId: 'c-1', amount: 48720, status: 'pending', label: 'Anticipo', due_date: today },
      { id: 'm-2', clientId: 'c-2', amount: 12000, status: 'pending', label: 'Entrega', due_date: '2026-12-01' },
    ],
    collected: [
      { clientId: 'c-1', amount: 20000, confirmed_at: new Date().toISOString() },
      // A payment from a past month must not count into "este mes".
      { clientId: 'c-2', amount: 99000, confirmed_at: '2020-01-15T00:00:00Z' },
    ],
  };

  it('names the top debtor for "¿Qué cliente me debe más?"', () => {
    const result = parseNaturalLanguageQuery('¿Qué cliente me debe más?', CHIP_ORG);

    expect(result.intent).toBe('top_debtor');
    expect(result.matchedClient).toBe('Constructora del Bajío');
    expect(result.answerText).toContain('48,720.00');
    expect(result.totalOverdue).toBe(48720);
  });

  it('lists the owing clients for "¿Qué clientes tienen facturas pendientes?" — never the Facturapi how-to', () => {
    const result = parseNaturalLanguageQuery('¿Qué clientes tienen facturas pendientes?', CHIP_ORG);

    expect(result.intent).toBe('pending_by_client');
    expect(result.answerText).toContain('Constructora del Bajío');
    expect(result.answerText).toContain('Materiales del Norte');
    // The hijack this pins: the FAQ answer about connecting Facturapi.
    expect(result.answerText).not.toMatch(/Facturapi|Ajustes/);
    expect(result.matchedFAQ).toBeNull();
  });

  it('answers collected — not por cobrar — for "¿Cuánto hemos cobrado este mes?"', () => {
    const result = parseNaturalLanguageQuery('¿Cuánto hemos cobrado este mes?', CHIP_ORG);

    expect(result.intent).toBe('collected_this_month');
    // What arrived this month; neither the old-month payment nor the
    // por-cobrar total (the semantic opposite this issue names).
    expect(result.answerText).toContain('20,000.00');
    expect(result.answerText).not.toContain('60,720.00');
    expect(result.answerText).not.toContain('99,000');
  });

  it('answers with zero collected honestly when nothing confirmed this month', () => {
    const result = parseNaturalLanguageQuery('¿Cuánto hemos cobrado este mes?', {
      ...CHIP_ORG,
      collected: [],
    });

    expect(result.intent).toBe('collected_this_month');
    expect(result.answerText).toMatch(/todavía no has confirmado/i);
  });

  it('filters today for "¿Cuáles pagos vencen hoy?"', () => {
    const result = parseNaturalLanguageQuery('¿Cuáles pagos vencen hoy?', CHIP_ORG);

    expect(result.intent).toBe('due_today');
    expect(result.answerText).toContain('Constructora del Bajío');
    expect(result.answerText).not.toContain('Materiales del Norte');
  });

  it('still resolves a product how-to through the FAQ when no data intent matches', () => {
    const result = parseNaturalLanguageQuery('¿Cómo genero una factura electrónica?', CHIP_ORG);

    expect(result.intent).toBe('app_support_faq');
    expect(result.matchedFAQ).not.toBeNull();
  });

  it('lets a client whose name carries an FAQ keyword resolve as the client', () => {
    const result = parseNaturalLanguageQuery('¿Cuánto me debe Facturas del Norte?', {
      clients: [{ id: 'c-9', name: 'Facturas del Norte', phone: null }],
      receivables: [{ id: 'm-9', clientId: 'c-9', amount: 500, status: 'pending' }],
    });

    expect(result.intent).toBe('client_overdue_balance');
    expect(result.matchedClient).toBe('Facturas del Norte');
  });
});

/**
 * #257 — the reminder link must not double the country code.
 *
 * The hand-rolled `startsWith('52')` prefix logic read "+52 81…" (E.164, the
 * shape every phone has been stored in since the backfill) as not-prefixed
 * after stripping the +, then… actually it read it as prefixed, but a phone
 * stored as "+528112345678" was stripped to digits AFTER the check, so the
 * check ran against "+52…" — `startsWith('52')` false — and 52 was prefixed
 * onto the full digits: wa.me/52528112345678, a number that opens nobody's
 * chat, for every real tenant.
 */
describe('reminder links normalize the phone once (#257)', () => {
  it('builds wa.me/52... — not wa.me/5252... — from an E.164 phone', () => {
    const result = parseNaturalLanguageQuery('¿Cuánto me debe Constructora del Bajío?', {
      clients: [{ id: 'c-1', name: 'Constructora del Bajío', phone: '+528112345678' }],
      receivables: [{ id: 'm-1', clientId: 'c-1', amount: 1000, status: 'pending' }],
    });

    expect(result.whatsappUrl).toContain('wa.me/528112345678');
    expect(result.whatsappUrl).not.toContain('5252');
  });

  it('still lifts a legacy 10-digit phone to 52...', () => {
    const result = parseNaturalLanguageQuery('¿Cuánto me debe Constructora del Bajío?', {
      clients: [{ id: 'c-1', name: 'Constructora del Bajío', phone: '8112345678' }],
      receivables: [{ id: 'm-1', clientId: 'c-1', amount: 1000, status: 'pending' }],
    });

    expect(result.whatsappUrl).toContain('wa.me/528112345678');
  });
});

/**
 * #296 — no live-transfer promise without a line to transfer to.
 */
describe('the human handoff promises only what is configured (#296)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offers the WhatsApp chat when a support line is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_WHATSAPP', '5218112345678');
    const result = parseNaturalLanguageQuery('quiero hablar con un humano', {});

    expect(result.intent).toBe('human_handoff_request');
    expect(result.whatsappUrl).toContain('wa.me/5218112345678');
    expect(result.answerText).toMatch(/transfiriendo/i);
  });

  it('promises no transfer when none exists — points at the real channel', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPPORT_WHATSAPP', '');
    const result = parseNaturalLanguageQuery('quiero hablar con un humano', {});

    expect(result.whatsappUrl).toBe('');
    expect(result.answerText).not.toMatch(/transfiriendo/i);
    expect(result.answerText).toContain('soporte@businesshelper.app');
    // The retired placeholder, gone in every trace.
    expect(JSON.stringify(result)).not.toContain('528180000000');
  });
});
