'use client';

import React from 'react';
import Link from 'next/link';
import { Landmark, AlertTriangle } from 'lucide-react';
import { useSettlementAccount } from '@/lib/hooks/useSettlementAccount';

/**
 * Persistent warning for an organization with no CLABE (#64).
 *
 * Two populations reach the dashboard without a settlement account, and neither
 * is ever asked again: organizations created before onboarding collected one,
 * and anyone who closed the tab between the step that creates the organization
 * and the step that saves the account.
 *
 * Deliberately not dismissable. The alternative considered was bouncing every
 * such login back to onboarding; that was rejected because only an owner can
 * save the account — the PATCH is scoped by `owner_id` — so a manager or member
 * would land in a redirect they could not exit. This warns everyone and points
 * only the owner at the form.
 */
export const SettlementAccountBanner: React.FC = () => {
  const { ready, loading, canFix } = useSettlementAccount();

  // Only a known-missing account warns. `null` means the read failed or has not
  // finished, and asserting a missing bank account on that basis would be
  // stating something the server never said.
  if (loading || ready !== false) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-500/30 bg-amber-950/80 px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-black text-amber-200">
              Falta tu cuenta de cobro: nadie puede pagarte todavía
            </p>
            <p className="mt-0.5 text-xs font-medium text-amber-100/80">
              {canFix
                ? 'Sin tu CLABE, los enlaces de pago que envíes no muestran a dónde depositar y tus recordatorios por WhatsApp no se envían.'
                : 'Pídele al propietario de la cuenta que registre la CLABE del negocio. Mientras tanto, los enlaces de pago no muestran a dónde depositar.'}
            </p>
          </div>
        </div>

        {/* Onboarding resumes straight at the account step when the
            organization already exists, so this link is the whole journey. */}
        {canFix && (
          <Link
            href="/onboarding"
            className="flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-black text-slate-950 shadow-lg shadow-amber-950/40 transition-all hover:bg-amber-400 active:scale-95"
          >
            <Landmark className="h-4 w-4" />
            <span>Agregar mi CLABE</span>
          </Link>
        )}
      </div>
    </div>
  );
};
