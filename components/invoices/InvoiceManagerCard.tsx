'use client';

import React, { useState } from 'react';
import { useInvoices } from '@/lib/hooks/useInvoices';
import { generateReminderBroadcastPayload } from '@/lib/whatsappBroadcast';
import { generateNotaDeVentaPayload, generateReceiptWhatsAppLink } from '@/lib/receiptGenerator';
import { FileText, Download, Send, CheckCircle, Clock, FileCode, AlertCircle, MessageSquare } from 'lucide-react';

export function InvoiceManagerCard() {
  const { invoices, stamping, exporting, stampCFDI, downloadAccountantPackage } = useInvoices();
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-08');
  const [stampedMessage, setStampedMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleStamp = (milestoneId: string) => {
    setStampedMessage(null);
    const res = stampCFDI(milestoneId);
    if (res.success) {
      setStampedMessage('Factura timbrada exitosamente con Facturapi PAC (CFDI 4.0)');
      setTimeout(() => setStampedMessage(null), 4000);
    }
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

  const handleWhatsAppBroadcast = (inv: (typeof invoices)[0]) => {
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
        phone: '8115551234'
      },
      'overdue'
    );

    window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNotaDeVenta = (inv: (typeof invoices)[0]) => {
    const payload = generateNotaDeVentaPayload({
      title: inv.concept,
      clientName: inv.clientName,
      clientRfc: inv.clientRfc,
      amount: inv.amount,
      status: inv.cfdiStatus === 'issued' ? 'FACTURADO SAT' : 'PAGADO',
    });

    const waUrl = generateReceiptWhatsAppLink(payload, '8115551234');
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

      {exportError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3 text-sm font-semibold shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          {exportError}
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
              Envía Notas de Venta inmediatas por WhatsApp o timbra facturas SAT CFDI (Opcional Pro).
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 text-slate-300 px-3 py-1.5 rounded-full border border-slate-700">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            SAT CFDI: Opcional Pro
          </span>
        </div>

        <div className="divide-y divide-slate-800/80">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="p-5 hover:bg-slate-800/50 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h4 className="font-bold text-white text-base">{inv.concept}</h4>
                  {inv.cfdiStatus === 'issued' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-950/80 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/30">
                      <CheckCircle className="w-3.5 h-3.5" />
                      CFDI Emitido
                    </span>
                  ) : inv.cfdiStatus === 'pending' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-950/80 text-amber-300 px-2.5 py-1 rounded-full border border-amber-500/30">
                      <Clock className="w-3.5 h-3.5" />
                      Nota de Venta Lista
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full border border-slate-700">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Nota de Venta Lista
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs sm:text-sm text-slate-400 flex-wrap pt-1">
                  <span>Cliente: <strong className="text-slate-200">{inv.clientName}</strong></span>
                  <span>RFC: <code className="bg-slate-950 px-1.5 py-0.5 rounded text-slate-300 border border-slate-800 font-mono">{inv.clientRfc}</code></span>
                  <span>Vence: {inv.dueDate}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-between lg:justify-end shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800 flex-wrap">
                <span className="font-mono font-extrabold text-white text-lg">
                  ${inv.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleNotaDeVenta(inv)}
                    className="min-h-[44px] px-3.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5"
                    title="Generar Nota de Venta"
                  >
                    <FileText className="w-4 h-4 text-indigo-400" />
                    Nota de Venta PDF
                  </button>

                  <button
                    onClick={() => handleWhatsAppBroadcast(inv)}
                    className="min-h-[44px] px-3 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5"
                    title="Enviar aviso WhatsApp"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    Aviso WhatsApp
                  </button>

                  {inv.cfdiStatus === 'issued' ? (
                    <a
                      href={inv.pdfUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5 border border-slate-700"
                    >
                      <Download className="w-4 h-4 text-slate-400" />
                      CFDI XML
                    </a>
                  ) : (
                    <button
                      onClick={() => handleStamp(inv.milestoneId)}
                      disabled={stamping}
                      className="min-h-[44px] px-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/50 disabled:opacity-50"
                      title="Opcional Pro: Timbrar CFDI SAT"
                    >
                      <Send className="w-4 h-4" />
                      {stamping ? 'Timbrando...' : 'Timbrar SAT (Pro)'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
