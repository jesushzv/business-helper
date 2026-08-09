'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { OtpSignatureModal } from '@/components/quotes/OtpSignatureModal';
import { getOrganizationBranding, generateThemeCssVariables } from '@/lib/branding';
import { ShieldCheck, CheckCircle, Calendar, Building, Sparkles, MessageSquare } from 'lucide-react';
import { generateWhatsAppLink } from '@/lib/whatsappLink';

/**
 * Public quote portal — what the client opens from the WhatsApp link.
 *
 * This page renders exactly what GET /api/quotes/public/[token] returns. The
 * previous version never called that API: it displayed a hardcoded demo quote
 * (title, line items, totals) for ANY token, so a real client reviewing —
 * and signing — "their" quote was shown fabricated figures while the OTP flow
 * signed the real row underneath. The API route already existed and already
 * limits itself to publicly safe columns; the page just has to use it.
 */

interface PublicQuote {
  id: string;
  title: string;
  line_items: Array<{ description: string; quantity: number; unit_price: number }>;
  subtotal_amount: number;
  iva_amount: number;
  retencion_isr_amount: number;
  retencion_iva_amount: number;
  total_amount: number;
  currency: string;
  status: string;
  valid_until: string | null;
  notes: string | null;
  public_token: string;
  contract_hash: string | null;
  accepted_at: string | null;
  clients?: { name: string | null; contact_name: string | null } | null;
  organizations?: { name: string | null; logo_url: string | null; phone?: string | null } | null;
}

