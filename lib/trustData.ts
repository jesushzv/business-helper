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
    useCaseTitle: 'Caso de Uso 01: Agencia Digital & Consultoría B2B',
    personaLabel: 'Perfil: Dirección de Operaciones B2B',
    author: 'Directora de Operaciones',
    role: 'Perfil de Usuario',
    company: 'Agencia Digital & Consultoría B2B',
    location: 'CDMX',
    industry: 'Servicios Digitales & Consultoría B2B',
    quote:
      'Manejamos más de 15 proyectos simultáneos con clientes corporativos. Las cotizaciones se ven impecables con nuestra marca, las autorizan con firma OTP al instante y al final del mes le envío todo a mi contador en un paquete ZIP ordenado. Ahorro estimado de 15 horas a la semana.',
    rating: 5,
    metricTag: '15 hrs/semana Ahorradas',
    avatarInitials: 'MF',
    avatarBg: 'bg-indigo-600',
    avatarIcon: 'Briefcase',
    avatarUrl: '/avatars/mariana_fuentes.png',
  },
  {
    id: 'usecase-2',
    useCaseTitle: 'Caso de Uso 02: Mantenimiento & Servicios Industriales',
    personaLabel: 'Perfil: Gerencia Comercial & Campo',
    author: 'Gerente Comercial',
    role: 'Perfil de Usuario',
    company: 'Mantenimiento & Servicios Industriales',
    location: 'Tijuana, BC',
    industry: 'HVAC & Servicios Industriales',
    quote:
      'Nuestros técnicos andan siempre en campo. Poder cotizar un mantenimiento desde el celular en 2 minutos mientras están con el cliente y recibir la notificación cuando el cliente sube su comprobante SPEI cambió por completo nuestro flujo de caja.',
    rating: 5,
    metricTag: 'Cobros 5 días más rápidos',
    avatarInitials: 'CT',
    avatarBg: 'bg-teal-600',
    avatarIcon: 'Wrench',
    avatarUrl: '/avatars/carlos_trevino.png',
  },
];

export interface TrustBadge {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  iconName: string;
  badgeTag: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  location: string;
  bio: string;
  avatarInitials: string;
  avatarBg: string;
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
    title: 'SAT CFDI 4.0 Compliant',
    subtitle: 'Timbrado Fiscal Oficial',
    description:
      'Cumple con los requerimientos vigentes del Anexo 20 del SAT para Facturación CFDI 4.0. Garantía de Seguridad: Nunca almacenamos tus certificados SAT (.cer/.key); mantienes el control total de tus llaves con tu PAC de confianza.',
    iconName: 'Building2',
    badgeTag: 'SAT Anexo 20',
  },
  {
    id: 'ssl-encryption',
    title: 'Encriptación SSL/TLS 256-bit',
    subtitle: 'Seguridad Bancaria',
    description:
      'Toda tu información contable, firmas OTP y comprobantes se transmiten encriptados bajo estándares de nivel bancario.',
    iconName: 'ShieldCheck',
    badgeTag: 'SSL 256-bit',
  },
  {
    id: 'banxico-spei',
    title: 'Validación SPEI Banxico',
    subtitle: 'Comprobación de Pagos',
    description:
      'Verificación transparente de Clave de Rastreo SPEI y comprobantes bancarios directamente desde tu portal de pagos.',
    iconName: 'CheckCircle2',
    badgeTag: 'Banxico Validated',
  },
  {
    id: 'pac-partner',
    title: 'PAC Aliado Autorizado',
    subtitle: 'Proveedores de Certificación',
    description:
      'Infraestructura conectada a PACs certificados por el SAT (Facturapi) para timbrado directo sin intermediarios riesgosos.',
    iconName: 'Zap',
    badgeTag: 'PAC Certificado',
  },
];

function sanitizeEmail(envValue: string | undefined, fallback: string): string {
  if (!envValue || envValue.includes('yourdomain.com') || envValue.includes('example.com') || envValue.includes('placeholder')) {
    return fallback;
  }
  return envValue;
}

// Configurable support emails
export function getSupportEmail(): string {
  if (typeof process !== 'undefined') {
    return sanitizeEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, 'contacto@businesshelper.mx');
  }
  return 'contacto@businesshelper.mx';
}

export function getFounderEmail(): string {
  if (typeof process !== 'undefined') {
    return sanitizeEmail(process.env.NEXT_PUBLIC_FOUNDER_EMAIL, 'hector@businesshelper.mx');
  }
  return 'hector@businesshelper.mx';
}

export function getTechSupportEmail(): string {
  if (typeof process !== 'undefined') {
    return sanitizeEmail(process.env.NEXT_PUBLIC_TECH_SUPPORT_EMAIL, 'soporte@businesshelper.mx');
  }
  return 'soporte@businesshelper.mx';
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
  privacyEmail: 'privacidad@businesshelper.mx',
  streetAddress: 'Tijuana, B.C. / San Diego, CA',
  neighborhood: 'Frontera México / EE.UU.',
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
      'Tu cliente revisa la cotización en su celular sin instalar nada, autoriza ingresando un código OTP y se genera un Sello Digital Cryptoseal SHA-256.',
    actionText: '3. Aprobación con Sello Criptográfico SHA-256',
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
