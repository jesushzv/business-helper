'use client';

import React from 'react';
import { CONTACT_INFO } from '@/lib/trustData';
import { Mail, MapPin, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';

export function ContactSection() {
  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl backdrop-blur-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10">
        <div className="lg:col-span-6 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Contacto Directo y Atención Transparente</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            Estamos en Tijuana / San Diego para apoyarte en cada paso
          </h2>

          <p className="text-slate-300 text-sm leading-relaxed">
            ¿Tienes dudas sobre la integración del SAT CFDI 4.0, la validación de transferencias SPEI o cómo configurar tu catálogo de productos? Escríbenos directamente a nuestro correo oficial.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-4">
            <a
              href={`mailto:${CONTACT_INFO.email}?subject=${encodeURIComponent(
                'Consulta de Información — Business Helper'
              )}`}
              className="min-h-[50px] px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2.5 text-sm active:scale-95"
            >
              <Mail className="w-5 h-5" />
              <span>Contactar por Correo Electrónico</span>
            </a>
          </div>
        </div>

        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Main Support Email Card */}
          <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 sm:col-span-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Correo Principal de Soporte</div>
            <div className="text-lg font-extrabold text-white break-all">{CONTACT_INFO.email}</div>
            <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Tiempo estimado de respuesta: {CONTACT_INFO.responseTimeSLA}
            </div>
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

            <div className="pt-3 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{CONTACT_INFO.hours}</span>
              </div>
              <a href={`mailto:${CONTACT_INFO.privacyEmail}`} className="text-indigo-400 hover:underline text-[10px]">
                ARCO Privacy: {CONTACT_INFO.privacyEmail}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
