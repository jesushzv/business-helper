import { NextResponse } from 'next/server';
import { parseNaturalLanguageQuery, checkRateLimit, validateAIQuota, sanitizeAIQuery } from '@/lib/whatsappAI';
import { requireOrgAccess } from '@/lib/apiAuth';
import { loadAIOrgContext } from '@/lib/aiOrgContext';

/**
 * Operations assistant.
 *
 * Two things were wrong with this endpoint beyond its auth, which #1 fixed:
 * it answered from a hardcoded two-client ledger rather than the caller's
 * records, and `parseNaturalLanguageQuery` is keyword matching, not a model.
 * The data is now the tenant's own, and the response says which engine
 * produced it instead of leaving "AI" to be inferred.
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
    return NextResponse.json({
      ...response,
      // Deterministic keyword matching over the organization's records. Named
      // so a client cannot present the answer as a model's reasoning.
      engine: 'rules',
      quota: quotaCheck
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'AI_ERROR', message: 'Error al procesar consulta de IA' } },
      { status: 500 }
    );
  }
}
