'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, Building2, User, Mail, FileText, MapPin, Lock } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Client } from '@/types';
import { validateRFC } from '@/lib/rfcValidator';
import { looksLikeEmail, looksLikeCodigoPostal } from '@/lib/clientFieldHints';
import { ClientWriteError } from '@/lib/clientWriteError';
import { PhoneField } from '@/components/shared/PhoneField';
import { regimenOptions } from '@/lib/satRegimenes';
import { canManageCredit } from '@/lib/clientCreditAuthorization';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';
import { userFacingMessage } from '@/lib/errorCopy';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (clientData: Partial<Client>) => Promise<void>;
  initialClient?: Client | null;
}

const CFDI_USES = [
  { code: 'G03', label: 'G03 - Gastos en general' },
  { code: 'G01', label: 'G01 - Adquisición de mercancías' },
  { code: 'P01', label: 'P01 - Por definir' },
  { code: 'CP01', label: 'CP01 - Pagos' },
  { code: 'S01', label: 'S01 - Sin efectos fiscales' },
];

/**
 * The input each column's error message belongs to.
 *
 * The API reports failures keyed by column name; this is the only translation
 * needed to move focus to the offending field. Keys must stay in step with
 * `FIELD_ORDER` in `lib/clientValidation.ts` — `tests/components/
 * ClientFormModal.test.tsx` fails the build when a validated column has no
 * input to point at.
 */
export const FIELD_INPUT_IDS: Record<string, string> = {
  name: 'client-name',
  contact_name: 'client-contact-name',
  email: 'client-email',
  phone: 'client-phone',
  rfc: 'client-rfc',
  regimen_fiscal: 'client-regimen-fiscal',
  codigo_postal: 'client-codigo-postal',
  cfdi_use: 'client-cfdi-use',
  credit_limit: 'client-credit-limit',
  credit_days: 'client-credit-days',
  credit_status: 'client-credit-status',
};

