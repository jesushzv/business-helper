export interface UseCaseScenario {
  id: string;
  useCaseTitle: string;
  personaLabel: string;
  industry: string;
  location: string;
  quote: string;
  rating: number;
  metricTag: string;
  avatarIcon: string;
  avatarUrl: string;
  // Backward compatibility fields
  author: string;
  role: string;
  company: string;
  avatarInitials: string;
  avatarBg: string;
}

export type Testimonial = UseCaseScenario;

export const TESTIMONIALS: UseCaseScenario[] = [
  {
    id: 'usecase-1',
    useCaseTitle: 'Construcción & Acabados Industriales',
    personaLabel: 'Gerente General de Operaciones',
    author: 'Gerente General',
    role: 'Operaciones & Obras',
    company: 'Contratistas & Obras México',
    location: 'Monterrey, NL',
    industry: 'Construcción & Arquitectura',
    quote:
      'Aprobación de cotizaciones en 30 segundos por WhatsApp y anticipos SPEI inmediatos sin perder folios ni traspapelar notas de venta en papel.',
    rating: 5,
    metricTag: 'Cobro 40% más rápido',
    avatarInitials: 'CO',
    avatarBg: 'bg-emerald-600',
    avatarIcon: 'Building2',
    avatarUrl: '/avatars/industry_construction.png',
  },
  {
    id: 'usecase-2',
    useCaseTitle: 'Servicios Industriales & HVAC',
    personaLabel: 'Gerencia Comercial de Campo',
    author: 'Gerente Comercial',
    role: 'Ventas en Campo & Mantenimiento',
    company: 'Servicios Industriales MTY/TJ',
    location: 'Tijuana, BC',
    industry: 'HVAC & Mantenimiento Industrial',
    quote:
      'Cotizaciones enviadas desde el celular en el lugar de la obra en menos de 2 minutos con notificación en tiempo real al recibirse la transferencia SPEI.',
    rating: 5,
    metricTag: '15 hrs/semana Ahorradas',
    avatarInitials: 'SI',
    avatarBg: 'bg-teal-600',
    avatarIcon: 'Wrench',
    avatarUrl: '/avatars/industry_hvac.png',
  },
  {
    id: 'usecase-3',
    useCaseTitle: 'Agencias Digitales & Consultoría B2B',
    personaLabel: 'Dirección de Operaciones',
    author: 'Dirección de Operaciones',
    role: 'Gestión de Proyectos B2B',
    company: 'Consultoría & Servicios B2B',
    location: 'CDMX',
    industry: 'Servicios Digitales & Consultoría',
    quote:
      'Gestión de más de 15 proyectos simultáneos con firma OTP legal y entrega mensual limpia en un solo paquete ZIP para el despacho contable.',
    rating: 5,
    metricTag: 'Entrega ZIP 1-Clic',
    avatarInitials: 'AD',
    avatarBg: 'bg-indigo-600',
    avatarIcon: 'Briefcase',
    avatarUrl: '/avatars/industry_agency.png',
  },
  {
    id: 'usecase-4',
    useCaseTitle: 'Distribución & Comercio al Mayoreo',
    personaLabel: 'Administración de Ventas',
    author: 'Administración de Ventas',
    role: 'Cobranza & Facturación SAT',
    company: 'Distribuidora de Materiales',
    location: 'Guadalajara, JAL',
    industry: 'Distribución & Comercio',
    quote:
      'Control total de la cartera vencida con alertas de pago SPEI Banxico y timbrado CFDI 4.0 automático sin complicaciones fiscales ante el SAT.',
    rating: 5,
    metricTag: '80% Menos Cartera Vencida',
    avatarInitials: 'DM',
    avatarBg: 'bg-amber-600',
    avatarIcon: 'ShieldCheck',
    avatarUrl: '/avatars/industry_distribution.png',
  },
];

