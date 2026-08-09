/**
 * Business Helper — Stripe Subscription Billing Engine
 * 
 * Provides tier configurations, checkout session payload creation,
 * environment secret auditing, and subscription status validation for Mexican SMBs.
 * Includes CFDI Folio Pack products per docs/02-architecture/cfdi_integration_architecture.md
 */

import { getAppBaseUrl } from './url';

export type StripeTierId = 'inicial' | 'negocio' | 'empresa';
export type FolioPackId = 'folio_pack_50' | 'folio_pack_200';

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
  includedFolios: number;
  addOnPricePerFolio: number;
}

export interface FolioPackConfig {
  id: FolioPackId;
  name: string;
  folios: number;
  price: number;
  currency: string;
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

export const FOLIO_PACK_PRICE_ENV_VARS: Record<FolioPackId, string[]> = {
  folio_pack_50: ['STRIPE_PRICE_FOLIO_50'],
  folio_pack_200: ['STRIPE_PRICE_FOLIO_200'],
};

export const STRIPE_FOLIO_PACKS: Record<string, FolioPackConfig> = {
  folio_pack_50: {
    id: 'folio_pack_50',
    name: 'Paquete 50 Folios CFDI',
    folios: 50,
    price: 100,
    currency: 'MXN',
  },
  folio_pack_200: {
    id: 'folio_pack_200',
    name: 'Paquete 200 Folios CFDI',
    folios: 200,
    price: 350,
    currency: 'MXN',
  },
};

export const STRIPE_PLANS: Record<string, StripeTierConfig> = {
  inicial: {
    id: 'inicial',
    name: 'Plan Inicial',
    price: 299,
    currency: 'MXN',
    interval: 'mes',
    description: 'Ideal para independientes y freelancers que van iniciando.',
    includedFolios: 0,
    addOnPricePerFolio: 5,
    features: [
      'Hasta 25 cotizaciones por mes',
      'Firma digital OTP por WhatsApp',
      'Portal público de carga SPEI',
      'Facturación CFDI 4.0 disponible ($5 MXN/folio o con tu PAC)',
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
    includedFolios: 10,
    addOnPricePerFolio: 3,
    features: [
      'Cotizaciones ilimitadas',
      '10 folios CFDI 4.0/mes incluidos ($3 MXN/folio adicional)',
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
    includedFolios: 50,
    addOnPricePerFolio: 2,
    features: [
      'Todo lo del Plan Negocio',
      '50 folios CFDI 4.0/mes incluidos ($2 MXN/folio adicional)',
      'Paquetes de folios add-on (50 por $100 MXN / 200 por $350 MXN)',
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
 * `getStripeTierConfig('pro')` — the $599 tier — fell through to Inicial, which
 * is the 0-included-folios entitlement `lib/cfdiFolios.ts` reads.
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

/**
 * Entitlement lookup: an unrecognised key resolves to Inicial, the smallest
 * entitlement, so an unknown stored value never grants folios it did not buy.
 * Use `normalizeTierKey` where an unknown key must be refused rather than
 * downgraded — charging is one of those places.
 */
export function getStripeTierConfig(tierKey: string): StripeTierConfig {
  return STRIPE_PLANS[normalizeTierKey(tierKey) ?? 'inicial'];
}

/** The configured Stripe Price id for a tier, or null when its variable is unset. */
export function resolveTierPriceId(tierKey: string, env: EnvRecord = process.env): string | null {
  const tierId = normalizeTierKey(tierKey);
  if (!tierId) return null;
  for (const name of TIER_PRICE_ENV_VARS[tierId]) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** The configured Stripe Price id for a folio pack, or null when its variable is unset. */
export function resolveFolioPackPriceId(packKey: string, env: EnvRecord = process.env): string | null {
  const names = FOLIO_PACK_PRICE_ENV_VARS[packKey as FolioPackId];
  if (!names) return null;
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export type CheckoutPayloadResult =
  | { ok: true; payload: Record<string, unknown>; tierId: StripeTierId }
  | { ok: false; code: 'UNKNOWN_TIER' }
  | { ok: false; code: 'PRICE_NOT_CONFIGURED'; tierId: StripeTierId; envVar: string };

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

  const priceId = resolveTierPriceId(tierId, env);
  if (!priceId) {
    return {
      ok: false,
      code: 'PRICE_NOT_CONFIGURED',
      tierId,
      envVar: TIER_PRICE_ENV_VARS[tierId][0],
    };
  }

  const baseUrl = returnUrl || `${getAppBaseUrl()}/dashboard/settings`;
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
      success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${baseUrl}?status=cancelled`,
    },
  };
}

export type FolioPackPayloadResult =
  | { ok: true; payload: Record<string, unknown>; packId: FolioPackId }
  | { ok: false; code: 'UNKNOWN_PACK' }
  | { ok: false; code: 'PRICE_NOT_CONFIGURED'; packId: FolioPackId; envVar: string };

export function createFolioPackCheckoutPayload(
  packKey: string,
  organizationId: string,
  returnUrl?: string,
  env: EnvRecord = process.env
): FolioPackPayloadResult {
  const pack = STRIPE_FOLIO_PACKS[packKey];
  if (!pack) return { ok: false, code: 'UNKNOWN_PACK' };

  const priceId = resolveFolioPackPriceId(pack.id, env);
  if (!priceId) {
    return {
      ok: false,
      code: 'PRICE_NOT_CONFIGURED',
      packId: pack.id,
      envVar: FOLIO_PACK_PRICE_ENV_VARS[pack.id][0],
    };
  }

  const baseUrl = returnUrl || `${getAppBaseUrl()}/dashboard/settings`;
  return {
    ok: true,
    packId: pack.id,
    payload: {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        organization_id: organizationId,
        pack_id: pack.id,
        folios: pack.folios.toString(),
      },
      success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}&status=success&pack=${pack.id}`,
      cancel_url: `${baseUrl}?status=cancelled`,
    },
  };
}

export interface SubscriptionStatusResult {
  status: string;
  isAccessible: boolean;
  badgeText: string;
  badgeColor: string;
}

export function validateSubscriptionStatus(status: string = 'active'): SubscriptionStatusResult {
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
    case 'canceled':
    case 'unpaid':
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
  status: string;
  /** null when the event names no tier we can attribute — do not write a guess. */
  tierId: StripeTierId | null;
  eventType: string;
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
  const status = event?.type === 'customer.subscription.deleted'
    ? 'canceled'
    : obj?.status || 'active';

  const tierId =
    normalizeTierKey(obj?.metadata?.tier_id || '') ?? resolveTierFromPriceId(priceId, env);

  return {
    organizationId,
    status,
    tierId,
    eventType: event.type
  };
}

export interface StripeEnvironmentAudit {
  mode: 'sandbox' | 'live' | 'unconfigured';
  isReady: boolean;
  isWebhookConfigured: boolean;
  hasSecretKey: boolean;
  /** null for any tier whose STRIPE_PRICE_* variable is unset. */
  priceIds: Record<StripeTierId, string | null>;
  /** Tiers that cannot be sold because they have no Price id. */
  unconfiguredTiers: StripeTierId[];
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
  const priceIds = tierIds.reduce(
    (acc, tierId) => {
      acc[tierId] = resolveTierPriceId(tierId, env);
      return acc;
    },
    {} as Record<StripeTierId, string | null>
  );

  const unconfiguredTiers = tierIds.filter((tierId) => !priceIds[tierId]);
  const isReady = mode !== 'unconfigured' && isWebhookConfigured && unconfiguredTiers.length === 0;

  return {
    mode,
    isReady,
    isWebhookConfigured,
    hasSecretKey: Boolean(secretKey),
    priceIds,
    unconfiguredTiers,
    missingKeys: [
      !secretKey ? 'STRIPE_SECRET_KEY' : null,
      !webhookSecret ? 'STRIPE_WEBHOOK_SECRET' : null,
      ...unconfiguredTiers.map((tierId) => TIER_PRICE_ENV_VARS[tierId][0]),
    ].filter((k): k is string => k !== null)
  };
}