/** Border + ring for an input the server or the form has objected to. */
function fieldClass(base: string, invalid: boolean): string {
  return invalid
    ? `${base} border-rose-500/70 focus:border-rose-400`
    : `${base} border-slate-800 focus:border-emerald-500`;
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialClient,
}) => {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [rfc, setRfc] = useState('');
  const [regimenFiscal, setRegimenFiscal] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [cfdiUse, setCfdiUse] = useState('G03');
  const [creditLimit, setCreditLimit] = useState<number | ''>('');
  const [creditDays, setCreditDays] = useState<number | ''>('');
  const [creditStatus, setCreditStatus] = useState<'' | 'active' | 'suspended' | 'blocked'>('');
  const [notes, setNotes] = useState('');

  /**
   * Whether this tenant may set the credit terms (#123).
   *
   * Three states, not two. `role === null` is **unknown** — still loading, or
   * the org read failed — and unknown must not disable the section: locking a
   * healthy owner out of their own credit line on a network blip is the #64
   * mistake in reverse. The permissive choice is safe because the client is not
   * the enforcement: both clients routes refuse a credit change from a role
   * without the capability, with a 403 the form pins under the field.
   */
  const { role, loading: roleLoading } = useCurrentOrg();
  const creditLocked = !roleLoading && role !== null && !canManageCredit(role);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Column name → Spanish message, rendered under the matching input.
   *
   * The form used to hold a single `error` string and show it in one banner at
   * the top of a modal that, at 375px, is taller than the screen. Tapping
   * "Guardar Cliente" at the bottom therefore looked like it did nothing, and
   * the message — when it was finally scrolled to — named no field. Both
   * halves of "no sé qué me falta" came from that.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialClient) {
      setName(initialClient.name || '');
      setContactName(initialClient.contact_name || '');
      setEmail(initialClient.email || '');
      setPhone(initialClient.phone || '');
      setRfc(initialClient.rfc || '');
      setRegimenFiscal(initialClient.regimen_fiscal || '');
      setCodigoPostal(initialClient.codigo_postal || '');
      setCfdiUse(initialClient.cfdi_use || 'G03');
      setCreditLimit(initialClient.credit_limit ?? '');
      setCreditDays(initialClient.credit_days ?? '');
      setCreditStatus(initialClient.credit_status || '');
      setNotes(initialClient.notes || '');
    } else {
      setName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setRfc('');
      setRegimenFiscal('');
      setCodigoPostal('');
      setCfdiUse('G03');
      setCreditLimit('');
      setCreditDays('');
      setCreditStatus('');
      setNotes('');
    }
    setError(null);
    setFieldErrors({});
  }, [initialClient, isOpen]);

  /**
   * RFC shape, shown as guidance and **never** as a gate.
   *
   * A client is a directory entry first. The RFC is only load-bearing when a
   * CFDI is stamped, and `lib/facturapi.ts` refuses to stamp one with a bad
   * receptor RFC and says why — so blocking registration over it lost the
   * client to keep a field the owner may not have been given yet.
   */
  const rfcLooksValid = rfc.trim() ? validateRFC(rfc.trim()).isValid : true;
  const rfcType = rfc.trim() ? validateRFC(rfc.trim()).type : null;

  /** Drops a field's error as soon as the tenant touches it. */
  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  /**
   * Puts the first bad field on screen and in focus.
   *
   * Without this the messages exist but the tenant never reaches them: the
   * banner is above the fold, the submit button is below it, and a phone shows
   * one of the two.
   */
  const focusFirstError = (errors: Record<string, string>) => {
    const first = Object.keys(errors)[0];
    const inputId = first && FIELD_INPUT_IDS[first];
    if (!inputId || typeof document === 'undefined') return;
    const el = document.getElementById(inputId);
    if (!el) return;
    // `focus` is the load-bearing half and every environment has it;
    // `scrollIntoView` is the enhancement and jsdom does not implement it.
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    el.focus({ preventScroll: true });
  };

  const applyErrors = (errors: Record<string, string>, summary: string | null) => {
    setFieldErrors(errors);
    setError(summary);
    focusFirstError(errors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only the name is checked here. Everything else is the server's call and
    // comes back attributed — duplicating those rules in the browser is how a
    // client and a server come to disagree about the same client (#95's class),
    // and a stricter copy would refuse values the product can actually store.
    if (!name.trim()) {
      applyErrors(
        { name: 'Escribe el nombre o razón social del cliente.' },
        'Falta el nombre del cliente. Es el único dato obligatorio.'
      );
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await onSave({
        // null, not undefined: the write path skips undefined keys so it can
        // tell "not provided" from "cleared". The form always provides every
        // field, so a blank one means the user cleared it and must persist as
        // NULL — sending undefined made clearing a value a silent no-op.
        name: name.trim(),
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        rfc: rfc.trim().toUpperCase() || null,
        regimen_fiscal: regimenFiscal || null,
        codigo_postal: codigoPostal.trim() || null,
        cfdi_use: cfdiUse,
        // Blank means "not assigned", not "assigned a value of zero" — the
        // columns are nullable precisely so the detail page can tell those
        // apart instead of showing every client a green "Activo" over $0 (#96).
        //
        // The three are independent on purpose. Coupling status and plazo to
        // the limit discarded the most important credit decision there is:
        // an owner cutting off a defaulting client picks "Bloqueado" and
        // clears the limit, and the block would never persist while the modal
        // closed reporting success.
        // Omitted entirely, not sent as the stored values, when the tenant
        // cannot set them: the routes read a present key as an intent, and a
        // patch that never mentions a column cannot be misread as clearing it.
        ...(creditLocked
          ? {}
          : {
              credit_limit: creditLimit === '' ? null : Number(creditLimit),
              credit_days: creditDays === '' ? null : Number(creditDays),
              credit_status: creditStatus || null,
            }),
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err: unknown) {
      const msg = userFacingMessage(err, 'No se pudo guardar el cliente. Intenta de nuevo.');
      // A ClientWriteError carries the API's per-field map; anything else is a
      // failure with no field to blame, and stays in the banner alone.
      const fields = err instanceof ClientWriteError ? err.fields : {};
      applyErrors(fields, msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const errorCount = Object.keys(fieldErrors).length;

  /** Message + wiring for one input, so every field reports the same way. */
  const fieldProps = (field: string) => {
    const message = fieldErrors[field];
    return {
      id: FIELD_INPUT_IDS[field],
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `${FIELD_INPUT_IDS[field]}-error` : undefined,
    };
  };

  const FieldError: React.FC<{ field: string }> = ({ field }) => {
    const message = fieldErrors[field];
    if (!message) return null;
    return (
      <p
        id={`${FIELD_INPUT_IDS[field]}-error`}
        role="alert"
        className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-rose-400"
      >
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>{message}</span>
      </p>
    );
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={initialClient ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
      // The longest form in the app; a backdrop tap must not discard it.
      dismissOnBackdrop={false}
      panelClassName="p-6 sm:p-8"
    >
      <div>
        <h3 className="text-xl font-extrabold text-white pr-12">
          {initialClient ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Solo el nombre es obligatorio. Todo lo demás lo puedes completar después.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl bg-rose-950/80 border border-rose-500/30 p-3 text-xs font-semibold text-rose-400"
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0" />
            <span>
              {error}
              {errorCount > 1 && (
                <span className="mt-1 block font-medium text-rose-300/80">
                  Marcamos en rojo cada campo que hay que corregir.
                </span>
              )}
            </span>
          </div>
        )}

        {/* noValidate: the browser's own bubbles arrive in the device language,
            not the product's, and they stop at the first field. Every message
            here is ours, in Spanish, and they all appear at once. */}
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          {/* Business / Client Name */}
          <div>
            <label htmlFor={FIELD_INPUT_IDS.name} className="block text-xs font-bold text-slate-300">
              Nombre o Razón Social <span className="text-rose-400">*</span>
            </label>
            <div className="relative mt-1.5">
              <Building2 className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
              <input
                {...fieldProps('name')}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearFieldError('name');
                }}
                placeholder="Ej. Construcciones Maya S.A. de C.V."
                className={fieldClass(
                  'w-full min-h-[48px] rounded-xl border bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:outline-none',
                  !!fieldErrors.name
                )}
              />
            </div>
            <FieldError field="name" />
          </div>

          {/* Contact Person & Phone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={FIELD_INPUT_IDS.contact_name}
                className="block text-xs font-bold text-slate-300"
              >
                Persona de Contacto
              </label>
              <div className="relative mt-1.5">
                <User className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  {...fieldProps('contact_name')}
                  type="text"
                  value={contactName}
                  onChange={(e) => {
                    setContactName(e.target.value);
                    clearFieldError('contact_name');
                  }}
                  placeholder="Ej. Arq. Fernando Maya"
                  className={fieldClass(
                    'w-full min-h-[48px] rounded-xl border bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:outline-none',
                    !!fieldErrors.contact_name
                  )}
                />
              </div>
              <FieldError field="contact_name" />
            </div>

            <div>
              <PhoneField
                inputId={FIELD_INPUT_IDS.phone}
                value={phone}
                onChange={(next) => {
                  setPhone(next);
                  clearFieldError('phone');
                }}
                hint="Opcional. Es el número al que se envía el código de firma. Si tu cliente está en otro país, elige su bandera."
              />
              <FieldError field="phone" />
            </div>
          </div>

          {/* Email & RFC */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={FIELD_INPUT_IDS.email}
                className="block text-xs font-bold text-slate-300"
              >
                Correo Electrónico
              </label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  {...fieldProps('email')}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError('email');
                  }}
                  placeholder="contacto@cliente.com"
                  className={fieldClass(
                    'w-full min-h-[48px] rounded-xl border bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:outline-none',
                    !!fieldErrors.email
                  )}
                />
              </div>
              {/* A hint, never a gate — same posture as the RFC below. A typo'd
                  address is worth flagging; losing the client record over one
                  is not. */}
              {email.trim() && !looksLikeEmail(email) && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-amber-400">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>Revisa el correo: parece incompleto. Puedes guardarlo así.</span>
                </p>
              )}
              <FieldError field="email" />
            </div>

            <div>
              <label
                htmlFor={FIELD_INPUT_IDS.rfc}
                className="block text-xs font-bold text-slate-300"
              >
                RFC del Cliente <span className="font-medium text-slate-500">(opcional)</span>
              </label>
              <div className="relative mt-1.5">
                <FileText className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  {...fieldProps('rfc')}
                  type="text"
                  maxLength={13}
                  value={rfc}
                  onChange={(e) => {
                    setRfc(e.target.value.toUpperCase());
                    clearFieldError('rfc');
                  }}
                  placeholder="CMA120315HD9"
                  className={fieldClass(
                    'w-full min-h-[48px] font-mono uppercase rounded-xl border bg-slate-950/80 pl-11 pr-4 text-sm font-bold text-white placeholder-slate-500 focus:outline-none',
                    !!fieldErrors.rfc
                  )}
                />
              </div>
              {/* Guidance, not a gate: the RFC never blocks the save. Saying so
                  next to the field is what keeps accepting a half-typed one
                  from reading as the product blessing it. */}
              {rfc.trim() &&
                (rfcLooksValid ? (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>RFC válido ({rfcType})</span>
                  </p>
                ) : (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-amber-400">
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span>
                      No parece un RFC del SAT (12 o 13 caracteres). Puedes guardar el cliente
                      así; solo lo necesitarás correcto para facturarle.
                    </span>
                  </p>
                ))}
              <FieldError field="rfc" />
            </div>
          </div>

          {/* SAT Tax Regime & Postal Code */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
            <div className="sm:col-span-2">
              <label
                htmlFor={FIELD_INPUT_IDS.regimen_fiscal}
                className="block text-xs font-bold text-slate-300"
              >
                Régimen Fiscal SAT <span className="font-medium text-slate-500">(opcional)</span>
              </label>
              <select
                {...fieldProps('regimen_fiscal')}
                value={regimenFiscal}
                onChange={(e) => {
                  setRegimenFiscal(e.target.value);
                  clearFieldError('regimen_fiscal');
                }}
                className={fieldClass(
                  'mt-1.5 w-full min-h-[48px] rounded-xl border bg-slate-950/80 px-3 text-xs font-medium text-white focus:outline-none',
                  !!fieldErrors.regimen_fiscal
                )}
              >
                {/* The régimen decides how a CFDI is stamped, so it is the
                    client's own answer or nothing — the form used to preselect
                    601 for everyone, which (once saves started persisting)
                    would stamp a regime the owner never chose (#96). */}
                <option value="" className="bg-slate-900 text-white">
                  Selecciona el régimen del cliente
                </option>
                {regimenOptions(regimenFiscal).map((r) => (
                  <option key={r.code} value={r.code} className="bg-slate-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
              <FieldError field="regimen_fiscal" />
            </div>

            <div>
              <label
                htmlFor={FIELD_INPUT_IDS.codigo_postal}
                className="block text-xs font-bold text-slate-300"
              >
                Código Postal
              </label>
              <div className="relative mt-1.5">
                <MapPin className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  {...fieldProps('codigo_postal')}
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={codigoPostal}
                  onChange={(e) => {
                    setCodigoPostal(e.target.value);
                    clearFieldError('codigo_postal');
                  }}
                  placeholder="64000"
                  className={fieldClass(
                    'w-full min-h-[48px] rounded-xl border bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white focus:outline-none',
                    !!fieldErrors.codigo_postal
                  )}
                />
              </div>
              {codigoPostal.trim() && !looksLikeCodigoPostal(codigoPostal) && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-amber-400">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>Son 5 dígitos. Lo necesitarás completo solo para facturar.</span>
                </p>
              )}
              <FieldError field="codigo_postal" />
            </div>
          </div>

          {/* CFDI Usage */}
          <div>
            <label
              htmlFor={FIELD_INPUT_IDS.cfdi_use}
              className="block text-xs font-bold text-slate-300"
            >
              Uso de CFDI Preferente
            </label>
            <select
              {...fieldProps('cfdi_use')}
              value={cfdiUse}
              onChange={(e) => {
                setCfdiUse(e.target.value);
                clearFieldError('cfdi_use');
              }}
              className={fieldClass(
                'mt-1.5 w-full min-h-[48px] rounded-xl border bg-slate-950/80 px-3 text-xs font-medium text-white focus:outline-none',
                !!fieldErrors.cfdi_use
              )}
            >
              {CFDI_USES.map((u) => (
                <option key={u.code} value={u.code} className="bg-slate-900 text-white">
                  {u.label}
                </option>
              ))}
            </select>
            <FieldError field="cfdi_use" />
          </div>

          {/* B2B Credit Conditions */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              Condiciones de Crédito B2B <span className="font-bold text-slate-500">(opcional)</span>
            </h4>

            {/* Says who can change it and why it is locked, rather than
                presenting a control that answers 403. Plain language: no
                "capability", no role matrix. */}
            {creditLocked && (
              <p className="flex items-start gap-2 rounded-xl bg-slate-900/80 p-3 text-[11px] font-semibold text-slate-400">
                <Lock className="mt-px h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>
                  Cuánto crédito se le da a un cliente lo decide el dueño o un administrador de
                  la cuenta. Puedes editar todo lo demás de este cliente.
                </span>
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 [&>*]:min-w-0">
              {/* Credit Limit */}
              <div>
                <label
                  htmlFor={FIELD_INPUT_IDS.credit_limit}
                  className="block text-xs font-bold text-slate-300"
                >
                  Límite de Crédito ($ MXN)
                </label>
                <input
                  {...fieldProps('credit_limit')}
                  disabled={creditLocked}
                  type="number"
                  min={0}
                  step={1000}
                  value={creditLimit}
                  onChange={(e) => {
                    setCreditLimit(e.target.value ? Number(e.target.value) : '');
                    clearFieldError('credit_limit');
                  }}
                  placeholder="Ej. 50000"
                  className={fieldClass(
                    'mt-1.5 w-full min-h-[48px] rounded-xl border bg-slate-900 px-3 text-sm font-semibold text-white placeholder-slate-500 focus:outline-none',
                    !!fieldErrors.credit_limit
                  )}
                />
                <FieldError field="credit_limit" />
              </div>

              {/* Credit Days / Payment Terms */}
              <div>
                <label
                  htmlFor={FIELD_INPUT_IDS.credit_days}
                  className="block text-xs font-bold text-slate-300"
                >
                  Plazo de Crédito (Días)
                </label>
                <select
                  {...fieldProps('credit_days')}
                  disabled={creditLocked}
                  value={creditDays}
                  onChange={(e) => {
                    setCreditDays(e.target.value === '' ? '' : Number(e.target.value));
                    clearFieldError('credit_days');
                  }}
                  className={fieldClass(
                    'mt-1.5 w-full min-h-[48px] rounded-xl border bg-slate-900 px-3 text-xs font-medium text-white focus:outline-none',
                    !!fieldErrors.credit_days
                  )}
                >
                  <option value="" className="bg-slate-900 text-white">Sin definir</option>
                  <option value={0} className="bg-slate-900 text-white">0 días (Contado)</option>
                  <option value={7} className="bg-slate-900 text-white">7 días</option>
                  <option value={15} className="bg-slate-900 text-white">15 días</option>
                  <option value={30} className="bg-slate-900 text-white">30 días</option>
                  <option value={45} className="bg-slate-900 text-white">45 días</option>
                  <option value={60} className="bg-slate-900 text-white">60 días</option>
                  <option value={90} className="bg-slate-900 text-white">90 días</option>
                </select>
                <FieldError field="credit_days" />
              </div>

              {/* Credit Status */}
              <div>
                <label
                  htmlFor={FIELD_INPUT_IDS.credit_status}
                  className="block text-xs font-bold text-slate-300"
                >
                  Estatus de Crédito
                </label>
                <select
                  {...fieldProps('credit_status')}
                  disabled={creditLocked}
                  value={creditStatus}
                  onChange={(e) => {
                    setCreditStatus(e.target.value as '' | 'active' | 'suspended' | 'blocked');
                    clearFieldError('credit_status');
                  }}
                  className={fieldClass(
                    'mt-1.5 w-full min-h-[48px] rounded-xl border bg-slate-900 px-3 text-xs font-medium text-white focus:outline-none',
                    !!fieldErrors.credit_status
                  )}
                >
                  <option value="" className="bg-slate-900 text-white">Sin asignar</option>
                  <option value="active" className="bg-slate-900 text-emerald-400">Activo (Crédito Permitido)</option>
                  <option value="suspended" className="bg-slate-900 text-amber-400">Suspendido (Requiere Revisión)</option>
                  <option value="blocked" className="bg-slate-900 text-rose-400">Bloqueado (Solo Contado)</option>
                </select>
                <FieldError field="credit_status" />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-700 active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-2.5 text-sm font-bold text-slate-950 shadow-md active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : initialClient ? 'Actualizar Cliente' : 'Guardar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
