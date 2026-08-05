'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function BottomConversionForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [rfc, setRfc] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (businessName) params.set('businessName', businessName);
    if (rfc) params.set('rfc', rfc);
    if (phone) params.set('phone', phone);
    if (email) params.set('email', email);

    router.push(`/register?${params.toString()}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl mx-auto p-6 sm:p-8 rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-xl space-y-5 text-left"
    >
      {/* Business Name */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-300">
          Nombre de tu Negocio <span className="text-rose-500 font-bold ml-0.5">*</span>
        </label>
        <input
          type="text"
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="ej. Materiales Elizondo S.A. de C.V."
          className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* RFC & Phone Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300">
            RFC de la Empresa <span className="text-slate-400 font-normal text-[10px] ml-1">(Opcional)</span>
          </label>
          <input
            type="text"
            maxLength={13}
            value={rfc}
            onChange={(e) => setRfc(e.target.value.toUpperCase())}
            placeholder="ej. MEL120315HD9"
            className="w-full min-h-[48px] px-4 py-3 uppercase font-mono rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300">
            Teléfono / WhatsApp <span className="text-rose-500 font-bold ml-0.5">*</span>
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="8112345678"
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-300">
          Correo Electrónico <span className="text-rose-500 font-bold ml-0.5">*</span>
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contacto@tunegocio.mx"
          className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Password */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-300">
          Contraseña <span className="text-rose-500 font-bold ml-0.5">*</span>
        </label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Terms & Privacy Consent Checkbox */}
      <div className="pt-1">
        <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 leading-relaxed">
          <input
            type="checkbox"
            required
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
          />
          <span>
            Acepto el{' '}
            <Link href="/privacy" className="text-emerald-400 underline hover:text-emerald-300 font-medium">
              Aviso de Privacidad (LFPDPPP)
            </Link>{' '}
            y los{' '}
            <Link href="/terms" className="text-emerald-400 underline hover:text-emerald-300 font-medium">
              Términos y Condiciones
            </Link>{' '}
            de Business Helper México. <span className="text-rose-500 font-bold">*</span>
          </span>
        </label>
      </div>

      <button
        type="submit"
        className="w-full min-h-[54px] py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 text-sm text-center flex items-center justify-center transition-all active:scale-95 mt-2 cursor-pointer"
      >
        Comenzar Prueba Gratis (14 Días)
      </button>

      <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-800/60">
        <span>✓ Sin tarjeta de crédito</span>
        <span>✓ Cancela cuando quieras</span>
        <span>✓ Soporte WhatsApp</span>
      </div>
    </form>
  );
}
