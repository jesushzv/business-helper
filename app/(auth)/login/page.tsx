'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, Mail, ArrowRight, AlertCircle, Sparkles, Eye, EyeOff, Phone } from 'lucide-react';
import { validatePhone } from '@/lib/phoneValidator';

export default function LoginPage() {
  const router = useRouter();

  /**
   * An invitation link sends the invitee here with `?next=/invitacion/<token>`
   * so they land back on the invitation instead of a generic dashboard. Only a
   * same-site path is honored — `//evil.example` and absolute URLs are not —
   * so the parameter cannot be used as an open redirect. Read from
   * `window.location` rather than `useSearchParams` to keep this page
   * statically renderable.
   */
  const resolveRedirect = (): string => {
    if (typeof window === 'undefined') return '/dashboard';
    const next = new URLSearchParams(window.location.search).get('next');
    return next && /^\/[^/\\]/.test(next) ? next : '/dashboard';
  };
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneResult = phone ? validatePhone(phone) : { isValid: false, phone: '' };

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

    if (loginMethod === 'phone' && !phoneResult.isValid) {
      setError('Por favor ingresa un número telefónico válido de 10 dígitos.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = loginMethod === 'email'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signInWithPassword({ phone: phoneResult.phone, password });

      if (authError) {
        setError('Correo, teléfono o contraseña incorrectos. Por favor verifica tus datos.');
        setLoading(false);
        return;
      }

      router.push(resolveRedirect());
    } catch {
      setError('Ocurrió un error al conectar con el servidor. Intenta de nuevo.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError('No se pudo iniciar sesión con Google. Intenta con tu correo o teléfono.');
      }
    } catch {
      setError('Ocurrió un error al conectar con Google.');
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

          {/* Social Login Button */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 min-h-[48px] py-3 px-4 bg-slate-950 hover:bg-slate-800/80 border border-slate-700/80 rounded-xl text-sm font-semibold text-slate-200 transition-all hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Continuar con Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-3 text-slate-400 font-medium">o accede con tu cuenta</span>
              </div>
            </div>
          </div>

          {/* Email / Phone Method Selector */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => setLoginMethod('email')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all min-h-[40px] ${
                loginMethod === 'email'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Correo Electrónico
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('phone')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all min-h-[40px] ${
                loginMethod === 'phone'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Teléfono / WhatsApp
            </button>
          </div>

          <form className="space-y-6" onSubmit={handleLogin}>
            {loginMethod === 'email' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="don.roberto@negocio.mx"
                    className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Teléfono Móvil (10 dígitos)
                  </label>
                  {phone && (
                    <span className={`text-[10px] font-bold ${phoneResult.isValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {phoneResult.isValid ? '✓ 10 dígitos' : 'Inválido'}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Phone className="w-5 h-5" />
                  </div>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="8112345678"
                    className="block w-full pl-11 pr-4 py-3 min-h-[48px] bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
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
