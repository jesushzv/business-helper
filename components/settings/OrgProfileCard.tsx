'use client';

import React, { useState } from 'react';
import { Building2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { OrganizationSettings } from '@/lib/hooks/useOrganizationSettings';
import { validateRFC } from '@/lib/rfcValidator';

interface OrgProfileCardProps {
  settings: OrganizationSettings;
  onSave: (updated: Partial<OrganizationSettings>) => Promise<boolean>;
  saving: boolean;
  /** Only the owner can PATCH the organization; others see the data read-only. */
  canEdit: boolean;
}

// Stored as the SAT code; the label is presentation only. The old select
// persisted the whole display string, which is not what a CFDI wants.
const REGIMENES_FISCALES = [
  { code: '601', label: '601 — General de Ley Personas Morales' },
  { code: '626', label: '626 — Régimen Simplificado de Confianza (RESICO)' },
  { code: '612', label: '612 — Personas Físicas con Actividades Empresariales' },
  { code: '605', label: '605 — Sueldos y Salarios' },
];

export const OrgProfileCard: React.FC<OrgProfileCardProps> = ({
  settings,
  onSave,
  saving,
  canEdit,
}) => {
  const [formData, setFormData] = useState<OrganizationSettings>(settings);
  const [rfcError, setRfcError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<boolean>(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'rfc') setRfcError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.rfc && formData.rfc.trim().length > 0) {
      const rfcCheck = validateRFC(formData.rfc);
      if (!rfcCheck.isValid) {
        setRfcError(rfcCheck.error || 'RFC inválido');
        return;
      }
    }

    const ok = await onSave(formData);
    if (ok) {
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl sm:p-8 text-white">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-950/80 text-indigo-400 border border-indigo-500/30 shadow-md">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-white">
            Perfil de la Empresa
          </h3>
          <p className="text-xs text-slate-400">
            Datos fiscales para cotizaciones, comprobantes SPEI y facturación CFDI 4.0
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {successMsg && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/80 p-4 text-xs font-bold text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Los datos de la empresa se guardaron correctamente.</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
            Nombre de la Empresa o Razón Social
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px] disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              RFC (Taxpayer ID)
            </label>
            <input
              type="text"
              name="rfc"
              value={formData.rfc}
              onChange={handleChange}
              placeholder="XAXX010101000"
              disabled={!canEdit}
              className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px] uppercase font-mono disabled:opacity-60"
            />
            {rfcError && (
              <p className="mt-1 flex items-center gap-1 text-xs text-rose-400">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{rfcError}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Código Postal SAT
            </label>
            <input
              type="text"
              name="codigo_postal"
              value={formData.codigo_postal}
              onChange={handleChange}
              maxLength={5}
              placeholder="64000"
              disabled={!canEdit}
              className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px] disabled:opacity-60"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Régimen Fiscal (SAT)
            </label>
            <select
              name="regimen_fiscal"
              value={formData.regimen_fiscal}
              onChange={handleChange}
              disabled={!canEdit}
              className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px] disabled:opacity-60"
            >
              {formData.regimen_fiscal === '' && (
                <option value="" className="bg-slate-900 text-white">
                  Selecciona tu régimen
                </option>
              )}
              {REGIMENES_FISCALES.map((r) => (
                <option key={r.code} value={r.code} className="bg-slate-900 text-white">
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Teléfono WhatsApp de Contacto
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="10 dígitos, ej. 8112345678"
              disabled={!canEdit}
              className="mt-1.5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5 text-sm font-medium text-white shadow-xl focus:border-emerald-500 focus:outline-none min-h-[48px] disabled:opacity-60"
            />
          </div>
        </div>

        <div className="pt-2">
          {canEdit ? (
            <button
              type="submit"
              disabled={saving}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold px-6 py-3.5 text-sm shadow-md transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Cambios de Empresa'}</span>
            </button>
          ) : (
            <p className="text-xs font-medium text-slate-400">
              Solo el propietario del negocio puede editar estos datos.
            </p>
          )}
        </div>
      </form>
    </div>
  );
};
