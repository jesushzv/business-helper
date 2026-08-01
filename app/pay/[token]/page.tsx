'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { validateTrackingReference, validateReceiptFile } from '@/lib/speiValidator';
import { getOrganizationBranding, generateThemeCssVariables } from '@/lib/branding';
import { Building2, Upload, CheckCircle2, ShieldCheck, Copy, Check, FileText } from 'lucide-react';

interface PublicMilestone {
  id: string;
  label: string;
  amount: number;
  due_date: string;
  status: string;
  contract_title?: string;
  client_name?: string;
  org_name?: string;
  bank_name?: string;
  clabe?: string;
  beneficiary?: string;
  tracking_reference?: string;
  receipt_url?: string;
}

export default function PublicPayPortalPage() {
  const params = useParams();
  const token = (params?.token as string) || '';

  const [milestone, setMilestone] = useState<PublicMilestone | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedClabe, setCopiedClabe] = useState(false);

  // Form states
  const [trackingRef, setTrackingRef] = useState('');
  const [transferredAmount, setTransferredAmount] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function fetchPublicMilestone() {
      setLoading(true);
      try {
        const res = await fetch(`/api/receivables/public/${token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.milestone) {
            setMilestone(data.milestone);
            setTransferredAmount(data.milestone.amount.toString());
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fallback for demo mode
      }

      // Demo fallback data
      const demoData: PublicMilestone = {
        id: 'milestone-demo-1',
        label: 'Anticipo 50% — Suministro Cemento',
        amount: 48720,
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
        contract_title: 'Suministro de Cemento y Varilla',
        client_name: 'Distribuidora del Norte S.A. de C.V.',
        org_name: 'Business Helper Demo',
        bank_name: 'BBVA México',
        clabe: '012180001234567890',
        beneficiary: 'Distribuidora del Norte S.A. de C.V.',
      };
      setMilestone(demoData);
      setTransferredAmount(demoData.amount.toString());
      setLoading(false);
    }

    if (token) {
      fetchPublicMilestone();
    } else {
      setLoading(false);
    }
  }, [token]);

  const branding = getOrganizationBranding({ companyName: milestone?.org_name || 'Business Helper Demo' });
  const cssVars = generateThemeCssVariables(branding);

  const handleCopyClabe = () => {
    if (milestone?.clabe) {
      navigator.clipboard.writeText(milestone.clabe);
      setCopiedClabe(true);
      setTimeout(() => setCopiedClabe(false), 2500);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validation = validateReceiptFile({
        name: file.name,
        size: file.size,
        type: file.type,
      });

      if (!validation.isValid) {
        setFormError(validation.error || 'Archivo no válido');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trackingVal = validateTrackingReference(trackingRef);
    if (!trackingVal.isValid) {
      setFormError(trackingVal.error || 'Clave de Rastreo inválida');
      return;
    }

    if (!selectedFile) {
      setFormError('Por favor selecciona o adjunta tu comprobante de pago (imagen o PDF < 5MB).');
      return;
    }

    setSubmitting(true);

    try {
      // Simulate file upload or submit to public API
      const fakeFileUrl = URL.createObjectURL(selectedFile);

      await fetch(`/api/receivables/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_reference: trackingRef.trim(),
          transferred_amount: parseFloat(transferredAmount) || milestone?.amount,
          receipt_url: fakeFileUrl,
        }),
      });

      setSubmitted(true);
    } catch {
      // Demo fallback success
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-slate-400 font-medium">Cargando portal de pago...</div>
      </div>
    );
  }

  if (!milestone) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-md">
          <h2 className="text-xl font-bold text-slate-800">Enlace de Pago No Encontrado</h2>
          <p className="text-sm text-slate-500 mt-2">
            La clave o ficha de cobro no existe o ha expirado.
          </p>
        </div>
      </div>
    );
  }

  const formattedAmount = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(milestone.amount);

  return (
    <div style={cssVars as React.CSSProperties} className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header Branding */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center space-y-3">
          <div
            className="w-12 h-12 rounded-2xl text-white flex items-center justify-center mx-auto shadow-md overflow-hidden"
            style={{ backgroundColor: branding.primaryColor }}
          >
            {branding.hasCustomLogo && branding.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={branding.logoUrl} alt={branding.companyName} className="w-full h-full object-contain" />
            ) : (
              <Building2 className="w-6 h-6" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{milestone.org_name || branding.companyName}</h1>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
              Portal de Pago y Registro SPEI
            </p>
          </div>
        </div>

        {/* Milestone Payment Summary Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Concepto de Cobro</span>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{milestone.label}</h2>
            <p className="text-sm text-slate-600 mt-0.5">{milestone.contract_title}</p>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500">Monto a Transferir</span>
              <p className="text-xs text-slate-400">Vence: {milestone.due_date}</p>
            </div>
            <span className="text-2xl font-black text-slate-900">{formattedAmount}</span>
          </div>
        </div>

        {/* SPEI Bank Transfer Details Card */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-6 shadow-xl text-white space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">Datos para Transferencia SPEI</span>
            </div>
            <span className="text-xs font-bold bg-indigo-800/80 px-2.5 py-1 rounded-full text-indigo-200">
              {milestone.bank_name || 'BBVA México'}
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <span className="text-xs text-slate-400 block font-medium">CLABE Interbancaria (18 dígitos)</span>
              <div className="flex items-center justify-between mt-1 bg-white/10 p-3 rounded-2xl border border-white/10">
                <span className="font-mono text-lg font-bold tracking-wider">{milestone.clabe || '012180001234567890'}</span>
                <button
                  type="button"
                  onClick={handleCopyClabe}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                >
                  {copiedClabe ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 block font-medium">Beneficiario</span>
              <p className="font-semibold text-sm text-slate-100">{milestone.beneficiary || milestone.org_name}</p>
            </div>
          </div>
        </div>

        {/* Upload Proof Form */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          {submitted ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">¡Comprobante Enviado Exitosamente!</h3>
              <p className="text-sm text-slate-600 max-w-xs mx-auto">
                El proveedor revisará la Clave de Rastreo en Banxico y confirmará tu pago. ¡Gracias!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitProof} className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Subir Comprobante de Pago</h3>
                <p className="text-xs text-slate-500">
                  Registra tu transferencia SPEI para validar y liberar tu factura.
                </p>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-100">
                  {formError}
                </div>
              )}

              {/* Clave de Rastreo */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Clave de Rastreo Banxico *
                </label>
                <input
                  type="text"
                  value={trackingRef}
                  onChange={(e) => setTrackingRef(e.target.value)}
                  placeholder="Ej. SPEI20260830123456"
                  required
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-600 outline-none uppercase font-mono"
                />
              </div>

              {/* Amount Transfered */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Monto Transferido (MXN) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={transferredAmount}
                  onChange={(e) => setTransferredAmount(e.target.value)}
                  required
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-600 outline-none"
                />
              </div>

              {/* File Attachment Dropzone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Comprobante (PNG, JPG o PDF &lt; 5MB) *
                </label>
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-indigo-500 bg-slate-50/50 transition-colors min-h-[100px]">
                  <Upload className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-700">
                    {selectedFile ? selectedFile.name : 'Haz clic para seleccionar comprobante'}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">Máximo 5MB (PNG/JPG/PDF)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Submit Button (>= 48px touch target) */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] px-5 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-2xl text-sm transition-colors shadow-md flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <span>Enviando comprobante...</span>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    <span>Enviar Comprobante SPEI</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
