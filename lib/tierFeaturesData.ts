/**
 * Business Helper — Features, Pain Points & App Tier Matrix Data
 */

export interface PainPointSolution {
  id: string;
  painPoint: string;
  solution: string;
  impact: string;
  iconName: string;
}

export interface TierConfig {
  id: string;
  name: string;
  priceMonthly: number;
  badge?: string;
  recommended?: boolean;
  description: string;
  targetAudience: string;
  features: string[];
  ctaText: string;
}

export interface ValueAddRoi {
  metric: string;
  label: string;
  description: string;
}

export const PAIN_POINTS_SOLUTIONS: PainPointSolution[] = [
  {
    id: 'pp-1',
    painPoint: 'Perder horas creando cotizaciones desordenadas en Excel o Word.',
    solution: 'Genera cotizaciones profesionales con tu logotipo en 2 minutos desde tu celular.',
    impact: 'Cotizaciones 5x más rápidas',
    iconName: 'FileText',
  },
  {
    id: 'pp-2',
    painPoint: '"Mañana te transfiero" y cobranza olvidada que mata tu liquidez.',
    solution: 'Recordatorios automáticos por WhatsApp con 1 toque y botón de pago SPEI Banxico.',
    impact: 'Cobro 3x más rápido',
    iconName: 'DollarSign',
  },
  {
    id: 'pp-3',
    painPoint: 'Fricción con el SAT, facturas CFDI 4.0 complicadas y catálogo SAT confuso.',
    solution: 'Timbrado fiscal CFDI 4.0 en 1 clic con catálogo SAT pre-configurado para PyMEs.',
    impact: '100% Cumplimiento SAT',
    iconName: 'ShieldCheck',
  },
  {
    id: 'pp-4',
    painPoint: 'Estrés al final de mes reuniendo comprobantes dispersos para el contador.',
    solution: 'Descarga un paquete ZIP mensual organizado con todas tus facturas XML/PDF.',
    impact: '0 Estrés Contable',
    iconName: 'Package',
  },
];

export const APP_TIERS: TierConfig[] = [
  {
    id: 'inicial',
    name: 'Plan Inicial',
    priceMonthly: 299,
    description: 'Ideal para pequeños negocios que buscan profesionalizar sus cotizaciones y cobranza.',
    targetAudience: '1 usuario • Hasta 15 clientes activos',
    features: [
      'Cotizaciones ilimitadas con logotipo y PDF',
      'Recordatorios por WhatsApp con 1 toque',
      'Validación de comprobantes SPEI Banxico',
      'Gestión de hasta 15 clientes',
      'Timbrado CFDI 4.0 con tu propio PAC (Facturapi) — tu proveedor te cobra el timbrado, tú conservas tus sellos CSD.',
      'Reporte básico de cobranza',
      'Soporte por correo electrónico',
    ],
    ctaText: 'Comenzar con Inicial',
  },
  {
    id: 'pro',
    name: 'Plan Negocio',
    priceMonthly: 599,
    badge: 'MÁS POPULAR',
    recommended: true,
    description: 'La solución completa para PyMEs que necesitan facturar al SAT y automatizar flujo de efectivo.',
    targetAudience: 'Hasta 3 usuarios • Clientes ilimitados',
    features: [
      'Todo lo del Plan Inicial +',
      'Timbrado CFDI 4.0 con tu propio PAC (Facturapi) — tu proveedor te cobra el timbrado, tú conservas tus sellos CSD.',
      'Firma digital con evidencia legal certificada',
      'Confianza de Pago del cliente',
      'Proyección de Flujo de Efectivo a 30/60/90 días',
      'Asistente AI por WhatsApp para alertas',
      'Exportación mensual ZIP para Contador',
      'Clientes y Productos ilimitados',
    ],
    ctaText: 'Probar 14 Días Gratis',
  },
  {
    id: 'enterprise',
    name: 'Plan Empresa',
    priceMonthly: 999,
    description: 'Para empresas consolidadas con equipo comercial, varias sucursales y control de permisos.',
    targetAudience: 'Usuarios ilimitados • Multi-sucursal',
    features: [
      'Todo lo del Plan Negocio +',
      'Timbrado CFDI 4.0 con tu propio PAC (Facturapi) — tu proveedor te cobra el timbrado, tú conservas tus sellos CSD.',
      'Permisos por rol: Dueño, Gerente, Miembro y Contador',
      'Multi-sucursal y multi-RFC',
      'Control de inventario e historial de stock',
      'Conexión con tus otros sistemas',
      'Atención prioritaria 24/7 y acompañamiento en la puesta en marcha',
    ],
    ctaText: 'Contactar Ventas',
  },
];

export const VALUE_ADDS_ROI: ValueAddRoi[] = [
  {
    metric: '5x',
    label: 'Cotizaciones Más Rápidas',
    description: 'De 20 minutos en Excel a solo 2 minutos en tu celular.',
  },
  {
    metric: '68%',
    label: 'Reducción de Cartera Vencida',
    description: 'Recordatorios amigables de WhatsApp que aseguran pagos a tiempo.',
  },
  {
    metric: '100%',
    label: 'Validación SPEI Banxico',
    description: 'Verificación instantánea de claves de rastreo y comprobantes.',
  },
  {
    metric: '0',
    label: 'Fricción Fiscal SAT',
    description: 'Facturación CFDI 4.0 timbrada en segundos sin complicaciones.',
  },
];
