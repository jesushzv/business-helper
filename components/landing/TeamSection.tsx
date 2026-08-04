'use client';

import React from 'react';
import { TEAM_MEMBERS } from '@/lib/trustData';
import { Building2, Award, CheckCircle2 } from 'lucide-react';

export function TeamSection() {
  return (
    <div className="w-full">
      <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3.5 py-1 rounded-full border border-indigo-500/20">
          Transparencia y Equipo Lider
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Diseñado por Empresarios e Ingenieros en Monterrey, NL
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mx-auto">
          Conoce al equipo detrás de Business Helper. Construimos la plataforma que nosotros mismos necesitábamos para acelerar la cobranza de las PyMEs en México.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {TEAM_MEMBERS.map((member) => (
          <div
            key={member.id}
            className="p-6 sm:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-6 hover:border-indigo-500/40 transition-all flex flex-col justify-between shadow-xl"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  className={`w-14 h-14 rounded-2xl ${member.avatarBg} text-white font-black text-xl flex items-center justify-center shadow-lg shrink-0 border border-white/10`}
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

            <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1 font-medium text-emerald-400">
                <Award className="w-3.5 h-3.5" /> Equipo Fundador
              </span>
              <span className="text-[11px] font-mono text-slate-500">Business Helper MX</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
