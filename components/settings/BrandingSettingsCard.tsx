'use client';

import React, { useEffect, useState } from 'react';
import { Palette, Check, Image as ImageIcon } from 'lucide-react';
import { getOrganizationBranding, generateThemeCssVariables } from '@/lib/branding';

interface BrandingSettings {
  primary_color?: string;
  logo_url?: string | null;
  tagline?: string | null;
  name?: string;
  default_currency?: 'MXN' | 'USD' | string;
}

interface BrandingSettingsCardProps {
  settings: BrandingSettings;
  onSave: (updated: { logo_url: string | null }) => Promise<boolean>;
  saving?: boolean;
  /** Only the owner can PATCH the organization; others see the data read-only. */
  canEdit: boolean;
}

const PRESET_COLORS = [
  { name: 'Azul Ejecutivo', hex: '#2563eb' },
  { name: 'Verde Esmeralda', hex: '#059669' },
  { name: 'Púrpura Corporativo', hex: '#7c3aed' },
  { name: 'Naranja Calidez', hex: '#ea580c' },
  { name: 'Negro Elegante', hex: '#0f172a' },
];

export function BrandingSettingsCard({ settings, onSave, saving, canEdit }: BrandingSettingsCardProps) {
  const branding = getOrganizationBranding({
    primaryColor: settings?.primary_color || '#2563eb',
    logoUrl: settings?.logo_url,
    tagline: settings?.tagline,
    companyName: settings?.name,
  });

  const [primaryColor, setPrimaryColor] = useState<string>(branding.primaryColor);
  const [logoUrl, setLogoUrl] = useState<string>(settings?.logo_url || '');
  const [tagline, setTagline] = useState<string>(settings?.tagline || '');
  const [defaultCurrency, setDefaultCurrency] = useState<'MXN' | 'USD'>(settings?.default_currency === 'USD' ? 'USD' : 'MXN');

  // Same reason as OrgProfileCard: the server trims the logo URL and rejects a
  // non-https one, and the hook then applies the row it returned. Without this
  // the field keeps the typed string under "Logotipo guardado con éxito".
  useEffect(() => {
    setLogoUrl(settings?.logo_url || '');
  }, [settings?.logo_url]);

  // Only the logo has a server column today. Color, tagline and currency have
  // nowhere to persist — the old card "saved" them into a request the server
  // ignored and reported success (#95); they are disabled until the feature
  // lands rather than pretending. Tracked in the branding-persistence issue.
  // Reporting moved to the settings page's ActionResultDialog, fired off this
  // save's outcome — the card only submits (#146's confirmation gap).
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ logo_url: logoUrl.trim() || null });
  };

  const cssVars = generateThemeCssVariables({ primaryColor });

  return (
    <div style={cssVars as React.CSSProperties} className="bg-slate-900/90 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 space-y-6 text-white">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-950/80 text-blue-400 border border-blue-500/30 rounded-2xl">
            <Palette className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Marca Blanca y Personalización de Portales</h3>
            <p className="text-xs text-slate-400">Personalice el color principal, logotipo y divisa predeterminada de sus propuestas públicas.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveBranding} className="space-y-6">
        {/* Primary Theme Color Palette — preview only until persistence lands */}
        <div>
          <label className="block text-sm font-bold text-slate-300 mb-2">
            Color Principal de Marca{' '}
            <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Muy pronto
            </span>
          </label>
          <p className="mb-2 text-xs text-slate-500">
            Vista previa disponible; guardar el color, el lema y la divisa estará disponible muy pronto.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.hex}
                type="button"
                onClick={() => setPrimaryColor(color.hex)}
                className={`min-h-[48px] px-4 py-2 rounded-2xl flex items-center gap-2 border text-sm font-semibold transition-all ${
                  primaryColor === color.hex
                    ? 'border-emerald-500 bg-slate-800 text-white shadow-md ring-2 ring-emerald-500/30'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/80 text-slate-300'
                }`}
              >
                <span className="w-5 h-5 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} />
                <span>{color.name}</span>
                {primaryColor === color.hex && <Check className="w-4 h-4 text-emerald-400 ml-1" />}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Logo URL & Tagline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1">URL del Logotipo (PNG/SVG)</label>
            <div className="relative">
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
                disabled={!canEdit}
                className="w-full min-h-[48px] px-4 pl-11 rounded-2xl border border-slate-800 bg-slate-950/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60"
              />
              <ImageIcon className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1">Lema o Eslogan de Empresa</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Muy pronto"
              disabled
              className="w-full min-h-[48px] px-4 rounded-2xl border border-slate-800 bg-slate-950/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-60"
            />
          </div>
        </div>

        {/* Currency Preference Selector */}
        <div>
          <label className="block text-sm font-bold text-slate-300 mb-2">Divisa Predeterminada para Cotizaciones</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setDefaultCurrency('MXN')}
              className={`min-h-[48px] px-6 py-3 rounded-2xl border font-bold text-sm flex items-center gap-2 transition-all ${
                defaultCurrency === 'MXN'
                  ? 'border-emerald-500 bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                  : 'border-slate-800 text-slate-300 bg-slate-950/80 hover:bg-slate-800'
              }`}
            >
              🇲🇽 Peso Mexicano (MXN)
            </button>
            <button
              type="button"
              onClick={() => setDefaultCurrency('USD')}
              className={`min-h-[48px] px-6 py-3 rounded-2xl border font-bold text-sm flex items-center gap-2 transition-all ${
                defaultCurrency === 'USD'
                  ? 'border-emerald-500 bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                  : 'border-slate-800 text-slate-300 bg-slate-950/80 hover:bg-slate-800'
              }`}
            >
              🇺🇸 Dólar Americano (USD)
            </button>
          </div>
        </div>

        {/* Live Portal Preview Badge */}
        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-sm shadow-md"
              style={{ backgroundColor: primaryColor }}
            >
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg" />
              ) : (
                'BH'
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Vista Previa de Portal Público</p>
              <p className="text-sm font-extrabold text-white">{settings?.name || 'Mi Empresa'}</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: primaryColor }}>
            {defaultCurrency}
          </span>
        </div>

        {/* Submit Button — saves the logo, the only branding field with a server home */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {canEdit ? (
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl text-sm shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Logotipo'}
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
}
