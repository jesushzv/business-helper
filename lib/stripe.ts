/**
 * Business Helper — Stripe Subscription Billing Engine
 * 
 * Provides tier configurations, checkout session payload creation,
 * environment secret auditing, and subscription status validation for Mexican SMBs.
 * Includes CFDI Folio Pack products per docs/02-architecture/cfdi_integration_architecture.md
 */

import { getAppBaseUrl } from './url';

export interface StripeTierConfig {
  id: 'inicial' | 'negocio' | 'empresa';
  name: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  features: string[];
  stripePriceId?: string;
  popular?: boolean;
  includedFolios: number;
  addOnPricePerFolio: number;
}

export interface FolioPackConfig {
  id: 'folio_pack_50' | 'folio_pack_200';
  name: string;
  folios: number;
  price: number;
  currency: string;
  stripePriceId: string;
}

export const STRIPE_FOLIO_PACKS: Record<string, FolioPackConfig> = {
  folio_pack_50: {
    id: 'folio_pack_50',
    name: 'Paquete 50 Folios CFDI',
    folios: 50,
    price: 100,
    currency: 'MXN',
    stripePriceId: process.env.STRIPE_PRICE_FOLIO_50 || 'price_cfdi_50_folios_100_mxn',
  },
  folio_pack_200: {
    id: 'folio_pack_200',
    name: 'Paquete 200 Folios CFDI',
    folios: 200,
    price: 350,
    currency: 'MXN',
    stripePriceId: process.env.STRIPE_PRICE_FOLIO_200 || 'price_cfdi_200_folios_350_mxn',
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
    stripePriceId: process.env.STRIPE_PRICE_INICIAL || process.env.STRIPE_PRICE_EMPRENDEDOR || 'price_inicial_299_mxn',
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
    stripePriceId: process.env.STRIPE_PRICE_NEGOCIO || 'price_negocio_599_mxn',
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
    stripePriceId: process.env.STRIPE_PRICE_EMPRESA || 'price_empresa_999_mxn',
  },
};

export function getStripeTierConfig(tierKey: string): StripeTierConfig {
  const normalized = (tierKey || 'inicial').toLowerCase();
  if (normalized === 'starter' || normalized === 'emprendedor' || normalized === 'basico') {
    return STRIPE_PLANS.inicial;
  }
  return STRIPE_PLANS[normalized] || STRIPE_PLANS.inicial;
}

export function createCheckoutPayload(tierKey: string, organizationId: string, returnUrl?: string) {
  const plan = getStripeTierConfig(tierKey);
  const baseUrl = returnUrl || `${getAppBaseUrl()}/dashboard/settings`;
  const metadata = {
    organization_id: organizationId,
    tier_id: plan.id,
  };

  return {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: plan.stripePriceId || 'price_negocio_599_mxn',
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
  };
}

export function createFolioPackCheckoutPayload(packKey: string, organizationId: string, returnUrl?: string) {
  const pack = STRIPE_FOLIO_PACKS[packKey] || STRIPE_FOLIO_PACKS.folio_pack_50;
  const baseUrl = returnUrl || `${getAppBaseUrl()}/dashboard/settings`;
  return {
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price: pack.stripePriceId || 'price_cfdi_50_folios_100_mxn',
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

/** Maps a Stripe price id to a tier, preferring exact matches on configured ids. */
function resolveTierFromPriceId(priceId: string): string {
  const configured: Array<[string, string | undefined]> = [
    ['inicial', process.env.STRIPE_PRICE_INICIAL || process.env.STRIPE_PRICE_EMPRENDEDOR],
    ['negocio', process.env.STRIPE_PRICE_NEGOCIO],
    ['empresa', process.env.STRIPE_PRICE_EMPRESA],
  ];

  for (const [tier, envPriceId] of configured) {
    if (envPriceId && envPriceId === priceId) return tier;
  }

  // Fallback for the seeded placeholder ids used in demo/tests. Safe only
  // because the payload reaching this point has a verified Stripe signature.
  if (priceId.includes('inicial') || priceId.includes('emprendedor')) return 'inicial';
  if (priceId.includes('empresa')) return 'empresa';
  return 'negocio';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleStripeWebhookEvent(event: { type: string; data?: { object?: any } }) {
  const obj = event?.data?.object || {};
  const organizationId = obj?.metadata?.organization_id || 'org_demo';
  const priceId = obj?.items?.data?.[0]?.price?.id || 'price_negocio';

  // A deletion means the subscription is gone regardless of the status on the
  // object, which Stripe may still report as 'active' at the moment of send.
  const status = event?.type === 'customer.subscription.deleted'
    ? 'canceled'
    : obj?.status || 'active';

  const tierId = obj?.metadata?.tier_id || resolveTierFromPriceId(priceId);

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
  priceIds: {
    inicial: string;
    negocio: string;
    empresa: string;
  };
  missingKeys: string[];
}

export function auditStripeEnvironment(env: Record<string, string | undefined> = process.env): StripeEnvironmentAudit {
  const secretKey = env.STRIPE_SECRET_KEY || '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';

  let mode: 'sandbox' | 'live' | 'unconfigured' = 'unconfigured';
  if (secretKey.startsWith('sk_test_')) {
    mode = 'sandbox';
  } else if (secretKey.startsWith('sk_live_')) {
    mode = 'live';
  }

  const isWebhookConfigured = webhookSecret.startsWith('whsec_');
  const priceIds = {
    inicial: env.STRIPE_PRICE_INICIAL || env.STRIPE_PRICE_EMPRENDEDOR || STRIPE_PLANS.inicial.stripePriceId || 'price_inicial_299_mxn',
    negocio: env.STRIPE_PRICE_NEGOCIO || STRIPE_PLANS.negocio.stripePriceId || 'price_negocio_599_mxn',
    empresa: env.STRIPE_PRICE_EMPRESA || STRIPE_PLANS.empresa.stripePriceId || 'price_empresa_999_mxn',
  };

  const isReady = mode !== 'unconfigured' && isWebhookConfigured;

  return {
    mode,
    isReady,
    isWebhookConfigured,
    hasSecretKey: Boolean(secretKey),
    priceIds,
    missingKeys: [
      !secretKey ? 'STRIPE_SECRET_KEY' : null,
      !webhookSecret ? 'STRIPE_WEBHOOK_SECRET' : null,
    ].filter((k): k is string => k !== null)
  };
}
