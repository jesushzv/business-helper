'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Building2, Lock, Mail, ArrowRight, AlertCircle, Sparkles, FileText, Phone, Users, ShieldCheck } from 'lucide-react';
import { validateRFC } from '@/lib/rfcValidator';
import { validatePhone } from '@/lib/phoneValidator';

const REGIMENES_FISCALES = [
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '606', label: '606 - Arrendamiento' },
  { code: '621', label: '621 - Incorporación Fiscal (RIF)' },
  { code: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
];

const COMPANY_SIZES = [
  { value: '1-5', label: '1 - 5 colaboradores (Micro)' },
  { value: '6-20', label: '6 - 20 colaboradores (Pequeña)' },
  { value: '21-50', label: '21 - 50 colaboradores (Mediana)' },
  { value: '50+', label: '50+ colaboradores (Grande)' },
];

function RegisterFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [businessName, setBusinessName] = useState(searchParams.get('businessName') || '');
  const [rfc, setRfc] = useState(searchParams.get('rfc') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || '');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [taxRegime, setTaxRegime] = useState('601');
  const [companySize, setCompanySize] = useState('1-5');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rfcResult = rfc ? validateRFC(rfc) : { isValid: false, type: null };
  const phoneResult = phone ? validatePhone(phone) : { isValid: false, phone: '' };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!acceptTerms) {
      setError('Debes aceptar el Aviso de Privacidad y los Términos y Condiciones.');
      return;
    }

    if (rfc && !rfcResult.isValid) {
      setError('Por favor ingresa un RFC válido (12 o 13 caracteres).');
      return;
    }

    if (!phoneResult.isValid) {
      setError('Por favor ingresa un número telefónico válido de 10 dígitos.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            business_name: businessName,
            rfc: rfc ? rfc.trim().toUpperCase() : null,
            phone: phoneResult.phone,
            tax_regime: taxRegime,
            company_size: companySize,
          },
        },
      });

      if (authError) {
        setError('Ocurrió un error al registrar la cuenta: ' + authError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        router.push('/onboarding');
      } else {
        setError('Registro iniciado. Por favor revisa tu correo electrónico para confirmar.');
        setLoading(false);
      }
    } catch {
      setError('Ocurrió un error en el servidor. Intenta de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-xl z-10 text-center px-4">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-3.5 py-1.5 rounded-full border border-indigo-500/20 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Business Helper MX
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          Registra tu Negocio
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Prueba gratis de 14 días con acceso completo — Sin tarjeta de crédito
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl z-10 px-4">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-3xl border border-slate-800 sm:px-10">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleRegister}>
            {/* Business Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Nombre de tu Empresa / Negocio <span className="text-rose-500 font-bold ml-0.5">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Building2 className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Materiales MTY SA de CV"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {/* Grid 2 Columns for RFC & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* RFC */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    RFC de la Empresa <span className="text-slate-400 font-normal text-[11px] normal-case ml-1">(Opcional al registrarte — lo pediremos al facturar)</span>
                  </label>
                  {rfc && (
                    <span className={`text-[10px] font-bold ${rfcResult.isValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {rfcResult.isValid ? `✓ ${rfcResult.type === 'moral' ? 'Moral (12)' : 'Física (13)'}` : 'Inválido'}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <FileText className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    maxLength={13}
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    placeholder="ABC120315HD9 (Opcional)"
                    className="block w-full pl-11 pr-4 py-3 min-h-[48px] uppercase font-mono bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              {/* Phone / WhatsApp */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Teléfono Móvil / WhatsApp <span className="text-rose-500 font-bold ml-0.5">*</span>
                  </label>
                  {phone && (
                    <span className={`text-[10px] font-bold ${phoneResult.isValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {phoneResult.isValid ? '✓ 10 dígitos' : 'Inválido'}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Phone className="w-5 h-5" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="8112345678"
                    className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Correo Electrónico del Dueño / Admin <span className="text-rose-500 font-bold ml-0.5">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="roberto@materialesmty.mx"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Contraseña <span className="text-rose-500 font-bold ml-0.5">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            {/* Optional Grid: Tax Regime & Company Size */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
              {/* Tax Regime */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Régimen Fiscal SAT <span className="text-slate-500 font-normal normal-case ml-1">(Opcional)</span>
                </label>
                <div className="relative">
                  <select
                    value={taxRegime}
                    onChange={(e) => setTaxRegime(e.target.value)}
                    className="block w-full px-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs"
                  >
                    {REGIMENES_FISCALES.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Company Size */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Tamaño de Empresa <span className="text-slate-500 font-normal normal-case ml-1">(Opcional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Users className="w-4 h-4" />
                  </div>
                  <select
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs"
                  >
                    {COMPANY_SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Privacy & Terms Checkbox */}
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer text-xs text-slate-300 leading-relaxed">
                <input
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                />
                <span>
                  Acepto el{' '}
                  <Link href="/privacy" className="text-indigo-400 underline hover:text-indigo-300 font-medium">
                    Aviso de Privacidad
                  </Link>{' '}
                  y los{' '}
                  <Link href="/terms" className="text-indigo-400 underline hover:text-indigo-300 font-medium">
                    Términos y Condiciones
                  </Link>{' '}
                  de Business Helper México. <span className="text-rose-500 font-bold">*</span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 min-h-[48px] py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
            >
              {loading ? (
                'Creando tu cuenta...'
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Comenzar Prueba Gratis
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-800 pt-6 text-center">
            <p className="text-xs text-slate-400">
              ¿Ya tienes una cuenta registrada?{' '}
              <Link
                href="/login"
                className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Inicia Sesión Aquí
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Cargando...</div>}>
      <RegisterFormContent />
    </Suspense>
  );
}
