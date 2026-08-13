'use client';

import { useCallback, useEffect, useState } from 'react';
import { notFound } from 'next/navigation';

/**
 * /admin — the founder panel.
 *
 * Platform-wide metrics and owner actions, gated by data rather than markup:
 * `/api/admin/metrics` answers 404 for anyone off `PLATFORM_ADMIN_USER_IDS`,
 * and this page then vanishes behind `notFound()` instead of rendering an
 * empty admin shell. There is deliberately no demo state and no fixture here
 * — a failed read shows an error, never invented tenants (#93/#96).
 *
 * Desktop-first on purpose: this is the Lic. Mariana form factor, and the one
 * user of this page is the founder at a keyboard.
 */

interface AdminOrgRow {
  id: string;
  name: string;
  subscription_tier: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  created_at: string | null;
}

interface AdminMetrics {
  generated_at: string;
  totals: {
    organizations: number;
    users: number | null;
    clients: number;
    quotes: number;
    contracts: number;
    milestones: number;
    confirmed_payments: number;
    confirmed_amount_mxn: number;
  };
  subscriptions: Record<string, number>;
  tiers: Record<string, number>;
  organizations: AdminOrgRow[];
  organizations_total: number;
}

const EXTENSION_DAYS = 30;

function formatMxn(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(amount);
}

function groupRows(
  rows: AdminOrgRow[],
  key: 'subscription_status' | 'subscription_tier'
): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const row of rows) {
    const value = typeof row[key] === 'string' ? (row[key] as string) : 'desconocido';
    groups[value] = (groups[value] ?? 0) + 1;
  }
  return groups;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toISOString().slice(0, 10);
}

function StatTile({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p data-testid={testId} className="mt-1 text-2xl font-black text-white">
        {value}
      </p>
    </div>
  );
}

