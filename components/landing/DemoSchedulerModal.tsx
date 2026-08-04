'use client';

import React, { useState } from 'react';
import { X, Mail, CheckCircle2, Building2, Sparkles, ArrowRight, Play } from 'lucide-react';

interface DemoSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DemoSchedulerModal({ isOpen, onClose }: DemoSchedulerModalProps) {
  const [email, setEmail] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [isSent, setIsSent] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSent(true);
  };

  const handleReset = () => {
    setIsSent(false);
    onClose();
  };

  const handleWatchDirectly = () => {
    handleReset();
    const demoElement = document.getElementById('demostracion');
    if (demoElement) {
      demoElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6 text-left">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleReset}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center min-h-[48px] min-w-[48px]"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {!isSent ? (
          <>
            {/* Header */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Caso de Estudio en Video</span>
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                Ver Video de Caso de Estudio PyME
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ingresa tu correo empresarial para recibir el acceso directo al video de 3 minutos donde explicamos cómo automatizar cotizaciones, firma OTP y cobranza SPEI.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Business Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span>Nombre de tu Negocio</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Distribuidora del Norte S.A."
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-base focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Email Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-emerald-400" />
                  <span>Correo Electrónico Empresarial</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="contacto@tunegocio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-base focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <span>Recibir Video de Caso de Estudio</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-2xl font-black text-white">¡Acceso al Video Enviado!</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Hemos enviado el enlace del video de caso de estudio a <span className="font-bold text-emerald-400">{email}</span>. También puedes verlo directamente en esta página.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleWatchDirectly}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-500/20"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Ver Video Ahora Mismo</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
