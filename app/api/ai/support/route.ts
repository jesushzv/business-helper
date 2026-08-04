import { NextResponse } from 'next/server';
import {
  parseNaturalLanguageQuery,
  checkRateLimit,
  validateAIQuota,
  sanitizeAIQuery,
} from '@/lib/whatsappAI';

/**
 * POST /api/ai/support
 * In-App AI Support Agent API Endpoint — Business Helper
 * 
 * Processes user support queries about product features, how-tos, SPEI, SAT CFDI 4.0,
 * branding, and RBAC permissions directly inside the web application.
 */
export async function POST(request: Request) {
  try {
    // 1. Rate Limiter Guard (Max 10 req/min per IP/client for in-app support)
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = checkRateLimit(clientIp, 10);

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

    const demoOrgData = {
      clients: [
        { id: 'c-1', name: 'Construcciones Maya', phone: '8115551234' },
        { id: 'c-salinas', name: 'Grupo Salinas', phone: '8112223344' },
      ],
      receivables: [
        { clientId: 'c-1', amount: 75000, status: 'overdue' },
        { clientId: 'c-salinas', amount: 45000, status: 'overdue' },
      ],
    };

    const aiResponse = parseNaturalLanguageQuery(sanitizedQuery, demoOrgData);

    return NextResponse.json({
      success: true,
      query: sanitizedQuery,
      response: aiResponse,
      quota: quotaCheck,
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'AI_SUPPORT_ERROR', message: 'Error al procesar la consulta con el Agente de IA' } },
      { status: 500 }
    );
  }
}