function BreakdownList({ title, groups }: { title: string; groups: Record<string, number> }) {
  const entries = Object.entries(groups);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="mt-2 space-y-1">
        {entries.length === 0 ? (
          <li className="text-sm text-slate-500">Sin datos</li>
        ) : (
          entries.map(([key, count]) => (
            <li key={key} className="flex justify-between text-sm text-slate-200">
              <span>{key}</span>
              <span className="font-bold">{count}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default function AdminPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [gone, setGone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/metrics');
        if (cancelled) return;
        if (response.status === 404) {
          setGone(true);
          return;
        }
        const body = await response.json();
        if (!response.ok) {
          setLoadError(
            body?.error?.message || 'No se pudieron cargar las métricas de la plataforma.'
          );
          return;
        }
        setMetrics(body as AdminMetrics);
      } catch {
        if (!cancelled) {
          setLoadError('No se pudieron cargar las métricas de la plataforma.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExtendTrial = useCallback(
    async (orgId: string) => {
      setExtendingId(orgId);
      setRowErrors((prev) => ({ ...prev, [orgId]: '' }));
      try {
        const response = await fetch(`/api/admin/organizations/${orgId}/trial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: EXTENSION_DAYS }),
        });
        const body = await response.json();
        if (!response.ok) {
          setRowErrors((prev) => ({
            ...prev,
            [orgId]: body?.error?.message || 'No se pudo extender la prueba.',
          }));
          return;
        }
        // The server's readback is the only row worth rendering (#33/#50/#59),
        // and the breakdowns are regrouped from the patched rows so they never
        // describe a list the table no longer shows.
        const updated = body.organization as AdminOrgRow;
        setMetrics((prev) => {
          if (!prev) return prev;
          const organizations = prev.organizations.map((org) =>
            org.id === updated.id ? { ...org, ...updated } : org
          );
          return {
            ...prev,
            organizations,
            subscriptions: groupRows(organizations, 'subscription_status'),
            tiers: groupRows(organizations, 'subscription_tier'),
          };
        });
      } catch {
        setRowErrors((prev) => ({
          ...prev,
          [orgId]: 'No se pudo extender la prueba.',
        }));
      } finally {
        setExtendingId(null);
      }
    },
    []
  );

  if (gone) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#090D16] px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <p className="text-xs font-extrabold uppercase tracking-widest text-emerald-400">
            Business Helper
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
            Panel del fundador
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Métricas de toda la plataforma y acciones de soporte.
          </p>
        </header>

        {loadError ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-200"
          >
            {loadError}
          </div>
        ) : null}

        {!metrics && !loadError ? (
          <p className="text-sm text-slate-400">Cargando métricas…</p>
        ) : null}

        {metrics ? (
          <>
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile
                label="Organizaciones"
                value={String(metrics.totals.organizations)}
                testId="total-organizations"
              />
              <StatTile
                label="Usuarios"
                value={metrics.totals.users === null ? '—' : String(metrics.totals.users)}
                testId="total-users"
              />
              <StatTile
                label="Cotizaciones"
                value={String(metrics.totals.quotes)}
                testId="total-quotes"
              />
              <StatTile
                label="Contratos"
                value={String(metrics.totals.contracts)}
                testId="total-contracts"
              />
              <StatTile
                label="Clientes"
                value={String(metrics.totals.clients)}
                testId="total-clients"
              />
              <StatTile
                label="Pagos (todos los estados)"
                value={String(metrics.totals.milestones)}
                testId="total-milestones"
              />
              <StatTile
                label="Pagos confirmados"
                value={String(metrics.totals.confirmed_payments)}
                testId="total-confirmed-payments"
              />
              <StatTile
                label="Cobrado confirmado"
                value={formatMxn(metrics.totals.confirmed_amount_mxn)}
                testId="total-confirmed-amount"
              />
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* When the org list is capped, the breakdowns describe the page,
                  not the platform — the qualifier keeps them honest. */}
              <BreakdownList
                title={
                  metrics.organizations.length < metrics.organizations_total
                    ? `Suscripciones por estado (últimas ${metrics.organizations.length})`
                    : 'Suscripciones por estado'
                }
                groups={metrics.subscriptions}
              />
              <BreakdownList
                title={
                  metrics.organizations.length < metrics.organizations_total
                    ? `Organizaciones por plan (últimas ${metrics.organizations.length})`
                    : 'Organizaciones por plan'
                }
                groups={metrics.tiers}
              />
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900">
              <div className="flex items-baseline justify-between px-4 pt-4">
                <h2 className="text-lg font-bold text-white">Organizaciones</h2>
                <p className="text-xs text-slate-400">
                  Mostrando {metrics.organizations.length} de {metrics.organizations_total}
                </p>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4">Organización</th>
                      <th className="pb-2 pr-4">Plan</th>
                      <th className="pb-2 pr-4">Estado</th>
                      <th className="pb-2 pr-4">Fin de prueba</th>
                      <th className="pb-2 pr-4">Alta</th>
                      <th className="pb-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.organizations.map((org) => (
                      <tr key={org.id} className="border-t border-slate-800 align-top">
                        <td className="py-3 pr-4 font-semibold text-white">{org.name}</td>
                        <td className="py-3 pr-4 text-slate-300">
                          {org.subscription_tier ?? '—'}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {org.subscription_status ?? '—'}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">
                          {formatDate(org.trial_ends_at)}
                        </td>
                        <td className="py-3 pr-4 text-slate-300">{formatDate(org.created_at)}</td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => handleExtendTrial(org.id)}
                            disabled={extendingId === org.id}
                            className="min-h-[48px] rounded-xl border border-emerald-500/40 bg-emerald-950 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-900 disabled:opacity-50"
                          >
                            {extendingId === org.id
                              ? 'Extendiendo…'
                              : `Extender prueba ${EXTENSION_DAYS} días`}
                          </button>
                          {rowErrors[org.id] ? (
                            <p role="alert" className="mt-1 max-w-[220px] text-xs text-red-300">
                              {rowErrors[org.id]}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
