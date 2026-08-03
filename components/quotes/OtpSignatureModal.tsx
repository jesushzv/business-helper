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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative text-white">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-extrabold text-white">Firma Digital con Código OTP</h3>
          <p className="text-xs text-slate-400 mt-1">
            Se enviará un código de verificación de 6 dígitos a su número celular registrado.
          </p>
        </div>

        {demoSent && (
          <div className="bg-amber-950/80 border border-amber-500/30 rounded-2xl p-3 mb-5 text-center">
            <p className="text-xs font-bold text-amber-300">Código de prueba SMS enviado:</p>
            <p className="text-lg font-black tracking-widest font-mono text-amber-200 mt-0.5">{serverOtp}</p>
          </div>
        )}

        {error && (
          <div className="bg-rose-950/80 border border-rose-500/30 text-rose-400 rounded-2xl p-3.5 mb-5 flex items-center gap-2.5 text-xs font-semibold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successSeal ? (
          <div className="bg-emerald-950/80 border border-emerald-500/30 rounded-2xl p-4 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-bold text-emerald-300">¡Firma Aceptada con Éxito!</p>
            <p className="text-[10px] font-mono text-emerald-400 truncate">Sello SHA-256: {successSeal}</p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Ingresar Código de 6 dígitos
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456"
                className="w-full text-center text-2xl font-mono tracking-widest min-h-[52px] px-4 py-2 bg-slate-950/80 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                required
                disabled={attempts >= 3}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Intentos restantes: {Math.max(0, 3 - attempts)}</span>
              <button
                type="button"
                onClick={handleSendOtp}
                className="text-emerald-400 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reenviar Código SMS</span>
              </button>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[48px] px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={attempts >= 3 || otpCode.length !== 6}
                className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md"
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
