'use client';

import React, { useState } from 'react';
import { ShieldCheck, Lock, AlertTriangle, CheckCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';

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
  /**
   * The server answered 409 QUOTE_ALREADY_SIGNED: someone signed this quote
   * before this attempt. Not `onSuccess` — the caller did not sign anything
   * (#293) — but the page behind the modal should swap to its sealed view.
   * `seal` is the existing signature's hash, `null` on legacy rows that were
   * verified before the hash column carried one.
   */
  onAlreadySigned?: (seal: string | null) => void;
}

const MAX_ATTEMPTS = 3;
/**
 * How long before a resend is offered again.
 *
 * The server owns the real rate limit (#22's escalating backoff and daily
 * cap); this only stops a client tapping twice in three seconds and spending
 * one of those sends on a code that is already in flight to their phone.
 */
const RESEND_COOLDOWN_SECONDS = 30;

export const OtpSignatureModal: React.FC<OtpSignatureModalProps> = ({
  isOpen,
  onClose,
  publicToken,
  clientName,
  onSuccess,
  onAlreadySigned,
}) => {
  const [otpCode, setOtpCode] = useState<string>('');
  const [remaining, setRemaining] = useState<number>(MAX_ATTEMPTS);
  const [error, setError] = useState<string | null>(null);
  const [successSeal, setSuccessSeal] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  // Which channel the server actually sent over — the copy below must not
  // claim a destination ("su correo", "su celular") the server did not use.
  const [channel, setChannel] = useState<string | null>(null);
  /** Seconds until "Reenviar Código" is tappable again. 0 = ready. */
  const [cooldown, setCooldown] = useState<number>(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
        // Public routes answer { error: { code, message } } (#65); message is
        // Spanish and safe to show verbatim.
        setError(data?.error?.message || 'No se pudo enviar el código de verificación');
        return;
      }

      setSent(true);
      setRemaining(MAX_ATTEMPTS);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setChannel(typeof data?.channel === 'string' ? data.channel : null);
      // Only ever populated by a local dev server with no delivery provider wired up.
      setDevCode(data?.dev_code || null);
    } catch {
      setError('No se pudo contactar al servidor. Intenta de nuevo.');
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
        // Already signed is a refusal, not this caller's success (#293): the
        // route used to answer `success: true` here before any OTP check, so
        // anyone holding the link could POST a junk code and read "¡Firma
        // Aceptada con Éxito!" for a signature they never performed. The
        // message names the fact; the page behind swaps to its sealed view.
        if (data?.error?.code === 'QUOTE_ALREADY_SIGNED') {
          setError(data?.error?.message || 'Esta cotización ya fue firmada.');
          onAlreadySigned?.(typeof data?.contract_hash === 'string' ? data.contract_hash : null);
          return;
        }
        setError(data?.error?.message || 'Código OTP incorrecto');
        if (typeof data?.remaining === 'number') setRemaining(data.remaining);
        if (data?.expired) setSent(false);
        return;
      }

      // Only a response that actually verified this caller's OTP reaches here
      // (#293's edge: a legacy verified row with no hash now answers 409 above,
      // so `success: true` always carries the seal it just minted).
      setSuccessSeal(data.contract_hash);
      setTimeout(() => {
        onSuccess(data.contract_hash);
        onClose();
      }, 1500);
    } catch {
      setError('No se pudo contactar al servidor. Intenta de nuevo.');
    } finally {
      setVerifying(false);
    }
  };

  const locked = remaining <= 0;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Firma Digital con Código OTP"
      maxWidth="max-w-md"
      // A stray backdrop tap mid-signature would discard a code the client
      // just received on their phone; the X and "Cancelar" are the exits.
      dismissOnBackdrop={false}
      panelClassName="p-6 sm:p-8"
    >
      <div>
        <div className="text-center mb-6 pr-12">
          <div className="w-14 h-14 bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-extrabold text-white">Firma Digital con Código OTP</h3>
          <p className="text-xs text-slate-400 mt-1">
            Te enviaremos un código de verificación de 6 dígitos a tu contacto registrado para
            confirmar tu firma.
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
              {channel === 'email'
                ? 'Código enviado a tu correo electrónico registrado. Si no lo ves, revisa tu carpeta de spam.'
                : channel === 'sms' || channel === 'whatsapp'
                  ? 'Código enviado a tu número celular registrado.'
                  : 'Código enviado a tu contacto registrado.'}
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="bg-rose-950/80 border border-rose-500/30 text-rose-400 rounded-2xl p-3.5 mb-5 flex items-center gap-2.5 text-xs font-semibold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successSeal ? (
          <div className="bg-emerald-950/80 border border-emerald-500/30 rounded-2xl p-4 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
            <p className="text-sm font-bold text-emerald-300">¡Firma Aceptada con Éxito!</p>
            <p className="text-[10px] font-mono text-emerald-400 truncate">
              Folio de evidencia: {successSeal.slice(0, 12)}
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
              <label htmlFor="otpsignaturemodal-ingresar-codigo-de-6" className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Ingresar Código de 6 dígitos
              </label>
              <input
                id="otpsignaturemodal-ingresar-codigo-de-6"
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
                disabled={sending || cooldown > 0}
                className="text-emerald-400 font-bold hover:underline flex items-center gap-1 disabled:opacity-50 disabled:no-underline"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar Código'}
                </span>
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
    </Modal>
  );
};
