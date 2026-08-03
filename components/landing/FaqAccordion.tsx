'use client';

import React, { useState } from 'react';
import { ChevronDown, HelpCircle, FileCheck, MessageSquare, CreditCard, ShieldCheck } from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  icon: React.ElementType;
}

const FAQS: FaqItem[] = [
  {
    id: 'sat-cfdi',
    question: '¿Tiene validez fiscal ante el SAT (CFDI 4.0)?',
    answer: 'Sí. Business Helper está integrado directamente con Proveedores Autorizados de Certificación (PAC) autorizados por el SAT. Todas tus facturas se emiten bajo el esquema CFDI 4.0 con tus sellos CSD y se entregan en formato XML y PDF.',
    icon: FileCheck,
  },
  {
    id: 'whatsapp-integration',
    question: '¿Cómo funciona la integración con WhatsApp?',
    answer: 'Al crear una cotización o recordatorio de cobro, Business Helper genera un enlace único de 1-Tap Click-to-Chat. Al presionar el botón en tu celular, se abre tu aplicación oficial de WhatsApp con el mensaje formateado y el enlace interactivo para tu cliente.',
    icon: MessageSquare,
  },
  {
    id: 'no-credit-card',
    question: '¿Necesito ingresar tarjeta de crédito para la prueba gratis?',
    answer: 'No. Obtienes 14 días de acceso completo a todas las funciones sin ingresar ninguna tarjeta de crédito. Solo se te pedirán datos de pago si decides continuar al finalizar el periodo de prueba.',
    icon: CreditCard,
  },
  {
    id: 'client-app',
    question: '¿Mis clientes necesitan descargar alguna app o registrarse?',
    answer: 'No. Tus clientes reciben un enlace web seguro que se abre directamente en el navegador de su celular o computadora. Pueden revisar, aceptar con código de seguridad OTP y firmar digitalmente sin crear ninguna cuenta.',
    icon: ShieldCheck,
  },
  {
    id: 'accountant-export',
    question: '¿Puedo exportar reportes para mi contador a fin de mes?',
    answer: 'Absolutamente. En la sección de reportes puedes descargar con 1 clic un archivo comprimido (.ZIP) organizado por mes con todos los comprobantes SPEI, cotizaciones firmadas y facturas XML/PDF de tu negocio.',
    icon: HelpCircle,
  },
];

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>('sat-cfdi');

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
              onClick={() => toggle(faq.id)}
              className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
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
