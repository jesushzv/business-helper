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
  const [regimenFiscal, setRegimenFiscal] = useState('601');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [cfdiUse, setCfdiUse] = useState('G03');
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
      setRegimenFiscal(initialClient.regimen_fiscal || '601');
      setCodigoPostal(initialClient.codigo_postal || '');
      setCfdiUse(initialClient.cfdi_use || 'G03');
      setNotes(initialClient.notes || '');
    } else {
      setName('');
      setContactName('');
      setEmail('');
      setPhone('');
      setRfc('');
      setRegimenFiscal('601');
      setCodigoPostal('');
      setCfdiUse('G03');
      setNotes('');
    }
    setError(null);
  }, [initialClient, isOpen]);

  // Live RFC Modulo 11 Validation
  const rfcValidation = rfc ? validateRFC(rfc) : { isValid: false, type: null };

  if (!isOpen) return null;

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
        name: name.trim(),
        contact_name: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        rfc: rfc.trim().toUpperCase() || undefined,
        regimen_fiscal: regimenFiscal,
        codigo_postal: codigoPostal.trim() || undefined,
        cfdi_use: cfdiUse,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-900/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-3xl border border-gray-100 bg-white p-6 shadow-2xl transition-all sm:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-xl font-extrabold text-gray-900">
          {initialClient ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Captura los datos del cliente para cotizaciones y cobranza SAT.
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Business / Client Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700">
              Nombre o Razón Social <span className="text-red-500">*</span>
            </label>
            <div className="relative mt-1.5">
              <Building2 className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Construcciones Maya S.A. de C.V."
                className="w-full min-h-[48px] rounded-xl border border-gray-300 pl-11 pr-4 text-sm font-medium text-gray-900 placeholder-gray-400 transition-all focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
          </div>

          {/* Contact Person & Phone */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-gray-700">Persona de Contacto</label>
              <div className="relative mt-1.5">
                <User className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ej. Arq. Fernando Maya"
                  className="w-full min-h-[48px] rounded-xl border border-gray-300 pl-11 pr-4 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Teléfono WhatsApp (10 dígitos)</label>
              <div className="relative mt-1.5">
                <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej. 8115551234"
                  className="w-full min-h-[48px] rounded-xl border border-gray-300 pl-11 pr-4 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>
          </div>

          {/* Email & RFC */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-gray-700">Correo Electrónico</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@cliente.com"
                  className="w-full min-h-[48px] rounded-xl border border-gray-300 pl-11 pr-4 text-sm font-medium text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-700">RFC del Cliente</label>
                {rfc && (
                  <span
                    className={`flex items-center gap-1 text-[11px] font-bold ${
                      rfcValidation.isValid ? 'text-emerald-600' : 'text-amber-600'
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
                <FileText className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  maxLength={13}
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="CMA120315HD9"
                  className="w-full min-h-[48px] font-mono uppercase rounded-xl border border-gray-300 pl-11 pr-4 text-sm font-bold text-gray-900 placeholder-gray-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>
          </div>

          {/* SAT Tax Regime & Postal Code */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-gray-700">Régimen Fiscal SAT</label>
              <select
                value={regimenFiscal}
                onChange={(e) => setRegimenFiscal(e.target.value)}
                className="mt-1.5 w-full min-h-[48px] rounded-xl border border-gray-300 px-3 text-xs font-medium text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              >
                {REGIMENES_FISCALES.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700">Código Postal</label>
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
          </div>

          {/* CFDI Usage */}
          <div>
            <label className="block text-xs font-bold text-gray-700">Uso de CFDI Preferente</label>
            <select
              value={cfdiUse}
              onChange={(e) => setCfdiUse(e.target.value)}
              className="mt-1.5 w-full min-h-[48px] rounded-xl border border-gray-300 px-3 text-xs font-medium text-gray-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
            >
              {CFDI_USES.map((u) => (
                <option key={u.code} value={u.code}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : initialClient ? 'Actualizar Cliente' : 'Guardar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
