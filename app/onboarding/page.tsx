'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, ShieldCheck, FileText, MapPin, Landmark } from 'lucide-react';
import { validateRFC } from '@/lib/rfcValidator';
import { formatClabe, normalizeClabe, isValidClabeLength, hasValidClabeCheckDigit } from '@/lib/clabe';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { hasSettlementAccount } from '@/lib/settlementAccount';
import { track } from '@/lib/analytics';
import { postOnboardingPath } from '@/lib/upgradeIntent';
import { regimenOptions } from '@/lib/satRegimenes';

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
  const [bankName, setBankName] = useState('');
  const [bankClabe, setBankClabe] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  /**
   * Resume an onboarding that already created its organization (#64).
   *
   * The organization row is created by the step-2 `POST` and the settlement
   * account is a separate step-3 `PATCH`. Closing the tab in between left a
   * complete, usable organization with no CLABE and no path back to this form —
   * and organizations created before this step existed are in the same state.
   *
   * So: if an organization already exists, step 1 and step 2 are done. Land on
   * the account step with what we know prefilled. This also stops a second
   * organization from being created by anyone who reopens `/onboarding`, which
   * the step-2 `POST` would otherwise happily do.
   */
  useEffect(() => {
    // No backend, no organization to resume — and the demo must not sit on a
    // spinner waiting for a fetch that answers with fixtures.
    if (isClientDemoMode()) return;

    let cancelled = false;
    setResuming(true);

    fetch('/api/organization')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        const org = data?.organization;
        // 403 NO_ORGANIZATION is the normal first-run case: nothing to resume.
        if (!res.ok || !org) return;

        setName(org.name || '');
        setRfc(org.rfc || '');
        if (org.regimen_fiscal) setRegimenFiscal(org.regimen_fiscal);
        setCodigoPostal(org.codigo_postal || '');
        if (org.industry) setIndustry(org.industry);
        setBankName(org.bank_name || '');
        setBankAccountHolder(org.bank_account_holder || '');
        if (hasSettlementAccount(org)) setBankClabe(formatClabe(org.bank_clabe as string));

        setStep(3);
      })
      .catch(() => {
        // Leave the user on step 1 rather than claiming anything about an
        // organization we could not read.
      })
      .finally(() => {
        if (!cancelled) setResuming(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rfcValidation = rfc ? validateRFC(rfc) : { isValid: false, type: null };
  const clabeDigits = normalizeClabe(bankClabe);
  const clabeComplete = isValidClabeLength(bankClabe);
  // Advisory only: a failed checksum is almost always a typo, but the server
  // accepts any 18 digits, so this warns rather than blocks.
  const clabeChecksumSuspect = clabeComplete && !hasValidClabeCheckDigit(bankClabe);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor ingresa el nombre de tu negocio');
      return;
    }
    setError(null);
    setStep(2);
  };

  /** Step 2 → creates the organization, then hands off to the bank step. */
  const handleCreateOrganization = async (e: React.FormEvent) => {
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
        track('organization_created', {
          organization_id: data.organization.id,
          industry,
          has_rfc: Boolean(rfc.trim()),
        });
        // The bank account is a separate PATCH and needs the organization to
        // exist first (it is scoped by owner_id).
        setStep(3);
        return;
      }

      // The one case where continuing without an organization is right: the
      // demo deployment has no backend to create one in (503
      // BACKEND_NOT_CONFIGURED). Any other failure must keep the user on the
      // form — a dashboard without an organization answers 403 NO_ORGANIZATION
      // on every route, with no way back to this form.
      if (res.status === 503 && data?.error?.code === 'BACKEND_NOT_CONFIGURED') {
        router.push(postOnboardingPath(typeof window === 'undefined' ? '' : window.location.search));
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

  /**
   * Step 3 → the SPEI settlement account.
   *
   * Collected during onboarding rather than left in Ajustes because without it
   * the payment page refuses to render instructions (409 NO_BANK_ACCOUNT) and
   * the cash-flow loop dead-ends at its last step, with nothing earlier warning
   * the owner. Never falls through to the dashboard on a failed write — that
   * would be reporting a saved account that does not exist.
   */
  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clabeComplete) {
      setError('La CLABE debe tener exactamente 18 dígitos');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: bankName.trim(),
          bankClabe: clabeDigits,
          bankAccountHolder: bankAccountHolder.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.organization?.id) {
        track('settlement_account_configured', {
          organization_id: data.organization.id,
          has_account_holder: Boolean(bankAccountHolder.trim()),
        });
        router.push(postOnboardingPath(typeof window === 'undefined' ? '' : window.location.search));
        return;
      }

      setError(
        data?.error?.message ||
          'No se pudo guardar la cuenta bancaria. Intenta de nuevo.'
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
        <div className="mt-8 flex items-center justify-between gap-2 border-b border-slate-800 pb-4">
          {[
            { n: 1, label: 'Tu Negocio' },
            { n: 2, label: 'Datos SAT' },
            { n: 3, label: 'Cuenta de Cobro' },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && <div className="h-0.5 flex-1 bg-slate-800" />}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step >= s.n ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {s.n}
                </div>
                <span className="text-xs font-bold text-slate-200">{s.label}</span>
              </div>
            </React.Fragment>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs font-semibold text-rose-400">
            {error}
          </div>
        )}

        {resuming && (
          <div className="mt-8 text-center text-sm font-semibold text-slate-400">
            Cargando la información de tu negocio...
          </div>
        )}

        {/* Step 1: Business Identity */}
        {!resuming && step === 1 && (
          <form onSubmit={handleNextStep} className="mt-6 space-y-5">
            <div>
              <label htmlFor="page-nombre-de-tu-empresa" className="block text-xs font-bold text-slate-300">
                Nombre de tu Empresa / Negocio <span className="text-rose-400">*</span>
              </label>
              <input
                id="page-nombre-de-tu-empresa"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Distribuidora del Norte"
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label htmlFor="page-giro-de-actividad" className="block text-xs font-bold text-slate-300">Giro de Actividad</label>
              <select
                id="page-giro-de-actividad"
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
        {!resuming && step === 2 && (
          <form onSubmit={handleCreateOrganization} className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="page-rfc-de-la-empresa" className="block text-xs font-bold text-slate-300">RFC de la Empresa</label>
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
                  id="page-rfc-de-la-empresa"
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
              <label htmlFor="page-regimen-fiscal-sat" className="block text-xs font-bold text-slate-300">Régimen Fiscal SAT</label>
              <select
                id="page-regimen-fiscal-sat"
                value={regimenFiscal}
                onChange={(e) => setRegimenFiscal(e.target.value)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {regimenOptions(regimenFiscal).map((r) => (
                  <option key={r.code} value={r.code} className="bg-slate-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="page-codigo-postal-fiscal" className="block text-xs font-bold text-slate-300">Código Postal Fiscal</label>
              <div className="relative mt-1.5">
                <MapPin className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  id="page-codigo-postal-fiscal"
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
                <span>{loading ? 'Guardando...' : 'Continuar a Cuenta de Cobro'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Step 3: SPEI settlement account */}
        {!resuming && step === 3 && (
          <form onSubmit={handleSaveBankAccount} className="mt-6 space-y-5">
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-950/70 p-4 text-xs font-bold text-emerald-300">
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Aquí es donde sus clientes le depositan. Sin esta cuenta, sus enlaces de pago no
                muestran instrucciones y nadie puede pagarle por transferencia.
              </span>
            </div>

            <div>
              <label htmlFor="onboarding_bank_name" className="block text-xs font-bold text-slate-300">
                Banco <span className="text-rose-400">*</span>
              </label>
              <input
                id="onboarding_bank_name"
                type="text"
                required
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="BBVA México"
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label htmlFor="onboarding_bank_clabe" className="block text-xs font-bold text-slate-300">
                CLABE Interbancaria (18 dígitos) <span className="text-rose-400">*</span>
              </label>
              <input
                id="onboarding_bank_clabe"
                type="text"
                inputMode="numeric"
                required
                value={bankClabe}
                onChange={(e) => setBankClabe(formatClabe(e.target.value))}
                placeholder="0121 8000 1234 5678 90"
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 font-mono text-sm font-bold text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <p className="mt-1 text-xs text-slate-400">{clabeDigits.length} de 18 dígitos</p>
              {clabeChecksumSuspect && (
                <p className="mt-1 text-xs font-bold text-amber-400">
                  Revise la CLABE: los dígitos no coinciden con una cuenta válida.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="onboarding_bank_holder"
                className="block text-xs font-bold text-slate-300"
              >
                Titular de la Cuenta (opcional)
              </label>
              <input
                id="onboarding_bank_holder"
                type="text"
                value={bankAccountHolder}
                onChange={(e) => setBankAccountHolder(e.target.value)}
                placeholder="Distribuidora del Norte S.A. de C.V."
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !clabeComplete || !bankName.trim()}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
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
