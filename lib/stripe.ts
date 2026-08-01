/**
 * Business Helper — Stripe Subscription Billing Engine
 * 
 * Provides tier configurations, checkout session payload creation,
 * and subscription status validation for Mexican SMBs.
 */

export interface StripeTierConfig {
  id: 'emprendedor' | 'negocio' | 'empresa';
  name: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  features: string[];
  stripePriceId?: string;
  popular?: boolean;
}

export const STRIPE_PLANS: Record<string, StripeTierConfig> = {
  emprendedor: {
    id: 'emprendedor',
    name: 'Plan Emprendedor',
    price: 299,
    currency: 'MXN',
    interval: 'mes',
    description: 'Ideal para independientes y freelancers que van iniciando.',
    features: [
      'Hasta 25 cotizaciones por mes',
      'Firma digital OTP por WhatsApp',
      'Portal público de carga SPEI',
      'Soporte estándar por correo',
    ],
    stripePriceId: process.env.STRIPE_PRICE_EMPRENDEDOR || 'price_emprendedor_299_mxn',
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
      'Firma digital OTP + Cryptoseal SHA-256',
      'Recordatorios automáticos de WhatsApp',
      'Centro de Control y Proyección de Flujo 90 días',
      'Soporte prioritario WhatsApp',
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
    features: [
      'Todo lo del Plan Negocio',
      'Multi-usuario y roles de equipo',
      'Exportación masiva para contador',
      'Asesoría fiscal SAT personalizada',
      'Gerente de cuenta dedicado',
    ],
    stripePriceId: process.env.STRIPE_PRICE_EMPRESA || 'price_empresa_999_mxn',
  },
};

export function getStripeTierConfig(tierKey: string): StripeTierConfig {
  const normalized = (tierKey || 'emprendedor').toLowerCase();
  return STRIPE_PLANS[normalized] || STRIPE_PLANS.emprendedor;
}

export function createCheckoutPayload(tierKey: string, organizationId: string, returnUrl: string) {
  const plan = getStripeTierConfig(tierKey);
  return {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: plan.stripePriceId || 'price_negocio_599_mxn',
        quantity: 1,
      },
    ],
    metadata: {
      organization_id: organizationId,
      tier_id: plan.id,
    },
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${returnUrl}?status=cancelled`,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleStripeWebhookEvent(event: { type: string; data?: { object?: any } }) {
  const obj = event?.data?.object || {};
  const organizationId = obj?.metadata?.organization_id || 'org_demo';
  const status = obj?.status || 'active';
  const priceId = obj?.items?.data?.[0]?.price?.id || 'price_negocio';

  let tierId = 'negocio';
  if (priceId.includes('emprendedor')) tierId = 'emprendedor';
  if (priceId.includes('empresa')) tierId = 'empresa';

  return {
    organizationId,
    status,
    tierId,
    eventType: event.type
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STRIPE_PLANS,
    getStripeTierConfig,
    createCheckoutPayload,
    validateSubscriptionStatus,
    handleStripeWebhookEvent
  };
}

