/**
 * Business Helper — Stripe Subscription Billing Engine (JS export for test-runner)
 */

const STRIPE_PLANS = {
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
    stripePriceId: 'price_emprendedor_299_mxn',
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
    stripePriceId: 'price_negocio_599_mxn',
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
    stripePriceId: 'price_empresa_999_mxn',
  },
};

function getStripeTierConfig(tierKey) {
  const normalized = (tierKey || 'emprendedor').toLowerCase();
  return STRIPE_PLANS[normalized] || STRIPE_PLANS.emprendedor;
}

function createCheckoutPayload(tierKey, organizationId, returnUrl) {
  const plan = getStripeTierConfig(tierKey);
  return {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: plan.currency.toLowerCase(),
          product_data: {
            name: `Business Helper — ${plan.name}`,
            description: plan.description,
          },
          unit_amount: plan.price * 100,
          recurring: {
            interval: 'month',
          },
        },
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

function validateSubscriptionStatus(status = 'active') {
  switch ((status || 'active').toLowerCase()) {
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

module.exports = {
  STRIPE_PLANS,
  getStripeTierConfig,
  createCheckoutPayload,
  validateSubscriptionStatus,
};
