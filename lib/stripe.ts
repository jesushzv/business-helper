/**
 * Business Helper — Stripe Subscription Billing Engine
 * 
 * Provides tier configurations, checkout session payload creation,
 * environment secret auditing, and subscription status validation for Mexican SMBs.
 * CFDI stamping is not billed here: tenants stamp through their own PAC, which
 * bills them directly (BYOK, #221) — the folio-pack products were removed with it.
 */

import { getAppBaseUrl } from './url';

export type StripeTierId = 'inicial' | 'negocio' | 'empresa';

type EnvRecord = Record<string, string | undefined>;

export interface StripeTierConfig {
  id: StripeTierId;
  name: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  features: string[];
  popular?: boolean;
}

/**
 * Which environment variable carries each product's Stripe Price id.
 *
 * These used to be `process.env.STRIPE_PRICE_NEGOCIO || 'price_negocio_599_mxn'`
 * on the config object itself, which was wrong twice over. The literal is a
 * fabricated identifier (hard rule #1, the #44/#78/#106 shape): with a live
 * secret key and the variable unset, checkout posted a price id no Stripe
 * account has ever had, and the owner saw the same "no se pudo iniciar el pago"
 * as a Stripe outage. And because `STRIPE_PLANS` is imported by a client
 * component, the browser bundle only ever saw the placeholder — non-`NEXT_PUBLIC_`
 * variables do not cross that boundary.
 *
 * The id is therefore resolved from the environment on demand, server-side, and
 * is `null` when unset. Absent is absent.
 */
export const TIER_PRICE_ENV_VARS: Record<StripeTierId, string[]> = {
  // STRIPE_PRICE_INICIAL is the current name; the pre-rename variable still works.
  inicial: ['STRIPE_PRICE_INICIAL', 'STRIPE_PRICE_EMPRENDEDOR'],
  negocio: ['STRIPE_PRICE_NEGOCIO'],
  empresa: ['STRIPE_PRICE_EMPRESA'],
};

export const STRIPE_PLANS: Record<string, StripeTierConfig> = {
  inicial: {
    id: 'inicial',
    name: 'Plan Inicial',
    price: 299,
    currency: 'MXN',
    interval: 'mes',
    description: 'Ideal para independientes y freelancers que van iniciando.',
    features: [
      'Hasta 25 cotizaciones por mes',
      'Firma digital con código OTP por correo',
      'Portal público de carga SPEI',
      'Timbrado CFDI 4.0 con tu propio PAC (Facturapi) — tu proveedor te cobra el timbrado, tú conservas tus sellos CSD.',
      'Soporte por correo electrónico',
    ],
  },
  negocio: {
    id: 'negocio',
    name: 'Plan Negocio',
    price: 599,
    currency: 'MXN',
    interval: 'mes',
    description: 'Para negocios en crecimiento que requieren control total.',
    popular: true,
    features: [
      'Cotizaciones ilimitadas',
      'Timbrado CFDI 4.0 con tu propio PAC (Facturapi) — tu proveedor te cobra el timbrado, tú conservas tus sellos CSD.',
      'Aprobación digital OTP con Evidencia Legal',
      'Recordatorios automáticos de WhatsApp',
      'Centro de Control y Proyección de Flujo 90 días',
      'Soporte prioritario por correo',
    ],
  },
  empresa: {
    id: 'empresa',
    name: 'Plan Empresa',
    price: 999,
    currency: 'MXN',
    interval: 'mes',
    description: 'Para empresas estructuradas con múltiples operaciones.',
    features: [
      'Todo lo del Plan Negocio',
      'Timbrado CFDI 4.0 con tu propio PAC (Facturapi) — tu proveedor te cobra el timbrado, tú conservas tus sellos CSD.',
      'Multi-usuario y roles de equipo',
      'Exportación masiva para contador',
      'Asesoría fiscal SAT personalizada',
      'Gerente de cuenta dedicado',
    ],
  },
};

