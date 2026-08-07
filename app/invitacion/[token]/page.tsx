'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { Users, ArrowRight, AlertCircle, CheckCircle2, LogIn } from 'lucide-react';

/**
 * Where an invitation link lands.
 *
 * The team screen previously reported "Invitación enviada" for an invite that
 * had no record and no destination. This page is that destination: it posts the
 * token to `/api/organization/invitations/accept`, which writes the membership
 * row, and sends the person who is not signed in to log in first.
 */
type PageState = 'checking' | 'needs_login' | 'ready' | 'accepting' | 'accepted' | 'error';

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [state, setState] = useState<PageState>('checking');
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setError('Las invitaciones no están disponibles en esta instalación.');
          setState('error');
        }
        return;
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setState('needs_login');
        return;
      }

      setAccountEmail(user.email ?? null);
      setState('ready');
    };

    resolveSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const acceptInvitation = useCallback(async () => {
    setState('accepting');
    setError(null);

    try {
      const res = await fetch('/api/organization/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message || 'No se pudo aceptar la invitación.');
        setState('error');
        return;
      }

      setState('accepted');
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch {
      setError('No se pudo aceptar la invitación.');
      setState('error');
    }
  }, [token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-6">
          <span className="p-3 bg-indigo-950/80 text-indigo-300 rounded-2xl border border-indigo-500/30">
            <Users className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Invitación de equipo</h1>
            <p className="text-sm text-slate-400">Business Helper</p>
          </div>
        </div>

        {state === 'checking' && (
          <p className="text-sm text-slate-400">Verificando tu sesión…</p>
        )}

        {state === 'needs_login' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Inicia sesión con el correo al que te invitaron para unirte al equipo.
            </p>
            <Link
              href={`/login?next=/invitacion/${token}`}
              className="min-h-[48px] w-full px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              Iniciar sesión
            </Link>
            <p className="text-xs text-slate-500 text-center">
              ¿No tienes cuenta?{' '}
              <Link href="/register" className="text-emerald-400 font-semibold">
                Crear una cuenta
              </Link>
            </p>
          </div>
        )}

        {(state === 'ready' || state === 'accepting') && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Estás por unirte a una organización como colaborador
              {accountEmail ? ` con la cuenta ${accountEmail}` : ''}.
            </p>
            <button
              onClick={acceptInvitation}
              disabled={state === 'accepting'}
              className="min-h-[48px] w-full px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {state === 'accepting' ? 'Uniéndote…' : 'Aceptar invitación'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {state === 'accepted' && (
          <div className="p-4 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            Ya formas parte del equipo. Abriendo tu panel…
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-950/80 border border-rose-500/30 text-rose-300 rounded-xl text-sm font-medium flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              {error || 'No se pudo aceptar la invitación.'}
            </div>
            <Link
              href="/dashboard"
              className="min-h-[48px] w-full px-5 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 font-medium rounded-xl flex items-center justify-center"
            >
              Ir al panel
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
