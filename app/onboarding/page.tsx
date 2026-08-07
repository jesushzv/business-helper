'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, ShieldCheck, FileText, MapPin, Sparkles } from 'lucide-react';
import { validateRFC } from '@/lib/rfcValidator';

const REGIMENES_FISCALES = [
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales' },
  { code: '606', label: '606 - Arrendamiento' },
];

const INDUSTRIES = [
  { value: 'construction', label: 'Materiales & Construcción' },
  { value: 'services', label: 'Servicios Profesionales / Agencia' },
  { value: 'retail', label: 'Comercio Mayorista / Distribución' },
  { value: 'manufacturing', label: 'Manufactura & Taller Industrial' },
  { value: 'other', label: 'Otro Giro Comercial' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [rfc, setRfc] = useState('');
  const [regimenFiscal, setRegimenFiscal] = useState('601');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [industry, setIndustry] = useState('construction');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rfcValidation = rfc ? validateRFC(rfc) : { isValid: false, type: null };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor ingresa el nombre de tu negocio');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rfc: rfc.trim().toUpperCase(),
          regimenFiscal,
          codigoPostal,
          industry,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.organization?.id) {
        router.push('/dashboard');
        return;
      }

      // The one case where continuing without an organization is right: the
      // demo deployment has no backend to create one in (503
      // BACKEND_NOT_CONFIGURED). Any other failure must keep the user on the
      // form — a dashboard without an organization answers 403 NO_ORGANIZATION
      // on every route, with no way back to this form.
      if (res.status === 503 && data?.error?.code === 'BACKEND_NOT_CONFIGURED') {
        router.push('/dashboard');
        return;
      }

      setError(
        data?.error?.message ||
          'No se pudo guardar la información de tu negocio. Intenta de nuevo.'
      );
    } catch {
      setError('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl sm:p-10 backdrop-blur-xl z-10 text-white">
        {/* Header Branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-white">
                Business<span className="text-emerald-400">Helper</span>
              </span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                México
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-400">Configuración Inicial (3 minutos)</p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="mt-8 flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                step >= 1 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              1
            </div>
            <span className="text-xs font-bold text-slate-200">Tu Negocio</span>
          </div>

          <div className="h-0.5 w-12 bg-slate-800" />

          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                step >= 2 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              2
            </div>
            <span className="text-xs font-bold text-slate-200">Datos SAT</span>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs font-semibold text-rose-400">
            {error}
          </div>
        )}

        {/* Step 1: Business Identity */}
        {step === 1 && (
          <form onSubmit={handleNextStep} className="mt-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-300">
                Nombre de tu Empresa / Negocio <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Distribuidora del Norte"
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">Giro de Actividad</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-medium text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value} className="bg-slate-900 text-white">
                    {ind.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="mt-8 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 cursor-pointer"
            >
              <span>Continuar a Datos Fiscales</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Step 2: SAT Tax Configuration */}
        {step === 2 && (
          <form onSubmit={handleCompleteSetup} className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300">RFC de la Empresa</label>
                {rfc && (
                  <span
                    className={`text-[11px] font-bold ${
                      rfcValidation.isValid ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {rfcValidation.isValid ? `✓ RFC ${rfcValidation.type}` : 'Incompleto'}
                  </span>
                )}
              </div>
              <div className="relative mt-1.5">
                <FileText className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  maxLength={13}
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="DNO850101HD9"
                  className="w-full min-h-[48px] uppercase font-mono rounded-xl border border-slate-800 bg-slate-950 pl-11 pr-4 text-sm font-bold text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">Régimen Fiscal SAT</label>
              <select
                value={regimenFiscal}
                onChange={(e) => setRegimenFiscal(e.target.value)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {REGIMENES_FISCALES.map((r) => (
                  <option key={r.code} value={r.code} className="bg-slate-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">Código Postal Fiscal</label>
              <div className="relative mt-1.5">
                <MapPin className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  maxLength={5}
                  value={codigoPostal}
                  onChange={(e) => setCodigoPostal(e.target.value)}
                  placeholder="64000"
                  className="w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[48px] flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white active:scale-95 cursor-pointer"
              >
                Regresar
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[48px] flex-2 items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="h-5 w-5" />
                <span>{loading ? 'Guardando...' : 'Comenzar en Business Helper'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
