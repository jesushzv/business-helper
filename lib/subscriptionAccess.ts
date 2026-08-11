/**
 * What an organization may do, given its subscription state.
 *
 * #128 asked what an organization that has never subscribed actually gets. The
 * answer taken was **a 30-day trial**, then read-only until a plan is bought.
 *
 * Before this existed the product was free with metered CFDI and nothing said
 * so. `subscription_tier` defaulted to `'free'` — a tier `STRIPE_PLANS` has
 * never contained — `subscription_status` defaulted to `'active'`, and
 * `validateSubscriptionStatus()` computed an `isAccessible` flag that **no
 * route, middleware or component ever read**. A tenant who had paid nothing
 * could quote, sign, collect and invoice exactly like one who had.
 *
 * ## Two rules this module will not bend
 *
 * **1. Unknown is permissive.** A row that fails to read, a status the CHECK
 * has grown that this code has not, a `trial_ends_at` that will not parse —
 * every one of them resolves to full access, and says `state: 'unknown'` so the
 * caller can tell that apart from a genuine `'active'`. The alternative is
 * locking a paying tenant out of their own receivables because one query
 * blipped, and that is far worse than a lapsed tenant getting a free afternoon.
 * This is #64's tri-state rule with the permissive branch chosen deliberately,
 * and #95's lesson that an unrecognised value must never be mapped to the
 * nearest one we happen to know.
 *
 * **2. Nothing here ever reaches a tenant's client.** `/q/[token]` and
 * `/pay/[token]` are the pages a *buyer* opens to sign and to pay. They resolve
 * a public token and have no session, so they never call this — and they must
 * not. A supplier's billing lapse is not their customer's problem, and money
 * already in flight has to keep flowing. `tests/unit/subscriptionAccess.test.ts`
 * fails the build if a public route ever imports this module.
 */

import { normalizeSubscriptionStatus } from '@/lib/stripe';

/** Trial length for a new organization. Fixed at 30 days by #128. */
export const TRIAL_PERIOD_DAYS = 30;

export type AccessState =
  /** Paying, or grandfathered by the #128 migration. */
  | 'active'
  /** Inside the 30-day trial. */
  | 'trialing'
  /** The trial ran out and no plan was bought. Reads only. */
  | 'trial_expired'
  /** Stripe says a payment failed. Access continues; this is a dunning state. */
  | 'past_due'
  /** Cancelled, unpaid, or otherwise finished. Reads only. */
  | 'inactive'
  /** Not determinable — a failed read or a value this code does not know. */
  | 'unknown';

export interface SubscriptionAccess {
  state: AccessState;
  /**
   * May the tenant create new commercial work — quotes, contracts, CFDI,
   * outbound reminders? Reading, exporting and *collecting money already owed*
   * are never gated, so there is no matching `canRead`: it is always true.
   */
  canWrite: boolean;
  /** Whole days left in the trial, or null when not trialing. Never negative. */
  trialDaysRemaining: number | null;
  /**
   * One sentence of Mexican Spanish for the tenant, or null when there is
   * nothing worth saying. Plain language, benefit-framed (hard rule 8) — no
   * "subscription_status", no "trial_ends_at".
   */
  message: string | null;
}

export interface SubscriptionAccessInput {
  /** `organizations.subscription_status`. */
  status: string | null | undefined;
  /** `organizations.trial_ends_at`, an ISO timestamp or null. */
  trialEndsAt: string | null | undefined;
  /** Injected so the result is a pure function of its inputs, and testable. */
  now: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `now` to `end`, rounded up, floored at 0. */
function daysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MS_PER_DAY));
}

function fullAccess(state: AccessState, message: string | null = null): SubscriptionAccess {
  return { state, canWrite: true, trialDaysRemaining: null, message };
}

