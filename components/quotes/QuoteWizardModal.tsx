import React, { useState } from 'react';
import { Client, LineItem } from '@/types';
import {
  LineItemDraft,
  DEFAULT_SAT_CODE,
  createLineItemDraft,
  normalizeNumericInput,
  toLineItems,
  validateLineItemDrafts,
} from '@/lib/lineItemDraft';
import { calculateQuoteTotals } from '@/lib/quoteCalculator';
import { calculateClientCreditSummary, validateQuoteCreditLimit } from '@/lib/clientCredit';
import { useReceivables } from '@/lib/hooks/useReceivables';
import { Plus, Trash2, ArrowRight, ArrowLeft, Check, Sparkles, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { userFacingMessage } from '@/lib/errorCopy';
import { ConfirmDialog, useConfirm } from '@/components/shared/ConfirmDialog';

interface QuoteWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  onSubmit: (data: {
    client_id: string;
    title: string;
    line_items: LineItem[];
    currency: string;
    valid_until: string;
    notes: string;
    taxOptions: { applyIva: boolean; applyRetencionIsr: boolean; applyRetencionIva: boolean };
  }) => Promise<void>;
}

export const QuoteWizardModal: React.FC<QuoteWizardModalProps> = ({
  isOpen,
  onClose,
  clients,
  onSubmit,
}) => {
  const confirmAction = useConfirm();
  const [step, setStep] = useState<number>(1);
  const [clientId, setClientId] = useState<string>(clients[0]?.id || '');
  const [title, setTitle] = useState<string>('');
  const [currency, setCurrency] = useState<string>('MXN');
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>('');

  // Starts empty on purpose: the old prefill ('Suministro de Materiales de
  // Obra', $15,000) passed step-2 validation untouched, so an owner who only
  // typed a title sent their client a real quote for goods they don't sell (#93).
  //
  // Drafts hold the raw text of the number fields; `lib/lineItemDraft.ts`
  // explains why binding the numbers directly produced a trailing zero in
  // Precio Unitario.
  const [drafts, setDrafts] = useState<LineItemDraft[]>([createLineItemDraft(DEFAULT_SAT_CODE)]);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [applyIva, setApplyIva] = useState<boolean>(true);
  const [applyRetencionIsr, setApplyRetencionIsr] = useState<boolean>(false);
  const [applyRetencionIva, setApplyRetencionIva] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen && clients && clients.length > 0 && (!clientId || !clients.some(c => c.id === clientId))) {
      const selected = clients[0];
      setClientId(selected.id);
      if (selected.credit_days && selected.credit_days > 0) {
        setValidUntil(new Date(Date.now() + selected.credit_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      }
    }
  }, [isOpen, clients, clientId]);

  const handleClientChange = (newId: string) => {
    setClientId(newId);
    const selected = clients.find((c) => c.id === newId);
    if (selected && selected.credit_days && selected.credit_days > 0) {
      setValidUntil(new Date(Date.now() + selected.credit_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    }
  };

  // The client's open receivables are what consume the line. Omitting them made
  // `usedCredit` always 0, so a client who already owed $48,000 of a $50,000
  // line was shown "$50,000 MXN Disp." and the over-limit warning only fired
  // for a quote larger than the entire line (#96 money-path review).
  const { receivables, loading: receivablesLoading, error: receivablesError } = useReceivables();

  if (!isOpen) return null;

  const lineItems: LineItem[] = toLineItems(drafts);

  const totals = calculateQuoteTotals(lineItems, {
    applyIva,
    applyRetencionIsr,
    applyRetencionIva,
  });

  const selectedClient = clients.find((c) => c.id === (clientId || clients[0]?.id));
  const balanceKnown = !receivablesLoading && !receivablesError;
  const creditSummary = calculateClientCreditSummary(
    selectedClient,
    balanceKnown ? receivables.filter((m) => m.client_id === selectedClient?.id) : []
  );
  const creditValidation = validateQuoteCreditLimit(
    totals.totalAmount,
    creditSummary.availableCredit,
    creditSummary.status
  );

  const handleAddLineItem = () => {
    setDrafts((prev) => [...prev, createLineItemDraft()]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (drafts.length === 1) return;
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    setItemsError(null);
  };

  const handleItemChange = (index: number, field: keyof LineItemDraft, value: string) => {
    // The number fields keep the owner's own text — no round-trip through
    // Number(), which is what re-inserted the leading zero on every keystroke.
    const next =
      field === 'quantity' || field === 'unit_price' ? normalizeNumericInput(value) : value;

    setDrafts((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: next } : item)));
    setItemsError(null);
  };

  const effectiveClientId = clientId || (clients && clients.length > 0 ? clients[0].id : '');

  const handleNext = () => {
    if (step === 1 && (!effectiveClientId || !title.trim())) return;
    if (step === 2) {
      // Saying why beats a button that does nothing (#146).
      const validation = validateLineItemDrafts(drafts);
      setItemsError(validation.message);
      if (!validation.valid) return;
    }
    setStep((prev) => Math.min(3, prev + 1));
  };

  const handlePrev = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !effectiveClientId || !title.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        title: title.trim(),
        client_id: effectiveClientId,
        currency,
        valid_until: validUntil,
        line_items: lineItems,
        notes: notes.trim(),
        taxOptions: { applyIva, applyRetencionIsr, applyRetencionIva },
      });
      onClose();
    } catch (err) {
      // The quote was not created; the wizard stays open so nothing pretends
      // otherwise (#50).
      setSubmitError(
        userFacingMessage(err, 'No se pudo crear la cotización. Intenta de nuevo.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  // A mis-tap on the X used to discard everything typed — up to eight line
  // items entered on a phone (#104). The guard only fires when there is
  // something to lose, so an untouched wizard still closes in one tap.
  const isDirty =
    title.trim() !== '' ||
    notes.trim() !== '' ||
    drafts.some((d) => d.description.trim() !== '' || d.quantity.trim() !== '' || d.unit_price.trim() !== '');

  const handleClose = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    confirmAction.ask({
      title: 'Descartar esta cotización',
      consequence: 'Se perderán los conceptos y las notas que llevas capturados. Esto no se puede deshacer.',
      confirmLabel: 'Sí, descartar',
      cancelLabel: 'Seguir editando',
      onConfirm: onClose,
    });
  };

  return (
    <Modal
      open
      onClose={handleClose}
      title="Generador de Cotización"
      maxWidth="max-w-2xl"
      // Three steps of typed work behind a backdrop tap.
      dismissOnBackdrop={false}
      panelClassName="p-6 sm:p-8"
    >
      <div>
        {/* Wizard Header */}
        <div className="mb-6 pr-12">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-3 py-1 rounded-full mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Step {step} de 3 — Generador de Cotización
          </span>
          <h2 className="text-2xl font-black text-white">
            {step === 1 && '1. Cliente y Detalles de la Propuesta'}
            {step === 2 && '2. Conceptos y Cálculo de Impuestos SAT'}
            {step === 3 && '3. Resumen y Confirmación'}
          </h2>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`h-2 flex-1 rounded-full ${step >= 1 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
          <div className={`h-2 flex-1 rounded-full ${step >= 2 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
          <div className={`h-2 flex-1 rounded-full ${step >= 3 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
        </div>

        <form onSubmit={handleSubmit}>
          {/* STEP 1: CLIENT & TITLE */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label htmlFor="quotewizardmodal-seleccionar-cliente" className="block text-sm font-bold text-slate-300 mb-2">Seleccionar Cliente</label>
                <select
                  id="quotewizardmodal-seleccionar-cliente"
                  value={clientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl font-medium text-white focus:border-emerald-500 focus:outline-none"
                  required
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.name} {c.rfc ? `(${c.rfc})` : ''}
                    </option>
                  ))}
                </select>

                {/* Selected Client Credit Info Banner */}
                {selectedClient && (
                  <div className="mt-2.5 rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300">Condiciones de Crédito B2B:</span>
                      <span className={`font-extrabold px-2 py-0.5 rounded-md ${
                        creditSummary.status === 'blocked' ? 'bg-rose-950 text-rose-400 border border-rose-500/30' :
                        creditSummary.status === 'suspended' ? 'bg-amber-950 text-amber-400 border border-amber-500/30' :
                        creditSummary.status === 'active' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' :
                        'bg-slate-900 text-slate-400 border border-slate-700'
                      }`}>
                        {/* "Contado (0 días)" used to be the else branch for
                            everything, so a client nobody had assessed got a
                            confident green badge stating terms the owner never
                            set (#96). */}
                        {!creditSummary.hasLimit
                          ? 'Sin línea de crédito'
                          : !balanceKnown
                          ? `$${creditSummary.totalLimit.toLocaleString('es-MX')} MXN de límite`
                          : `$${creditSummary.availableCredit.toLocaleString('es-MX')} MXN Disp.${
                              creditSummary.creditDays === null ? '' : ` (${creditSummary.creditDays}d)`
                            }`}
                      </span>
                    </div>

                    {creditValidation.warningMessage && (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-950/80 border border-amber-500/30 p-2.5 text-amber-300 font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                        <span>{creditValidation.warningMessage}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="quotewizardmodal-titulo-de-la-cotizacion" className="block text-sm font-bold text-slate-300 mb-2">Título de la Cotización</label>
                <input
                  id="quotewizardmodal-titulo-de-la-cotizacion"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ej. Suministro de Cemento y Varilla para Obra"
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="quotewizardmodal-valida-hasta" className="block text-sm font-bold text-slate-300 mb-2">Válida Hasta</label>
                  <input
                    id="quotewizardmodal-valida-hasta"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full min-h-[48px] px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl font-medium text-white focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="quotewizardmodal-moneda" className="block text-sm font-bold text-slate-300 mb-2">Moneda</label>
                  <select
                    id="quotewizardmodal-moneda"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full min-h-[48px] px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl font-medium text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="MXN" className="bg-slate-900 text-white">MXN (Pesos Mexicanos)</option>
                    <option value="USD" className="bg-slate-900 text-white">USD (Dólares)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: LINE ITEMS & SAT TAXES */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1">
                {drafts.map((item, index) => (
                  <div key={index} className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">Concepto #{index + 1}</span>
                      {drafts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(index)}
                          // Repeated per row: without the number, a screen
                          // reader announces N identical "eliminar" buttons.
                          aria-label={`Eliminar concepto ${index + 1}`}
                          className="flex h-12 w-12 items-center justify-center rounded-xl text-rose-400 hover:bg-rose-950/50 hover:text-rose-300"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      placeholder="Descripción del producto o servicio"
                      className="w-full min-h-[48px] px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          className="block text-xs font-semibold text-slate-400 mb-1"
                          htmlFor={`line-item-${index}-quantity`}
                        >
                          Cantidad
                        </label>
                        {/* text + inputMode: the numeric keypad without the
                            browser's value sanitising, which blanks the field
                            on a half-typed decimal ("1." reads as ""). */}
                        <input
                          id={`line-item-${index}-quantity`}
                          type="text"
                          inputMode="numeric"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          placeholder="1"
                          className="w-full min-h-[48px] px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-base font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          required
                        />
                      </div>
                      <div>
                        <label
                          className="block text-xs font-semibold text-slate-400 mb-1"
                          htmlFor={`line-item-${index}-unit-price`}
                        >
                          Precio Unitario ($)
                        </label>
                        <input
                          id={`line-item-${index}-unit-price`}
                          type="text"
                          inputMode="decimal"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                          placeholder="0.00"
                          className="w-full min-h-[48px] px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-base font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddLineItem}
                className="w-full min-h-[48px] border-2 border-dashed border-slate-700 hover:border-emerald-500 hover:text-emerald-400 font-bold text-slate-300 rounded-2xl flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Agregar Otro Concepto</span>
              </button>

              {/* SAT Tax Toggles */}
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Impuestos y Retenciones SAT</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyIva}
                    onChange={(e) => setApplyIva(e.target.checked)}
                    className="w-5 h-5 accent-emerald-500 rounded"
                  />
                  <span className="text-sm font-semibold text-slate-200">Agregar IVA 16%</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyRetencionIsr}
                    onChange={(e) => setApplyRetencionIsr(e.target.checked)}
                    className="w-5 h-5 accent-emerald-500 rounded"
                  />
                  <span className="text-sm font-semibold text-slate-200">Retención ISR 10% (Régimen RESICO)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyRetencionIva}
                    onChange={(e) => setApplyRetencionIva(e.target.checked)}
                    className="w-5 h-5 accent-emerald-500 rounded"
                  />
                  <span className="text-sm font-semibold text-slate-200">Retención IVA 10.6667% (Moral a Física)</span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & CONFIRM */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-400">Cliente</span>
                  <span className="text-sm font-bold text-white">
                    {clients.find((c) => c.id === clientId)?.name}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-400">Título</span>
                  <span className="text-sm font-bold text-white">{title}</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal</span>
                    <span>${totals.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {totals.ivaAmount > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>IVA (16%)</span>
                      <span>+${totals.ivaAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {totals.retencionIsrAmount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Retención ISR (10%)</span>
                      <span>-${totals.retencionIsrAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {totals.retencionIvaAmount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Retención IVA (10.6667%)</span>
                      <span>-${totals.retencionIvaAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-black text-white pt-3 border-t border-slate-800 font-mono">
                    <span>Total Final</span>
                    <span className="text-emerald-400">${totals.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {currency}</span>
                  </div>
                </div>

                {creditValidation.warningMessage && (
                  <div className="rounded-xl bg-amber-950/80 border border-amber-500/40 p-3.5 text-xs text-amber-300 font-semibold flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-amber-200">Alerta de Crédito Comercial:</span>
                      <p className="mt-0.5 text-amber-300/90">{creditValidation.warningMessage}</p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="quotewizardmodal-notas-adicionales-para-el" className="block text-sm font-bold text-slate-300 mb-2">Notas adicionales para el cliente</label>
                <textarea
                  id="quotewizardmodal-notas-adicionales-para-el"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condiciones de pago, tiempo de entrega, etc."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Beside the button that refused to advance — a message inside the
              scrolling list of conceptos is a message nobody sees. */}
          {step === 2 && itemsError && (
            <div
              role="alert"
              className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-sm font-semibold"
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{itemsError}</span>
            </div>
          )}

          {submitError && (
            <div className="mt-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm font-semibold">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between gap-4 mt-8 pt-4 border-t border-slate-800">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="min-h-[48px] px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl flex items-center gap-2 transition-colors text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
            ) : <div />}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={step === 1 && (!clientId || !title.trim())}
                className="min-h-[48px] px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition-all shadow-md text-sm"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg text-sm"
              >
                <Check className="w-5 h-5" />
                <span>{submitting ? 'Creando...' : 'Generar y Compartir'}</span>
              </button>
            )}
          </div>
        </form>
      </div>

      <ConfirmDialog request={confirmAction.request} onClose={confirmAction.dismiss} />
    </Modal>
  );
};
