'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  calculateBusinessMetrics,
  getTopClientsByRevenue,
  calculateCashFlowForecast,
  BusinessMetrics,
  TopClientRevenue,
  CashFlowForecast,
  MilestoneItem,
  QuoteItem,
  ClientItem,
} from '../dashboardAnalytics';
import { useClients } from './useClients';
import { useQuotes } from './useQuotes';
import { useReceivables } from './useReceivables';

export function useDashboardAnalytics() {
  const { clients, loading: clientsLoading } = useClients();
  const { quotes, loading: quotesLoading } = useQuotes();
  const { receivables, loading: receivablesLoading } = useReceivables();

  const [apiAnalytics, setApiAnalytics] = useState<{
    metrics: BusinessMetrics;
    topClients: TopClientRevenue[];
    cashFlowForecast: CashFlowForecast;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch API analytics if available
  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/dashboard/analytics');
      if (res.ok) {
        const data = await res.json();
        if (data.metrics && data.topClients && data.cashFlowForecast) {
          setApiAnalytics(data);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('API Analytics fetch warning (fallback to computed local state):', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Compute metrics from current local hooks state
  const computedMetrics = useMemo<BusinessMetrics>(() => {
    const milestoneItems: MilestoneItem[] = receivables.map((r) => ({
      id: r.id,
      contract_id: r.contract_id,
      client_id: r.client_id || (r.client_name ? clients.find((c) => c.name === r.client_name)?.id || r.client_name : undefined),
      label: r.label,
      amount: r.amount,
      due_date: r.due_date,
      status: r.status as MilestoneItem['status'],
      confirmed_at: r.confirmed_at,
    }));

    const quoteItems: QuoteItem[] = quotes.map((q) => ({
      id: q.id,
      client_id: q.client_id,
      status: q.status,
      total_amount: q.total_amount,
    }));

    const clientItems: ClientItem[] = clients.map((c) => ({
      id: c.id,
      name: c.name,
      contact_name: c.contact_name,
      phone: c.phone,
      health_score: c.health_score,
      rfc: c.rfc,
    }));

    return calculateBusinessMetrics(milestoneItems, quoteItems, clientItems);
  }, [receivables, quotes, clients]);

  const computedTopClients = useMemo<TopClientRevenue[]>(() => {
    const milestoneItems: MilestoneItem[] = receivables.map((r) => ({
      id: r.id,
      contract_id: r.contract_id,
      client_id: r.client_id || clients.find((c) => c.name === r.client_name)?.id || r.client_name || r.id,
      label: r.label,
      amount: r.amount,
      due_date: r.due_date,
      status: r.status as MilestoneItem['status'],
      confirmed_at: r.confirmed_at,
    }));

    const clientItems: ClientItem[] = clients.map((c) => ({
      id: c.id,
      name: c.name,
      contact_name: c.contact_name,
      phone: c.phone,
      health_score: c.health_score,
      rfc: c.rfc,
    }));

    return getTopClientsByRevenue(milestoneItems, clientItems, 5);
  }, [receivables, clients]);

  const computedCashFlowForecast = useMemo<CashFlowForecast>(() => {
    const milestoneItems: MilestoneItem[] = receivables.map((r) => ({
      id: r.id,
      contract_id: r.contract_id,
      label: r.label,
      amount: r.amount,
      due_date: r.due_date,
      status: r.status as MilestoneItem['status'],
      confirmed_at: r.confirmed_at,
    }));

    return calculateCashFlowForecast(milestoneItems);
  }, [receivables]);

  const hasApiData = useMemo(() => {
    if (!apiAnalytics) return false;
    // If API metrics are all zeroes and no clients, fallback to computed demo state
    if (
      apiAnalytics.metrics.collectedRevenue === 0 &&
      apiAnalytics.metrics.pendingReceivables === 0 &&
      apiAnalytics.topClients.length === 0
    ) {
      return false;
    }
    return true;
  }, [apiAnalytics]);

  const metrics = hasApiData && apiAnalytics ? apiAnalytics.metrics : computedMetrics;
  const topClients = hasApiData && apiAnalytics ? apiAnalytics.topClients : computedTopClients;
  const cashFlowForecast = hasApiData && apiAnalytics ? apiAnalytics.cashFlowForecast : computedCashFlowForecast;

  const isInitialLoading = (clientsLoading || quotesLoading || receivablesLoading) && loading;

  return {
    metrics,
    topClients,
    cashFlowForecast,
    loading: isInitialLoading,
    error,
    refreshAnalytics: fetchAnalytics,
  };
}
