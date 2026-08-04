export interface Testimonial {
  id: string;
  author: string;
  role: string;
  company: string;
  location: string;
  industry: string;
  quote: string;
  rating: number;
  metricTag: string;
  avatarInitials: string;
  avatarBg: string;
}

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
  linkedinUrl?: string;
}

export interface ContactDetails {
  phoneDisplay: string;
  whatsappNumber: string;
  email: string;
  streetAddress: string;
  neighborhood: string;
  cityState: string;
  country: string;
  hours: string;
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

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'test-1',
    author: 'Roberto Elizondo',
    role: 'Director General',
    company: 'Distribuidora de Materiales del Norte S.A. de C.V.',
    location: 'Monterrey, NL',
    industry: 'Construcción y Materiales',
    quote:
      'Antes me pasaba todos los viernes revisando hojas de Excel y pidiendo a recepción que llamaran a los clientes para cobrar anticipos. Con Business Helper mandamos la cotización y el recordatorio por WhatsApp con 1 toque. Redujimos nuestra cartera vencida un 40% en solo 60 días.',
    rating: 5,
    metricTag: '-40% Cartera Vencida',
    avatarInitials: 'RE',
    avatarBg: 'bg-emerald-600',
  },
  {
    id: 'test-2',
    author: 'Lic. Mariana Fuentes',
    role: 'Directora de Operaciones',
    company: 'Pixel & Code MX',
    location: 'CDMX',
    industry: 'Agencia Digital & Consultoría B2B',
    quote:
      'Manejamos más de 15 proyectos simultáneos con clientes corporativos. Las cotizaciones se ven impecables con nuestra marca, las autorizan con firma OTP al instante y al final del mes le envío todo a mi contador en un paquete ZIP ordenado. Nos ahorra al menos 15 horas a la semana.',
    rating: 5,
    metricTag: '15 hrs/semana Ahorradas',
    avatarInitials: 'MF',
    avatarBg: 'bg-indigo-600',
  },
  {
    id: 'test-3',
    author: 'Ing. Carlos Treviño',
    role: 'Gerente Comercial',
    company: 'Climas y Servicios Industriales del Norte',
    location: 'Monterrey, NL',
    industry: 'HVAC & Mantenimiento Industrial',
    quote:
      'Nuestros técnicos andan siempre en campo. Poder cotizar un mantenimiento desde el celular en 2 minutos mientras están con el cliente y recibir la notificación cuando el cliente sube su comprobante SPEI cambió por completo nuestro flujo de caja.',
    rating: 5,
    metricTag: 'Cobros 5 días más rápidos',
    avatarInitials: 'CT',
    avatarBg: 'bg-teal-600',
  },
  {
    id: 'test-4',
    author: 'Dra. Sofía Morales',
    role: 'Administradora General',
    company: 'Servicios de Salud & Equipamiento Médico',
    location: 'Guadalajara, JAL',
    industry: 'Insumos Médicos & Salud',
    quote:
      'Tener el Score de Salud del Cliente y el panel visual de cobranza nos permite saber exactamente a quién otorgar crédito comercial y quién tiene facturas pendientes sin tener que implementar un ERP pesado de cientos de miles de pesos.',
    rating: 5,
    metricTag: 'Score de Salud Activo',
    avatarInitials: 'SM',
    avatarBg: 'bg-amber-600',
  },
];

export const TRUST_BADGES: TrustBadge[] = [
  {
    id: 'sat-cfdi',
    title: 'SAT CFDI 4.0 Compliant',
    subtitle: 'Timbrado Fiscal Oficial',
    description:
      'Cumple con los requerimientos vigentes del Anexo 20 del SAT para Notas de Venta, Recibos de Pago y Facturación CFDI 4.0.',
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

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'team-1',
    name: 'Jesús Zamora',
    role: 'Fundador & CEO',
    location: 'Monterrey, NL',
    bio: 'Ingeniero de Software y emprendedor regio apasionado por simplificar la gestión financiera de las PyMEs mexicanas. +8 años construyendo herramientas de software B2B.',
    avatarInitials: 'JZ',
    avatarBg: 'bg-emerald-600',
    highlights: ['Ex-Consultor Tecnológico B2B', 'M.S. Software Engineering', 'Apasionado del Cash Flow PyME'],
  },
  {
    id: 'team-2',
    name: 'Ing. Alejandro Garza',
    role: 'Co-Fundador & CTO',
    location: 'Monterrey, NL',
    bio: 'Especialista en arquitectura cloud, seguridad en pagos digitales y sistemas distribuidos. Lidera el desarrollo del motor de firmas Cryptoseal SHA-256 y la arquitectura Supabase/Next.js.',
    avatarInitials: 'AG',
    avatarBg: 'bg-indigo-600',
    highlights: ['Arquitectura de Seguridad & Payments', 'Ex-Dev Lead en Fintech MX', 'Experto SAT CFDI 4.0'],
  },
  {
    id: 'team-3',
    name: 'Lic. Valeria Morales',
    role: 'Líder de Atención & Soporte SAT',
    location: 'Monterrey, NL',
    bio: 'Contadora y especialista en relación con clientes. Asegura que cada negocio en Business Helper reciba acompañamiento directo por WhatsApp y soporte en la emisión de comprobantes.',
    avatarInitials: 'VM',
    avatarBg: 'bg-teal-600',
    highlights: ['Especialista Fiscal & Anexo 20', 'Soporte Directo por WhatsApp', 'Acompañamiento PyME'],
  },
];

export const CONTACT_INFO: ContactDetails = {
  phoneDisplay: '+52 (81) 8000-4592',
  whatsappNumber: '528180004592',
  email: 'soporte@businesshelper.mx',
  streetAddress: 'Av. San Pedro 215, Piso 4',
  neighborhood: 'Col. Del Valle',
  cityState: 'San Pedro Garza García, N.L., México',
  country: 'México (CP 66220)',
  hours: 'Lunes a Viernes: 8:00 AM – 7:00 PM (Hora Centro CST)',
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
    title: 'Envía por WhatsApp con 1 Toque',
    durationSeconds: 15,
    description:
      'Haz clic en "Enviar por WhatsApp". Se abre la app en tu celular con un mensaje personalizado y un enlace interactivo seguro para tu cliente.',
    actionText: '2. Enlace 1-Tap Click-to-Chat',
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
