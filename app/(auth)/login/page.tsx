'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, Mail, ArrowRight, AlertCircle, Sparkles, Eye, EyeOff } from 'lucide-react';
import { exitDemoMode } from '@/lib/demoUtils';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { identifyPostHogUser } from '@/components/PostHogInit';
import { authErrorMessage } from '@/lib/errorCopy';
import { safeInternalPath } from '@/lib/url';

export default function LoginPage() {
  const router = useRouter();

  /**
   * An invitation link sends the invitee here with `?next=/invitacion/<token>`
   * so they land back on the invitation instead of a generic dashboard. Only a
   * same-site path is honored (`safeInternalPath`) — `//evil.example` and
   * absolute URLs are not — so the parameter cannot be used as an open
   * redirect. Read from `window.location` rather than `useSearchParams` to
   * keep this page statically renderable.
   */
  const resolveNext = (): string | null => {
    if (typeof window === 'undefined') return null;
    return safeInternalPath(new URLSearchParams(window.location.search).get('next'));
  };
  const resolveRedirect = (): string => resolveNext() ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // /auth/callback bounces back here with ?error=oauth when the code exchange
  // failed — without this, the user just sees the login form again with no
  // explanation of why their Google sign-in did not stick.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'oauth') {
      setError('No se pudo completar el inicio de sesión con Google. Intenta de nuevo o usa tu correo y contraseña.');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      // Phone + password sign-in was removed (#122): no account has a phone
      // identity, so the tab only ever rejected valid credentials.
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        // Not every failure is a wrong password (#247): "Email not confirmed"
        // means the password was *right*, and a rate limit means "stop
        // retrying" — telling either "contraseña incorrectos" sends the user
        // to reset a password that works. authErrorMessage carries the mapped
        // Spanish for both and keeps the anti-enumeration fallback generic.
        setError(authErrorMessage(authError, 'Correo o contraseña incorrectos. Por favor verifica tus datos.'));
        setLoading(false);
        return;
      }

      if (data.user) {
        const metadata = data.user.user_metadata ?? {};
        const name =
          typeof metadata.full_name === 'string'
            ? metadata.full_name
            : typeof metadata.name === 'string'
              ? metadata.name
              : undefined;

        identifyPostHogUser(data.user.id, {
          email: data.user.email ?? undefined,
          name,
        });
      }

      // The "Ver Demo" link below plants sandbox flags that never expire; a
      // real sign-in must clear them or the dashboard renders fixtures.
      exitDemoMode();
      router.push(resolveRedirect());
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
          Business Helper MX
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          Inicia Sesión
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Controla tus cotizaciones, cobranza y facturación en un solo lugar
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4">
        <div className="bg-slate-900/90 backdrop-blur-xl py-8 px-6 shadow-2xl rounded-3xl border border-slate-800 sm:px-10">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <GoogleAuthButton
            dividerLabel="o accede con tu cuenta"
            unavailableMessage="Por ahora no es posible entrar con Google. Usa tu correo y contraseña."
            failureMessage="No se pudo iniciar sesión con Google. Intenta con tu correo y contraseña."
            resolveNext={resolveNext}
            onError={setError}
          />

          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label htmlFor="page-correo-electronico" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="page-correo-electronico"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="don.roberto@negocio.mx"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="page-contrasena" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Contraseña
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="page-contrasena"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 min-h-[48px] py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                'Iniciando sesión...'
              ) : (
                <>
                  Entrar a mi Cuenta
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <Link
              href="/dashboard?demo=true"
              className="w-full flex justify-center items-center gap-2 min-h-[48px] py-3 px-4 border border-slate-800 rounded-xl text-sm font-bold text-slate-300 bg-slate-950 hover:bg-slate-900 hover:text-white transition-all"
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Ver Demo
            </Link>
          </form>

          <div className="mt-6 border-t border-slate-800 pt-6 text-center">
            <p className="text-xs text-slate-400">
              ¿No tienes una cuenta aún?{' '}
              <Link
                href="/register"
                className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Registra tu Negocio Gratis
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
