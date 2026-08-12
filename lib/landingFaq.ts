/**
 * The landing page FAQ, as data.
 *
 * Single source for two consumers: `FaqAccordion` renders it, and
 * `components/seo/JsonLd.tsx` maps it into the FAQPage schema. They used to
 * carry two hand-maintained copies, and the schema drifted into answers the
 * page never showed (including a "Notas de Venta ilimitadas" claim no plan
 * makes) — structured data must mirror what a visitor can actually read
 * (#230/#232). Icons stay in the component; this module is rendered copy only.
 */

export interface LandingFaqItem {
  id: string;
  question: string;
  answer: string;
}

export const LANDING_FAQS: LandingFaqItem[] = [
  {
    id: 'invoicing-sat',
    question: '¿Genera Notas de Venta y Facturas SAT CFDI 4.0?',
    answer: 'Sí. Todos nuestros planes tienen acceso al timbrado fiscal CFDI 4.0 ante el SAT. En el Plan Inicial conectas tu propia cuenta de PAC y tu proveedor te cobra cada folio; Plan Negocio incluye 10 folios/mes ($3 MXN por adicional); Plan Empresa incluye 50 folios/mes ($2 MXN por adicional). Además, puedes adquirir paquetes de folios add-on (50 folios por $100 MXN / 200 folios por $350 MXN). Mantienes el control total de tus sellos CSD con tu PAC de confianza (Facturapi).',
  },
  {
    id: 'otp-legal-validity',
    question: '¿La firma digital OTP por WhatsApp tiene validez legal en México?',
    answer: 'Sí. De acuerdo con el Artículo 89 del Código de Comercio de México y los lineamientos de la Norma Oficial Mexicana NOM-151 sobre conservación de mensajes de datos, la aprobación mediante código OTP enviado al correo del cliente respaldado por un sello de tiempo certificado constituye un medio de prueba digital válido y atribuible para contratos comerciales.',
  },
  {
    id: 'whatsapp-integration',
    question: '¿Cómo funciona la integración con WhatsApp?',
    answer: 'Al generar una cotización o recordatorio de cobranza, Business Helper crea un enlace único de 1-Tap Click-to-Chat (wa.me). Al presionar el botón en tu celular, se abre WhatsApp con el mensaje pre-redactado y el enlace interactivo para tu cliente, sin pagar costos adicionales de API de terceros.',
  },
  {
    id: 'spei-verification',
    question: '¿Cómo confirmo las transferencias bancarias SPEI de Banxico?',
    answer: 'Tus clientes cuentan con un portal público seguro donde pueden adjuntar su comprobante de pago SPEI e ingresar la Clave de Rastreo de Banxico. Tú recibes una notificación inmediata en tu celular y confirmas el pago con un solo toque.',
  },
  {
    id: 'excel-migration',
    question: '¿Puedo migrar mis clientes y productos desde Excel?',
    answer: 'Totalmente. Puedes importar la lista de tus clientes y catálogo de productos en menos de 2 minutos mediante archivos CSV o tablas de Excel. Además, nuestro equipo de soporte te acompaña en el proceso para que no pierdas ningún dato.',
  },
  {
    id: 'accountant-export',
    question: '¿Cómo funciona la exportación para mi contador a fin de mes?',
    answer: 'Al final de cada mes, puedes descargar con 1 clic un paquete comprimido (.ZIP) y un resumen estructurado en CSV que contiene todos tus comprobantes SPEI, notas de venta en PDF, cotizaciones firmadas y facturas XML/PDF ordenados para entregárselos a tu despacho contable.',
  },
  {
    id: 'data-ownership-cancellation',
    question: '¿Qué pasa con mis datos y facturas si decido cancelar?',
    answer: 'Tus datos son 100% tuyos. Puedes cancelar en cualquier momento desde tu panel de configuración sin penalizaciones. Antes de cancelar o al finalizar tu periodo pagado, puedes descargar la totalidad de tus facturas XML/PDF y directorio de clientes en un paquete ZIP organizado.',
  },
  {
    id: 'trial-end-behavior',
    question: '¿Qué sucede cuando terminan los 14 días de prueba gratis?',
    answer: 'Al terminar los 14 días, tu cuenta pasa automáticamente a modo consulta sin cobros sorpresivos, ya que no solicitamos tarjeta de crédito para iniciar. Podrás elegir el plan que mejor se adapte a tu volumen para reactivar la emisión de nuevas cotizaciones.',
  },
  {
    id: 'no-credit-card',
    question: '¿Necesito ingresar tarjeta de crédito para la prueba de 14 días?',
    answer: 'No. Obtienes 14 días de acceso completo a todas las funciones sin ingresar ninguna tarjeta de crédito. Solo se te solicitarán datos de pago si decides continuar al finalizar el periodo de prueba.',
  },
];
