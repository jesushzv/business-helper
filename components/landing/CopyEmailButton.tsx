'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, AlertTriangle } from 'lucide-react';

/**
 * Copy-an-email-address button.
 *
 * The contact CTAs are `mailto:` links, and on a device with no mail handler
 * configured (very common on desktop browsers) clicking one does nothing
 * visible. This button is the fallback that always works: it puts the address
 * on the clipboard so the visitor can paste it into whatever mail client they
 * actually use.
 *
 * The label only says "Copiado" after the copy really happened — a failed
 * copy says so instead of pretending (hard rule #1).
 */

type CopyState = 'idle' | 'copied' | 'failed';

interface CopyEmailButtonProps {
  email: string;
  className?: string;
}

const RESET_AFTER_MS = 2500;

function copyViaExecCommand(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function CopyEmailButton({ email, className = '' }: CopyEmailButtonProps) {
  const [state, setState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(email);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = copyViaExecCommand(email);
    }

    setState(copied ? 'copied' : 'failed');
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState('idle'), RESET_AFTER_MS);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copiar correo ${email}`}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white text-xs font-bold transition-colors active:scale-95 shrink-0 ${className}`}
    >
      {state === 'copied' ? (
        <Check className="w-4 h-4 text-emerald-400" />
      ) : state === 'failed' ? (
        <AlertTriangle className="w-4 h-4 text-amber-400" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
      <span>
        {state === 'copied' ? 'Copiado' : state === 'failed' ? 'No se pudo copiar' : 'Copiar'}
      </span>
    </button>
  );
}
