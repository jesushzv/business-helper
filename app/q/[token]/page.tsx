'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Quote } from '@/types';
import { OtpSignatureModal } from '@/components/quotes/OtpSignatureModal';
import { ShieldCheck, MessageSquare, CheckCircle, FileText, Calendar, Building, Sparkles } from 'lucide-react';

export default function PublicQuotePage() {
  const params = useParams();
  const token = params?.token as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isOtpOpen, setIsOtpOpen] = useState<boolean>(false);
  const [signedSeal, setSignedSeal] = useState<string | null>(null);

  useEffect(() => {
    // Demo quote fallback by token
    const demoQuote: Quote = {
      id: 'quote-public-1',
      organization_id: 'org-demo-1',
      client_id: 'client-demo-1',
      created_by: 'user-demo-1',
      title: 'Propuesta Comercial — Suministro de Materiales de Obra',
      line_items: [
        { description: 'Tonelada Cemento CPO 40', quantity: 5, unit_price: 3600, sat_code: '30111500', unit: 'TON' },
        { description: 'Tonelada Varilla 3/8"', quantity: 3, unit_price: 22000, sat_code: '30101800', unit: 'TON' },
      ],
      subtotal_amount: 84000,
      iva_amount: 13440,
      retencion_isr_amount: 0,
      retencion_iva_amount: 0,
      total_amount: 97440,
      currency: 'MXN',
      status: 'sent',
      valid_until: '2026-08-30',
      notes: 'Entrega directa en obra en 48 horas hábiles tras recibir anticipo del 50%.',
      public_token: token || 'demo-token',
      converted_contract_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setQuote(demoQuote);
    setLoading(false);
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-500 font-medium">Cargando propuesta comercial...</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-500 font-medium">Cotización no encontrada o enlace expirado.</p>
      </div>
    );
  }

  const lineItems = (quote.line_items as unknown as Array<{ description: string; quantity: number; unit_price: number }>) || [];

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl">
              BH
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Propuesta Comercial</p>
              <h2 className="text-base font-extrabold text-slate-900">Distribuidora del Norte</h2>
            </div>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
            Vista Segura
          </span>
        </div>

        {/* Quote Main Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Cotización #{quote.id.substring(0, 8)}
            </span>
            <h1 className="text-2xl font-black text-slate-900 mt-1 leading-snug">{quote.title}</h1>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500 mt-3 pt-3 border-t border-slate-100">
              <span className="flex items-center gap-1">
                <Building className="w-4 h-4 text-slate-400" /> Construcciones Maya
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-slate-400" /> Válida hasta: {quote.valid_until}
              </span>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conceptos Cotizados</h3>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
              {lineItems.map((item, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{item.description}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.quantity} x ${item.unit_price.toLocaleString('es-MX')}
                    </p>
                  </div>
                  <span className="text-sm font-extrabold text-slate-900">
                    ${(item.quantity * item.unit_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
            <div className="flex justify-between text-xs text-slate-300">
              <span>Subtotal</span>
              <span>${quote.subtotal_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
            {quote.iva_amount > 0 && (
              <div className="flex justify-between text-xs text-slate-300">
                <span>IVA (16%)</span>
                <span>+${quote.iva_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-3 border-t border-slate-800">
              <span className="text-sm font-bold">Total Final</span>
              <span className="text-3xl font-black text-emerald-400">
                ${quote.total_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {quote.currency}
              </span>
            </div>
          </div>

          {/* Terms & Notes */}
          {quote.notes && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-800">Condiciones y Notas:</p>
              <p>{quote.notes}</p>
            </div>
          )}

          {/* Signature State or Action Buttons */}
          {signedSeal ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-2">
              <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
              <h4 className="text-base font-extrabold text-emerald-950">Propuesta Aceptada y Firmada</h4>
              <p className="text-xs text-emerald-800">Sello Digital de Confirmación SHA-256 generado exitosamente.</p>
              <p className="text-[10px] font-mono text-emerald-700 break-all bg-emerald-100/50 p-2 rounded-xl">
                {signedSeal}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {/* Primary 1-Tap Accept & Sign Button (>= 48px touch target) */}
              <button
                onClick={() => setIsOtpOpen(true)}
                className="w-full min-h-[52px] px-6 py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg text-base"
              >
                <ShieldCheck className="w-6 h-6" />
                <span>Aceptar y Firmar Cotización</span>
              </button>

              {/* Secondary WhatsApp Request Revisions Button */}
              <a
                href={`https://wa.me/528115551234?text=Hola,%20quisiera%20solicitar%20un%20cambio%20en%20la%20cotización%20"${encodeURIComponent(
                  quote.title
                )}"`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[48px] px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <MessageSquare className="w-5 h-5 text-emerald-600" />
                <span>Solicitar Cambios por WhatsApp</span>
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 space-y-1">
          <p className="flex items-center justify-center gap-1 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Protegido por Business Helper & Criptosello SHA-256
          </p>
        </div>
      </div>

      {/* OTP Signature Modal */}
      <OtpSignatureModal
        isOpen={isOtpOpen}
        onClose={() => setIsOtpOpen(false)}
        contractId={quote.id}
        clientName="Construcciones Maya"
        totalAmount={quote.total_amount}
        onSuccess={(seal) => {
          setSignedSeal(seal);
        }}
      />
    </div>
  );
}
