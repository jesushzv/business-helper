'use client';

import React, { useState } from 'react';
import { MilestoneWithClient } from '@/lib/hooks/useReceivables';
import { X, CheckCircle, ExternalLink, ShieldCheck } from 'lucide-react';

interface SpeiConfirmModalProps {
  isOpen: boolean;
  milestone: MilestoneWithClient | null;
  onClose: () => void;
  onConfirm: (milestoneId: string, transferredAmount?: number) => Promise<void>;
}

export const SpeiConfirmModal: React.FC<SpeiConfirmModalProps> = ({
  isOpen,
  milestone,
  onClose,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [transferredAmount, setTransferredAmount] = useState<number>(
    milestone?.transferred_amount || milestone?.amount || 0
  );

  React.useEffect(() => {
    if (milestone) {
      setTransferredAmount(milestone.transferred_amount || milestone.amount);
    }
  }, [milestone]);

  if (!isOpen || !milestone) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(milestone.id, Number(transferredAmount) || milestone.amount);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(milestone.amount);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <span>Confirmación de Pago SPEI</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="text-xs font-semibold text-slate-400 uppercase">Hito de Cobro</span>
            <h4 className="text-base font-bold text-slate-900">{milestone.label}</h4>
            <p className="text-sm text-slate-600 font-medium">{milestone.client_name}</p>
            <div className="mt-2 text-xl font-black text-slate-900">Monto Esperado: {formattedAmount}</div>
          </div>

          {/* SPEI Details if uploaded */}
          {milestone.tracking_reference && (
            <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 space-y-1">
              <span className="text-xs font-bold text-indigo-600 uppercase">Clave de Rastreo (Banxico)</span>
              <p className="font-mono text-base font-bold text-indigo-950">{milestone.tracking_reference}</p>
            </div>
          )}

          {milestone.receipt_url && (
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase mb-1 block">Comprobante Adjunto</span>
              <a
                href={milestone.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-medium text-sm transition-colors min-h-[48px] w-full justify-center"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Ver Comprobante de Transferencia</span>
              </a>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
              Monto Transferido Confirmado (MXN)
            </label>
            <input
              type="number"
              step="0.01"
              value={transferredAmount}
              onChange={(e) => setTransferredAmount(parseFloat(e.target.value) || 0)}
              className="w-full min-h-[48px] px-4 py-3 border border-slate-300 rounded-xl font-bold text-lg text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 min-h-[48px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 shadow-md"
          >
            {loading ? (
              <span>Confirmando...</span>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Confirmar Pago</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
