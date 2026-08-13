'use client';

import React, { useState } from 'react';
import {
  useInvoices,
  type CFDIPaymentMethod,
  type InvoiceItem,
} from '@/lib/hooks/useInvoices';
import { generateReminderBroadcastPayload } from '@/lib/whatsappBroadcast';
import { useSettlementAccount } from '@/lib/hooks/useSettlementAccount';
import { generateNotaDeVentaPayload, generateReceiptWhatsAppLink } from '@/lib/receiptGenerator';
import { FileText, Download, Send, CheckCircle, Clock, FileCode, AlertCircle, MessageSquare, Ban, Receipt } from 'lucide-react';
import { ConfirmDialog, useConfirm } from '@/components/shared/ConfirmDialog';

const currency = (value: number) =>
  `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

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

/**
 * The complemento de pago state of one PPD invoice.
 *
 * A PPD document declares the amount as still owed. Every payment against it
 * obliges the taxpayer to file a complement with the SAT in the first days of
 * the following month, and the product used to be able to issue the PPD
 * document while having no way to file the complement at all. This block is
 * where that obligation becomes visible: what has been filed, what is still
 * outstanding, and — when an automatic attempt failed — a way to retry it.
 */
function ComplementPanel({
  invoice,
  busy,
  onSend,
}: {
  invoice: InvoiceItem;
  busy: boolean;
  onSend: () => void;
}) {
  if (invoice.cfdiStatus !== 'issued' || invoice.paymentMethod !== 'PPD') return null;

  const settled = invoice.outstandingBalance <= 0;
  const failed = invoice.complements.filter((c) => c.status === 'failed');

  return (
    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
          <Receipt className="w-3.5 h-3.5" />
          Factura PPD — complemento de pago
        </span>
        <span className="text-xs text-slate-400">
          {settled
            ? 'Saldada: todos los pagos tienen complemento.'
            : `Saldo insoluto ${currency(invoice.outstandingBalance)}`}
        </span>
      </div>

      {invoice.complements.length > 0 && (
        <ul className="space-y-1">
          {invoice.complements.map((c) => (
            <li key={c.id} className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
              <span className="text-slate-300 font-semibold">Parcialidad {c.installment}</span>
              <span>{currency(c.amount)}</span>
              {c.status === 'issued' && c.uuid ? (
                <code className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300 border border-slate-800 font-mono">
                  {c.uuid}
                </code>
              ) : (
                <span className={c.status === 'failed' ? 'text-rose-300' : 'text-sky-300'}>
                  {c.status === 'failed' ? 'No se pudo timbrar' : 'En proceso'}
                </span>
              )}
              {c.status === 'issued' && c.xmlUrl && (
                <a
                  href={c.xmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-300 underline underline-offset-2"
                >
                  XML
                </a>
              )}
              {c.status === 'issued' && c.pdfUrl && (
                <a
                  href={c.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-300 underline underline-offset-2"
                >
                  PDF
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {failed.length > 0 && failed[failed.length - 1].error && (
        <p className="text-xs text-rose-300">{failed[failed.length - 1].error}</p>
      )}

      {!settled && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onSend}
            disabled={busy}
            className="min-h-[48px] px-3 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold rounded-lg text-xs transition-all disabled:opacity-50"
            title="Emitir el complemento de pago del saldo pendiente"
          >
            {busy ? 'Emitiendo...' : 'Emitir complemento de pago'}
          </button>
          <span className="text-xs text-slate-500">
            Se emite solo al confirmar el pago; usa este botón si falló o si cobraste fuera de la app.
          </span>
        </div>
      )}
    </div>
  );
}

export function InvoiceManagerCard() {
  const confirmAction = useConfirm();
  const {
    invoices,
    loading,
    loadError,
    stampingId,
    complementingId,
    exporting,
    stampCFDI,
    sendComplement,
    downloadAccountantPackage,
  } = useInvoices();
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [stampedMessage, setStampedMessage] = useState<string | null>(null);
  const [stampError, setStampError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // PUE stays the default: it declares the invoice as already paid, which is
  // what a cobro settled on issuance is. PPD is opt-in per cobro and is only
  // offered now that the complemento de pago it obliges can actually be filed.
  const [paymentMethods, setPaymentMethods] = useState<Record<string, CFDIPaymentMethod>>({});

  // Only a confirmed-missing account blocks sharing; unknown leaves the button
  // alone and lets the server refuse (#64).
  const { ready: settlementReady } = useSettlementAccount();
  const canSharePaymentLinks = settlementReady !== false;

  const handleStamp = async (milestoneId: string) => {
    setStampedMessage(null);
    setStampError(null);

    const method = paymentMethods[milestoneId] || 'PUE';
    const res = await stampCFDI(milestoneId, method);

    if (!res.success) {
      // The PAC's rejection is the actionable part — a missing RFC, a key
      // that is not connected.
      setStampError(res.error || 'No se pudo timbrar la factura');
      return;
    }

    const validity =
      res.environment === 'sandbox'
        ? ' Se emitió contra el entorno de pruebas de tu PAC: no tiene validez fiscal.'
        : '';

    // A PPD invoice is only half the paperwork, and the user has to know that
    // at the moment they issue it rather than a month later.
    const ppdNotice = res.complementRequired
      ? ' Al ser PPD, cada pago que confirmes emitirá su complemento de pago ante el SAT.'
      : '';

    setStampedMessage(
      `Factura timbrada. Folio fiscal ${res.uuid}.${validity}${ppdNotice}${res.warning ? ` ${res.warning}` : ''}`
    );
  };

  const handleComplement = async (milestoneId: string) => {
    setStampedMessage(null);
    setStampError(null);

    const res = await sendComplement(milestoneId);

    if (!res.success) {
      setStampError(res.error || 'No se pudo emitir el complemento de pago');
      return;
    }

    if (!res.issued) {
      setStampedMessage(res.message || 'Este cobro no tiene un complemento de pago pendiente.');
      return;
    }

    setStampedMessage(
      `Complemento de pago timbrado (parcialidad ${res.installment}). Folio fiscal ${res.uuid}. ` +
        `Saldo insoluto ${currency(res.remainingBalance ?? 0)}.${res.warning ? ` ${res.warning}` : ''}`
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
    // No token, no payment page — refuse rather than open WhatsApp prefilled
    // with a link that 404s in front of the client (#72). The button below is
    // disabled in the same case; this is the guard behind it.
    if (!inv.clientPhone || !inv.publicToken) return;

    const payload = generateReminderBroadcastPayload(
      {
        id: inv.milestoneId,
        publicToken: inv.publicToken,
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
        ) : loadError ? (
          // A failed read is not an empty book of business (#260): "Aún no
          // tienes cobros" off a dropped request told a tenant with real
          // invoices they had nothing to facturar. The banner above already
          // shows `loadError`; this branch keeps the list area from
          // contradicting it.
          <div className="p-8 text-center space-y-2">
            <p className="text-slate-300 font-semibold">No pudimos cargar tus cobros.</p>
            <p className="text-sm text-slate-400">
              Revisa tu conexión e intenta de nuevo. Tus cobros y facturas no se han perdido.
            </p>
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

                  <ComplementPanel
                    invoice={inv}
                    busy={complementingId === inv.milestoneId}
                    onSend={() => handleComplement(inv.milestoneId)}
                  />
                </div>

                <div className="flex items-center gap-3 justify-between lg:justify-end shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800 flex-wrap">
                  <span className="font-mono font-extrabold text-white text-lg">
                    ${inv.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => handleNotaDeVenta(inv)}
                      disabled={!inv.clientPhone}
                      className="min-h-[48px] px-3.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                      title={
                        inv.clientPhone
                          ? 'Generar Nota de Venta'
                          : 'El cliente no tiene WhatsApp registrado'
                      }
                    >
                      <FileText className="w-4 h-4 text-indigo-400" />
                      Nota de Venta PDF
                    </button>

                    {/* This aviso carries a /pay/ link, so it is gated on the
                        settlement account the same way the Cobranza card is:
                        without a CLABE that page answers 409 (#64). */}
                    <button
                      onClick={() => handleWhatsAppBroadcast(inv)}
                      disabled={!inv.clientPhone || !canSharePaymentLinks || !inv.publicToken}
                      className="min-h-[48px] px-3 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5 disabled:opacity-40"
                      title={
                        !canSharePaymentLinks
                          ? 'Agrega la CLABE de tu negocio para poder cobrar'
                          : !inv.publicToken
                            ? 'Este cobro no tiene una cotización con liga de pago'
                            : inv.clientPhone
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
                            className="min-h-[48px] px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5 border border-slate-700"
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
                            className="min-h-[48px] px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-xl text-sm transition-all flex items-center gap-1.5 border border-slate-700"
                          >
                            <Download className="w-4 h-4 text-slate-400" />
                            CFDI PDF
                          </a>
                        )}
                      </div>
                    ) : (
                      <>
                        {/* MetodoPago is a property of the document, not a
                            preference, and it cannot be changed after
                            stamping — so it is chosen here, before. */}
                        <label className="sr-only" htmlFor={`metodo-pago-${inv.milestoneId}`}>
                          Método de pago SAT
                        </label>
                        <select
                          id={`metodo-pago-${inv.milestoneId}`}
                          value={paymentMethods[inv.milestoneId] || 'PUE'}
                          onChange={(e) =>
                            setPaymentMethods((prev) => ({
                              ...prev,
                              [inv.milestoneId]: e.target.value as CFDIPaymentMethod,
                            }))
                          }
                          disabled={stampingId !== null || inv.cfdiStatus === 'cancelled'}
                          className="w-full min-w-0 max-w-full min-h-[48px] px-3 bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50"
                          title="PUE: el cobro ya está pagado. PPD: se pagará después, y cada pago emitirá su complemento."
                        >
                          <option value="PUE">PUE — Pago en una exhibición</option>
                          <option value="PPD">PPD — Pago diferido o en parcialidades</option>
                        </select>

                        <button
                        onClick={() =>
                          confirmAction.ask({
                            title: 'Timbrar factura ante el SAT',
                            // The cost, named before the tap. #99 asks for
                            // exactly this sentence: a confirmation that does
                            // not say what happens is a speed bump.
                            consequence:
                              'Tu PAC te cobrará este timbrado y la factura quedará registrada ante el SAT. Esta acción no se puede deshacer desde la app.',
                            confirmLabel: 'Timbrar factura',
                            destructive: false,
                            onConfirm: () => handleStamp(inv.milestoneId),
                          })
                        }
                        disabled={stampingId !== null || inv.cfdiStatus === 'cancelled'}
                        className="min-h-[48px] px-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/50 disabled:opacity-50"
                        title="Timbrar CFDI 4.0 con tu PAC"
                      >
                        <Send className="w-4 h-4" />
                        {stampingId === inv.milestoneId
                          ? 'Timbrando...'
                          : inv.cfdiStatus === 'failed'
                            ? 'Reintentar timbrado'
                            : 'Timbrar CFDI'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog request={confirmAction.request} onClose={confirmAction.dismiss} />
    </div>
  );
}
