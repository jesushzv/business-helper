import { normalizeTierKey } from './stripe';

/**
 * Carrying "I want this plan" across the pages between the CTA and the payment.
 *
 * A visitor who clicks a plan on the pricing page may be three navigations away
 * from anywhere that can charge them — register, onboarding, then Ajustes — and
 * the tier used to survive none of them: `/register?plan=…` was a link nothing
 * read, so the choice died at the first hop and the tenant arrived on a
 * dashboard with no sign they had ever picked anything.
 *
 * These are the two hops that carry it. `/upgrade` decides where a click goes
 * (it needs the session, so it lives in `app/upgrade/route.ts`); this is the
 * plumbing after that decision, pure and testable on its own.
 */

/**
 * Appends a plan to a path, and only a plan this deployment sells.
 *
 * The value comes off a URL a visitor can type, and it ends up on another URL,
 * so it is normalized through the canonical tier map rather than echoed:
 * an unknown key returns the bare path instead of forwarding a value the
 * billing card would match against nothing.
 */
export function withPlanParam(path: string, plan: string | null | undefined): string {
  const tier = normalizeTierKey(plan || '');
  return tier ? `${path}?plan=${encodeURIComponent(tier)}` : path;
}

/**
 * Where onboarding hands off once the organization exists.
 *
 * With a plan in flight the tenant is mid-purchase and finishes on Ajustes with
 * that plan marked; without one, the dashboard, as before.
 */
export function postOnboardingPath(search: string): string {
  const plan = new URLSearchParams(search || '').get('plan');
  return withPlanParam('/settings', plan) === '/settings'
    ? '/dashboard'
    : withPlanParam('/settings', plan);
}