export function evaluateSubscriptionAccess(
  input: SubscriptionAccessInput
): SubscriptionAccess {
  const { status, trialEndsAt, now } = input;

  // The stored vocabulary lives in `lib/stripe.ts` (#116) and is not restated
  // here — a second copy is how the tier list and the status list drifted from
  // their own CHECK constraints in the first place. `normalizeSubscriptionStatus`
  // answers null for anything outside it, which covers a failed read, an empty
  // string, and a value the constraint has grown that this code has not, in one
  // branch.
  //
  // It resolves them all to full access. Note this is the **opposite** of
  // `validateSubscriptionStatus`, which renders unknown as an inaccessible
  // "Estado desconocido" badge — deliberately, and the two are not in conflict.
  // A badge reporting uncertainty is honest; a *gate* that blocks on uncertainty
  // invents the fact that a tenant has not paid, and acts on it.
  const normalized = normalizeSubscriptionStatus(status);
  if (!normalized) return fullAccess('unknown');

  switch (normalized) {
    case 'active':
      return fullAccess('active');

    // Stripe's dunning window. The card failed but the subscription is alive
    // and Stripe is retrying; cutting a paying customer off mid-retry would
    // punish them for their bank's timing.
    case 'past_due':
      return fullAccess(
        'past_due',
        'No pudimos procesar tu último pago. Actualiza tu método de pago para no perder el acceso.'
      );

    case 'trialing':
      break;

    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return {
        state: 'inactive',
        canWrite: false,
        trialDaysRemaining: null,
        message:
          'Tu plan terminó. Puedes consultar y cobrar lo que ya tienes; ' +
          'para crear cotizaciones nuevas, activa un plan.',
      };

    // `incomplete` means a checkout was started and never finished. Nothing was
    // charged, but nothing was cancelled either — treating it as lapsed would
    // block a tenant mid-payment, which is the moment they are most valuable.
    case 'incomplete':
      return fullAccess('unknown');

    // Unreachable: `normalizeSubscriptionStatus` has already rejected anything
    // outside the vocabulary. Kept so a value added to SUBSCRIPTION_STATUSES
    // without a decision here lands on access rather than falling through to
    // the trial logic below with a status that is not 'trialing'.
    default:
      return fullAccess('unknown');
  }

  // status === 'trialing' from here.

  // Trialing with no end date is a half-written row, not an expired trial.
  if (!trialEndsAt) return fullAccess('unknown');

  const ends = new Date(trialEndsAt);
  if (Number.isNaN(ends.getTime())) return fullAccess('unknown');

  if (ends.getTime() > now.getTime()) {
    const remaining = daysUntil(ends, now);
    return {
      state: 'trialing',
      canWrite: true,
      trialDaysRemaining: remaining,
      // Only worth saying near the end; a countdown from day 30 is noise.
      message:
        remaining <= 7
          ? remaining === 1
            ? 'Tu prueba gratis termina mañana. Activa un plan para seguir creando cotizaciones.'
            : `Tu prueba gratis termina en ${remaining} días. Activa un plan para seguir creando cotizaciones.`
          : null,
    };
  }

  return {
    state: 'trial_expired',
    canWrite: false,
    trialDaysRemaining: 0,
    message:
      'Tu prueba gratis terminó. Puedes seguir consultando tu información y ' +
      'cobrando lo que ya facturaste; para crear cotizaciones nuevas, activa un plan.',
  };
}

/** The end of a trial starting now. Used when an organization is created. */
export function trialEndsAtFrom(start: Date): string {
  return new Date(start.getTime() + TRIAL_PERIOD_DAYS * MS_PER_DAY).toISOString();
}

/**
 * The error envelope a gated write returns.
 *
 * 402 rather than 403: this is "payment required", and the client branches on
 * the code to send the tenant to billing rather than to a permissions message.
 * Same shape as `FOLIOS_EXHAUSTED`, the other 402 in the app.
 */
export const SUBSCRIPTION_REQUIRED_CODE = 'SUBSCRIPTION_REQUIRED';
