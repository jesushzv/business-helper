import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/platformAdmin';
import { normalizeSubscriptionStatus } from '@/lib/stripe';
import { apiError } from '@/lib/apiError';

/**
 * POST /api/admin/organizations/[id]/trial — extend (or restart) a trial.
 *
 * The founder's support action: give a tenant more trial runway, or restart a
 * canceled one as trialing (win-back). Two boundaries keep it honest:
 *
 *   - `active` / `past_due` are refused. Stripe's webhook is the only writer
 *     of a live subscription's state (#116/#171); an admin overwrite here
 *     would be silently undone by the next webhook event, which is the worst
 *     kind of success.
 *   - The response carries the row the UPDATE returned, never the values the
 *     caller asked for — a write that half-happened must look half-happened.
 *
 * Every grant leaves an audit_logs row naming the admin, so "why is this
 * tenant still on trial?" has an answer months later.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A year of trial via repeated grants is a decision; via one typo it is a bug. */
const MAX_EXTENSION_DAYS = 365;

/**
 * One of the two private copies of the envelope this route used to carry
 * (#322 item 2). Kept as a thin alias rather than renamed at 11 call sites:
 * the shape now comes from `lib/apiError.ts`, which is the point.
 */
const error = apiError;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;
  const { service, userId } = auth.ctx;
  const { id } = await params;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const days = (body as { days?: unknown } | null)?.days;
  if (
    typeof days !== 'number' ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > MAX_EXTENSION_DAYS
  ) {
    return error(
      422,
      'INVALID_DAYS',
      `La extensión debe ser un número entero de días entre 1 y ${MAX_EXTENSION_DAYS}.`
    );
  }

  const { data: organization, error: readError } = await service
    .from('organizations')
    .select('id, name, subscription_status, stripe_subscription_id, trial_ends_at')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    console.error('[admin/trial] read failed:', readError);
    return error(500, 'ADMIN_TRIAL_READ_FAILED', 'No se pudo leer la organización.');
  }
  if (!organization) {
    return error(404, 'ORGANIZATION_NOT_FOUND', 'Organización no encontrada.');
  }

  const status = normalizeSubscriptionStatus(organization.subscription_status);
  if (status === 'active' || status === 'past_due') {
    return error(
      409,
      'SUBSCRIPTION_ACTIVE',
      'La organización ya tiene una suscripción activa; su estado lo administra Stripe y la prueba no aplica.'
    );
  }

  // Status alone cannot tell an app trial from a Stripe-owned one: `unpaid`,
  // `incomplete` and Stripe's own `trialing` all carry a live subscription
  // whose next webhook event nulls `trial_ends_at` — the grant would evaporate
  // silently while Stripe keeps charging on its own schedule. A non-null
  // subscription id is the ownership fact; those orgs are managed in Stripe.
  // (`canceled` is safe: the deletion webhook clears the id, so win-back works.)
  if (organization.stripe_subscription_id) {
    return error(
      409,
      'STRIPE_OWNED',
      'Esta organización tiene una suscripción en Stripe; su estado se gestiona desde Stripe, no desde este panel.'
    );
  }

  // Extend from whichever is later: today, or the trial's current end. An
  // expired or absent end date extends from now; a running trial stacks.
  const now = Date.now();
  const currentEnd = Date.parse(String(organization.trial_ends_at ?? ''));
  const base = Number.isNaN(currentEnd) ? now : Math.max(now, currentEnd);
  const newEnd = new Date(base + days * DAY_MS).toISOString();

  // The refusal above raced a concurrent Stripe webhook the moment it was
  // read, so the UPDATE re-states it as a filter: if the webhook wrote
  // `active`/`past_due` between the read and here, zero rows match and the
  // 409 stands instead of clobbering a paying subscription to `trialing`.
  const { data: updated, error: updateError } = await service
    .from('organizations')
    .update({ trial_ends_at: newEnd, subscription_status: 'trialing' })
    .eq('id', id)
    .not('subscription_status', 'in', '("active","past_due")')
    .select('id, name, subscription_status, trial_ends_at')
    .maybeSingle();
  if (updateError) {
    console.error('[admin/trial] update failed:', updateError);
    return error(
      500,
      'ADMIN_TRIAL_UPDATE_FAILED',
      'No se pudo extender la prueba; el cambio no se aplicó.'
    );
  }
  if (!updated) {
    return error(
      409,
      'SUBSCRIPTION_ACTIVE',
      'La organización ya tiene una suscripción activa; su estado lo administra Stripe y la prueba no aplica.'
    );
  }

  // Best-effort by design: the grant above is already durable, and un-writing
  // it because its log line failed would trade a real change for a clean
  // ledger. A failure is still loud in the server log.
  const { error: auditError } = await service.from('audit_logs').insert({
    organization_id: updated.id,
    action: 'platform_admin_trial_extended',
    actor: userId,
    details: `trial_ends_at ${organization.trial_ends_at ?? 'sin fecha'} -> ${updated.trial_ends_at} (+${days} días)`,
  });
  if (auditError) {
    console.error('[admin/trial] audit insert failed:', auditError);
  }

  return NextResponse.json({
    organization: updated,
    previous_trial_ends_at: organization.trial_ends_at ?? null,
  });
}
