import { NextResponse } from 'next/server';
import {
  parseNaturalLanguageQuery,
  buildGroundedAssistantPrompt,
  checkRateLimit,
  sanitizeAIQuery,
} from '@/lib/whatsappAI';
import { requireOrgAccess } from '@/lib/apiAuth';
import { loadAIOrgContext } from '@/lib/aiOrgContext';
import { isGeminiConfigured, generateGeminiText } from '@/lib/geminiClient';
import { resolveAIModelBudget, recordModelAnswer } from '@/lib/aiUsage';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
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
    // Only `query` is read. The body once carried tierKey/currentUsage and the
    // route believed them — the caller graded its own model allowance (#228).
    const { query } = body;

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

    const orgData = await loadAIOrgContext(supabase, organizationId);

    const response = parseNaturalLanguageQuery(sanitizedQuery, orgData);

    let engine: 'rules' | 'gemini' = 'rules';
    let answerText = response.answerText;
    let quota = null;

    // The model runs only inside a verified budget: tier from the caller's
    // organization row, usage from the service-only ledger. Exhausted or
    // unknown budget answers from the rules engine — a refusal would block a
    // healthy tenant on a read blip, and an unverified model call spends
    // tokens nobody granted. Only model-written answers count against the
    // quota. A handoff answer is an action, not prose — always deterministic.
    if (isGeminiConfigured() && isServiceRoleConfigured() && !response.requiresHumanHandoff) {
      const service = createServiceClient();
      const budget = await resolveAIModelBudget(service, organizationId);
      quota = budget?.quota ?? null;
      if (budget?.quota.allowed) {
        try {
          answerText = await generateGeminiText(buildGroundedAssistantPrompt(sanitizedQuery, response, orgData));
          engine = 'gemini';
          await recordModelAnswer(service, organizationId);
        } catch (err) {
          // Also to stdout: the degradation is invisible in Vercel logs when
          // Sentry is configured, and reading the status there is how the
          // "always Calculada con reglas" report gets a cause. The message
          // carries only a status or reason — never the key.
          console.warn('[AI] Gemini no disponible, respondiendo con reglas:', err instanceof Error ? err.message : String(err));
          captureException(err, { organization_id: organizationId, route: '/api/ai/assistant', level: 'warning' });
        }
      }
    }

    return NextResponse.json({
      ...response,
      answerText,
      engine,
      quota
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'AI_ERROR', message: 'Error al procesar consulta de IA' } },
      { status: 500 }
    );
  }
}
