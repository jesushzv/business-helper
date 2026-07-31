'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Quote } from '@/types';
import { generatePublicToken } from '../quoteToken';
import { calculateQuoteTotals, LineItem } from '../quoteCalculator';
import { convertQuoteToContract } from '../quoteToContract';

const INITIAL_DEMO_QUOTES: Quote[] = [
  {
    id: 'quote-demo-1',
    organization_id: 'org-demo-1',
    client_id: 'client-demo-1',
    created_by: 'user-demo-1',
    title: 'Suministro de Cemento y Varilla para Obra Civil',
    line_items: [
      { description: 'Tonelada Cemento CPO 40', quantity: 5, unit_price: 3600, sat_code: '30111500', unit: 'TON' },
      { description: 'Tonelada Varilla 3/8"', quantity: 3, unit_price: 22000, sat_code: '30101800', unit: 'TON' },
    ],
    subtotal_amount: 84000,
    iva_amount: 13440,
    retencion_isr_amount: 0,
    retencion_iva_amount: 0,
    total_amount: 97440,
    currency: 'MXN',
    status: 'sent',
    valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'Entrega directa en obra en 48 horas hábiles tras recibir anticipo.',
    public_token: 'a1b2c3d4e5f678901234567890abcdef',
    converted_contract_id: null,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'quote-demo-2',
    organization_id: 'org-demo-1',
    client_id: 'client-demo-2',
    created_by: 'user-demo-1',
    title: 'Estudio de Suelo e Ingeniería Topográfica',
    line_items: [
      { description: 'Estudio Geotécnico de Suelo', quantity: 1, unit_price: 25000, sat_code: '81101500', unit: 'E48' },
      { description: 'Levantamiento Topográfico', quantity: 1, unit_price: 12000, sat_code: '81101500', unit: 'E48' },
    ],
    subtotal_amount: 37000,
    iva_amount: 5920,
    retencion_isr_amount: 3700,
    retencion_iva_amount: 3946.68,
    total_amount: 35273.32,
    currency: 'MXN',
    status: 'accepted',
    valid_until: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'Cotización emitida bajo Régimen RESICO.',
    public_token: 'ff99887766554433221100aabbccdde',
    converted_contract_id: null,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const LOCAL_STORAGE_KEY = 'business_helper_quotes_v1';

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/quotes');
      if (res.ok) {
        const data = await res.json();
        if (data.quotes && Array.isArray(data.quotes) && data.quotes.length > 0) {
          setQuotes(data.quotes);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fall through to localStorage / demo fallback
    }

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setQuotes(parsed);
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_QUOTES));
        setQuotes(INITIAL_DEMO_QUOTES);
      }
    } catch {
      setQuotes(INITIAL_DEMO_QUOTES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const syncLocalStorage = (updated: Quote[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to sync quotes to localStorage', e);
    }
  };

  const createQuote = async (data: {
    client_id: string;
    title: string;
    line_items: LineItem[];
    currency?: string;
    valid_until?: string;
    notes?: string;
    taxOptions?: { applyIva?: boolean; applyRetencionIsr?: boolean; applyRetencionIva?: boolean };
  }): Promise<Quote> => {
    const totals = calculateQuoteTotals(data.line_items, data.taxOptions);
    const publicToken = generatePublicToken();

    const newQuote: Quote = {
      id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: 'org-demo-1',
      client_id: data.client_id,
      created_by: 'user-demo-1',
      title: data.title,
      line_items: data.line_items as unknown as Quote['line_items'],
      subtotal_amount: totals.subtotal,
      iva_amount: totals.ivaAmount,
      retencion_isr_amount: totals.retencionIsrAmount,
      retencion_iva_amount: totals.retencionIvaAmount,
      total_amount: totals.totalAmount,
      currency: (data.currency as 'MXN' | 'USD') || 'MXN',
      status: 'sent',
      valid_until: data.valid_until || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: data.notes || '',
      public_token: publicToken,
      converted_contract_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuote),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const saved = await res.json();
        if (saved && saved.id) {
          setQuotes((prev) => [saved, ...prev]);
          return saved;
        }
      }
    } catch {
      // Fallback to local state mutation
    }

    setQuotes((prev) => {
      const next = [newQuote, ...prev];
      syncLocalStorage(next);
      return next;
    });

    return newQuote;
  };

  const updateQuoteStatus = async (id: string, status: string): Promise<Quote> => {
    let updatedQuote: Quote | undefined;

    setQuotes((prev) => {
      const next = prev.map((q) => {
        if (q.id === id) {
          updatedQuote = { ...q, status: status as Quote['status'], updated_at: new Date().toISOString() };
          return updatedQuote;
        }
        return q;
      });
      syncLocalStorage(next);
      return next;
    });

    try {
      await fetch(`/api/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch {
      // Ignore API error in demo mode
    }

    if (!updatedQuote) throw new Error('Cotización no encontrada');
    return updatedQuote;
  };

  const convertToContract = async (quoteId: string) => {
    const targetQuote = quotes.find((q) => q.id === quoteId);
    if (!targetQuote) throw new Error('Cotización no encontrada');

    const conversion = convertQuoteToContract({
      id: targetQuote.id,
      organization_id: targetQuote.organization_id,
      client_id: targetQuote.client_id,
      title: targetQuote.title,
      total_amount: targetQuote.total_amount,
      currency: targetQuote.currency,
      status: targetQuote.status,
    });

    // Mark quote as converted
    await updateQuoteStatus(quoteId, 'converted');

    try {
      await fetch(`/api/quotes/${quoteId}/convert`, { method: 'POST' });
    } catch {
      // Fallback demo sync
    }

    return conversion;
  };

  const filteredQuotes = useMemo(() => {
    return quotes.filter((q) => {
      const matchesStatus = statusFilter === 'all' || q.status === statusFilter;
      const matchesQuery =
        !searchQuery.trim() ||
        q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.notes?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [quotes, statusFilter, searchQuery]);

  return {
    quotes,
    filteredQuotes,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    fetchQuotes,
    createQuote,
    updateQuoteStatus,
    convertToContract,
  };
}