export interface TrustBadge {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  iconName: string;
  badgeTag: string;
  externalSealLabel: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  location: string;
  bio: string;
  avatarInitials: string;
  avatarBg: string;
  avatarUrl?: string;
  highlights: string[];
  linkedinUrl: string;
  contactEmail: string;
}

export interface ContactDetails {
  email: string;
  founderEmail: string;
  supportEmail: string;
  privacyEmail: string;
  streetAddress: string;
  neighborhood: string;
  cityState: string;
  country: string;
  hours: string;
  responseTimeSLA: string;
}

export interface DemoStep {
  id: string;
  stepNumber: number;
  title: string;
  durationSeconds: number;
  description: string;
  actionText: string;
  screenMockupType: 'quote' | 'whatsapp' | 'otp' | 'spei';
}

export const TRUST_BADGES: TrustBadge[] = [
  {
    id: 'sat-cfdi',
    title: 'Certificados SAT Protegidos',
    subtitle: 'Seguridad CSD',
    description:
      'Nunca almacenamos tus certificados SAT (.cer/.key). Tus sellos CSD se quedan protegidos en tu PAC autorizado de confianza.',
    iconName: 'Building2',
    badgeTag: 'Garantía CSD SAT',
    externalSealLabel: 'PAC SAT Certificado — Facturapi Partner',
  },
  {
    id: 'ssl-encryption',
    title: 'Encriptación SSL/TLS 256-bit',
    subtitle: 'Seguridad Bancaria',
    description:
      'Toda tu información contable, firmas OTP y comprobantes se transmiten encriptados bajo estándares de nivel bancario.',
    iconName: 'ShieldCheck',
    badgeTag: 'SSL 256-bit',
    externalSealLabel: 'Encriptación TLS 1.3 / SSL 256-Bit (Stripe Security)',
  },
  {
    id: 'banxico-spei',
    title: 'Validación SPEI Banxico',
    subtitle: 'Conciliación Bancaria',
    description:
      'Verificación transparente por Clave de Rastreo SPEI Banxico directamente desde tu portal de cobranza.',
    iconName: 'CheckCircle2',
    badgeTag: 'Banxico Validated',
    externalSealLabel: 'Verificación CEP Banxico por Clave de Rastreo',
  },
];

function sanitizeEmail(envValue: string | undefined, fallback: string): string {
  if (!envValue || envValue.includes('yourdomain.com') || envValue.includes('example.com') || envValue.includes('placeholder')) {
    return fallback;
  }
  return envValue;
}

// Configurable support emails using @businesshelper.app domain
export function getSupportEmail(): string {
  if (typeof process !== 'undefined') {
    return sanitizeEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, 'contacto@businesshelper.app');
  }
  return 'contacto@businesshelper.app';
}

export function getFounderEmail(): string {
  if (typeof process !== 'undefined') {
    return sanitizeEmail(process.env.NEXT_PUBLIC_FOUNDER_EMAIL, 'hector@businesshelper.app');
  }
  return 'hector@businesshelper.app';
}

export function getTechSupportEmail(): string {
  if (typeof process !== 'undefined') {
    return sanitizeEmail(process.env.NEXT_PUBLIC_TECH_SUPPORT_EMAIL, 'soporte@businesshelper.app');
  }
  return 'soporte@businesshelper.app';
}

