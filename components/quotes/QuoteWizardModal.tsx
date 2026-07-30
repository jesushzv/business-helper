'use client';

import React, { useState } from 'react';
import { Client, LineItem } from '@/types';
import { calculateQuoteTotals } from '@/lib/quoteCalculator';
import { X, Plus, Trash2, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';

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

  if (!isOpen) return null;

  const totals = calculateQuoteTotals(lineItems, {
    applyIva,
    applyRetencionIsr,
    applyRetencionIva,
  });

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

  const handleNext = () => {
    if (step === 1 && (!clientId || !title.trim())) return;
    if (step === 2 && lineItems.some((item) => !item.description.trim() || item.unit_price <= 0)) return;
    setStep((prev) => Math.min(prev + 1, 3));
  };

  const handlePrev = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        client_id: clientId,
        title,
        line_items: lineItems,
        currency,
        valid_until: validUntil,
        notes,
        taxOptions: { applyIva, applyRetencionIsr, applyRetencionIva },
      });
      onClose();
    } catch (err) {
      console.error('Failed to create quote', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 my-8 relative">
        {/* Close Button (>= 48px touch target) */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Wizard Header */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Step {step} de 3 — Generador de Cotización
          </span>
          <h2 className="text-2xl font-black text-slate-900">
            {step === 1 && '1. Cliente y Detalles de la Propuesta'}
            {step === 2 && '2. Conceptos y Cálculo de Impuestos SAT'}
            {step === 3 && '3. Resumen y Confirmación'}
          </h2>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`h-2 flex-1 rounded-full ${step >= 1 ? 'bg-emerald-600' : 'bg-slate-200'}`} />
          <div className={`h-2 flex-1 rounded-full ${step >= 2 ? 'bg-emerald-600' : 'bg-slate-200'}`} />
          <div className={`h-2 flex-1 rounded-full ${step >= 3 ? 'bg-emerald-600' : 'bg-slate-200'}`} />
        </div>

        <form onSubmit={handleSubmit}>
          {/* STEP 1: CLIENT & TITLE */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Seleccionar Cliente</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  required
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.rfc ? `(${c.rfc})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Título de la Cotización</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="ej. Suministro de Cemento y Varilla para Obra"
                  className="w-full min-h-[48px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Válida Hasta</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full min-h-[48px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Moneda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full min-h-[48px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="MXN">MXN (Pesos Mexicanos)</option>
                    <option value="USD">USD (Dólares)</option>
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
                  <div key={index} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">Concepto #{index + 1}</span>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLineItem(index)}
                          className="text-rose-500 hover:text-rose-700 p-1"
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
                      className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none"
                      required
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Cantidad</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Precio Unitario ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(index, 'unit_price', Number(e.target.value))}
                          className="w-full min-h-[44px] px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none"
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
                className="w-full min-h-[48px] border-2 border-dashed border-slate-300 hover:border-emerald-600 hover:text-emerald-600 font-bold text-slate-600 rounded-2xl flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Agregar Otro Concepto</span>
              </button>

              {/* SAT Tax Toggles */}
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Impuestos y Retenciones SAT</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyIva}
                    onChange={(e) => setApplyIva(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 rounded"
                  />
                  <span className="text-sm font-semibold text-slate-800">Agregar IVA 16%</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyRetencionIsr}
                    onChange={(e) => setApplyRetencionIsr(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 rounded"
                  />
                  <span className="text-sm font-semibold text-slate-800">Retención ISR 10% (Régimen RESICO)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyRetencionIva}
                    onChange={(e) => setApplyRetencionIva(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 rounded"
                  />
                  <span className="text-sm font-semibold text-slate-800">Retención IVA 10.6667% (Moral a Física)</span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & CONFIRM */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-400">Cliente</span>
                  <span className="text-sm font-bold text-slate-900">
                    {clients.find((c) => c.id === clientId)?.name}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                  <span className="text-xs font-bold uppercase text-slate-400">Título</span>
                  <span className="text-sm font-bold text-slate-900">{title}</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>${totals.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {totals.ivaAmount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>IVA (16%)</span>
                      <span>+${totals.ivaAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {totals.retencionIsrAmount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Retención ISR (10%)</span>
                      <span>-${totals.retencionIsrAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {totals.retencionIvaAmount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Retención IVA (10.6667%)</span>
                      <span>-${totals.retencionIvaAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-black text-slate-900 pt-3 border-t border-slate-200">
                    <span>Total Final</span>
                    <span>${totals.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {currency}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Notas adicionales para el cliente</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Condiciones de pago, tiempo de entrega, etc."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between gap-4 mt-8 pt-4 border-t border-slate-100">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="min-h-[48px] px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center gap-2 transition-colors text-sm"
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
                className="min-h-[48px] px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-2 transition-colors text-sm"
              >
                <span>Siguiente</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 transition-colors shadow-lg text-sm"
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
