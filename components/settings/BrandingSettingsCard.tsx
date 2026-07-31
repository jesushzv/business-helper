'use client';

import React, { useState } from 'react';
import { Palette, Globe, Check, Image as ImageIcon } from 'lucide-react';
import { getOrganizationBranding, generateThemeCssVariables } from '@/lib/branding';

interface BrandingSettingsCardProps {
  settings: any;
  onSave: (updated: any) => Promise<boolean>;
  saving?: boolean;
}

const PRESET_COLORS = [
  { name: 'Azul Ejecutivo', hex: '#2563eb' },
  { name: 'Verde Esmeralda', hex: '#059669' },
  { name: 'Púrpura Corporativo', hex: '#7c3aed' },
  { name: 'Naranja Calidez', hex: '#ea580c' },
  { name: 'Negro Elegante', hex: '#0f172a' },
];

export function BrandingSettingsCard({ settings, onSave, saving }: BrandingSettingsCardProps) {
  const branding = getOrganizationBranding({
    primaryColor: settings?.primary_color || '#2563eb',
    logoUrl: settings?.logo_url,
    tagline: settings?.tagline,
    companyName: settings?.name,
  });

  const [primaryColor, setPrimaryColor] = useState<string>(branding.primaryColor);
  const [logoUrl, setLogoUrl] = useState<string>(settings?.logo_url || '');
  const [tagline, setTagline] = useState<string>(settings?.tagline || '');
  const [defaultCurrency, setDefaultCurrency] = useState<'MXN' | 'USD'>(settings?.default_currency || 'MXN');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onSave({
      primary_color: primaryColor,
      logo_url: logoUrl || null,
      tagline: tagline || null,
      default_currency: defaultCurrency,
    });
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const cssVars = generateThemeCssVariables({ primaryColor });

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Palette className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Marca Blanca y Personalización de Portales</h3>
            <p className="text-xs text-slate-500">Personalice el color principal, logotipo y divisa predeterminada de sus propuestas públicas.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveBranding} className="space-y-6">
        {/* Primary Theme Color Palette */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Color Principal de Marca</label>
          <div className="flex flex-wrap items-center gap-3">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.hex}
                type="button"
                onClick={() => setPrimaryColor(color.hex)}
                className={`min-h-[48px] px-4 py-2 rounded-2xl flex items-center gap-2 border text-sm font-semibold transition-all ${
                  primaryColor === color.hex
                    ? 'border-slate-900 bg-slate-50 shadow-sm ring-2 ring-slate-900/10'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <span className="w-5 h-5 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
                <span>{color.name}</span>
                {primaryColor === color.hex && <Check className="w-4 h-4 text-slate-900 ml-1" />}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Logo URL & Tagline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">URL del Logotipo (PNG/SVG)</label>
            <div className="relative">
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
                className="w-full min-h-[48px] px-4 pl-11 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <ImageIcon className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Lema o Eslogan de Empresa</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Soluciones de construcción y logística"
              className="w-full min-h-[48px] px-4 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Currency Preference Selector */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Divisa Predeterminada para Cotizaciones</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDefaultCurrency('MXN')}
              className={`min-h-[48px] px-6 py-3 rounded-2xl border font-bold text-sm flex items-center gap-2 transition-all ${
                defaultCurrency === 'MXN'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              🇲🇽 Peso Mexicano (MXN)
            </button>
            <button
              type="button"
              onClick={() => setDefaultCurrency('USD')}
              className={`min-h-[48px] px-6 py-3 rounded-2xl border font-bold text-sm flex items-center gap-2 transition-all ${
                defaultCurrency === 'USD'
                  ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              🇺🇸 Dólar Americano (USD)
            </button>
          </div>
        </div>

        {/* Live Portal Preview Badge */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {logoUrl ? <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" /> : 'BH'}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Vista Previa de Portal Público</p>
              <p className="text-sm font-extrabold text-slate-900">{settings?.name || 'Mi Empresa'}</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: primaryColor }}>
            {defaultCurrency}
          </span>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {saveSuccess && <span className="text-xs font-bold text-emerald-600">¡Personalización guardada con éxito!</span>}
          <button
            type="submit"
            disabled={saving}
            className="min-h-[48px] px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-sm shadow-sm transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios de Marca'}
          </button>
        </div>
      </form>
    </div>
  );
}
