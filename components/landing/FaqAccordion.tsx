'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle, FileCheck, MessageSquare, CreditCard, ShieldCheck, Download } from 'lucide-react';

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
    answer: 'Sí. Business Helper incluye un motor de Nota de Venta y Recibo de Pago PDF de 1 clic para entregar comprobantes inmediatos a tus clientes sin necesidad de sellos CSD ni trámites complejos ante el SAT. Si tu empresa requiere facturación fiscal oficial, el addon Pro te permite timbrar facturas CFDI 4.0 ante el SAT a través de Proveedores Autorizados (PAC).',
    icon: FileCheck,
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
    id: 'accountant-export',
    question: '¿Cómo funciona la exportación para mi contador a fin de mes?',
    answer: 'Al final de cada mes, puedes descargar con 1 clic un paquete comprimido (.ZIP) y un resumen estructurado en CSV que contiene todos tus comprobantes SPEI, notas de venta en PDF, cotizaciones firmadas y facturas XML/PDF ordenados para entregárselos a tu despacho contable.',
    icon: Download,
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
