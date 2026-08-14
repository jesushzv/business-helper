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
import { localTodayStr } from '@/lib/dates';
import { useClients } from './useClients';
import { useQuotes } from './useQuotes';
import { useReceivables } from './useReceivables';
import { isClientDemoMode } from '../clientDemoMode';

export function useDashboardAnalytics() {
  const { clients, loading: clientsLoading, error: clientsError } = useClients();
  const { quotes, loading: quotesLoading, error: quotesError } = useQuotes();
  const { receivables, loading: receivablesLoading, error: receivablesError } = useReceivables();

  const [apiAnalytics, setApiAnalytics] = useState<{
    metrics: BusinessMetrics;
    topClients: TopClientRevenue[];
    cashFlowForecast: CashFlowForecast;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // The server's aggregate view, when it answers. A failure is recorded, not
  // swallowed (#97): the locally computed numbers below remain a legitimate
  // fallback — they derive from the sub-hooks' real rows — but the dashboard
  // must be able to say the server disagreed instead of silently diverging.
  const fetchAnalytics = useCallback(async () => {
    // The sandbox never asks the server (#273): this was the one dashboard
    // hook with no demo gate, so the tour's very first screen fired a real
    // fetch that 401s and opened on an amber "No pudimos actualizar tus
    // números" banner over the fixture KPIs. The sub-hooks already serve
    // fixtures behind the same signal; the computed figures below derive from
    // them, so skipping the fetch is the whole gate.
    if (isClientDemoMode()) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // The viewer's local day rides along (#263): the server runs in UTC, so
      // without it a cobro due today classified as Deuda Vencida from 18:00
      // local — disagreeing with the client-computed Cobranza page.
      const res = await fetch(`/api/dashboard/analytics?today=${localTodayStr()}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.metrics && data?.topClients && data?.cashFlowForecast) {
        setApiAnalytics(data);
      } else {
        setError('No pudimos actualizar tus números desde el servidor.');
      }
    } catch {
      setError('No pudimos actualizar tus números desde el servidor.');
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

  /**
   * Did the server answer — not, did the answer have big enough numbers in it.
   *
   * This used to return false when `collectedRevenue`, `pendingReceivables`
   * and `topClients` were all empty, treating an all-zero answer as no answer
   * and falling through to the locally computed figures (#114). Every newly
   * onboarded tenant has exactly those zeros, so the dashboard's headline MXN
   * cards showed numbers that were not theirs at the precise moment first
   * impressions are formed.
   *
   * **Zero is a real answer.** The request either succeeded or it did not;
   * `apiAnalytics` is only ever set from a 2xx carrying all three shapes, so
   * its presence *is* the state. A failure leaves it null, falls back to the
   * figures computed from the sub-hooks' own rows, and is reported through
   * `combinedError` below rather than rendered as a confident total.
   */
  const hasApiData = apiAnalytics !== null;

  const metrics = hasApiData && apiAnalytics ? apiAnalytics.metrics : computedMetrics;
  const topClients = hasApiData && apiAnalytics ? apiAnalytics.topClients : computedTopClients;
  const cashFlowForecast = hasApiData && apiAnalytics ? apiAnalytics.cashFlowForecast : computedCashFlowForecast;

  // Loading until every source has answered: the old `(a || b || c) && loading`
  // cleared the skeleton the moment the analytics fetch resolved, flashing $0
  // KPI cards while the sub-hooks were still in flight (#97).
  const isInitialLoading = clientsLoading || quotesLoading || receivablesLoading || loading;

  // A failed sub-hook read means the computed numbers are missing real rows —
  // "$0 por cobrar" derived from an errored fetch is the same false claim one
  // layer down.
  const combinedError = error || receivablesError || quotesError || clientsError;

  return {
    metrics,
    topClients,
    cashFlowForecast,
    loading: isInitialLoading,
    error: combinedError,
    refreshAnalytics: fetchAnalytics,
  };
}
