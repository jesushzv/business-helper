'use client';

import React from 'react';
import { CONTACT_INFO } from '@/lib/trustData';
import { MessageSquare, Mail, MapPin, Clock, ArrowRight, ShieldCheck } from 'lucide-react';

export function ContactSection() {
  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl backdrop-blur-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10">
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Contacto y Atencion Transparente</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Estamos en Monterrey para apoyarte en cada paso
          </h2>

          <p className="text-slate-300 text-sm leading-relaxed">
            ¿Tienes dudas sobre la integración del SAT CFDI 4.0, la validación de transferencias SPEI o cómo configurar tu catálogo? Habla directamente con nuestro equipo de soporte humano por WhatsApp o visítanos.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-4">
            <a
              href={`https://wa.me/${CONTACT_INFO.whatsappNumber}?text=${encodeURIComponent(
                'Hola, quiero saber más sobre Business Helper para mi negocio'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[50px] px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2.5 text-sm active:scale-95"
            >
              <MessageSquare className="w-5 h-5 fill-current" />
              <span>Contactar por WhatsApp</span>
              <ArrowRight className="w-4 h-4" />
            </a>

            <a
              href={`mailto:${CONTACT_INFO.email}`}
              className="min-h-[50px] px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 text-sm active:scale-95"
            >
              <Mail className="w-4 h-4 text-emerald-400" />
              <span>Enviar Correo</span>
            </a>
          </div>
        </div>

        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* WhatsApp Card */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">WhatsApp de Soporte</div>
            <div className="text-base font-extrabold text-white">{CONTACT_INFO.phoneDisplay}</div>
            <div className="text-[11px] text-emerald-400 font-semibold">Respuesta promedio: &lt; 15 min</div>
          </div>

          {/* Email Card */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Correo Electrónico</div>
            <div className="text-sm font-extrabold text-white break-all">{CONTACT_INFO.email}</div>
            <div className="text-[11px] text-slate-400 font-semibold">Atención a Clientes & SAT</div>
          </div>

          {/* Physical Address Card */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 sm:col-span-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Oficinas Corporativas</div>
                <div className="text-sm font-bold text-white">
                  {CONTACT_INFO.streetAddress}, {CONTACT_INFO.neighborhood}
                </div>
                <div className="text-xs text-slate-300">
                  {CONTACT_INFO.cityState} — {CONTACT_INFO.country}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-900 flex items-center gap-2 text-[11px] text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{CONTACT_INFO.hours}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
