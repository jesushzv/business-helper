'use client';

import React, { useState } from 'react';
import { Building2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { OrganizationSettings } from '@/lib/hooks/useOrganizationSettings';
import { validateRFC } from '@/lib/rfcValidator';

interface OrgProfileCardProps {
  settings: OrganizationSettings;
  onSave: (updated: Partial<OrganizationSettings>) => Promise<boolean>;
  saving: boolean;
}

export const OrgProfileCard: React.FC<OrgProfileCardProps> = ({ settings, onSave, saving }) => {
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
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs sm:p-8">
      <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 shadow-xs">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-gray-900">
            Perfil de la Empresa
          </h3>
          <p className="text-xs text-gray-500">
            Datos fiscales para cotizaciones, comprobantes SPEI y facturación CFDI 4.0
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {successMsg && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-xs font-bold text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Los datos de la empresa se guardaron correctamente.</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
            Nombre de la Empresa o Razón Social
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="mt-1.5 w-full rounded-2xl border border-gray-300 p-3.5 text-sm font-medium text-gray-900 shadow-xs focus:border-indigo-600 focus:outline-hidden min-h-[48px]"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              RFC (Taxpayer ID)
            </label>
            <input
              type="text"
              name="rfc"
              value={formData.rfc}
              onChange={handleChange}
              placeholder="DNO850101HD9"
              className="mt-1.5 w-full rounded-2xl border border-gray-300 p-3.5 text-sm font-medium text-gray-900 shadow-xs focus:border-indigo-600 focus:outline-hidden min-h-[48px] uppercase"
            />
            {rfcError && (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{rfcError}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Código Postal SAT
            </label>
            <input
              type="text"
              name="codigo_postal"
              value={formData.codigo_postal}
              onChange={handleChange}
              maxLength={5}
              placeholder="64000"
              className="mt-1.5 w-full rounded-2xl border border-gray-300 p-3.5 text-sm font-medium text-gray-900 shadow-xs focus:border-indigo-600 focus:outline-hidden min-h-[48px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Régimen Fiscal (SAT)
            </label>
            <select
              name="regimen_fiscal"
              value={formData.regimen_fiscal}
              onChange={handleChange}
              className="mt-1.5 w-full rounded-2xl border border-gray-300 p-3 text-sm font-medium text-gray-900 shadow-xs focus:border-indigo-600 focus:outline-hidden min-h-[48px]"
            >
              <option value="601 — General de Ley Personas Morales">601 — General de Ley Personas Morales</option>
              <option value="626 — Régimen Simplificado de Confianza (RESICO)">626 — RESICO</option>
              <option value="612 — Personas Físicas con Actividades Empresariales">612 — Actividades Empresariales</option>
              <option value="605 — Sueldos y Salarios">605 — Sueldos y Salarios</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Teléfono WhatsApp de Contacto
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="8115551234"
              className="mt-1.5 w-full rounded-2xl border border-gray-300 p-3.5 text-sm font-medium text-gray-900 shadow-xs focus:border-indigo-600 focus:outline-hidden min-h-[48px]"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-98 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Cambios de Empresa'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