export default function PublicQuotePage() {
  const params = useParams();
  const token = params?.token as string;

  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOtpOpen, setIsOtpOpen] = useState<boolean>(false);
  const [signedSeal, setSignedSeal] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/quotes/public/${encodeURIComponent(token)}`);
        if (cancelled) return;

        if (!res.ok) {
          // 404 falls through with quote === null → "no encontrada".
          if (res.status !== 404) {
            setLoadError('No se pudo cargar la cotización. Intente de nuevo más tarde.');
          }
          return;
        }

        const data: PublicQuote = await res.json();
        if (cancelled) return;

        setQuote(data);
        // Already signed: show the seal instead of offering to sign again.
        if (data.contract_hash) {
          setSignedSeal(data.contract_hash);
        }
      } catch {
        if (!cancelled) {
          setLoadError('No se pudo cargar la cotización. Revise su conexión e intente de nuevo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const branding = getOrganizationBranding({
    companyName: quote?.organizations?.name || undefined,
    logoUrl: quote?.organizations?.logo_url || null,
  });
  const cssVars = generateThemeCssVariables(branding);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <p className="text-slate-400 font-medium">Cargando propuesta comercial...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <p className="text-slate-400 font-medium">{loadError}</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <p className="text-slate-400 font-medium">Cotización no encontrada o enlace expirado.</p>
      </div>
    );
  }

  const lineItems = quote.line_items || [];
  const clientDisplayName = quote.clients?.name || 'Cliente';
  const signerName = quote.clients?.contact_name || quote.clients?.name || 'Cliente';

  return (
    <div style={cssVars as React.CSSProperties} className="min-h-screen bg-slate-950 py-6 px-4 sm:px-6 text-white">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl text-white flex items-center justify-center font-black text-xl shadow-md overflow-hidden"
              style={{ backgroundColor: branding.primaryColor }}
            >
              {branding.hasCustomLogo && branding.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={branding.logoUrl} alt={branding.companyName} className="w-full h-full object-contain" />
              ) : (
                'BH'
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Propuesta Comercial</p>
              <h2 className="text-base font-extrabold text-white">{branding.companyName}</h2>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-3 py-1.5 rounded-full border border-emerald-500/30">
            Vista Segura
          </span>
        </div>

        {/* Quote Main Card */}
        <div className="bg-slate-900/90 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 space-y-6">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Cotización #{quote.id.substring(0, 8)}
            </span>
            <h1 className="text-2xl font-black text-white mt-1 leading-snug">{quote.title}</h1>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-400 mt-3 pt-3 border-t border-slate-800">
              <span className="flex items-center gap-1 text-slate-300">
                <Building className="w-4 h-4 text-slate-400" /> {clientDisplayName}
              </span>
              {quote.valid_until && (
                <span className="flex items-center gap-1 text-slate-300">
                  <Calendar className="w-4 h-4 text-slate-400" /> Válida hasta: {quote.valid_until}
                </span>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conceptos Cotizados</h3>
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/80">
              {lineItems.map((item, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white">{item.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      {item.quantity} x ${item.unit_price.toLocaleString('es-MX')}
                    </p>
                  </div>
                  <span className="text-sm font-extrabold font-mono text-white">
                    ${(item.quantity * item.unit_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="bg-slate-950/90 text-white rounded-2xl p-5 border border-slate-800 space-y-3">
            <div className="flex justify-between text-xs text-slate-400 font-mono">
              <span>Subtotal</span>
              <span>${quote.subtotal_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
            {quote.iva_amount > 0 && (
              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>IVA (16%)</span>
                <span>+${quote.iva_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {quote.retencion_isr_amount > 0 && (
              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>Retención ISR</span>
                <span>-${quote.retencion_isr_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {quote.retencion_iva_amount > 0 && (
              <div className="flex justify-between text-xs text-slate-400 font-mono">
                <span>Retención IVA</span>
                <span>-${quote.retencion_iva_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-3 border-t border-slate-800">
              <span className="text-sm font-bold text-white">Total Final</span>
              <span className="text-3xl font-black font-mono text-emerald-400">
                ${quote.total_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {quote.currency}
              </span>
            </div>
          </div>

          {/* Terms & Notes */}
          {quote.notes && (
            <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-xs text-slate-300 space-y-1">
              <p className="font-bold text-white">Condiciones y Notas:</p>
              <p>{quote.notes}</p>
            </div>
          )}

          {/* Signature State or Action Buttons */}
          {signedSeal ? (
            <div className="bg-emerald-950/80 border border-emerald-500/30 rounded-2xl p-5 text-center space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="text-base font-extrabold text-white">Propuesta Aceptada y Firmada</h4>
              <p className="text-xs text-emerald-300">Sello Digital de Confirmación SHA-256 generado exitosamente.</p>
              <p className="text-[10px] font-mono text-emerald-400 break-all bg-slate-950/80 p-2 rounded-xl border border-emerald-500/30">
                {signedSeal}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {/* Primary 1-Tap Accept & Sign Button (>= 48px touch target) */}
              <button
                onClick={() => setIsOtpOpen(true)}
                className="w-full min-h-[52px] px-6 py-4 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-extrabold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md text-base"
              >
                <ShieldCheck className="w-6 h-6" />
                <span>Aceptar y Firmar Cotización</span>
              </button>
              {/* Change requests go to the vendor's own WhatsApp — the button
                  that used to live here pointed every tenant's clients at one
                  hardcoded number (#44). No org phone on record → no button:
                  absent is absent. */}
              {quote.organizations?.phone && (
                <a
                  href={generateWhatsAppLink(
                    quote.organizations.phone,
                    `Hola, quisiera solicitar un cambio en la cotización "${quote.title}".`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-6 py-3.5 border border-slate-700 bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold rounded-2xl flex items-center justify-center gap-2 transition-all text-sm"
                >
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                  <span>Solicitar Cambios por WhatsApp</span>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 space-y-1">
          <p className="flex items-center justify-center gap-1 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Protegido por Business Helper & Criptosello SHA-256
          </p>
        </div>
      </div>

      {/* OTP Signature Modal */}
      <OtpSignatureModal
        isOpen={isOtpOpen}
        onClose={() => setIsOtpOpen(false)}
        publicToken={quote.public_token}
        clientName={signerName}
        onSuccess={(seal) => {
          setSignedSeal(seal);
        }}
      />
    </div>
  );
}
