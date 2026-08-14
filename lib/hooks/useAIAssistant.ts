'use client';

import { useState, useCallback } from 'react';
import { parseNaturalLanguageQuery } from '@/lib/whatsappAI';
import { isClientDemoMode } from '@/lib/clientDemoMode';

/**
 * Operations assistant state.
 *
 * The hook answered every question in the browser from a fixed ledger
 * ("Grupo Salinas" owing 45,000 MXN), so a signed-in owner asking about their
 * own collections got numbers belonging to nobody. It now calls
 * `/api/ai/assistant`, which reads that organization's records.
 *
 * The demo ledger survives only where there is no backend at all — the static
 * marketing demo — and every answer from it is marked `isDemo` so the UI can
 * say so rather than let it pass for the user's data.
 */

export interface AIResponse {
  query: string;
  intent: string;
  matchedClient: string | null;
  totalOverdue: number;
  answerText: string;
  whatsappUrl: string;
  timestamp: string;
  isDemo: boolean;
  /** Which engine actually wrote `answerText` — the server decides, per answer. */
  engine: 'rules' | 'gemini';
}

/** Sample book of business for the no-backend marketing demo. */
const DEMO_ORG_DATA = {
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

function timestamp(): string {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export function useAIAssistant() {
  const [query, setQuery] = useState<string>('');
  const [history, setHistory] = useState<AIResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * True when answers come from the sample ledger instead of real records.
   *
   * `isClientDemoMode()`, not `isSupabaseConfigured()` (#273): the latter is
   * true on the real deployment, so a `/demo` visitor following the tour's own
   * `?demo=true` link asked their first question and got a red "Sesión
   * requerida" — the hooks' demo signal is the one that honors the visitor
   * opt-in, and it already refuses over a real session cookie.
   */
  const isDemoMode = isClientDemoMode();

  const askAssistant = useCallback(
    async (inputQuery: string): Promise<AIResponse | undefined> => {
      if (!inputQuery.trim()) return;
      setLoading(true);
      setError(null);

      try {
        if (isDemoMode) {
          const res = parseNaturalLanguageQuery(inputQuery, DEMO_ORG_DATA);
          const item: AIResponse = { ...res, timestamp: timestamp(), isDemo: true, engine: 'rules' };
          setHistory((prev) => [item, ...prev]);
          setQuery('');
          return item;
        }

        const response = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: inputQuery }),
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setError(data?.error?.message || 'No se pudo procesar tu consulta.');
          return;
        }

        const item: AIResponse = {
          query: data.query,
          intent: data.intent,
          matchedClient: data.matchedClient ?? null,
          totalOverdue: data.totalOverdue ?? 0,
          answerText: data.answerText,
          whatsappUrl: data.whatsappUrl,
          timestamp: timestamp(),
          isDemo: false,
          // Only the server knows which engine answered; never assume the model.
          engine: data.engine === 'gemini' ? 'gemini' : 'rules',
        };

        setHistory((prev) => [item, ...prev]);
        setQuery('');
        return item;
      } catch {
        setError('No se pudo procesar tu consulta.');
        return;
      } finally {
        setLoading(false);
      }
    },
    [isDemoMode]
  );

  return {
    query,
    setQuery,
    history,
    loading,
    error,
    isDemoMode,
    askAssistant
  };
}
