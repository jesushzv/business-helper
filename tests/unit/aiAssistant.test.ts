import { describe, it, expect } from 'vitest';
import {
  checkRateLimit,
  sanitizeAIQuery,
  validateAIQuota,
  matchFAQSupportQuery,
  buildAIPromptContext,
  buildAISupportPromptContext,
  parseNaturalLanguageQuery,
  TIER_AI_QUOTAS,
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
    expect(result.answerText).toContain('COTIZACIONES');
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
