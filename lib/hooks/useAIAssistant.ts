'use client';

import { useState, useCallback } from 'react';
import { parseNaturalLanguageQuery } from '@/lib/whatsappAI';

export interface AIResponse {
  query: string;
  intent: string;
  matchedClient: string | null;
  totalOverdue: number;
  answerText: string;
  whatsappUrl: string;
  timestamp: string;
}

export function useAIAssistant() {
  const [query, setQuery] = useState<string>('');
  const [history, setHistory] = useState<AIResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const askAssistant = useCallback((inputQuery: string) => {
    if (!inputQuery.trim()) return;
    setLoading(true);

    const demoOrgData = {
      clients: [
        { id: 'c-1', name: 'Construcciones Maya', phone: '8115551234' },
        { id: 'c-2', name: 'Desarrollos Inmobiliarios del Norte', phone: '8189998877' },
        { id: 'c-salinas', name: 'Grupo Salinas', phone: '8112223344' }
      ],
      receivables: [
        { clientId: 'c-1', amount: 75000, status: 'overdue', label: 'Anticipo Obra' },
        { clientId: 'c-salinas', amount: 45000, status: 'overdue', label: 'Finiquito' }
      ]
    };

    const res = parseNaturalLanguageQuery(inputQuery, demoOrgData);
    const item: AIResponse = {
      ...res,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    };

    setHistory((prev) => [item, ...prev]);
    setQuery('');
    setLoading(false);
    return item;
  }, []);

  return {
    query,
    setQuery,
    history,
    loading,
    askAssistant
  };
}
