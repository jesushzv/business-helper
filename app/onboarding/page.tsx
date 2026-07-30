'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, ShieldCheck, FileText, MapPin } from 'lucide-react';
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
      await fetch('/api/organization', {
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
    } catch {
      // Continue to dashboard anyway in demo mode
    } finally {
      setLoading(false);
      router.push('/dashboard/clients');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl rounded-3xl border border-gray-100 bg-white p-6 shadow-xl sm:p-10">
        {/* Header Branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <span className="text-2xl font-black text-gray-900">
              Business<span className="text-indigo-600">Helper</span>
            </span>
            <p className="text-xs font-semibold text-gray-500">Configuración Inicial (3 minutos)</p>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="mt-8 flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                step >= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              1
            </div>
            <span className="text-xs font-bold text-gray-700">Tu Negocio</span>
          </div>

          <div className="h-0.5 w-12 bg-gray-200" />

          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                step >= 2 ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              2
            </div>
            <span className="text-xs font-bold text-gray-700">Datos SAT</span>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Business Identity */}
        {step === 1 && (
          <form onSubmit={handleNextStep} className="mt-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700">
                Nombre de tu Empresa / Negocio <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Distribuidora del Norte"
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Giro de Actividad</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              >
                {INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value}>
                    {ind.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="mt-8 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95"
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
                <label className="block text-xs font-bold text-gray-700">RFC de la Empresa</label>
                {rfc && (
                  <span
                    className={`text-[11px] font-bold ${
                      rfcValidation.isValid ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {rfcValidation.isValid ? `✓ RFC ${rfcValidation.type}` : 'Incompleto'}
                  </span>
                )}
              </div>
              <div className="relative mt-1.5">
                <FileText className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  maxLength={13}
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="DNO850101HD9"
                  className="w-full min-h-[48px] uppercase font-mono rounded-xl border border-gray-300 pl-11 pr-4 text-sm font-bold text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Régimen Fiscal SAT</label>
              <select
                value={regimenFiscal}
                onChange={(e) => setRegimenFiscal(e.target.value)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-gray-300 px-4 text-xs font-medium text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              >
                {REGIMENES_FISCALES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Código Postal Fiscal</label>
              <div className="relative mt-1.5">
                <MapPin className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  maxLength={5}
                  value={codigoPostal}
                  onChange={(e) => setCodigoPostal(e.target.value)}
                  placeholder="64000"
                  className="w-full min-h-[48px] rounded-xl border border-gray-300 pl-11 pr-4 text-sm font-medium text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[48px] flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 active:scale-95"
              >
                Regresar
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-[48px] flex-2 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
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
