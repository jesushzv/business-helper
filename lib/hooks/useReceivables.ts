'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MilestoneItem, calculateReceivablesSummary, ReceivablesSummary } from '../receivablesCalculator';

export interface MilestoneWithClient extends MilestoneItem {
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  contract_title?: string;
  public_token?: string;
}

const INITIAL_DEMO_RECEIVABLES: MilestoneWithClient[] = [
  {
    id: 'milestone-demo-1',
    contract_id: 'contract-demo-1',
    organization_id: 'org-demo-1',
    label: 'Anticipo 50% — Suministro Cemento',
    amount: 48720,
    due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Overdue
    status: 'pending',
    receipt_url: null,
    tracking_reference: null,
    transferred_amount: null,
    confirmed_at: null,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Distribuidora del Norte',
    client_phone: '8115551234',
    client_email: 'contacto@distribuidora.mx',
    contract_title: 'Suministro de Cemento y Varilla',
    public_token: 'a1b2c3d4e5f678901234567890abcdef',
  },
  {
    id: 'milestone-demo-2',
    contract_id: 'contract-demo-2',
    organization_id: 'org-demo-1',
    label: 'Pago Inicial Estudio Geotécnico',
    amount: 17636.66,
    due_date: new Date().toISOString().split('T')[0], // Due Today
    status: 'marked_paid',
    receipt_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500',
    tracking_reference: 'SPEI20260830998877',
    transferred_amount: 17636.66,
    confirmed_at: null,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Constructora Maya S.A.',
    client_phone: '5551234567',
    client_email: 'finanzas@construcoramaya.mx',
    contract_title: 'Estudio de Suelo e Ingeniería',
    public_token: 'ff99887766554433221100aabbccdde',
  },
  {
    id: 'milestone-demo-3',
    contract_id: 'contract-demo-1',
    organization_id: 'org-demo-1',
    label: 'Entrega Final 50% — Cemento',
    amount: 48720,
    due_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Upcoming
    status: 'pending',
    receipt_url: null,
    tracking_reference: null,
    transferred_amount: null,
    confirmed_at: null,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Distribuidora del Norte',
    client_phone: '8115551234',
    client_email: 'contacto@distribuidora.mx',
    contract_title: 'Suministro de Cemento y Varilla',
    public_token: 'a1b2c3d4e5f678901234567890abcdef',
  },
  {
    id: 'milestone-demo-4',
    contract_id: 'contract-demo-3',
    organization_id: 'org-demo-1',
    label: 'Anticipo Proyecto Remodelación',
    amount: 25000,
    due_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'confirmed',
    receipt_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500',
    tracking_reference: 'SPEI20260815112233',
    transferred_amount: 25000,
    confirmed_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Comercializadora Regio',
    client_phone: '8189998877',
    client_email: 'pagos@regio.com.mx',
    contract_title: 'Remodelación Oficinas Corporativas',
    public_token: '1234567890abcdef1234567890abcdef',
  },
];

const LOCAL_STORAGE_KEY = 'business_helper_receivables_v1';

export function useReceivables() {
  const [receivables, setReceivables] = useState<MilestoneWithClient[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/receivables');
      if (res.ok) {
        const data = await res.json();
        if (data.receivables && Array.isArray(data.receivables) && data.receivables.length > 0) {
          setReceivables(data.receivables);
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReceivables(parsed);
        } else {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECEIVABLES));
          setReceivables(INITIAL_DEMO_RECEIVABLES);
        }
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECEIVABLES));
        setReceivables(INITIAL_DEMO_RECEIVABLES);
      }
    } catch {
      setReceivables(INITIAL_DEMO_RECEIVABLES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReceivables();
  }, [fetchReceivables]);

  const syncLocalStorage = (updated: MilestoneWithClient[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to sync receivables to localStorage', e);
    }
  };

  const confirmPayment = async (id: string, transferredAmount?: number): Promise<MilestoneWithClient> => {
    let updatedItem: MilestoneWithClient | undefined;

    setReceivables((prev) => {
      const next = prev.map((m) => {
        if (m.id === id) {
          updatedItem = {
            ...m,
            status: 'confirmed',
            transferred_amount: transferredAmount ?? m.amount,
            confirmed_at: new Date().toISOString(),
          };
          return updatedItem;
        }
        return m;
      });
      syncLocalStorage(next);
      return next;
    });

    try {
      await fetch(`/api/receivables/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferredAmount }),
      });
    } catch {
      // Ignore API error in demo mode
    }

    if (!updatedItem) throw new Error('Cuentas por cobrar no encontradas');
    return updatedItem;
  };

  const uploadSpeiProof = async (
    id: string,
    data: { receipt_url: string; tracking_reference: string; transferred_amount?: number }
  ): Promise<MilestoneWithClient> => {
    let updatedItem: MilestoneWithClient | undefined;

    setReceivables((prev) => {
      const next = prev.map((m) => {
        if (m.id === id) {
          updatedItem = {
            ...m,
            status: 'marked_paid',
            receipt_url: data.receipt_url,
            tracking_reference: data.tracking_reference,
            transferred_amount: data.transferred_amount ?? m.amount,
          };
          return updatedItem;
        }
        return m;
      });
      syncLocalStorage(next);
      return next;
    });

    try {
      await fetch(`/api/receivables/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'marked_paid',
          receipt_url: data.receipt_url,
          tracking_reference: data.tracking_reference,
          transferred_amount: data.transferred_amount,
        }),
      });
    } catch {
      // Ignore API error in demo mode
    }

    if (!updatedItem) throw new Error('Hito de pago no encontrado');
    return updatedItem;
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const summary: ReceivablesSummary = useMemo(() => {
    return calculateReceivablesSummary(receivables, todayStr);
  }, [receivables, todayStr]);

  const filteredReceivables = useMemo(() => {
    return receivables.filter((m) => {
      const dueDate = m.due_date ? m.due_date.substring(0, 10) : '';

      let matchesStatus = true;
      if (statusFilter === 'overdue') {
        matchesStatus = (m.status === 'pending' || m.status === 'requested') && dueDate < todayStr;
      } else if (statusFilter === 'due_today') {
        matchesStatus = (m.status === 'pending' || m.status === 'requested') && dueDate === todayStr;
      } else if (statusFilter === 'upcoming') {
        matchesStatus = (m.status === 'pending' || m.status === 'requested') && dueDate > todayStr;
      } else if (statusFilter === 'marked_paid') {
        matchesStatus = m.status === 'marked_paid';
      } else if (statusFilter === 'confirmed') {
        matchesStatus = m.status === 'confirmed';
      }

      const matchesQuery =
        !searchQuery.trim() ||
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.contract_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.tracking_reference?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesQuery;
    });
  }, [receivables, statusFilter, searchQuery, todayStr]);

  const resetDemoReceivables = useCallback(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECEIVABLES));
    setReceivables(INITIAL_DEMO_RECEIVABLES);
  }, []);

  return {
    receivables,
    filteredReceivables,
    summary,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    fetchReceivables,
    confirmPayment,
    uploadSpeiProof,
    resetDemoReceivables,
  };
}
