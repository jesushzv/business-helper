'use client';

import React, { useState } from 'react';
import { ShieldCheck, Lock, AlertTriangle, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';

/**
 * OTP signature modal.
 *
 * This component used to generate the code, hold it in React state, render it
 * on screen, and verify the user's input against it locally — then hand the
 * resulting seal to the caller. Nothing about that proved a signature: the
 * browser both set and checked the answer.
 *
 * It now only collects input. The code is issued and verified by the server,
 * and the seal in `onSuccess` is the one the server computed and persisted.
 */

interface OtpSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** public_token of the quote being signed; scopes both server calls. */
  publicToken: string;
  clientName: string;
  onSuccess: (cryptoseal: string) => void;
}

const MAX_ATTEMPTS = 3;

export const OtpSignatureModal: React.FC<OtpSignatureModalProps> = ({
  isOpen,
  onClose,
  publicToken,
  clientName,
  onSuccess,
}) => {
  const [otpCode, setOtpCode] = useState<string>('');
  const [remaining, setRemaining] = useState<number>(MAX_ATTEMPTS);
  const [error, setError] = useState<string | null>(null);
  const [successSeal, setSuccessSeal] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendOtp = async () => {
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/quotes/public/${encodeURIComponent(publicToken)}/otp`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'No se pudo enviar el código de verificación');
        return;
      }

      setSent(true);
      setRemaining(MAX_ATTEMPTS);
      // Only ever populated by a local dev server with no SMS provider wired up.
      setDevCode(data?.dev_code || null);
    } catch {
      setError('No se pudo contactar al servidor. Intente de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerifying(true);

    try {
      const res = await fetch(`/api/quotes/public/${encodeURIComponent(publicToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode, clientName }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        setError(data?.error || 'Código OTP incorrecto');
        if (typeof data?.remaining === 'number') setRemaining(data.remaining);
        if (data?.expired) setSent(false);
        return;
      }

      setSuccessSeal(data.contract_hash);
      setTimeout(() => {
        onSuccess(data.contract_hash);
        onClose();
      }, 1500);
    } catch {
      setError('No se pudo contactar al servidor. Intente de nuevo.');
    } finally {
      setVerifying(false);
    }
  };

  const locked = remaining <= 0;

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

        {devCode && (
          <div className="bg-amber-950/80 border border-amber-500/30 rounded-2xl p-3 mb-5 text-center">
            <p className="text-xs font-bold text-amber-300">
              Entorno de desarrollo — código de prueba:
            </p>
            <p className="text-lg font-black tracking-widest font-mono text-amber-200 mt-0.5">
              {devCode}
            </p>
          </div>
        )}

        {sent && !devCode && !successSeal && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 mb-5 text-center">
            <p className="text-xs font-semibold text-slate-300">
              Código enviado a su número celular registrado.
            </p>
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
            <p className="text-[10px] font-mono text-emerald-400 truncate">
              Sello HMAC-SHA256: {successSeal}
            </p>
          </div>
        ) : !sent ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sending}
              className="w-full min-h-[48px] px-4 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{sending ? 'Enviando…' : 'Enviar Código de Verificación'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[48px] px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-sm"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Ingresar Código de 6 dígitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center text-2xl font-mono tracking-widest min-h-[52px] px-4 py-2 bg-slate-950/80 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
                required
                disabled={locked || verifying}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Intentos restantes: {Math.max(0, remaining)}</span>
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={sending}
                className="text-emerald-400 font-bold hover:underline flex items-center gap-1 disabled:opacity-50"
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
                disabled={locked || verifying || otpCode.length !== 6}
                className="flex-1 min-h-[48px] px-4 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-md"
              >
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>{verifying ? 'Verificando…' : 'Firmar Cotización'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
