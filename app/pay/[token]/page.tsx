'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { validateTrackingReference, validateReceiptFile } from '@/lib/speiValidator';
import { isClientDemoMode } from '@/lib/clientDemoMode';
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
  /** Always present when the API returns a milestone; it 409s when the org has no account. */
  clabe: string;
  beneficiary?: string;
  tracking_reference?: string;
  receipt_url?: string;
}

export default function PublicPayPortalPage() {
  const params = useParams();
  const token = (params?.token as string) || '';

  const [milestone, setMilestone] = useState<PublicMilestone | null>(null);
  const [loading, setLoading] = useState(true);
  // Machine-readable error code from the public API envelope (#65). The one
  // the page branches on is ORG_BANK_DETAILS_MISSING: the link is valid, the
  // business just has no CLABE yet — telling the payer "el enlace no existe"
  // would send them to re-ask the vendor for a link that works fine.
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [copiedClabe, setCopiedClabe] = useState(false);

  // Form states
  const [trackingRef, setTrackingRef] = useState('');
  const [transferredAmount, setTransferredAmount] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Set when the declaration was recorded but the receipt file itself could
  // not be stored (#85): the payer must not walk away believing the vendor
  // holds a comprobante that never left this machine.
  const [receiptNotice, setReceiptNotice] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPublicMilestone() {
      setLoading(true);
      try {
        const res = await fetch(`/api/receivables/public/${token}`);
        const data = await res.json().catch(() => null);
        if (res.ok && data?.milestone) {
          setMilestone(data.milestone);
          setTransferredAmount(data.milestone.amount.toString());
          setLoading(false);
          return;
        }
        if (data?.error?.code) {
          setLoadErrorCode(data.error.code);
          // Every message in this envelope is Spanish and safe to render to the
          // payer verbatim — that is what `publicApiError()` guarantees (#65).
          // Keeping it means a refusal this page has no specific styling for is
          // still said in the words the route chose, instead of being flattened
          // into "no existe".
          if (typeof data.error.message === 'string') setLoadErrorMessage(data.error.message);
        }
      } catch {
        // Network failure falls through to the not-found rendering below.
      }

      // The API is the only source of bank details. A client-side fallback
      // would put a CLABE on screen that no organization actually owns, so
      // failure surfaces as an error instead of as payment instructions.
      setMilestone(null);
      setLoading(false);
    }

    if (token) {
      fetchPublicMilestone();
    } else {
      setLoading(false);
    }
  }, [token]);

  // No org name → the neutral platform default, never an invented "Demo"
  // company on the screen where a client is about to transfer money (#93).
  const branding = getOrganizationBranding({ companyName: milestone?.org_name || undefined });
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
    setReceiptNotice(null);

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

    // Static marketing demo: there is no backend to record anything and the
    // visitor is exploring, not paying — the POST route answers 503 by
    // design. Only behind this build-time signal may the flow simulate
    // success; a real tenant's payer always sees the API's actual outcome.
    if (isClientDemoMode()) {
      setSubmitted(true);
      setSubmitting(false);
      return;
    }

    try {
      // The receipt goes to storage first (#85 — before this, the page sent
      // `URL.createObjectURL(file)`, a blob: URL valid only inside this tab,
      // and the vendor's Cobranza held a dead link for every payment declared
      // here). The declaration then references the path the server issued.
      //
      // Decided on #85: an upload failure does not block the declaration. The
      // clave de rastreo is the load-bearing evidence — Banxico resolves it —
      // and a storage outage must not stop a payer from registering a
      // transfer already made. The declaration proceeds receipt-less and the
      // confirmation says so.
      let receiptPath: string | null = null;
      try {
        const uploadData = new FormData();
        uploadData.append('file', selectedFile);
        const uploadRes = await fetch(`/api/receivables/public/${token}/upload`, {
          method: 'POST',
          body: uploadData,
        });
        const uploaded = await uploadRes.json().catch(() => null);
        if (uploadRes.ok && typeof uploaded?.receipt_path === 'string') {
          receiptPath = uploaded.receipt_path;
        }
      } catch {
        // Network failure on the upload alone — fall through to declare.
      }

      if (!receiptPath) {
        setReceiptNotice(
          'Tu comprobante no se pudo adjuntar. Tu pago quedó registrado con la Clave de Rastreo; ' +
            'si el negocio necesita el comprobante, envíaselo directamente.'
        );
      }

      const res = await fetch(`/api/receivables/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_reference: trackingRef.trim(),
          transferred_amount: parseFloat(transferredAmount) || milestone?.amount,
          ...(receiptPath ? { receipt_path: receiptPath } : {}),
        }),
      });

      // The write is the record. Confirming a declaration the API rejected —
      // as the previous version did by ignoring the response, and even
      // reporting success from the catch block — shows the payer a
      // confirmation for a payment the system never stored (#33's shape).
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setFormError(
          data?.error?.message || 'No se pudo registrar el comprobante. Intenta de nuevo.'
        );
        return;
      }

      setSubmitted(true);
    } catch {
      setFormError('No se pudo contactar al servidor. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-slate-400 font-medium">Cargando portal de pago...</div>
      </div>
    );
  }

  if (!milestone) {
    const bankDetailsMissing = loadErrorCode === 'ORG_BANK_DETAILS_MISSING';
    // Every payable milestone is already declared or confirmed — a valid link,
    // not a broken one. Saying "no existe" here would tell a payer who already
    // transferred that their cobro vanished.
    const alreadyRecorded = loadErrorCode === 'PAYMENT_ALREADY_RECORDED';
    /**
     * The account this quote named has been archived (#164).
     *
     * A real link, a real cobro, and a payer who must **not** transfer yet.
     * Before this branch existed the page fell through to "Enlace de Pago No
     * Encontrado", so a client holding a perfectly valid quote was told their
     * cobro did not exist — they conclude the link is dead or the vendor is
     * not real, and nobody contacts anybody.
     */
    const accountUnavailable = loadErrorCode === 'SETTLEMENT_ACCOUNT_UNAVAILABLE';
    /**
     * Anything else the route refuses with. `publicApiError()` guarantees a
     * Spanish message safe to show the payer, so an unrecognised code says what
     * the route said rather than being flattened into "no existe" — a claim
     * this page cannot actually support for a code it does not know.
     */
    const unknownRefusal = Boolean(loadErrorCode) && !bankDetailsMissing && !alreadyRecorded && !accountUnavailable;

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 text-center max-w-md text-white">
          <h2 className="text-xl font-bold text-white">
            {bankDetailsMissing
              ? 'Pago No Disponible Por El Momento'
              : alreadyRecorded
              ? 'Este Cobro Ya Fue Registrado'
              : accountUnavailable
              ? 'Pago No Disponible Por El Momento'
              : unknownRefusal
              ? 'No Se Puede Completar El Pago'
              : 'Enlace de Pago No Encontrado'}
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            {bankDetailsMissing
              ? 'El negocio aún no ha configurado su cuenta bancaria para recibir pagos SPEI. Contacte a su proveedor para completar el pago.'
              : alreadyRecorded
              ? 'El comprobante de este cobro ya fue enviado o el pago ya fue confirmado. Si tienes dudas, contacta directamente al negocio.'
              : accountUnavailable || unknownRefusal
              ? loadErrorMessage ||
                'No se puede completar este pago por el momento. Contacta al negocio antes de transferir.'
              : 'La clave o ficha de cobro no existe o ha expirado.'}
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
    <div style={cssVars as React.CSSProperties} className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 text-white">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header Branding */}
        <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-slate-800 text-center space-y-3">
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
            <h1 className="text-xl font-extrabold text-white">{milestone.org_name || branding.companyName}</h1>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
              Portal de Pago y Registro SPEI
            </p>
          </div>
        </div>

        {/* Milestone Payment Summary Card */}
        <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-slate-800 space-y-4">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Concepto de Cobro</span>
            <h2 className="text-lg font-bold text-white leading-snug">{milestone.label}</h2>
            <p className="text-sm text-slate-300 mt-0.5">{milestone.contract_title}</p>
          </div>

          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400">Monto a Transferir</span>
              <p className="text-xs text-slate-400">Vence: {milestone.due_date}</p>
            </div>
            <span className="text-2xl font-black font-mono text-emerald-400">{formattedAmount}</span>
          </div>
        </div>

        {/* SPEI Bank Transfer Details Card */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 rounded-3xl p-6 shadow-2xl border border-indigo-500/30 text-white space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">Datos para Transferencia SPEI</span>
            </div>
            {/* No bank on file → no badge. The fallback here used to invent
                "BBVA México" for whatever account the CLABE actually belongs to. */}
            {milestone.bank_name && (
              <span className="text-xs font-bold bg-indigo-900/80 border border-indigo-500/30 px-2.5 py-1 rounded-full text-indigo-200">
                {milestone.bank_name}
              </span>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <span className="text-xs text-slate-400 block font-medium">CLABE Interbancaria (18 dígitos)</span>
              <div className="flex items-center justify-between mt-1 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                <span className="min-w-0 break-all font-mono text-lg font-bold tracking-wider text-white">{milestone.clabe}</span>
                <button
                  type="button"
                  onClick={handleCopyClabe}
                  aria-label={copiedClabe ? 'CLABE copiada' : 'Copiar CLABE'}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center shadow-md"
                >
                  {copiedClabe ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-xs text-slate-400 block font-medium">Beneficiario</span>
              <p className="font-semibold text-sm text-slate-200">{milestone.beneficiary || milestone.org_name}</p>
            </div>
          </div>
        </div>

        {/* Upload Proof Form */}
        <div className="bg-slate-900/90 rounded-3xl p-6 shadow-xl border border-slate-800">
          {submitted ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white">¡Comprobante Enviado Exitosamente!</h3>
              <p className="text-sm text-slate-300 max-w-xs mx-auto">
                El proveedor revisará la Clave de Rastreo en Banxico y confirmará tu pago. ¡Gracias!
              </p>
              {receiptNotice && (
                <div
                  role="alert"
                  className="mx-auto max-w-xs p-3 bg-amber-950/60 border border-amber-500/30 text-amber-200 text-xs font-semibold rounded-xl text-left"
                >
                  {receiptNotice}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmitProof} className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Subir Comprobante de Pago</h3>
                <p className="text-xs text-slate-400">
                  Registra tu transferencia SPEI para validar y liberar tu factura.
                </p>
              </div>

              {formError && (
                <div role="alert" className="p-3 bg-rose-950/80 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30">
                  {formError}
                </div>
              )}

              {/* Clave de Rastreo */}
              <div>
                <label htmlFor="page-clave-de-rastreo-banxico" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Clave de Rastreo Banxico *
                </label>
                <input
                  id="page-clave-de-rastreo-banxico"
                  type="text"
                  value={trackingRef}
                  onChange={(e) => setTrackingRef(e.target.value)}
                  placeholder="Ej. SPEI20260830123456"
                  required
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm font-bold text-white focus:border-emerald-500 outline-none uppercase font-mono"
                />
              </div>

              {/* Amount Transfered */}
              <div>
                <label htmlFor="page-monto-transferido-mxn" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Monto Transferido (MXN) *
                </label>
                <input
                  id="page-monto-transferido-mxn"
                  type="number"
                  step="0.01"
                  value={transferredAmount}
                  onChange={(e) => setTransferredAmount(e.target.value)}
                  required
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm font-bold font-mono text-white focus:border-emerald-500 outline-none"
                />
              </div>

              {/* File Attachment Dropzone */}
              <div>
                <label htmlFor="page-comprobante-png-jpg-o" className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                  Comprobante (PNG, JPG o PDF &lt; 5MB) *
                </label>
                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-800 rounded-2xl cursor-pointer hover:border-emerald-500 bg-slate-950/50 transition-colors min-h-[100px]">
                  <Upload className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-bold text-slate-300">
                    {selectedFile ? selectedFile.name : 'Haz clic para seleccionar comprobante'}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">Máximo 5MB (PNG/JPG/PDF)</span>
                  <input
                    id="page-comprobante-png-jpg-o"
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
                className="w-full min-h-[48px] px-5 py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-2xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
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
