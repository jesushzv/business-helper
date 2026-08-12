import { NextResponse } from 'next/server';
import {
  parseNaturalLanguageQuery,
  buildGroundedAssistantPrompt,
  checkRateLimit,
  validateAIQuota,
  sanitizeAIQuery,
} from '@/lib/whatsappAI';
import { requireOrgAccess } from '@/lib/apiAuth';
import { loadAIOrgContext } from '@/lib/aiOrgContext';
import { isGeminiConfigured, generateGeminiText } from '@/lib/geminiClient';
import { captureException } from '@/lib/sentry';

/**
 * Operations assistant.
 *
 * The rules engine computes every fact — matched client, totals, the WhatsApp
 * link — from the tenant's own records. When `GEMINI_API_KEY` is configured,
 * Gemini rewrites only the prose (`answerText`) around those pinned figures;
 * it is never the source of a number. `engine` names whichever one actually
 * produced the text, so no answer can pass for a model's when it was not:
 * with the key unset, or on any Gemini failure (reported to Sentry), the
 * deterministic answer stands and says so.
 */
export async function POST(request: Request) {
  // Was anonymous, with the rate limit keyed to x-forwarded-for — a header the
  // caller controls, so the quota was trivially bypassed by rotating it.
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, userId, organizationId } = auth.ctx;

  try {
    // Rate limit per authenticated user (max 5 req/min).
    const rateLimit = checkRateLimit(userId, 5);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Límite de solicitudes alcanzado. Por favor espera un minuto.' } },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { query, tierKey = 'demo', currentUsage = 0 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_QUERY', message: 'La consulta es requerida' } },
        { status: 400 }
      );
    }

    // 2. Input Sanitization & Truncation Guard (Max 300 characters)
    const sanitizedQuery = sanitizeAIQuery(query, 300);
    if (!sanitizedQuery) {
      return NextResponse.json(
        { error: { code: 'INVALID_QUERY', message: 'La consulta no puede estar vacía' } },
        { status: 400 }
      );
    }

    // 3. Tier Quota Guard (Demo: 20, Emprendedor: 50, Negocio: 300, Empresa: 1500)
    const quotaCheck = validateAIQuota(tierKey, currentUsage);
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { error: { code: 'QUOTA_EXCEEDED', message: quotaCheck.reason, quota: quotaCheck } },
        { status: 403 }
      );
    }

    const orgData = await loadAIOrgContext(supabase, organizationId);

    const response = parseNaturalLanguageQuery(sanitizedQuery, orgData);

    let engine: 'rules' | 'gemini' = 'rules';
    let answerText = response.answerText;

    // A handoff answer is an action, not prose — it stays deterministic.
    if (isGeminiConfigured() && !response.requiresHumanHandoff) {
      try {
        answerText = await generateGeminiText(buildGroundedAssistantPrompt(sanitizedQuery, response, orgData));
        engine = 'gemini';
      } catch (err) {
        captureException(err, { organization_id: organizationId, route: '/api/ai/assistant', level: 'warning' });
      }
    }

    return NextResponse.json({
      ...response,
      answerText,
      engine,
      quota: quotaCheck
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'AI_ERROR', message: 'Error al procesar consulta de IA' } },
      { status: 500 }
    );
  }
}
