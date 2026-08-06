import { NextResponse } from 'next/server';
import { parseNaturalLanguageQuery, checkRateLimit, validateAIQuota, sanitizeAIQuery } from '@/lib/whatsappAI';
import { requireUser } from '@/lib/apiAuth';

export async function POST(request: Request) {
  // Was anonymous, with the rate limit keyed to x-forwarded-for — a header the
  // caller controls, so the quota was trivially bypassed by rotating it.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    // Rate limit per authenticated user (max 5 req/min).
    const rateLimit = checkRateLimit(auth.userId, 5);

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

    const demoOrgData = {
      clients: [
        { id: 'c-1', name: 'Construcciones Maya', phone: '8115551234' },
        { id: 'c-salinas', name: 'Grupo Salinas', phone: '8112223344' }
      ],
      receivables: [
        { clientId: 'c-1', amount: 75000, status: 'overdue' },
        { clientId: 'c-salinas', amount: 45000, status: 'overdue' }
      ]
    };

    const response = parseNaturalLanguageQuery(sanitizedQuery, demoOrgData);
    return NextResponse.json({
      ...response,
      quota: quotaCheck
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'AI_ERROR', message: 'Error al procesar consulta de IA' } },
      { status: 500 }
    );
  }
}