const activeContactoEmail = getSupportEmail();
const activeHectorEmail = getFounderEmail();
const activeSoporteEmail = getTechSupportEmail();

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'team-1',
    name: 'Hector Zamora',
    role: 'Fundador & CEO',
    location: 'Tijuana, BC / San Diego, CA',
    bio: 'Fundador y líder ejecutivo apasionado por empoderar a los dueños de PyMEs en México con tecnología móvil accesible. Enfocado en eliminar las barreras de cobranza y agilizar el flujo de efectivo.',
    avatarInitials: 'HZ',
    avatarBg: 'bg-emerald-600',
    highlights: ['Líder de Visión & Estrategia', 'Enfoque en Cash Flow PyME', 'Atención Directa a Clientes'],
    linkedinUrl: 'https://linkedin.com/company/business-helper-mx',
    contactEmail: activeHectorEmail,
  },
  {
    id: 'team-2',
    name: 'Gilberto Santana',
    role: 'Co-Fundador & CTO',
    location: 'Tijuana, BC / San Diego, CA',
    bio: 'Co-Fundador y líder de arquitectura técnica. Diseña la infraestructura de seguridad en la nube, integración del SAT CFDI 4.0 y sincronización en tiempo real con Supabase y Next.js.',
    avatarInitials: 'GS',
    avatarBg: 'bg-indigo-600',
    highlights: ['Arquitectura Cloud & Seguridad', 'Infraestructura Multitenant', 'Integraciones SAT & SPEI'],
    linkedinUrl: 'https://linkedin.com/company/business-helper-mx',
    contactEmail: activeSoporteEmail,
  },
  {
    id: 'team-3',
    name: 'Guillermo Fernandez',
    role: 'Co-Fundador & COO',
    location: 'Tijuana, BC / San Diego, CA',
    bio: 'Co-Fundador y líder de operaciones comerciales y alianzas. Supervisa el acompañamiento a usuarios, la relación con despachos contables y la expansión estratégica de la plataforma.',
    avatarInitials: 'GF',
    avatarBg: 'bg-teal-600',
    highlights: ['Operaciones & Alianzas B2B', 'Relación con Contadores', 'Experiencia de Usuario'],
    linkedinUrl: 'https://linkedin.com/company/business-helper-mx',
    contactEmail: activeContactoEmail,
  },
];

export const CONTACT_INFO: ContactDetails = {
  email: activeContactoEmail,
  founderEmail: activeHectorEmail,
  supportEmail: activeSoporteEmail,
  privacyEmail: 'privacidad@businesshelper.app',
  streetAddress: 'Zona Urbana Río / San Diego Border',
  neighborhood: 'Zona Río',
  cityState: 'Tijuana, B.C., México / San Diego, CA',
  country: 'México / EE.UU.',
  hours: 'Lunes a Viernes: 8:00 AM – 6:00 PM (Hora Pacífico PST)',
  responseTimeSLA: '< 2 Horas por Correo',
};

export const DEMO_WALKTHROUGH_STEPS: DemoStep[] = [
  {
    id: 'create-quote',
    stepNumber: 1,
    title: 'Crea la Cotización en 2 min',
    durationSeconds: 20,
    description:
      'Selecciona los productos de tu catálogo, el sistema calcula automáticamente IVA (16%) y retenciones SAT, generando una propuesta elegante con tu logotipo.',
    actionText: '1. Seleccionar productos y calcular impuestos',
    screenMockupType: 'quote',
  },
  {
    id: 'send-whatsapp',
    stepNumber: 2,
    title: 'Comparte con tu Cliente',
    durationSeconds: 15,
    description:
      'Envía la propuesta mediante un enlace interactivo seguro. Tu cliente la abre en su celular sin descargar aplicaciones.',
    actionText: '2. Enlace Interactivo Seguro',
    screenMockupType: 'whatsapp',
  },
  {
    id: 'otp-signature',
    stepNumber: 3,
    title: 'Firma Digital OTP del Cliente',
    durationSeconds: 20,
    description:
      'Tu cliente revisa la cotización en su celular sin instalar nada, autoriza ingresando un código OTP a su celular y se genera evidencia legal certificada.',
    actionText: '3. Aprobación Digital y Evidencia Certificada',
    screenMockupType: 'otp',
  },
  {
    id: 'spei-notification',
    stepNumber: 4,
    title: 'Comprobante SPEI y Notificación',
    durationSeconds: 20,
    description:
      'El cliente adjunta su comprobante SPEI Banxico. Recibes una alerta en tiempo real en tu celular y el sistema actualiza tu panel de cobranza.',
    actionText: '4. Alerta de Pago e Ingreso Registrado',
    screenMockupType: 'spei',
  },
];
