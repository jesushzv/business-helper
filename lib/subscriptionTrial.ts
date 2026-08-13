/**
 * The trial an organization gets before it subscribes (#128).
 *
 * `organizations.subscription_tier` defaulted to `'free'` — a plan that exists
 * in no price list — and `subscription_status` to `'active'`, and nothing in the
 * app read either. The product was therefore free with metered CFDI and said so
 * nowhere. A pilot cohort that never meets a paywall produces no signal about
 * willingness to pay, which is the false negative the launch framing exists to
 * prevent.
 *
 * ## What "gated" means here, and what it deliberately does not
 *
 * An expired trial blocks **starting new work** — creating a quote — and
 * nothing else. Everything already in flight keeps running: a client can still
 * open, sign and pay a quote that is already out; payments still confirm; CFDIs
 * for work already done still stamp; every read, export and download stays
 * open. Locking a tenant out of collecting money they have already earned would
 * be a worse product than charging nothing, and it would strand their *clients*
 * — people who never agreed to anything with us — mid-signature.
 *
 * ## Why the gate is conditional on being able to pay
 *
 * #68 (live Stripe mode) is open: no organization can complete a checkout yet.
 * A gate that fires before there is a way through it is a dead end, not a
 * forcing function — so `resolveTrialState` refuses to gate unless checkout is
 * actually available, and says so through `gateEnforced`. This is a stated
 * dependency, not a hidden flag: when #68 lands and the keys are configured, the
 * gate begins to bite on its own. Until then the trial is honest information —
 * a countdown a tenant can see — and nothing more.
 */

import { normalizeSubscriptionStatus } from './stripe';

/**
 * How long a new organization gets.
 *
 * 14, by the founder's decision on #270: marketing promised 14 días on every
 * surface while the product granted 30, so one of the two was wrong for every
 * signup — and the marketing number is the real one. Existing trialing
 * organizations keep the end date already stored on their row; only new grants
 * change (the migration alters the column DEFAULT, never stored values).
 */
export const TRIAL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialKind =
  /** Inside the trial window. */
  | 'trialing'
  /** The trial's end date has passed and no subscription replaced it. */
  | 'expired'
  /** Stripe reports a subscription — the trial no longer decides anything. */
  | 'subscribed'
  /** Stripe is collecting but the last payment failed; not our gate's business. */
  | 'past_due'
  /**
   * Unknown: no trial recorded, an unreadable row, or a status this code does
   * not model. Never treated as expired — inventing an expiry for a row that
   * says nothing is the #64 mistake, and the permissive branch is the safe one
   * because it only ever *allows*.
   */
  | 'unknown';

export interface OrganizationTrialRow {
  subscription_status?: unknown;
  subscription_tier?: unknown;
  trial_ends_at?: unknown;
}

export interface TrialState {
  kind: TrialKind;
  /** Whole days remaining, rounded up; null when there is no trial end date. */
  daysLeft: number | null;
  /** The trial's end, ISO, or null when none is recorded. */
  endsAt: string | null;
  /** Whether the "start new work" gate applies to this organization right now. */
  blocksNewWork: boolean;
  /**
   * Whether the gate is enforceable at all in this deployment — false while
   * there is no configured way to subscribe (#68). Reported rather than
   * silently folded into `blocksNewWork`, so a caller can explain the state
   * instead of guessing at it.
   */
  gateEnforced: boolean;
}

/** The end date a trial starting now would carry. */
export function trialEndsAt(now: Date = new Date(), days: number = TRIAL_DAYS): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface ResolveTrialOptions {
  now?: Date;
  /**
   * Whether this deployment can take a payment at all. Passed in rather than
   * read here so the module stays pure and the caller — which already knows
   * whether it is the server or the browser — decides.
   */
  checkoutAvailable?: boolean;
}

/**
 * Reads an organization row's subscription columns into the one state the rest
 * of the app should branch on.
 */
export function resolveTrialState(
  row: OrganizationTrialRow | null | undefined,
  { now = new Date(), checkoutAvailable = false }: ResolveTrialOptions = {}
): TrialState {
  const base = { gateEnforced: checkoutAvailable };

  if (!row) {
    return { kind: 'unknown', daysLeft: null, endsAt: null, blocksNewWork: false, ...base };
  }

  // Read through the app's one subscription vocabulary (#171), not a second
  // copy of it: anything the column's CHECK would reject is not a status, and
  // normalizeSubscriptionStatus answers null rather than the nearest listed one.
  // A null lands in the unmodelled branch below, which does not gate.
  const status = normalizeSubscriptionStatus(row.subscription_status);
  const endsAtDate = parseDate(row.trial_ends_at);
  const endsAt = endsAtDate ? endsAtDate.toISOString() : null;

  // A real subscription outranks anything the trial columns say — the webhook is
  // the only writer of these, and it must win over a stale trial_ends_at.
  if (status === 'active') {
    return { kind: 'subscribed', daysLeft: null, endsAt, blocksNewWork: false, ...base };
  }
  if (status === 'past_due') {
    return { kind: 'past_due', daysLeft: null, endsAt, blocksNewWork: false, ...base };
  }

  if (status === 'trialing') {
    if (!endsAtDate) {
      // Trialing with no end date says nothing about when it ends, so it cannot
      // be expired. Honest answer: unknown, and no gate.
      return { kind: 'unknown', daysLeft: null, endsAt: null, blocksNewWork: false, ...base };
    }
    const remainingMs = endsAtDate.getTime() - now.getTime();
    if (remainingMs > 0) {
      return {
        kind: 'trialing',
        daysLeft: Math.ceil(remainingMs / DAY_MS),
        endsAt,
        blocksNewWork: false,
        ...base,
      };
    }
    return { kind: 'expired', daysLeft: 0, endsAt, blocksNewWork: checkoutAvailable, ...base };
  }

  // canceled / unpaid / incomplete / anything unmodelled. `validateSubscriptionStatus`
  // owns how those are badged; the trial gate does not add a second opinion.
  return { kind: 'unknown', daysLeft: null, endsAt, blocksNewWork: false, ...base };
}

/** What the tenant is told when the gate refuses a new quote. Plain Spanish. */
export const TRIAL_EXPIRED_MESSAGE =
  'Tu prueba gratis terminó. Elige un plan para seguir creando cotizaciones — lo que ya enviaste ' +
  'sigue funcionando: tus clientes pueden firmarlo y pagarlo, y puedes facturar lo que ya cerraste.';

/** Machine code for that refusal, so the UI can route to the plans page. */
export const TRIAL_EXPIRED_CODE = 'TRIAL_EXPIRED';
