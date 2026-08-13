'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, ArrowRight, AlertCircle, Sparkles, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { authErrorMessage } from '@/lib/errorCopy';
import { exitDemoMode } from '@/lib/demoUtils';

/**
 * Where the recovery email's link lands (#245). The link carries a one-time
 * code; the browser client exchanges it for a session on load, and this page
 * then lets the person set a new password with `updateUser`. Until this page
 * existed, `/forgot-password` sent a link into a 404 — a truthful "¡Correo
 * Enviado!" in front of a recovery that could never complete.
 *
 * `linkState` is the #64 tri-state: `null` = still verifying (the exchange is
 * async — claiming "expired" on first paint would be inventing a fact),
 * `'valid'` = a session exists and the form may submit, `'invalid'` = GoTrue
 * reported an error in the URL or finished initializing with no session (the
 * code was consumed or expired, or the email was opened in a different browser
 * than the one that requested it — the PKCE verifier lives client-side).
 */
type LinkState = null | 'valid' | 'invalid';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [linkState, setLinkState] = useState<LinkState>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // An expired or reused link never reaches the code exchange: GoTrue
    // reports it in the redirect itself (`?error_code=otp_expired`, or the
    // same keys in the fragment).
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (query.get('error') || query.get('error_code') || hash.get('error') || hash.get('error_description')) {
      setLinkState('invalid');
      return;
    }

    const supabase = createClient();

    // The client exchanges the link's ?code= during initialization and then
    // emits INITIAL_SESSION (with the recovery session, or without one if the
    // exchange failed or there was nothing to exchange). Waiting for that
    // event — rather than a one-shot getSession(), which can answer before
    // the exchange settles — is what keeps "invalid" an observed fact.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setLinkState('valid');
      } else if (event === 'INITIAL_SESSION') {
        setLinkState('invalid');
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Escríbelas de nuevo.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(authErrorMessage(updateError, 'No pudimos cambiar tu contraseña. Intenta de nuevo.'));
        setLoading(false);
        return;
      }

      // The recovery session is a real sign-in — demo-browsing flags must not
      // survive it or the dashboard renders fixtures.
      exitDemoMode();
      router.push('/dashboard');
    } catch {
      setError('Ocurrió un error al conectar con el servidor. Intenta de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10 text-center px-4">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 text-indigo-400 px-3.5 py-1.5 rounded-full border border-indigo-500/20 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Recuperación de Cuenta
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          Crea tu Nueva Contraseña
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Elige una contraseña nueva para volver a entrar a tu cuenta.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-3xl border border-slate-800 sm:px-10">
          {linkState === null && (
            <p className="text-center text-sm text-slate-400 py-4">Verificando tu enlace...</p>
          )}

          {linkState === 'invalid' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto text-rose-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white">Este Enlace ya no Sirve</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                El enlace venció o ya fue usado. También pasa si lo abres en otro navegador o
                dispositivo distinto al que usaste para pedirlo. Solicita uno nuevo y ábrelo desde
                el mismo navegador.
              </p>
              <div className="pt-4 space-y-3">
                <Link
                  href="/forgot-password"
                  className="w-full flex justify-center items-center gap-2 min-h-[48px] py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all"
                >
                  Solicitar un Enlace Nuevo
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="w-full flex justify-center items-center gap-2 min-h-[48px] py-3 px-4 border border-slate-800 rounded-xl text-sm font-bold text-slate-200 bg-slate-950 hover:bg-slate-900 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Volver a Iniciar Sesión
                </Link>
              </div>
            </div>
          )}

          {linkState === 'valid' && (
            <>
              {error && (
                <div
                  role="alert"
                  className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form className="space-y-6" onSubmit={handleUpdatePassword}>
                <div>
                  <label htmlFor="page-nueva-contrasena" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      id="page-nueva-contrasena"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="block w-full pl-11 pr-12 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors focus:outline-none min-h-[48px] px-2"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="page-confirmar-contrasena" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Confirma tu Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      id="page-confirmar-contrasena"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Escríbela otra vez"
                      className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 min-h-[48px] py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    'Guardando contraseña...'
                  ) : (
                    <>
                      Guardar y Entrar a mi Cuenta
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