/**
 * Every tier key the product has ever advertised, mapped to the plan it bills.
 *
 * The pricing page sells `starter` / `pro` / `business`; `lib/tierFeaturesData.ts`
 * calls the same three `inicial` / `pro` / `enterprise`; the database stores
 * `inicial` / `negocio` / `empresa`. Only the first alias was mapped, so
 * `getStripeTierConfig('pro')` — the $599 tier — fell through to Inicial and
 * billed the wrong plan.
 */
const TIER_ALIASES: Record<string, StripeTierId> = {
  inicial: 'inicial',
  starter: 'inicial',
  emprendedor: 'inicial',
  basico: 'inicial',
  negocio: 'negocio',
  pro: 'negocio',
  empresa: 'empresa',
  business: 'empresa',
  enterprise: 'empresa',
};

/** Resolves any advertised or stored tier key to a canonical plan id, or null if unknown. */
export function normalizeTierKey(tierKey: string): StripeTierId | null {
  return TIER_ALIASES[(tierKey || '').toLowerCase().trim()] ?? null;
}

/** Stripe Price ids — the only thing `line_items[0][price]` accepts. */
const PRICE_ID_PATTERN = /^price_[A-Za-z0-9_]+$/;

/**
 * What a configured `STRIPE_PRICE_*` value actually is.
 *
 * `'product'` is not a hypothetical. Production ran for days with all three
 * variables set to the **Product** ids from the Stripe dashboard
 * (`prod_V0DOcZFUtjlMkb` and its two siblings): Checkout answered
 * `No such price: 'prod_…'`, the route turned that into the same generic
 * "no se pudo iniciar el pago" a Stripe outage produces, and the founder could
 * not tell a typo from an incident. A product id is one dashboard click away
 * from the price id underneath it, so it earns its own diagnosis.
 */
export function describePriceIdShape(value: string): 'price' | 'product' | 'other' {
  const trimmed = (value || '').trim();
  if (PRICE_ID_PATTERN.test(trimmed)) return 'price';
  if (/^prod_[A-Za-z0-9_]+$/.test(trimmed)) return 'product';
  return 'other';
}

/**
 * The outcome of looking up a product's Price id in the environment.
 *
 * Three states, not two: unset and *set to something Stripe cannot bill* need
 * different words to the person who has to fix it, and collapsing them is how
 * the second one hid behind a 502 for as long as it did.
 */
export type PriceIdResolution =
  | { ok: true; priceId: string; envVar: string }
  | { ok: false; code: 'NOT_CONFIGURED'; envVar: string }
  | { ok: false; code: 'NOT_A_PRICE_ID'; envVar: string; value: string; shape: 'product' | 'other' };

function resolvePriceEnv(envVars: string[], env: EnvRecord): PriceIdResolution {
  for (const name of envVars) {
    const value = env[name]?.trim();
    if (!value) continue;

    const shape = describePriceIdShape(value);
    if (shape === 'price') return { ok: true, priceId: value, envVar: name };
    return { ok: false, code: 'NOT_A_PRICE_ID', envVar: name, value, shape };
  }

  return { ok: false, code: 'NOT_CONFIGURED', envVar: envVars[0] };
}

/** Resolves a tier's Price id, distinguishing "unset" from "not a price id". */
export function resolveTierPriceEnv(tierKey: string, env: EnvRecord = process.env): PriceIdResolution {
  const tierId = normalizeTierKey(tierKey);
  if (!tierId) return { ok: false, code: 'NOT_CONFIGURED', envVar: 'STRIPE_PRICE_*' };
  return resolvePriceEnv(TIER_PRICE_ENV_VARS[tierId], env);
}

/**
 * Entitlement lookup: an unrecognised key resolves to Inicial, the smallest
 * entitlement, so an unknown stored value never grants features it did not buy.
 * Use `normalizeTierKey` where an unknown key must be refused rather than
 * downgraded — charging is one of those places.
 */
export function getStripeTierConfig(tierKey: string): StripeTierConfig {
  return STRIPE_PLANS[normalizeTierKey(tierKey) ?? 'inicial'];
}

/**
 * The configured Stripe Price id for a tier, or null when its variable is unset
 * **or holds something that is not a Price id**.
 *
 * Null for a malformed value on purpose: every caller of this treats what it
 * returns as billable, and `resolveTierFromPriceId` treats it as the identity
 * of a tier. A value Checkout would reject must never be either.
 */
