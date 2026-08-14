import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import {
  calculateBusinessMetrics,
  getTopClientsByRevenue,
  calculateCashFlowForecast,
} from '@/lib/dashboardAnalytics';

import { MilestoneItem, QuoteItem } from '@/lib/dashboardAnalytics';

const DEMO_MILESTONES: MilestoneItem[] = [
  {
    id: 'milestone-demo-1',
    contract_id: 'contract-demo-1',
    client_id: 'client-demo-1',
    label: 'Anticipo 50% — Suministro Cemento',
    amount: 48720,
    due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'pending',
    confirmed_at: null,
  },
  {
    id: 'milestone-demo-2',
    contract_id: 'contract-demo-2',
    client_id: 'client-demo-2',
    label: 'Pago Inicial Estudio Geotécnico',
    amount: 17636.66,
    due_date: new Date().toISOString().split('T')[0],
    status: 'marked_paid',
    confirmed_at: null,
  },
  {
    id: 'milestone-demo-3',
    contract_id: 'contract-demo-1',
    client_id: 'client-demo-1',
    label: 'Entrega Final 50% — Cemento',
    amount: 48720,
    due_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'pending',
    confirmed_at: null,
  },
  {
    id: 'milestone-demo-4',
    contract_id: 'contract-demo-3',
    client_id: 'client-demo-3',
    label: 'Anticipo Proyecto Remodelación',
    amount: 30000,
    due_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'confirmed',
    confirmed_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const DEMO_QUOTES: QuoteItem[] = [
  { id: 'quote-demo-1', client_id: 'client-demo-1', status: 'sent', total_amount: 97440 },
  { id: 'quote-demo-2', client_id: 'client-demo-2', status: 'accepted', total_amount: 35273.32 },
];

const DEMO_CLIENTS = [
  { id: 'client-demo-1', name: 'Construcciones Maya S.A.', contact_name: 'Arq. Fernando Maya', phone: '8115551234', health_score: 95, rfc: 'CMA120315HD9' },
  { id: 'client-demo-2', name: 'Desarrollos Inmobiliarios del Norte', contact_name: 'Lic. Sofía Garza', phone: '8189998877', health_score: 65, rfc: 'DIN080920AB3' },
  { id: 'client-demo-3', name: 'Taller Industrial Regiomontano', contact_name: 'Roberto Gómez', phone: '8112223344', health_score: 100, rfc: 'GORR750412890' },
];

function getDemoAnalytics() {
  const metrics = calculateBusinessMetrics(DEMO_MILESTONES, DEMO_QUOTES, DEMO_CLIENTS);
  const topClients = getTopClientsByRevenue(DEMO_MILESTONES, DEMO_CLIENTS, 5);
  const cashFlowForecast = calculateCashFlowForecast(DEMO_MILESTONES);
  return { metrics, topClients, cashFlowForecast, demo: true };
}

export async function GET(request: Request) {
  // Whose "today"? The VIEWER's (#263 money-path review): this server runs in
  // UTC, so from 18:00 in Mexico its own date is tomorrow and a cobro due
  // today classified as Deuda Vencida — while the (client-computed) Cobranza
  // page said "Vence Hoy" about the same cobro. The client sends its local
  // day as ?today=; anything malformed falls back to the server clock, which
  // is no worse than before. Classification input only — it scopes no query.
  const todayParam = new URL(request.url).searchParams.get('today');
  const viewerToday = todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam) ? todayParam : undefined;

  // With no backend there is no tenant data, so demo analytics are honest.
  if (!isSupabaseConfigured()) {
    return NextResponse.json(getDemoAnalytics());
  }

  // Previously unauthenticated: an anonymous caller got a tenant's revenue
  // metrics, top clients and cash-flow forecast, or demo figures presented
  // identically when the query failed.
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestones } = await (supabase as any)
      .from('milestones')
      .select('id, contract_id, client_id, label, amount, due_date, status, confirmed_at')
      .eq('organization_id', organizationId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quotes } = await (supabase as any)
      .from('quotes')
      .select('id, client_id, status, total_amount')
      .eq('organization_id', organizationId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clients } = await (supabase as any)
      .from('clients')
      .select('id, name, contact_name, phone, health_score, rfc')
      .eq('organization_id', organizationId);

    const milestoneList = milestones || [];
    const quoteList = quotes || [];
    const clientList = clients || [];

    const metrics = calculateBusinessMetrics(milestoneList, quoteList, clientList, viewerToday);
    const topClients = getTopClientsByRevenue(milestoneList, clientList, 5);
    const cashFlowForecast = calculateCashFlowForecast(milestoneList, viewerToday);

    return NextResponse.json({
      metrics,
      topClients,
      cashFlowForecast,
    });
  } catch {
    // An authenticated tenant must not be shown demo figures on failure —
    // they are indistinguishable from real ones in the UI.
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: 'No se pudieron calcular las métricas de tu negocio.' } }, { status: 500 });
  }
}

