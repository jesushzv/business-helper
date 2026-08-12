'use client';

import React from 'react';
import { TEAM_MEMBERS } from '@/lib/trustData';
import { Building2, CheckCircle2, Mail } from 'lucide-react';

export function TeamSection() {
  return (
    <div className="w-full space-y-12">
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3.5 py-1 rounded-full border border-indigo-500/20">
          Transparencia y Fundador
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Diseñado en Tijuana / San Diego para las PyMEs de México
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mx-auto">
          Conoce al fundador detrás de Business Helper: una plataforma construida para acelerar la cobranza y mejorar la liquidez de las PyMEs en México, con atención directa por correo.
        </p>
      </div>

      {/* Founder Card (solo-founder project — one real profile, centered) */}
      <div className="grid grid-cols-1 gap-8 max-w-md mx-auto">
        {TEAM_MEMBERS.map((member) => (
          <div
            key={member.id}
            className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-6 hover:border-indigo-500/40 transition-all flex flex-col justify-between shadow-xl group"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl ${member.avatarBg} text-white font-black text-xl flex items-center justify-center shadow-lg shrink-0 border border-white/10 group-hover:scale-105 transition-transform`}
                >
                  {member.avatarInitials}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{member.name}</h3>
                  <div className="text-xs font-semibold text-indigo-400">{member.role}</div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    <span>{member.location}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed italic border-t border-slate-800/80 pt-4">
                &ldquo;{member.bio}&rdquo;
              </p>

              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                  Experiencia & Credenciales
                </span>
                <ul className="space-y-1.5">
                  {member.highlights.map((highlight, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/60 flex items-center justify-start text-xs text-slate-400">
              <a
                href={`mailto:${member.contactEmail}?subject=${encodeURIComponent(`Contacto para ${member.name}`)}`}
                className="flex items-center gap-1.5 text-indigo-400 font-bold hover:underline py-1"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Contactar por Correo</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
