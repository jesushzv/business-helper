import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/platformAdmin';

/**
 * GET /api/admin/metrics — the founder's cross-tenant snapshot.
 *
 * Everything here is read with the service role, so nothing below scopes by
 * organization_id — which is exactly why the route exists and why it sits
 * behind `requirePlatformAdmin()` and returns its refusal verbatim. No demo
 * fixtures on any path: a failed read is a 500, and a count the platform
 * cannot establish is `null`, never 0 (#64 — a failed read is not an empty
 * platform).
 */

/** The org list is paged; the total is reported separately so a cap is visible. */
const ORGANIZATIONS_PAGE_SIZE = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any;

async function headCount(service: ServiceClient, table: string): Promise<number> {
  const { count, error } = await service
    .from(table)
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`count(${table}): ${error.message}`);
  return count ?? 0;
}

function groupBy(rows: Array<Record<string, unknown>>, column: string): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const row of rows) {
    const key = typeof row[column] === 'string' ? (row[column] as string) : 'desconocido';
    groups[key] = (groups[key] ?? 0) + 1;
  }
  return groups;
}

export async function GET() {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { service } = auth.ctx;

  try {
    const {
      data: organizations,
      count: organizationsTotal,
      error: orgsError,
    } = await service
      .from('organizations')
      .select('id, name, subscription_tier, subscription_status, trial_ends_at, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(0, ORGANIZATIONS_PAGE_SIZE - 1);
    if (orgsError) throw new Error(`organizations: ${orgsError.message}`);
    const orgRows = organizations ?? [];

    const [clients, quotes, contracts, milestones] = await Promise.all([
      headCount(service, 'clients'),
      headCount(service, 'quotes'),
      headCount(service, 'contracts'),
      headCount(service, 'milestones'),
    ]);

    // Paged explicitly: PostgREST truncates un-ranged reads at its max-rows
    // (default 1000) with a 200 and no error, which would silently undercount
    // a money figure. The loop ends on the first short page.
    const CONFIRMED_PAGE = 1000;
    const confirmed: Array<{ amount: unknown }> = [];
    for (let from = 0; ; from += CONFIRMED_PAGE) {
      const { data: page, error: confirmedError } = await service
        .from('milestones')
        .select('amount')
        .eq('status', 'confirmed')
        .order('id', { ascending: true })
        .range(from, from + CONFIRMED_PAGE - 1);
      if (confirmedError) throw new Error(`milestones(confirmed): ${confirmedError.message}`);
      confirmed.push(...(page ?? []));
      if (!page || page.length < CONFIRMED_PAGE) break;
    }
    const confirmedAmount = confirmed.reduce(
      (sum: number, row: { amount: unknown }) =>
        sum + (typeof row.amount === 'number' ? row.amount : Number(row.amount) || 0),
      0
    );

    // GoTrue's admin API is a separate service from Postgres; its failure must
    // not take the panel down, and an unknown count stays null — rendering it
    // as 0 would report an empty platform on a blip.
    let users: number | null = null;
    try {
      const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error && typeof data?.total === 'number') users = data.total;
    } catch {
      users = null;
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      totals: {
        organizations: organizationsTotal ?? orgRows.length,
        users,
        clients,
        quotes,
        contracts,
        milestones,
        confirmed_payments: confirmed.length,
        confirmed_amount_mxn: Math.round(confirmedAmount * 100) / 100,
      },
      subscriptions: groupBy(orgRows, 'subscription_status'),
      tiers: groupBy(orgRows, 'subscription_tier'),
      organizations: orgRows,
      organizations_total: organizationsTotal ?? orgRows.length,
    });
  } catch (cause) {
    console.error('[admin/metrics] read failed:', cause);
    return NextResponse.json(
      {
        error: {
          code: 'ADMIN_METRICS_FAILED',
          message: 'No se pudieron calcular las métricas de la plataforma.',
        },
      },
      { status: 500 }
    );
  }
}