export function resolveTierPriceId(tierKey: string, env: EnvRecord = process.env): string | null {
  const resolved = resolveTierPriceEnv(tierKey, env);
  return resolved.ok ? resolved.priceId : null;
}

/**
 * Where Checkout sends the payer back. `(dashboard)` is a route group, so the
 * settings page is served at `/settings` — `/dashboard/settings`, which this
 * default used to be, is a 404. It only ever showed up as one when a caller
 * omitted `returnUrl`.
 */
const DEFAULT_RETURN_PATH = '/settings';

/** Parameters checkout owns on the return URL; a stale copy of one is dropped. */
const RESERVED_RETURN_PARAMS = ['session_id', 'status', 'pack'];

/**
 * Builds a return URL carrying checkout's outcome parameters.
 *
 * The old form was `${returnUrl}?session_id=…&status=success`, and `returnUrl`
 * is `window.location.href` — which, the moment a payer comes back from a
 * cancelled session, already ends in `?status=cancelled`. That produced
 * `…?status=cancelled?session_id={CHECKOUT_SESSION_ID}&status=success`: two
 * `?`, and a `status` whose *first* value — the one `URLSearchParams.get`
 * returns — says the payment was cancelled on the URL Stripe redirects to
 * after a successful one.
 *
 * The parameters are appended as raw text rather than through `searchParams`
 * so `{CHECKOUT_SESSION_ID}` reaches Stripe literally; percent-encoded braces
 * are not the placeholder Stripe substitutes.
 */
function buildReturnUrl(returnUrl: string | undefined, params: string): string {
  let url: URL;
  try {
    url = new URL(returnUrl || `${getAppBaseUrl()}${DEFAULT_RETURN_PATH}`);
  } catch {
    url = new URL(`${getAppBaseUrl()}${DEFAULT_RETURN_PATH}`);
  }

  // A fragment after the query would swallow the parameters we are adding.
  url.hash = '';
  for (const name of RESERVED_RETURN_PARAMS) url.searchParams.delete(name);

  const kept = url.searchParams.toString();
  url.search = '';

  return `${url.toString()}?${kept ? `${kept}&` : ''}${params}`;
}

export type CheckoutPayloadResult =
  | { ok: true; payload: Record<string, unknown>; tierId: StripeTierId }
  | { ok: false; code: 'UNKNOWN_TIER' }
  | { ok: false; code: 'PRICE_NOT_CONFIGURED'; tierId: StripeTierId; envVar: string }
  | {
      ok: false;
      code: 'PRICE_ID_MALFORMED';
      tierId: StripeTierId;
      envVar: string;
      value: string;
      shape: 'product' | 'other';
    };

/**
 * Builds the Checkout Session payload for a subscription tier.
 *
 * Returns a failure rather than a payload when the tier has no Price id: a
 * session cannot be created without one, and the caller needs to say *which*
 * variable is missing. Guessing a price id here is how a live deployment
 * charges the wrong amount — the failure #68 calls out as worse than not
 * charging at all.
 */
export function createCheckoutPayload(
  tierKey: string,
  organizationId: string,
  returnUrl?: string,
  env: EnvRecord = process.env
): CheckoutPayloadResult {
  const tierId = normalizeTierKey(tierKey);
  if (!tierId) return { ok: false, code: 'UNKNOWN_TIER' };

  const resolved = resolveTierPriceEnv(tierId, env);
  if (!resolved.ok) {
    if (resolved.code === 'NOT_A_PRICE_ID') {
      return {
        ok: false,
        code: 'PRICE_ID_MALFORMED',
        tierId,
        envVar: resolved.envVar,
        value: resolved.value,
        shape: resolved.shape,
      };
    }
    return {
      ok: false,
      code: 'PRICE_NOT_CONFIGURED',
      tierId,
      envVar: resolved.envVar,
    };
  }

  const priceId = resolved.priceId;
  const metadata = {
    organization_id: organizationId,
    tier_id: tierId,
  };

  return {
    ok: true,
    tierId,
    payload: {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata,
      // Checkout metadata does not propagate to the subscription object, and the
      // webhook resolves the tenant from `metadata.organization_id` on whatever
      // object the event carries. Without this copy, every later
      // `customer.subscription.*` event would arrive unattributable.
      subscription_data: { metadata },
      client_reference_id: organizationId,
      success_url: buildReturnUrl(returnUrl, 'session_id={CHECKOUT_SESSION_ID}&status=success'),
      cancel_url: buildReturnUrl(returnUrl, 'status=cancelled'),
    },
  };
}

