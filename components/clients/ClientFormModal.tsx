'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Building2, User, Phone, Mail, FileText, MapPin } from 'lucide-react';
import { Client } from '@/types';
import { validateRFC } from '@/lib/rfcValidator';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (clientData: Partial<Client>) => Promise<void>;
  initialClient?: Client | null;
}

const REGIMENES_FISCALES = [
  { code: '601', label: '601 - General de Ley Personas Morales' },
  { code: '626', label: '626 - Régimen Simplificado de Confianza (RESICO)' },
  { code: '612', label: '612 - Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '606', label: '606 - Arrendamiento' },
  { code: '603', label: '603 - Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 - Sueldos y Salarios' },
];

const CFDI_USES = [
  { code: 'G03', label: 'G03 - Gastos en general' },
  { code: 'G01', label: 'G01 - Adquisición de mercancías' },
  { code: 'P01', label: 'P01 - Por definir' },
  { code: 'CP01', label: 'CP01 - Pagos' },
  { code: 'S01', label: 'S01 - Sin efectos fiscales' },
];

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
  const [creditDays, setCreditDays] = useState<number>(0);
  const [creditStatus, setCreditStatus] = useState<'active' | 'suspended' | 'blocked'>('active');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setCreditDays(initialClient.credit_days ?? 0);
      setCreditStatus(initialClient.credit_status || 'active');
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
      setCreditDays(0);
      setCreditStatus('active');
      setNotes('');
    }
    setError(null);
  }, [initialClient, isOpen]);

  // Live RFC Modulo 11 Validation
  const rfcValidation = rfc ? validateRFC(rfc) : { isValid: false, type: null };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre o razón social del cliente es obligatorio.');
      return;
    }

    if (rfc.trim() && !rfcValidation.isValid) {
      setError('El RFC ingresado no tiene una sintaxis válida de SAT (12 o 13 caracteres).');
      return;
    }

    setSaving(true);
    setError(null);
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
        // Blank means "no credit line assigned", not "assigned a limit of
        // zero" — the column is nullable precisely so the detail page can tell
        // those apart instead of showing every client a green "Activo" over
        // $0 (#96). Terms and status only travel with a limit.
        credit_limit: creditLimit !== '' ? Number(creditLimit) : null,
        credit_days: creditLimit !== '' ? Number(creditDays) : null,
        credit_status: creditLimit !== '' ? creditStatus : null,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar cliente';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl transition-all sm:p-8 text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-xl font-extrabold text-white">
          {initialClient ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Captura los datos del cliente para cotizaciones y cobranza SAT.
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-950/80 border border-rose-500/30 p-3 text-xs font-semibold text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Business / Client Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300">
              Nombre o Razón Social <span className="text-rose-400">*</span>
            </label>
            <div className="relative mt-1.5">
              <Building2 className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Construcciones Maya S.A. de C.V."
                className="w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Contact Person & Phone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-300">Persona de Contacto</label>
              <div className="relative mt-1.5">
                <User className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ej. Arq. Fernando Maya"
                  className="w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">Teléfono WhatsApp (10 dígitos)</label>
              <div className="relative mt-1.5">
                <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. 8115551234"
                  className="w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Email & RFC */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-300">Correo Electrónico</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@cliente.com"
                  className="w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300">RFC del Cliente</label>
                {rfc && (
                  <span
                    className={`flex items-center gap-1 text-[11px] font-bold ${
                      rfcValidation.isValid ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {rfcValidation.isValid ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>RFC Válido ({rfcValidation.type})</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Incompleto</span>
                      </>
                    )}
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
                  placeholder="CMA120315HD9"
                  className="w-full min-h-[48px] font-mono uppercase rounded-xl border border-slate-800 bg-slate-950/80 pl-11 pr-4 text-sm font-bold text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SAT Tax Regime & Postal Code */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-300">Régimen Fiscal SAT</label>
              <select
                value={regimenFiscal}
                onChange={(e) => setRegimenFiscal(e.target.value)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none"
              >
                {/* The régimen decides how a CFDI is stamped, so it is the
                    client's own answer or nothing — the form used to preselect
                    601 for everyone, which (once saves started persisting)
                    would stamp a regime the owner never chose (#96). */}
                <option value="" className="bg-slate-900 text-white">
                  Selecciona el régimen del cliente
                </option>
                {REGIMENES_FISCALES.map((r) => (
                  <option key={r.code} value={r.code} className="bg-slate-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300">Código Postal</label>
              <div className="relative mt-1.5">
                <MapPin className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  maxLength={5}
                  value={codigoPostal}
                  onChange={(e) => setCodigoPostal(e.target.value)}
                  placeholder="64000"
                  className="w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* CFDI Usage */}
          <div>
            <label className="block text-xs font-bold text-slate-300">Uso de CFDI Preferente</label>
            <select
              value={cfdiUse}
              onChange={(e) => setCfdiUse(e.target.value)}
              className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 px-3 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none"
            >
              {CFDI_USES.map((u) => (
                <option key={u.code} value={u.code} className="bg-slate-900 text-white">
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* B2B Credit Conditions */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 space-y-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              Condiciones de Crédito B2B
            </h4>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Credit Limit */}
              <div>
                <label className="block text-xs font-bold text-slate-300">Límite de Crédito ($ MXN)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Ej. 50000"
                  className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-semibold text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Credit Days / Payment Terms */}
              <div>
                <label className="block text-xs font-bold text-slate-300">Plazo de Crédito (Días)</label>
                <select
                  value={creditDays}
                  onChange={(e) => setCreditDays(Number(e.target.value))}
                  className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value={0} className="bg-slate-900 text-white">0 días (Contado)</option>
                  <option value={7} className="bg-slate-900 text-white">7 días</option>
                  <option value={15} className="bg-slate-900 text-white">15 días</option>
                  <option value={30} className="bg-slate-900 text-white">30 días</option>
                  <option value={45} className="bg-slate-900 text-white">45 días</option>
                  <option value={60} className="bg-slate-900 text-white">60 días</option>
                  <option value={90} className="bg-slate-900 text-white">90 días</option>
                </select>
              </div>

              {/* Credit Status */}
              <div>
                <label className="block text-xs font-bold text-slate-300">Estatus de Crédito</label>
                <select
                  value={creditStatus}
                  onChange={(e) => setCreditStatus(e.target.value as 'active' | 'suspended' | 'blocked')}
                  className="mt-1.5 w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="active" className="bg-slate-900 text-emerald-400">Activo (Crédito Permitido)</option>
                  <option value="suspended" className="bg-slate-900 text-amber-400">Suspendido (Requiere Revisión)</option>
                  <option value="blocked" className="bg-slate-900 text-rose-400">Bloqueado (Solo Contado)</option>
                </select>
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
    </div>
  );
};
