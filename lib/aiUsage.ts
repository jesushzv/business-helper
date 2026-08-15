/**
 * Server-derived AI quota (#228).
 *
 * The routes used to read `tierKey` and `currentUsage` from the request body —
 * the caller graded its own allowance, and the defaults meant the gate never
 * blocked anyone. Now the tier comes from `organizations.subscription_tier`
 * and usage from the `ai_usage_monthly` ledger, both read through the service
 * client (the ledger is RLS deny-all so a tenant cannot zero their own
 * counter via PostgREST).
 *
 * Only model-written answers count: the quota is a token budget, and a rules
 * answer costs nothing. Exhausted or *unknown* budget degrades to the rules
 * answer — the #64 tri-state applied to cost: a failed read must neither
 * refuse a healthy tenant (never a 403 off a blip) nor spend tokens against a
 * budget nobody verified.
 */

import { validateAIQuota, AIQuotaResult } from './aiAssistant';
import { captureException } from './sentry';

/** The ledger's month key, UTC. */
export function currentAIMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export interface AIModelBudget {
  quota: AIQuotaResult;
  used: number;
}

/**
 * Reads the organization's tier and this month's model-answer count.
 * Returns null when either read fails — unknown, not zero and not blocked.
 */
export async function resolveAIModelBudget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceSupabase: any,
  organizationId: string,
  now: Date = new Date()
): Promise<AIModelBudget | null> {
  const month = currentAIMonth(now);

  const [orgResult, usageResult] = await Promise.all([
    serviceSupabase
      .from('organizations')
      .select('subscription_tier')
      .eq('id', organizationId)
      .maybeSingle(),
    serviceSupabase
      .from('ai_usage_monthly')
      .select('used')
      .eq('organization_id', organizationId)
      .eq('month', month)
      .maybeSingle(),
  ]);

  if (orgResult.error || usageResult.error || !orgResult.data) {
    // Unknown budget silently degrades the routes to rules-only answers — the
    // right call for the tenant (#64), but invisible without this: a missing
    // table (deploy outran the migration) or a persistent read failure would
    // otherwise switch the model off indefinitely with nothing in Sentry.
    const detail =
      orgResult.error?.message || usageResult.error?.message || 'organización no encontrada';
    captureException(new Error(`presupuesto de IA ilegible: ${detail}`), {
      organization_id: organizationId,
      route: 'lib/aiUsage',
      level: 'warning',
    });
    return null;
  }

  // No ledger row is a real answer: zero model calls this month. An
  // unrecognised tier falls to the demo allowance inside validateAIQuota —
  // the smallest plan, a floor rather than an invented entitlement.
  const used = usageResult.data?.used ?? 0;
  const tier = typeof orgResult.data.subscription_tier === 'string' ? orgResult.data.subscription_tier : 'demo';

  return { quota: validateAIQuota(tier, used), used };
}

/**
 * Counts one model-written answer, atomically (`increment_ai_usage`,
 * service_role only). The answer has already been delivered when this runs,
 * so a failed count must not fail the request — it is reported, not thrown.
 */
export async function recordModelAnswer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceSupabase: any,
  organizationId: string,
  now: Date = new Date()
): Promise<boolean> {
  const { error } = await serviceSupabase.rpc('increment_ai_usage', {
    p_organization_id: organizationId,
    p_month: currentAIMonth(now),
  });

  if (error) {
    captureException(new Error(`increment_ai_usage falló: ${error.message || error.code || 'sin detalle'}`), {
      organization_id: organizationId,
      route: 'lib/aiUsage',
      level: 'warning',
    });
    return false;
  }
  return true;
}
