import { NextResponse } from 'next/server';
import { parseNaturalLanguageQuery, checkRateLimit, validateAIQuota } from '@/lib/whatsappAI';

export async function POST(request: Request) {
  try {
    // 1. Rate Limiter Guard (Max 5 req/min per IP/client)
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = checkRateLimit(clientIp, 5);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Límite de solicitudes alcanzado. Por favor espera un minuto.' } },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { query, tierKey = 'negocio', currentUsage = 0 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_QUERY', message: 'La consulta es requerida' } },
        { status: 400 }
      );
    }

    // 2. Tier Quota Guard (Emprendedor: 50, Negocio: 300, Empresa: 1500)
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

    const response = parseNaturalLanguageQuery(query, demoOrgData);
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
