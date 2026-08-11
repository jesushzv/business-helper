export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
}

export interface FAQCategory {
  id: string;
  label: string;
  iconName: string;
}

export const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'cot-1',
    category: 'cotizaciones',
    question: '¿Cómo creo y envío una cotización por WhatsApp?',
    answer: 'Ve a la sección "Cotizaciones" en el menú, haz clic en "Nueva Cotización", selecciona o ingresa los datos de tu cliente, añade los productos o servicios con sus precios y presiona "Guardar". Al finalizar, usa el botón "Enviar por WhatsApp" para generar el enlace directo.',
    tags: ['cotizacion', 'whatsapp', 'crear', 'cliente', 'pdf']
  },
  {
    id: 'cot-2',
    category: 'cotizaciones',
    question: '¿Cómo acepta mi cliente una cotización?',
    answer: 'Tu cliente recibirá un enlace seguro (/q/[token]). Al abrirlo en su celular podrá revisar el desglose y aceptar la propuesta mediante una firma digital con código de verificación OTP enviado a su correo electrónico.',
    tags: ['cliente', 'firma', 'otp', 'aceptar', 'token', 'cryptoseal']
  },
  {
    id: 'cob-1',
    category: 'cobranza',
    question: '¿Cómo sube un cliente su comprobante de pago SPEI?',
    answer: 'Cada cobro o hito genera un enlace único (/pay/[token]). Tu cliente puede ingresar ahí desde su celular, subir la foto o archivo del comprobante SPEI e ingresar la Clave de Rastreo de Banxico.',
    tags: ['spei', 'comprobante', 'pago', 'banxico', 'clave de rastreo', 'cobranza']
  },
  {
    id: 'cob-2',
    category: 'cobranza',
    question: '¿Cómo funcionan los recordatorios automáticos de pago?',
    answer: 'En la pantalla "Cobranza", verás el estado de cada cuenta (Atrasado, Vence Hoy, Por Vencer). Puedes presionar el botón de WhatsApp para enviar un mensaje pre-llenado respetuoso recordando el pago pendiente.',
    tags: ['recordatorio', 'cobranza', 'whatsapp', 'atrasado', 'vence hoy']
  },
  {
    id: 'fac-1',
    category: 'facturacion',
    question: '¿Cómo genero una factura electrónica SAT CFDI 4.0?',
    answer: 'Primero conecta tu cuenta de Facturapi en "Ajustes" (tus sellos CSD se quedan con tu PAC; aquí solo guardamos la llave de API cifrada). Después, en "Facturación" timbras cada cobro en 1 clic: el PAC devuelve el folio fiscal y guardamos los archivos XML y PDF oficiales.',
    tags: ['sat', 'cfdi', 'factura', 'facturapi', 'xml', 'pdf', '4.0']
  },
  {
    id: 'fac-2',
    category: 'facturacion',
    question: '¿Cómo descargo el paquete mensual para mi contador?',
    answer: 'En "Facturación" o "Ajustes", usa la opción "Exportar Paquete Contador". Se descargará un archivo ZIP organizado con todas las facturas XML, PDFs, comprobantes SPEI y un archivo CSV resumido del mes.',
    tags: ['contador', 'zip', 'csv', 'exportar', 'impuestos', 'sat']
  },
  {
    id: 'cue-1',
    category: 'cuenta',
    question: '¿Puedo personalizar el logo y colores de mi empresa?',
    answer: 'Sí. En "Ajustes" > "Marca y Personalización", puedes subir tu logo, elegir tu color primario y configurar el nombre de tu negocio para que aparezca en todas tus cotizaciones y portales públicos.',
    tags: ['logo', 'marca', 'personalizacion', 'color', 'ajustes', 'blanco']
  },
  {
    id: 'cue-2',
    category: 'cuenta',
    question: '¿Cómo gestiono los permisos de mi equipo de trabajo?',
    answer: 'En la sección "Equipo", puedes invitar a tus colaboradores y asignar roles: Propietario, Gerente, Miembro o Contador, restringiendo o permitiendo el acceso según su función.',
    tags: ['equipo', 'roles', 'permisos', 'usuarios', 'invitar', 'rbac']
  }
];

export const CATEGORIES: FAQCategory[] = [
  { id: 'todas', label: 'Todas', iconName: 'HelpCircle' },
  { id: 'cotizaciones', label: 'Cotizaciones', iconName: 'FileText' },
  { id: 'cobranza', label: 'Cobranza & SPEI', iconName: 'DollarSign' },
  { id: 'facturacion', label: 'Facturación SAT', iconName: 'FileCode' },
  { id: 'cuenta', label: 'Mi Cuenta', iconName: 'Settings' }
];

export function searchFAQItems(query: string = '', category: string = 'todas'): FAQItem[] {
  let filtered = FAQ_ITEMS;

  if (category && category !== 'todas') {
    filtered = filtered.filter(item => item.category === category);
  }

  const q = query.trim().toLowerCase();
  if (!q) return filtered;

  return filtered.filter(item => {
    const inQuestion = item.question.toLowerCase().includes(q);
    const inAnswer = item.answer.toLowerCase().includes(q);
    const inTags = item.tags.some(tag => tag.toLowerCase().includes(q));
    return inQuestion || inAnswer || inTags;
  });
}

export function generateWhatsAppSupportLink(userMessage: string = ''): string {
  const phone = '528180000000'; // Default Business Helper support line
  const defaultText = 'Hola Business Helper, necesito ayuda con mi cuenta de negocio.';
  const messageText = userMessage.trim() ? `Hola Business Helper, necesito ayuda con: ${userMessage.trim()}` : defaultText;
  const encodedText = encodeURIComponent(messageText);
  return `https://wa.me/${phone}?text=${encodedText}`;
}
