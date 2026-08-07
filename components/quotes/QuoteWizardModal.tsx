import React, { useState } from 'react';
import { Client, LineItem } from '@/types';
import { calculateQuoteTotals } from '@/lib/quoteCalculator';
import { calculateClientCreditSummary, validateQuoteCreditLimit } from '@/lib/clientCredit';
import { X, Plus, Trash2, ArrowRight, ArrowLeft, Check, Sparkles, AlertTriangle } from 'lucide-react';

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
  const [step, setStep] = useState<number>(1);
  const [clientId, setClientId] = useState<string>(clients[0]?.id || '');
  const [title, setTitle] = useState<string>('');
  const [currency, setCurrency] = useState<string>('MXN');
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>('');

  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: 'Suministro de Materiales de Obra', quantity: 1, unit_price: 15000, sat_code: '30111500', unit: 'E48' },
  ]);

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

  if (!isOpen) return null;

  const totals = calculateQuoteTotals(lineItems, {
    applyIva,
    applyRetencionIsr,
    applyRetencionIva,
  });

  const selectedClient = clients.find((c) => c.id === (clientId || clients[0]?.id));
  const creditSummary = calculateClientCreditSummary(selectedClient);
  const creditValidation = validateQuoteCreditLimit(
    totals.totalAmount,
    creditSummary.availableCredit,
    creditSummary.status
  );

  const handleAddLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { description: '', quantity: 1, unit_price: 0, sat_code: '84111506', unit: 'E48' },
    ]);
  };

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const effectiveClientId = clientId || (clients && clients.length > 0 ? clients[0].id : '');

  const handleNext = () => {
    if (step === 1 && (!effectiveClientId || !title.trim())) return;
    if (step === 2 && lineItems.some((item) => !item.description.trim() || item.unit_price <= 0)) return;
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
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo crear la cotización. Intenta de nuevo.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 my-8 relative text-white">
        {/* Close Button (>= 48px touch target) */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors border border-slate-700"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Wizard Header */}
        <div className="mb-6">
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
                <label className="block text-sm font-bold text-slate-300 mb-2">Seleccionar Cliente</label>
                <select
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
                        'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {creditSummary.totalLimit > 0 ? `$${creditSummary.availableCredit.toLocaleString('es-MX')} MXN Disp. (${creditSummary.creditDays}d)` : 'Contado (0 días)'}
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
                <label className="block text-sm font-bold text-slate-300 mb-2">Título de la Cotización</label>
                <input
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
                  <label className="block text-sm font-bold text-slate-300 mb-2">Válida Hasta</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full min-h-[48px] px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl font-medium text-white focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">Moneda</label>
                  <select
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
                {lineItems.map((item, index) => (
                  <div key={index} className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">Concepto #{index + 1}</span>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(index)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      placeholder="Descripción del producto o servicio"
                      className="w-full min-h-[44px] px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Cantidad</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          className="w-full min-h-[44px] px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-emerald-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">Precio Unitario ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(index, 'unit_price', Number(e.target.value))}
                          className="w-full min-h-[44px] px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm font-medium text-white focus:outline-none focus:border-emerald-500"
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
                <label className="block text-sm font-bold text-slate-300 mb-2">Notas adicionales para el cliente</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condiciones de pago, tiempo de entrega, etc."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-950/80 border border-slate-800 rounded-xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
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
    </div>
  );
};
