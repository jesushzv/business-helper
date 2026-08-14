'use client';

import React from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchOAuthProviderEnabled } from '@/lib/authProviders';
import { exitDemoMode } from '@/lib/demoUtils';
import { useOAuthProviderEnabled } from '@/lib/hooks/useOAuthProvider';

interface GoogleAuthButtonProps {
  /** Caption under the button: 'o accede con tu cuenta' / 'o completa tus datos'. */
  dividerLabel: string;
  /** Shown when the Auth server reports the provider disabled. */
  unavailableMessage: string;
  /** Shown when signInWithOAuth reports an error it *can* report. */
  failureMessage: string;
  /**
   * Sanitized internal path to carry through the provider round-trip, resolved
   * at click time (#249). Return null for the default landing.
   */
  resolveNext?: () => string | null;
  /** Receives the failure copy for the page's error banner; null clears it. */
  onError: (message: string | null) => void;
}

/**
 * The "Continuar con Google" button shared by the login and register pages —
 * extracted because the two copies had already drifted in comment wording, and
 * the #48 availability reasoning must not fork.
 *
 * Hidden outright when the Auth server has said it will not accept Google
 * (#48); `null` (unknown) keeps it, because hiding a working sign-in on a
 * failed read would lock out anyone whose only account is a Google one.
 */
export function GoogleAuthButton({
  dividerLabel,
  unavailableMessage,
  failureMessage,
  resolveNext,
  onError,
}: GoogleAuthButtonProps) {
  const googleEnabled = useOAuthProviderEnabled('google');

  const handleClick = async () => {
    onError(null);

    /**
     * Ask before navigating. `signInWithOAuth` assigns `window.location` and
     * returns `error: null` unconditionally, so a disabled provider is never
     * reported back here — the browser simply leaves for GoTrue's raw English
     * JSON error on a supabase.co origin (#48). Once we navigate there is no
     * message we can show, which is why this check happens first.
     *
     * `googleEnabled` is already known in the common case; the fallback read
     * covers the window before the hook has answered, and the `null` (unknown)
     * result proceeds rather than blocking.
     */
    const available = googleEnabled ?? (await fetchOAuthProviderEnabled('google'));
    if (available === false) {
      onError(unavailableMessage);
      return;
    }

    try {
      // Clear the demo flags before the browser leaves for Google — they never
      // expire, and there is no client-side moment after the redirect where
      // this could run before the dashboard reads them.
      exitDemoMode();
      const supabase = createClient();
      // The caller's `next` (an invitation, say) has to ride through the
      // provider round-trip inside redirectTo, or the sign-in silently drops
      // it and the user lands on a generic dashboard (#249).
      const next = resolveNext?.() ?? null;
      // Kept as a guard for errors the SDK *can* report (a failure to persist
      // the PKCE verifier, say). It cannot fire for a disabled provider.
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback${
            next ? `?next=${encodeURIComponent(next)}` : ''
          }`,
        },
      });

      if (authError) {
        onError(failureMessage);
      }
    } catch {
      onError('Ocurrió un error al conectar con Google.');
    }
  };

  if (googleEnabled === false) {
    return null;
  }

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={handleClick}
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
          <span className="bg-slate-900 px-3 text-slate-400 font-medium">{dividerLabel}</span>
        </div>
      </div>
    </div>
  );
}
