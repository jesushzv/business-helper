'use client';

import React, { useState } from 'react';
import { ChevronDown, FileCheck, MessageSquare, CreditCard, ShieldCheck, Download, FileText, Database, FileSpreadsheet, RefreshCcw } from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  icon: React.ElementType;
}

const FAQS: FaqItem[] = [
  {
    id: 'invoicing-sat',
    question: '¿Genera Notas de Venta y Facturas SAT CFDI 4.0?',
    answer: 'Sí. Todos nuestros planes tienen acceso al timbrado fiscal CFDI 4.0 ante el SAT. En el Plan Inicial conectas tu propia cuenta de PAC y tu proveedor te cobra cada folio; Plan Negocio incluye 10 folios/mes ($3 MXN por adicional); Plan Empresa incluye 50 folios/mes ($2 MXN por adicional). Además, puedes adquirir paquetes de folios add-on (50 folios por $100 MXN / 200 folios por $350 MXN). Mantienes el control total de tus sellos CSD con tu PAC de confianza (Facturapi).',
    icon: FileCheck,
  },
  {
    id: 'otp-legal-validity',
    question: '¿La firma digital OTP por WhatsApp tiene validez legal en México?',
    answer: 'Sí. De acuerdo con el Artículo 89 del Código de Comercio de México y los lineamientos de la Norma Oficial Mexicana NOM-151 sobre conservación de mensajes de datos, la aprobación mediante código OTP enviado al correo del cliente respaldado por sellado de tiempo criptográfico SHA-256 constituye un medio de prueba digital válido y atribuible para contratos comerciales.',
    icon: FileText,
  },
  {
    id: 'whatsapp-integration',
    question: '¿Cómo funciona la integración con WhatsApp?',
    answer: 'Al generar una cotización o recordatorio de cobranza, Business Helper crea un enlace único de 1-Tap Click-to-Chat (wa.me). Al presionar el botón en tu celular, se abre WhatsApp con el mensaje pre-redactado y el enlace interactivo para tu cliente, sin pagar costos adicionales de API de terceros.',
    icon: MessageSquare,
  },
  {
    id: 'spei-verification',
    question: '¿Cómo confirmo las transferencias bancarias SPEI de Banxico?',
    answer: 'Tus clientes cuentan con un portal público seguro donde pueden adjuntar su comprobante de pago SPEI e ingresar la Clave de Rastreo de Banxico. Tú recibes una notificación inmediata en tu celular y confirmas el pago con un solo toque.',
    icon: ShieldCheck,
  },
  {
    id: 'excel-migration',
    question: '¿Puedo migrar mis clientes y productos desde Excel?',
    answer: 'Totalmente. Puedes importar la lista de tus clientes y catálogo de productos en menos de 2 minutos mediante archivos CSV o tablas de Excel. Además, nuestro equipo de soporte te acompaña en el proceso para que no pierdas ningún dato.',
    icon: FileSpreadsheet,
  },
  {
    id: 'accountant-export',
    question: '¿Cómo funciona la exportación para mi contador a fin de mes?',
    answer: 'Al final de cada mes, puedes descargar con 1 clic un paquete comprimido (.ZIP) y un resumen estructurado en CSV que contiene todos tus comprobantes SPEI, notas de venta en PDF, cotizaciones firmadas y facturas XML/PDF ordenados para entregárselos a tu despacho contable.',
    icon: Download,
  },
  {
    id: 'data-ownership-cancellation',
    question: '¿Qué pasa con mis datos y facturas si decido cancelar?',
    answer: 'Tus datos son 100% tuyos. Puedes cancelar en cualquier momento desde tu panel de configuración sin penalizaciones. Antes de cancelar o al finalizar tu periodo pagado, puedes descargar la totalidad de tus facturas XML/PDF y directorio de clientes en un paquete ZIP organizado.',
    icon: Database,
  },
  {
    id: 'trial-end-behavior',
    question: '¿Qué sucede cuando terminan los 14 días de prueba gratis?',
    answer: 'Al terminar los 14 días, tu cuenta pasa automáticamente a modo consulta sin cobros sorpresivos, ya que no solicitamos tarjeta de crédito para iniciar. Podrás elegir el plan que mejor se adapte a tu volumen para reactivar la emisión de nuevas cotizaciones.',
    icon: RefreshCcw,
  },
  {
    id: 'no-credit-card',
    question: '¿Necesito ingresar tarjeta de crédito para la prueba de 14 días?',
    answer: 'No. Obtienes 14 días de acceso completo a todas las funciones sin ingresar ninguna tarjeta de crédito. Solo se te solicitarán datos de pago si decides continuar al finalizar el periodo de prueba.',
    icon: CreditCard,
  },
];

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>('invoicing-sat');

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {FAQS.map((faq) => {
        const isOpen = openId === faq.id;
        const Icon = faq.icon;

        return (
          <div
            key={faq.id}
            className={`rounded-2xl border transition-all ${
              isOpen
                ? 'border-emerald-500/40 bg-slate-900/90 shadow-lg shadow-emerald-950/20'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(faq.id)}
              className="w-full min-h-[48px] p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    isOpen
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800/80 text-slate-400 border-slate-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {faq.question}
                </span>
              </div>
              <ChevronDown
                className={`w-5 h-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-emerald-400' : ''
                }`}
              />
            </button>

            {isOpen && (
              <div className="px-5 pb-6 pt-0 sm:px-6 text-slate-300 text-xs sm:text-sm leading-relaxed border-t border-slate-800/60 mt-1 pt-4 pl-16">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
