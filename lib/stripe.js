/**
 * Business Helper — Stripe Subscription Billing Engine (JS export for test-runner)
 */

const STRIPE_FOLIO_PACKS = {
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

const STRIPE_PLANS = {
  emprendedor: {
    id: 'emprendedor',
    name: 'Plan Emprendedor',
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
    includedFolios: 10,
    addOnPricePerFolio: 3,
    features: [
      'Cotizaciones ilimitadas',
      '10 folios CFDI 4.0/mes incluidos ($3 MXN/folio adicional)',
      'Aprobación digital OTP con Evidencia Legal',
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

function getStripeTierConfig(tierKey) {
  const normalized = (tierKey || 'emprendedor').toLowerCase();
  return STRIPE_PLANS[normalized] || STRIPE_PLANS.emprendedor;
}

function createCheckoutPayload(tierKey, organizationId, returnUrl) {
  const plan = getStripeTierConfig(tierKey);
  const baseUrl = returnUrl || 'https://businesshelper.mx/dashboard/settings';
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
    success_url: `${baseUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`,
    cancel_url: `${baseUrl}?status=cancelled`,
  };
}

function createFolioPackCheckoutPayload(packKey, organizationId, returnUrl) {
  const pack = STRIPE_FOLIO_PACKS[packKey] || STRIPE_FOLIO_PACKS.folio_pack_50;
  const baseUrl = returnUrl || 'https://businesshelper.mx/dashboard/settings';
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

function handleStripeWebhookEvent(event) {
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

function auditStripeEnvironment(env = process.env) {
  const secretKey = env.STRIPE_SECRET_KEY || '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';

  let mode = 'unconfigured';
  if (secretKey.startsWith('sk_test_')) {
    mode = 'sandbox';
  } else if (secretKey.startsWith('sk_live_')) {
    mode = 'live';
  }

  const isWebhookConfigured = webhookSecret.startsWith('whsec_');
  const priceIds = {
    emprendedor: env.STRIPE_PRICE_EMPRENDEDOR || STRIPE_PLANS.emprendedor.stripePriceId,
    negocio: env.STRIPE_PRICE_NEGOCIO || STRIPE_PLANS.negocio.stripePriceId,
    empresa: env.STRIPE_PRICE_EMPRESA || STRIPE_PLANS.empresa.stripePriceId,
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
    ].filter(Boolean)
  };
}

module.exports = {
  STRIPE_FOLIO_PACKS,
  STRIPE_PLANS,
  getStripeTierConfig,
  createCheckoutPayload,
  createFolioPackCheckoutPayload,
  validateSubscriptionStatus,
  handleStripeWebhookEvent,
  auditStripeEnvironment
};
