'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { useOrganizationSettings } from '@/lib/hooks/useOrganizationSettings';
import { OrgProfileCard } from '@/components/settings/OrgProfileCard';
import { BankAccountsCard } from '@/components/settings/BankAccountsCard';
import { SubscriptionBillingCard } from '@/components/settings/SubscriptionBillingCard';
import { BrandingSettingsCard } from '@/components/settings/BrandingSettingsCard';
import { PacConnectionCard } from '@/components/settings/PacConnectionCard';
import { track } from '@/lib/analytics';
import { normalizeTierKey } from '@/lib/stripe';
import { ActionResultDialog, useActionResult } from '@/components/shared/ActionResultDialog';

function SettingsPageContent() {
  const {
    settings,
    role,
    hasBillingAccount,
    subscriptionStatusInfo,
    updateSettings,
    loading,
    saving,
    error,
  } = useOrganizationSettings();

  /**
   * The plan the visitor clicked before they got here.
   *
   * `/upgrade?plan=…` sends a signed-in owner to this page rather than to the
   * registration form the pricing CTAs used to link to, and the tier rides
   * along so the billing card can mark the one they asked for. Normalized
   * because the marketing pages sell `starter`/`pro`/`business` while the card
   * matches on the canonical ids; an unrecognised value marks nothing rather
   * than highlighting the nearest plan (the #95 shape).
   */
  const requestedTier = normalizeTierKey(useSearchParams().get('plan') || '');

  // PATCH /api/organization is scoped by owner_id, so offering the form to a
  // manager or member would let them submit into a guaranteed failure (#64's
  // corollary). They see the data read-only instead.
  const canEdit = role === 'owner';

  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const result = useActionResult();

  /**
   * Adapts the hook's outcome to the confirmation dialog while preserving the
   * cards' `Promise<boolean>` contract — they decide nothing about reporting.
   *
   * A save on this page used to confirm itself with a three-second inline
   * banner *above* the form, and failures only through the page-top banner —
   * both the #146 shape, on the page holding the CLABE payments settle to and
   * the RFC every CFDI is stamped with. The success text is generic on
   * purpose: the card re-renders from the row the server returned, so the
   * fields themselves show what was actually stored.
   */
  const saveWithConfirmation = async (
    patch: Partial<import('@/lib/hooks/useOrganizationSettings').OrganizationSettings>,
    what: string
  ): Promise<boolean> => {
    const outcome = await updateSettings(patch);
    if (outcome.ok) {
      result.succeed({ title: 'Cambios guardados', message: `${what} se guardaron correctamente.` });
    } else {
      result.fail(new Error(outcome.message || ''), { title: 'No se guardaron los cambios' });
    }
    return outcome.ok;
  };

  /**
   * Sends the owner to Stripe Checkout.
   *
   * This used to write `subscription_tier: tierId, subscription_status: 'active'`
   * locally before redirecting — and again as a fallback when the request
   * failed — so clicking "upgrade" granted a paid plan without any payment. The
   * tier is now set exclusively by the Stripe webhook, after Stripe confirms
   * the charge; a failure here surfaces as an error instead of a free upgrade.
   */
  const handleSelectTier = async (tierId: 'inicial' | 'negocio' | 'empresa') => {
    setCheckoutError(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId, returnUrl: window.location.href }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.url) {
        track('subscription_checkout_started', { tier_id: tierId });
        window.location.href = data.url;
        return;
      }

      setCheckoutError(
        data?.error?.message ||
          'No se pudo abrir el pago con Stripe. Intenta de nuevo en unos minutos.'
      );
    } catch {
      setCheckoutError('No se pudo conectar con el servicio de pagos. Intenta de nuevo.');
    }
  };

  /**
   * Sends the owner to the Stripe Billing Portal — where cancelling, changing
   * a card and downloading invoices actually happen (#346).
   *
   * Nothing local changes on the way out and nothing is assumed on the way
   * back: the redirect only happens on a URL Stripe issued, and any
   * cancellation made over there returns as `customer.subscription.deleted`
   * for the webhook to apply. The screen never writes the outcome itself.
   */
  const handleManageBilling = async () => {
    setCheckoutError(null);

    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.url) {
        track('billing_portal_opened', {});
        window.location.href = data.url;
        return;
      }

      setCheckoutError(
        data?.error?.message ||
          'No se pudo abrir la administración de tu suscripción. Intenta de nuevo en unos minutos.'
      );
    } catch {
      setCheckoutError('No se pudo conectar con el servicio de pagos. Intenta de nuevo.');
    }
  };

  return (
    <div className="min-h-screen pb-16">
      <Header title="Ajustes de Empresa y Suscripción" />

      <div className="px-4 py-6 md:px-8 space-y-8">
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl bg-slate-800/60" />
        ) : !settings ? (
          // Loading is over and there is no organization to show: say so
          // instead of rendering the demo tenant's data as if it were theirs.
          <div role="alert" className="p-6 rounded-3xl border border-rose-500/30 bg-rose-950/80 text-rose-200 text-sm font-medium">
            {error || 'No se pudo cargar la información de tu negocio. Intenta de nuevo más tarde.'}
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" className="p-4 rounded-2xl border border-rose-500/30 bg-rose-950/80 text-rose-300 text-sm font-medium">
                {error}
              </div>
            )}

            {/* Organization Profile Settings */}
            <OrgProfileCard
              settings={settings}
              onSave={(patch) => saveWithConfirmation(patch, 'Los datos de tu empresa')}
              saving={saving}
              canEdit={canEdit}
            />

            {/* SPEI Settlement Account */}
            <BankAccountsCard canEdit={canEdit} />

            {/* CFDI 4.0 stamping credentials. Both verbs on
                /api/organization/pac require billing_management, so this card
                takes the same gate as its siblings (#265). */}
            <PacConnectionCard canEdit={canEdit} />

            {/* White-Labeling & Branding Settings */}
            <BrandingSettingsCard
              settings={settings}
              // Names only what the request actually carries. "Tu logotipo y
              // marca" claimed the colour, lema and divisa were saved too —
              // none of which has a column (#288).
              onSave={(patch) => saveWithConfirmation(patch, 'Tu logotipo')}
              saving={saving}
              canEdit={canEdit}
            />

            {checkoutError && (
              <div role="alert" className="p-4 rounded-2xl border border-rose-500/30 bg-rose-950/80 text-rose-300 text-sm font-medium">
                {checkoutError}
              </div>
            )}

            {/* Stripe Subscription Billing */}
            <SubscriptionBillingCard
              settings={settings}
              statusInfo={subscriptionStatusInfo}
              onSelectTier={handleSelectTier}
              highlightTier={requestedTier}
              // Checkout requires `billing_management` (owner-only), so the
              // same gate the sibling cards use applies here (#266).
              canManageBilling={canEdit}
              // Tri-state: the portal control appears only for a tenant Stripe
              // actually knows, and not at all while that is unknown (#346).
              hasBillingAccount={hasBillingAccount}
              onManageBilling={handleManageBilling}
            />
          </>
        )}
      </div>

      <ActionResultDialog result={result.value} onClose={result.dismiss} />
    </div>
  );
}

/**
 * `useSearchParams` needs a Suspense boundary above it, the same shape the
 * register page uses for the params it prefills from.
 */
export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pb-16" />}>
      <SettingsPageContent />
    </Suspense>
  );
}
