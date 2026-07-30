'use client';

import React, { useState } from 'react';
import { verifyOTP, generateDigitalSeal } from '@/lib/otpSeal';
import { ShieldCheck, Lock, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface OtpSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  clientName: string;
  totalAmount: number;
  onSuccess: (cryptoseal: string) => void;
}

export const OtpSignatureModal: React.FC<OtpSignatureModalProps> = ({
  isOpen,
  onClose,
  contractId,
  clientName,
  totalAmount,
  onSuccess,
}) => {
  const [otpCode, setOtpCode] = useState<string>('');
  const [attempts, setAttempts] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [successSeal, setSuccessSeal] = useState<string | null>(null);
  const [demoSent, setDemoSent] = useState<boolean>(false);

  // Mock server OTP for public demo
  const [serverOtp, setServerOtp] = useState<string>('123456');

  if (!isOpen) return null;

  const handleSendOtp = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setServerOtp(code);
    setDemoSent(true);
    setError(null);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = verifyOTP(otpCode, serverOtp, attempts);
    setAttempts(result.attempts);

    if (!result.success) {
      setError(result.error || 'Código OTP incorrecto');
      return;
    }

    const timestamp = new Date().toISOString();
    const seal = generateDigitalSeal({
      contractId,
      clientName,
      totalAmount,
      timestamp,
      otpCode,
    });

    setSuccessSeal(seal);
    setTimeout(() => {
      onSuccess(seal);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900">Firma Digital con Código OTP</h3>
          <p className="text-xs text-slate-500 mt-1">
            Se enviará un código de verificación de 6 dígitos a su número celular registrado.
          </p>
        </div>

        {demoSent && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-5 text-center">
            <p className="text-xs font-bold text-amber-800">Código de prueba SMS enviado:</p>
            <p className="text-lg font-black tracking-widest text-amber-900 mt-0.5">{serverOtp}</p>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3.5 mb-5 flex items-center gap-2.5 text-xs font-semibold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successSeal ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-900">¡Firma Aceptada con Éxito!</p>
            <p className="text-[10px] font-mono text-emerald-700 truncate">Sello SHA-256: {successSeal}</p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Ingresar Código de 6 dígitos
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full text-center text-2xl font-mono tracking-widest min-h-[52px] px-4 py-2 bg-slate-50 border border-slate-300 rounded-2xl focus:bg-white focus:border-emerald-600 focus:outline-none"
                required
                disabled={attempts >= 3}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Intentos restantes: {Math.max(0, 3 - attempts)}</span>
              <button
                type="button"
                onClick={handleSendOtp}
                className="text-emerald-600 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reenviar Código SMS</span>
              </button>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={attempts >= 3 || otpCode.length !== 6}
                className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md"
              >
                <Lock className="w-4 h-4" />
                <span>Firmar Cotización</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
