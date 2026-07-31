import { NextResponse } from 'next/server';
import { parseNaturalLanguageQuery } from '@/lib/whatsappAI';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_QUERY', message: 'La consulta es requerida' } },
        { status: 400 }
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
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: { code: 'AI_ERROR', message: 'Error al procesar consulta de IA' } },
      { status: 500 }
    );
  }
}
