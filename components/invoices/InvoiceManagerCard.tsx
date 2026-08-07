'use client';

import React, { useState } from 'react';
import { useInvoices, type InvoiceItem } from '@/lib/hooks/useInvoices';
import { generateReminderBroadcastPayload } from '@/lib/whatsappBroadcast';
import { generateNotaDeVentaPayload, generateReceiptWhatsAppLink } from '@/lib/receiptGenerator';
import { FileText, Download, Send, CheckCircle, Clock, FileCode, AlertCircle, MessageSquare, Ban } from 'lucide-react';

/**
 * Facturación screen.
 *
 * The copy here promised more than the product did: "Timbrar SAT (Pro)" ran a
 * browser-side simulation, and the confirmation read "Factura timbrada
 * exitosamente con Facturapi PAC (CFDI 4.0)" when no PAC had been contacted.
 * Every claim on this screen is now tied to something the API returned — the
 * folio fiscal for a stamped document, the PAC's own message for a failure, and
 * an explicit "sin validez fiscal" for anything stamped against a test account.
 */

function StatusBadge({ invoice }: { invoice: InvoiceItem }) {
  if (invoice.cfdiStatus === 'issued') {
    const isSandbox = invoice.cfdiEnvironment === 'sandbox';
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
          isSandbox
            ? 'bg-amber-950/80 text-amber-300 border-amber-500/30'
            : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
        }`}
      >
        <CheckCircle className="w-3.5 h-3.5" />
        {isSandbox ? 'CFDI de prueba (sin validez fiscal)' : 'CFDI Emitido'}
      </span>
    );
  }

  if (invoice.cfdiStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-sky-950/80 text-sky-300 px-2.5 py-1 rounded-full border border-sky-500/30">
        <Clock className="w-3.5 h-3.5" />
        Timbrado en proceso
      </span>
    );
  }

  if (invoice.cfdiStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-rose-950/80 text-rose-300 px-2.5 py-1 rounded-full border border-rose-500/30">
        <AlertCircle className="w-3.5 h-3.5" />
        Timbrado fallido
      </span>
    );
  }

  if (invoice.cfdiStatus === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-600">
        <Ban className="w-3.5 h-3.5" />
        CFDI cancelado
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
      <FileText className="w-3.5 h-3.5" />
      Sin factura CFDI
    </span>
  );
}

export function InvoiceManagerCard() {
  const {
    invoices,
    loading,
    loadError,
    stampingId,
    exporting,
    stampCFDI,
    downloadAccountantPackage,
  } = useInvoices();
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [stampedMessage, setStampedMessage] = useState<string | null>(null);
  const [stampError, setStampError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleStamp = async (milestoneId: string) => {
    setStampedMessage(null);
    setStampError(null);

    const res = await stampCFDI(milestoneId);

    if (!res.success) {
      // The PAC's rejection is the actionable part — a missing RFC, an
      // exhausted folio allowance, a key that is not connected.
      setStampError(res.error || 'No se pudo timbrar la factura');
      return;
    }

    const validity =
      res.environment === 'sandbox'
        ? ' Se emitió contra el entorno de pruebas de tu PAC: no tiene validez fiscal.'
        : '';

    setStampedMessage(
      `Factura timbrada. Folio fiscal ${res.uuid}.${validity}${res.warning ? ` ${res.warning}` : ''}`
    );
  };

  const handleExport = async () => {
    setExportError(null);
    const res = await downloadAccountantPackage(selectedMonth);
    if (!res.success) {
      // The package is built from the tenant's real milestones now, so a
      // failure has to be shown rather than resolved into an empty file.
      setExportError(res.error || 'No se pudo generar el paquete para tu contador');
    }
  };

  const handleWhatsAppBroadcast = (inv: InvoiceItem) => {
    if (!inv.clientPhone) return;

    const payload = generateReminderBroadcastPayload(
      {
        id: inv.milestoneId,
        label: inv.concept,
        amount: inv.amount,
        due_date: inv.dueDate,
        status: 'pending'
      },
      {
        name: inv.clientName,
        phone: inv.clientPhone
      },
      'overdue'
    );

    window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNotaDeVenta = (inv: InvoiceItem) => {
    if (!inv.clientPhone) return;

    const payload = generateNotaDeVentaPayload({
      title: inv.concept,
      clientName: inv.clientName,
      clientRfc: inv.clientRfc || '',
      amount: inv.amount,
      // Only a document stamped against a live PAC account is a filed invoice.
      status:
        inv.cfdiStatus === 'issued' && inv.cfdiEnvironment === 'live' ? 'FACTURADO SAT' : 'PAGADO',
    });

    const waUrl = generateReceiptWhatsAppLink(payload, inv.clientPhone);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* Accountant Export Header Card */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-lg border border-indigo-700/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 px-3 py-1 rounded-full border border-indigo-400/30">
              <FileCode className="w-3.5 h-3.5" />
              1-Click Zero-SAT Comprobantes
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Notas de Venta & Paquete para Contador (ZIP/CSV)
            </h2>
            <p className="text-indigo-200 text-sm sm:text-base max-w-xl">
              Genera Notas de Venta inmediatas para tus clientes o exporta el paquete mensual directo para tu contador sin necesidad de certificados SAT CSD.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="min-h-[48px] px-4 bg-indigo-950/80 border border-indigo-700 rounded-xl text-white font-medium text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="min-h-[48px] px-6 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-base shadow-md disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              {exporting ? 'Generando...' : 'Descargar ZIP/CSV'}
            </button>
          </div>
        </div>
      </div>

      {stampedMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-sm font-semibold shadow-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          {stampedMessage}
        </div>
      )}

      {(stampError || exportError || loadError) && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3 text-sm font-semibold shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          {stampError || exportError || loadError}
        </div>
      )}

      {/* Invoice List / Stamping Center */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden text-white">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-400" />
              Comprobantes Comerciales & Facturación SAT CFDI 4.0
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Envía Notas de Venta inmediatas por WhatsApp, o timbra el CFDI con el PAC que conectaste en Ajustes.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            SAT CFDI: requiere PAC conectado
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-20 w-full animate-pulse rounded-xl bg-slate-800/70" />
            <div className="h-20 w-full animate-pulse rounded-xl bg-slate-800/70" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-slate-300 font-semibold">Aún no tienes cobros registrados.</p>
            <p className="text-sm text-slate-400">
              Convierte una cotización aceptada en contrato y sus cobros aparecerán aquí para facturar.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="p-5 hover:bg-slate-800/50 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h4 className="font-bold text-white text-base">{inv.concept}</h4>
                    <StatusBadge invoice={inv} />
                  </div>

                  <div className="flex items-center gap-4 text-xs sm:text-sm text-slate-400 flex-wrap pt-1">
                    <span>Cliente: <strong className="text-slate-200">{inv.clientName}</strong></span>
                    <span>
                      RFC:{' '}
                      <code className="bg-slate-950 px-1.5 py-0.5 rounded text-slate-300 border border-slate-800 font-mono">
                        {inv.clientRfc || 'Sin RFC'}
                      </code>
                    </span>
                    <span>Vence: {inv.dueDate}</span>
                  </div>

                  {inv.cfdiUuid && (
                    <p className="text-xs text-slate-400 pt-1">
                      Folio fiscal:{' '}
                      <code className="bg-slate-950 px-1.5 py-0.5 rounded text-slate-300 border border-slate-800 font-mono">
                        {inv.cfdiUuid}
                      </code>
                    </p>
                  )}

                  {inv.cfdiError && (
                    <p className="text-xs text-rose-300 pt-1 max-w-xl">{inv.cfdiError}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 justify-between lg:justify-end shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800 flex-wrap">
                  <span className="font-mono font-extrabold text-white text-lg">
                    ${inv.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleNotaDeVenta(inv)}
                      disabled={!inv.clientPhone}
                      className="min-h-[44px] px-3.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                      title={
                        inv.clientPhone
                          ? 'Generar Nota de Venta'
                          : 'El cliente no tiene WhatsApp registrado'
                      }
                    >
                      <FileText className="w-4 h-4 text-indigo-400" />
                      Nota de Venta PDF
                    </button>

                    <button
                      onClick={() => handleWhatsAppBroadcast(inv)}
                      disabled={!inv.clientPhone}
                      className="min-h-[44px] px-3 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                      title={
                        inv.clientPhone
                          ? 'Enviar aviso WhatsApp'
                          : 'El cliente no tiene WhatsApp registrado'
                      }
                    >
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      Aviso WhatsApp
                    </button>

                    {inv.cfdiStatus === 'issued' ? (
                      <div className="flex items-center gap-2">
                        {/* Only offered when a document was actually stored. */}
                        {inv.xmlUrl && (
                          <a
                            href={inv.xmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5 border border-slate-700"
                          >
                            <Download className="w-4 h-4 text-slate-400" />
                            CFDI XML
                          </a>
                        )}
                        {inv.pdfUrl && (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5 border border-slate-700"
                          >
                            <Download className="w-4 h-4 text-slate-400" />
                            CFDI PDF
                          </a>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStamp(inv.milestoneId)}
                        disabled={stampingId !== null || inv.cfdiStatus === 'cancelled'}
                        className="min-h-[44px] px-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/50 disabled:opacity-50"
                        title="Timbrar CFDI 4.0 con tu PAC"
                      >
                        <Send className="w-4 h-4" />
                        {stampingId === inv.milestoneId
                          ? 'Timbrando...'
                          : inv.cfdiStatus === 'failed'
                            ? 'Reintentar timbrado'
                            : 'Timbrar CFDI'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
