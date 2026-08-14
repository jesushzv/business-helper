/**
 * Plan Inicial's monthly quote quota (#271).
 *
 * The quota was stated four different ways on one pricing scroll — 50/mes on
 * /pricing and the landing, 25/mes in the Stripe plan card, "ilimitadas + 15
 * clientes" in the tier comparison — and no code enforced any of them. The
 * founder's decision: **50 cotizaciones al mes**, said once everywhere and
 * enforced here.
 *
 * Posture matches the trial gate one block above its call site: the gate
 * refuses only on a *known* overage. An unreadable tier or a failed count
 * answers "unknown" and allows — a billing-page blip must not stop a paying
 * tenant from quoting (#64), and the quota exists to price fairness, not to
 * fail closed on infrastructure.
 *
 * Only `inicial` is metered. `negocio`/`empresa` sell "ilimitadas"; an org
 * with no tier at all is on trial, and the trial gate owns that question.
 */

export const INICIAL_MONTHLY_QUOTE_LIMIT = 50;

export const QUOTE_QUOTA_CODE = 'QUOTE_QUOTA_EXCEEDED';
const QUOTE_QUOTA_MESSAGE =
  `Alcanzaste las ${INICIAL_MONTHLY_QUOTE_LIMIT} cotizaciones de este mes incluidas en tu Plan Inicial. ` +
  'Cambia al Plan Negocio en Ajustes para cotizar sin límite; el mes que entra tu contador vuelve a cero.';

interface QuotaGateResult {
  ok: boolean;
  code?: string;
  message?: string;
  status?: number;
  /** How many quotes this calendar month, when the gate counted them. */
  used?: number;
  limit?: number;
}

/** First instant of the current calendar month, UTC — the same clock every server date uses. */
export function monthStartISO(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function checkQuoteQuotaGate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  organizationId: string,
  now: Date = new Date()
): Promise<QuotaGateResult> {
  try {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('subscription_tier')
      .eq('id', organizationId)
      .maybeSingle();

    // Unknown tier never gates.
    if (orgError || !org) return { ok: true };
    if (org.subscription_tier !== 'inicial') return { ok: true };

    // `count` head request: the number, not the rows.
    const { count, error: countError } = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('created_at', monthStartISO(now));

    // A failed count is unknown, and unknown allows.
    if (countError || typeof count !== 'number') return { ok: true };

    if (count >= INICIAL_MONTHLY_QUOTE_LIMIT) {
      return {
        ok: false,
        code: QUOTE_QUOTA_CODE,
        message: QUOTE_QUOTA_MESSAGE,
        status: 402,
        used: count,
        limit: INICIAL_MONTHLY_QUOTE_LIMIT,
      };
    }

    return { ok: true, used: count, limit: INICIAL_MONTHLY_QUOTE_LIMIT };
  } catch {
    return { ok: true };
  }
}