/**
 * The subscription vocabulary this app stores, matching `chk_subscription_status`
 * on `organizations` (widened in 20260806120000_security_hardening.sql).
 *
 * Anything outside this set is not a subscription status, and the column's CHECK
 * rejects it — so writing a guess does not merely mislabel a tenant, it fails
 * the UPDATE after the webhook has already claimed the event (#116).
 */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Maps a raw value onto the stored vocabulary, or null when it is not one of
 * them.
 *
 * Null is the point. A Checkout Session's `status` is
 * `'complete' | 'open' | 'expired'` — a different vocabulary on a different
 * object — and coercing it to the nearest subscription status is how a customer
 * who has just paid gets labelled. Callers must handle null by writing nothing,
 * never by substituting `'active'`.
 */
export function normalizeSubscriptionStatus(raw: unknown): SubscriptionStatus | null {
  const value = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
    ? (value as SubscriptionStatus)
    : null;
}

export interface SubscriptionStatusResult {
  status: string;
  isAccessible: boolean;
  badgeText: string;
  badgeColor: string;
}

export function validateSubscriptionStatus(status: string = 'active'): SubscriptionStatusResult {
  // An unrecognised value used to fall through to the `canceled` arm and badge
  // "Cancelado" — a paying tenant told their subscription was cancelled because
  // the column held a word this function had never heard of. Unknown is its own
  // state and says so (#116).
  if (!normalizeSubscriptionStatus(status)) {
    return {
      status,
      isAccessible: false,
      badgeText: 'Estado desconocido',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
    };
  }

  switch (status.toLowerCase()) {
    case 'active':
    case 'trialing':
      return {
        status,
        isAccessible: true,
        badgeText: 'Activo',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'past_due':
      return {
        status,
        isAccessible: true,
        badgeText: 'Pago Pendiente',
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    case 'incomplete':
    case 'incomplete_expired':
      // The checkout was started and never completed. Calling that "Cancelado"
      // hides the one thing the tenant can act on: finishing the payment.
      return {
        status,
        isAccessible: false,
        badgeText: 'Pago sin completar',
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    case 'unpaid':
      // Stripe's `unpaid` is not a cancellation: the subscription still exists
      // and every retry of the invoice failed. Badging it "Cancelado" hid the
      // one thing the customer can act on — their card — which is the same
      // reasoning the `incomplete` arm above already applies (#267).
      return {
        status,
        isAccessible: false,
        badgeText: 'Pago vencido',
        badgeColor: 'bg-red-100 text-red-800 border-red-200',
      };
    case 'canceled':
    default:
      return {
        status,
        isAccessible: false,
        badgeText: 'Cancelado',
        badgeColor: 'bg-red-100 text-red-800 border-red-200',
      };
  }
}

/**
 * Does this status mean the organization currently *holds* the plan its
 * `subscription_tier` names?
 *
 * The webhook writes `subscription_tier` on every attributable event, including
 * `customer.subscription.deleted`, so the tier column outlives the
 * subscription. A settings card reading the tier alone therefore showed a
 * cancelled customer "Tu Plan Actual" with a greyed-out "Plan Activo" button —
 * and the only way left to pay was to buy a *different* tier (#267).
 *
 * `past_due` counts as held: Stripe is still retrying and the subscription is
 * live, so re-buying it would create a second one.
 */
export function statusHoldsPlan(status: string | null | undefined): boolean {
  const normalized = normalizeSubscriptionStatus(status || '');
  return normalized === 'active' || normalized === 'trialing' || normalized === 'past_due';
}

/**
 * Maps a Stripe Price id back to the tier it bills — exact matches on the
 * configured ids only.
 *
 * This used to end in `return 'negocio'`, so *any* unrecognised price resolved
 * to the $599 tier: a subscription created against a live Empresa price the
 * environment did not know about granted Negocio, and the webhook wrote that
 * over the organization. A price id nobody configured tells us nothing, and the
 * honest answer is null — the caller writes the status and leaves the tier
 * alone rather than inventing one.
 */
export function resolveTierFromPriceId(
  priceId: string,
  env: EnvRecord = process.env
): StripeTierId | null {
  if (!priceId) return null;
  for (const tierId of Object.keys(TIER_PRICE_ENV_VARS) as StripeTierId[]) {
    if (resolveTierPriceId(tierId, env) === priceId) return tierId;
  }
  return null;
}

export interface StripeWebhookOutcome {
  organizationId: string | null;
  /**
   * null when the event carries no subscription status we recognise — do not
   * write a guess. The subscription lifecycle events own this column.
   */
  status: SubscriptionStatus | null;
  /** null when the event names no tier we can attribute — do not write a guess. */
  tierId: StripeTierId | null;
  /** The Stripe Customer this event belongs to, or null when it names none. */
  customerId: string | null;
  /** The Stripe Subscription this event belongs to, or null when it names none. */
  subscriptionId: string | null;
  /**
   * True only for `customer.subscription.deleted`: the subscription is gone, so
   * the stored id must be cleared rather than left pointing at something Stripe
   * will refuse to act on. Distinct from `subscriptionId === null`, which means
   * "this event says nothing" — the difference between erasing a fact and
   * simply not having learned one.
   */
  clearsSubscriptionId: boolean;
  eventType: string;
}

/**
 * Reads a Stripe object reference that may arrive as an id or as an expanded
 * object, and refuses anything that is not an id of the expected kind.
 *
 * `organizations.stripe_customer_id` and `stripe_subscription_id` are both
 * `text UNIQUE`, and nothing has ever written them (#115) — so the checkout
 * route's customer-reuse branch reads a column that is always null and every
 * upgrade mints a fresh Stripe customer for the same organization. Writing them
 * is the fix; writing the *wrong thing* into a UNIQUE column shared across
 * tenants is worse than leaving them null, hence the prefix check.
 */
export function readStripeId(value: unknown, prefix: 'cus_' | 'sub_'): string | null {
  const raw =
    typeof value === 'string'
      ? value
      : typeof (value as { id?: unknown })?.id === 'string'
        ? ((value as { id: string }).id)
        : '';
  const trimmed = raw.trim();
  return trimmed.startsWith(prefix) && /^[A-Za-z0-9_]+$/.test(trimmed) ? trimmed : null;
}

export function handleStripeWebhookEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: { type: string; data?: { object?: any } },
  env: EnvRecord = process.env
): StripeWebhookOutcome {
  const obj = event?.data?.object || {};
  const organizationId = obj?.metadata?.organization_id || null;
  const priceId = obj?.items?.data?.[0]?.price?.id || '';

  // A deletion means the subscription is gone regardless of the status on the
  // object, which Stripe may still report as 'active' at the moment of send.
  //
  // Everything else reads `obj.status` through the app's own vocabulary, and an
  // unrecognised value resolves to null rather than 'active'. The event that
  // made this necessary is `checkout.session.completed`, whose `data.object` is
  // a **Checkout Session**, not a Subscription: its `status` is 'complete', a
  // word `chk_subscription_status` rejects and `validateSubscriptionStatus`
  // never heard of. The session carries no subscription status at all, so the
  // honest outcome is to write none and let `customer.subscription.*` — which
  // fires for the same purchase — own the column. That also removes the
  // arrival-order dependency between the two events (#116).
  const status: SubscriptionStatus | null =
    event?.type === 'customer.subscription.deleted'
      ? 'canceled'
      : normalizeSubscriptionStatus(obj?.status);

  const tierId =
    normalizeTierKey(obj?.metadata?.tier_id || '') ?? resolveTierFromPriceId(priceId, env);

  // Where each id lives depends on which object the event carries: a Checkout
  // Session names the subscription it created in `subscription`, while a
  // Subscription *is* the subscription and names itself in `id`. Reading `id`
  // off a Session would store `cs_…` in a column meant for `sub_…`, which is
  // why `readStripeId` checks the prefix rather than trusting the field (#115).
  const customerId = readStripeId(obj?.customer, 'cus_');
  const subscriptionId =
    event?.type === 'checkout.session.completed'
      ? readStripeId(obj?.subscription, 'sub_')
      : readStripeId(obj?.id, 'sub_');

  return {
    organizationId,
    status,
    tierId,
    customerId,
    subscriptionId,
    clearsSubscriptionId: event?.type === 'customer.subscription.deleted',
    eventType: event.type
  };
}

export interface StripeEnvironmentAudit {
  mode: 'sandbox' | 'live' | 'unconfigured';
  isReady: boolean;
  isWebhookConfigured: boolean;
  hasSecretKey: boolean;
  /** null for any tier whose STRIPE_PRICE_* variable is unset or holds a non-price id. */
  priceIds: Record<StripeTierId, string | null>;
  /** Tiers that cannot be sold because they have no usable Price id. */
  unconfiguredTiers: StripeTierId[];
  /** Variables that are set to something Stripe cannot bill — a product id, usually. */
  malformedPriceVars: Array<{ tierId: StripeTierId; envVar: string; value: string; shape: 'product' | 'other' }>;
  missingKeys: string[];
}

/**
 * What can and cannot be sold on this deployment.
 *
 * `isReady` used to be `mode !== 'unconfigured' && isWebhookConfigured`, and
 * `priceIds` filled every unset variable with a placeholder — so a live key
 * with no price mapping at all audited as ready, with three price ids that
 * looked configured. Readiness now requires a Price id for every tier, because
 * a tier without one cannot take money.
 */
export function auditStripeEnvironment(env: EnvRecord = process.env): StripeEnvironmentAudit {
  const secretKey = env.STRIPE_SECRET_KEY || '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';

  let mode: 'sandbox' | 'live' | 'unconfigured' = 'unconfigured';
  if (secretKey.startsWith('sk_test_')) {
    mode = 'sandbox';
  } else if (secretKey.startsWith('sk_live_')) {
    mode = 'live';
  }

  const isWebhookConfigured = webhookSecret.startsWith('whsec_');

  const tierIds = Object.keys(TIER_PRICE_ENV_VARS) as StripeTierId[];
  const resolutions = tierIds.map((tierId) => [tierId, resolveTierPriceEnv(tierId, env)] as const);

  const priceIds = resolutions.reduce(
    (acc, [tierId, resolved]) => {
      acc[tierId] = resolved.ok ? resolved.priceId : null;
      return acc;
    },
    {} as Record<StripeTierId, string | null>
  );

  const unconfiguredTiers = tierIds.filter((tierId) => !priceIds[tierId]);

  // Set-but-unbillable is a different fix from unset, and it is the one that
  // actually shipped: reporting it as "missing" would send the founder to add a
  // variable that is already there.
  const malformedPriceVars = resolutions.flatMap(([tierId, resolved]) =>
    !resolved.ok && resolved.code === 'NOT_A_PRICE_ID'
      ? [{ tierId, envVar: resolved.envVar, value: resolved.value, shape: resolved.shape }]
      : []
  );

  const isReady = mode !== 'unconfigured' && isWebhookConfigured && unconfiguredTiers.length === 0;

  return {
    mode,
    isReady,
    isWebhookConfigured,
    hasSecretKey: Boolean(secretKey),
    priceIds,
    unconfiguredTiers,
    malformedPriceVars,
    missingKeys: [
      !secretKey ? 'STRIPE_SECRET_KEY' : null,
      !webhookSecret ? 'STRIPE_WEBHOOK_SECRET' : null,
      ...unconfiguredTiers
        .filter((tierId) => !malformedPriceVars.some((v) => v.tierId === tierId))
        .map((tierId) => TIER_PRICE_ENV_VARS[tierId][0]),
    ].filter((k): k is string => k !== null)
  };
}
