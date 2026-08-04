'use client';

import React from 'react';
import { CONTACT_INFO } from '@/lib/trustData';
import { Mail, MapPin, Clock, ShieldCheck, User, HelpCircle } from 'lucide-react';

export function ContactSection() {
  return (
    <div className="w-full space-y-8">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3.5 py-1 rounded-full border border-emerald-500/20">
          Contacto & Atención Directa
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Estamos para apoyarte en Tijuana / San Diego
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mx-auto">
          ¿Tienes dudas sobre la plataforma, ventas o soporte con el SAT CFDI 4.0? Contamos con canales de atención dedicados por correo electrónico.
        </p>
      </div>

      {/* Contact Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contacto General */}
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-6 shadow-xl group">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 group-hover:scale-105 transition-transform">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Contacto General</h3>
              <p className="text-xs text-slate-400 mt-1">Demos, información comercial y facturación.</p>
            </div>
            <div className="text-sm font-extrabold text-indigo-400 break-all border-t border-slate-800/80 pt-4">
              {CONTACT_INFO.email}
            </div>
          </div>
          <a
            href={`mailto:${CONTACT_INFO.email}?subject=${encodeURIComponent('Información General — Business Helper')}`}
            className="min-h-[44px] w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-indigo-600/20"
          >
            <Mail className="w-4 h-4" />
            <span>Enviar Correo</span>
          </a>
        </div>

        {/* Soporte Técnico */}
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-teal-500/40 transition-all flex flex-col justify-between space-y-6 shadow-xl group">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 group-hover:scale-105 transition-transform">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white tracking-tight">Soporte Técnico & SAT</h3>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  {CONTACT_INFO.responseTimeSLA}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Ayuda con CFDI 4.0, timbrado y plataforma.</p>
            </div>
            <div className="text-sm font-extrabold text-teal-400 break-all border-t border-slate-800/80 pt-4">
              {CONTACT_INFO.supportEmail}
            </div>
          </div>
          <a
            href={`mailto:${CONTACT_INFO.supportEmail}?subject=${encodeURIComponent('Soporte Técnico — Business Helper')}`}
            className="min-h-[44px] w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-teal-600/20"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Contactar Soporte</span>
          </a>
        </div>

        {/* Fundador & CEO */}
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-6 shadow-xl group">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:scale-105 transition-transform">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Fundador & CEO</h3>
              <p className="text-xs text-slate-400 mt-1">Contacto directo con Hector Zamora para alianzas.</p>
            </div>
            <div className="text-sm font-extrabold text-emerald-400 break-all border-t border-slate-800/80 pt-4">
              {CONTACT_INFO.founderEmail}
            </div>
          </div>
          <a
            href={`mailto:${CONTACT_INFO.founderEmail}?subject=${encodeURIComponent('Contacto Directo — Hector Zamora')}`}
            className="min-h-[44px] w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-emerald-600/20"
          >
            <User className="w-4 h-4" />
            <span>Escribir al CEO</span>
          </a>
        </div>
      </div>

      {/* Location & Operating Hours Footer Bar */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{CONTACT_INFO.cityState}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{CONTACT_INFO.hours}</span>
        </div>
        <a href={`mailto:${CONTACT_INFO.privacyEmail}`} className="text-slate-400 hover:text-white transition-colors text-xs flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
          <span>Derechos ARCO: <strong className="text-slate-300">{CONTACT_INFO.privacyEmail}</strong></span>
        </a>
      </div>
    </div>
  );
}
