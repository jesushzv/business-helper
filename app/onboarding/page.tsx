'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, ShieldCheck, FileText, MapPin, Landmark } from 'lucide-react';
import { validateRFC } from '@/lib/rfcValidator';
import { formatClabe, normalizeClabe, isValidClabeLength, hasValidClabeCheckDigit } from '@/lib/clabe';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { track } from '@/lib/analytics';
import { postOnboardingPath } from '@/lib/upgradeIntent';
import { invalidateCurrentOrg } from '@/lib/hooks/useCurrentOrg';
import { regimenOptions } from '@/lib/satRegimenes';
import {
  validateBankAccount,
  findDefaultAccount,
  type BankAccountFieldErrors,
  type BankAccount,
} from '@/lib/bankAccounts';
import { notifySettlementAccountChanged } from '@/lib/hooks/useSettlementAccount';

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
  const [organizationId, setOrganizationId] = useState<string>('');
  /**
   * The default account this form is *editing*, when resuming (#164).
   *
   * Empty means "create". Without it every visit to this form added a row:
   * an owner whose bank changed would reopen onboarding, see their old CLABE
   * prefilled, type the new one, and get a **second, non-default** account —
   * with every new quote still settling at the old one, and no indication that
   * the change they thought they made did not happen.
   */
  const [existingAccountId, setExistingAccountId] = useState<string>('');
  /** Keyed by input, pinned under it — never collected into one banner (#146). */
  const [bankFieldErrors, setBankFieldErrors] = useState<BankAccountFieldErrors>({});

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
        setOrganizationId(org.id || '');
        setStep(3);

        /**
         * Prefill from the **account list**, never from `organizations.bank_*`.
         *
         * The legacy columns are not cleared when an account is archived, so
         * prefilling from them re-offered a CLABE the owner had just taken out
         * of service — and the #64 banner links here, so the one tap they are
         * told to make would have re-registered a closed bank account as their
         * default. Their clients would then wire SPEI into it.
         *
         * A tenant with no live account correctly prefills nothing.
         */
        const accountsRes = await fetch('/api/organization/bank-accounts').catch(() => null);
        if (cancelled || !accountsRes?.ok) return;
        const accountsData = await accountsRes.json().catch(() => null);
        if (cancelled || !Array.isArray(accountsData?.accounts)) return;

        const current = findDefaultAccount(accountsData.accounts as BankAccount[]);
        if (!current) return;
        // Held so the submit edits this account instead of adding a second one.
        setExistingAccountId(current.id);
        setBankName(current.bank_name || '');
        setBankAccountHolder(current.account_holder || '');
        if (isValidClabeLength(current.clabe)) setBankClabe(formatClabe(current.clabe));
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
  // Shown while typing, as a heads-up before the tenant submits. It is no
  // longer only advisory: since this step writes through the accounts route
  // (#164), `validateBankAccount` refuses a failed checksum on both sides, so a
  // transposed digit is caught before it becomes the account money is wired to.
  // The warning stands down once the submit has pinned a real message.
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
        // The chrome's cached identity predates this organization — a session
        // that reached onboarding read `/api/organization` and got nothing.
        // Dropping it makes the next dashboard render read the real row rather
        // than the absence it cached (#281).
        invalidateCurrentOrg();
        // The bank account is a separate write and needs the organization to
        // exist first (the accounts route resolves it from the session).
        setOrganizationId(data.organization.id);
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
   * Step 3 → the first SPEI settlement account.
   *
   * Collected during onboarding rather than left in Ajustes because without it
   * the payment page refuses to render instructions (409 NO_BANK_ACCOUNT) and
   * the cash-flow loop dead-ends at its last step, with nothing earlier warning
   * the owner. Never falls through to the dashboard on a failed write — that
   * would be reporting a saved account that does not exist.
   *
   * Writes through `POST /api/organization/bank-accounts` rather than the
   * legacy `organizations.bank_*` columns (#164). The route flags the first
   * account as the default on its own, so a tenant leaving onboarding has an
   * account that quotes actually resolve to. Going through the legacy PATCH
   * would still work — `syncLegacyDefaultAccount` mirrors it — but it would
   * leave onboarding as the one surface that cannot name an account, and the
   * mirror exists for already-deployed code, not for new writes.
   */
  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setBankFieldErrors({});

    const values = {
      // Nothing asks the owner to name their first account: there is only one,
      // and one more field between a new tenant and a working payment link is
      // not worth the label. The bank's name is the honest default, and Ajustes
      // lets them rename it when a second account makes the distinction matter.
      label: bankName.trim() || 'Cuenta principal',
      bankName: bankName.trim(),
      clabe: clabeDigits,
      accountHolder: bankAccountHolder.trim(),
    };

    // Whole-form validation, every message keyed to its own input (#146).
    const validation = validateBankAccount(values);
    if (!validation.ok) {
      setBankFieldErrors(validation.fields);
      setLoading(false);
      return;
    }

    try {
      // Editing the account this form was prefilled from, or creating the
      // tenant's first. Always creating turns "I changed my CLABE" into a
      // second account that receives nothing.
      const res = await fetch(
        existingAccountId
          ? `/api/organization/bank-accounts/${existingAccountId}`
          : '/api/organization/bank-accounts',
        {
          method: existingAccountId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        }
      );

      const data = await res.json().catch(() => null);

      // The account the server actually created — not `res.ok` alone, which
      // would send the owner to a dashboard believing they can be paid.
      if (res.ok && data?.account?.id) {
        track('settlement_account_configured', {
          organization_id: organizationId || '',
          has_account_holder: Boolean(bankAccountHolder.trim()),
        });
        // The #64 banner and the share actions may already be mounted behind
        // this route; without the announcement they keep the pre-save answer.
        notifySettlementAccountChanged();
        router.push(postOnboardingPath(typeof window === 'undefined' ? '' : window.location.search));
        return;
      }

      const fields = data?.error?.fields;
      if (fields && typeof fields === 'object' && Object.keys(fields).length > 0) {
        setBankFieldErrors(fields as BankAccountFieldErrors);
      } else {
        setError(data?.error?.message || 'No se pudo guardar la cuenta bancaria. Intenta de nuevo.');
      }
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
                aria-invalid={Boolean(bankFieldErrors.bankName || bankFieldErrors.label)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 text-base font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {/*
                The label is derived from this field, so a problem with either
                belongs here — pinned under the input the tenant would fix, not
                in a banner above a form they have scrolled past (#146).
              */}
              {(bankFieldErrors.bankName || bankFieldErrors.label) && (
                <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">
                  {bankFieldErrors.bankName || bankFieldErrors.label}
                </p>
              )}
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
                aria-invalid={Boolean(bankFieldErrors.clabe)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950 px-4 font-mono text-base font-bold text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {/* Contrast from #194's a11y baseline; the keyed message is #164's. */}
              <p className="mt-1 text-xs text-slate-400">{clabeDigits.length} de 18 dígitos</p>
              {bankFieldErrors.clabe && (
                <p role="alert" className="mt-1.5 text-xs font-bold text-rose-300">
                  {bankFieldErrors.clabe}
                </p>
              )}
              {!bankFieldErrors.clabe && clabeChecksumSuspect && (
                <p className="mt-1 text-xs font-bold text-amber-400">
                  Revisa la CLABE: los dígitos no coinciden con una cuenta válida.
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
