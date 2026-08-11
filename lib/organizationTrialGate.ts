import { isStripeConfigured } from './stripeClient';
import { resolveTrialState, type TrialState } from './subscriptionTrial';

/**
 * Server-side read of an organization's trial state (#128).
 *
 * Kept out of `lib/subscriptionTrial.ts` so that module stays pure and
 * importable from the browser: this one reaches for `STRIPE_SECRET_KEY`, which
 * has no business in a client bundle.
 *
 * ## Failure is permissive, on purpose
 *
 * If the read fails — a network blip, or the column not existing yet because
 * the migration has not been applied to this environment — the answer is
 * "unknown", and unknown never gates. The gate exists to create a commercial
 * forcing function, not to protect anything, so the cost of being wrong is
 * asymmetric: wrongly allowing a quote costs a quote's worth of revenue,
 * wrongly refusing one takes a tenant's product away over an error they cannot
 * see or fix. That is the #64 tri-state rule with the permissive branch chosen
 * deliberately rather than by accident.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function readOrganizationTrialState(
  supabase: any,
  organizationId: string,
  now: Date = new Date()
): Promise<TrialState> {
  const checkoutAvailable = isStripeConfigured();

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('subscription_status, subscription_tier, trial_ends_at')
      .eq('id', organizationId)
      .maybeSingle();

    if (error || !data) {
      return resolveTrialState(null, { now, checkoutAvailable });
    }

    return resolveTrialState(data, { now, checkoutAvailable });
  } catch {
    return resolveTrialState(null, { now, checkoutAvailable });
  }
}
