import { NextResponse } from 'next/server';
import {
  parseNaturalLanguageQuery,
  buildAISupportPromptContext,
  checkRateLimit,
  validateAIQuota,
  sanitizeAIQuery,
} from '@/lib/whatsappAI';
import { requireUser, requireOrgAccess } from '@/lib/apiAuth';
import { loadAIOrgContext } from '@/lib/aiOrgContext';
import { isGeminiConfigured, generateGeminiText } from '@/lib/geminiClient';
import { captureException } from '@/lib/sentry';

/**
 * POST /api/ai/support
 * In-App AI Support Agent API Endpoint — Business Helper
 * 
 * Processes user support queries about product features, how-tos, SPEI, SAT CFDI 4.0,
 * branding, and RBAC permissions directly inside the web application.
 *
 * Answers come from the FAQ corpus in lib/helpFAQ and from the organization's
 * own receivables — the hardcoded "Grupo Salinas" ledger this route used to
 * fall back to is gone. FAQ matching stays deterministic; when
 * `GEMINI_API_KEY` is configured, Gemini rewrites the prose around the matched
 * FAQ, and `engine` names whichever engine actually wrote the text.
 */
export async function POST(request: Request) {
  // Was anonymous, with the rate limit keyed to x-forwarded-for — a header the
  // caller controls, so the quota was trivially bypassed by rotating it.
  // Support answers are mostly FAQ content, so any signed-in user may ask —
  // membership of an organization is required only to reach its receivables.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  try {
    // Rate limit per authenticated user (max 10 req/min for in-app support).
    const rateLimit = checkRateLimit(userId, 10);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Límite de consultas alcanzado. Por favor espera un momento.' } },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { query, tierKey = 'demo', currentUsage = 0 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_QUERY', message: 'La pregunta de soporte es requerida' } },
        { status: 400 }
      );
    }

    // 2. Input Sanitization & Truncation Guard (Max 300 chars)
    const sanitizedQuery = sanitizeAIQuery(query, 300);
    if (!sanitizedQuery) {
      return NextResponse.json(
        { error: { code: 'INVALID_QUERY', message: 'La consulta no puede estar vacía' } },
        { status: 400 }
      );
    }

    // 3. Tier Quota Guard
    const quotaCheck = validateAIQuota(tierKey, currentUsage);
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { error: { code: 'QUOTA_EXCEEDED', message: quotaCheck.reason, quota: quotaCheck } },
        { status: 403 }
      );
    }

    const orgAccess = await requireOrgAccess();
    const orgData = orgAccess.ok
      ? await loadAIOrgContext(orgAccess.ctx.supabase, orgAccess.ctx.organizationId)
      : {};

    const aiResponse = parseNaturalLanguageQuery(sanitizedQuery, orgData);

    let engine: 'rules' | 'gemini' = 'rules';
    let answerText = aiResponse.answerText;

    // A handoff answer is an action, not prose — it stays deterministic.
    if (isGeminiConfigured() && !aiResponse.requiresHumanHandoff) {
      try {
        answerText = await generateGeminiText(buildAISupportPromptContext(sanitizedQuery, aiResponse.matchedFAQ));
        engine = 'gemini';
      } catch (err) {
        captureException(err, { route: '/api/ai/support', level: 'warning' });
      }
    }

    return NextResponse.json({
      success: true,
      query: sanitizedQuery,
      response: { ...aiResponse, answerText },
      engine,
      quota: quotaCheck,
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'AI_SUPPORT_ERROR', message: 'Error al procesar la consulta con el Agente de IA' } },
      { status: 500 }
    );
  }
}
