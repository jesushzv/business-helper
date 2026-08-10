'use client';

import React from 'react';
import { Header } from '@/components/layout/Header';
import { useOrganizationSettings } from '@/lib/hooks/useOrganizationSettings';
import { OrgProfileCard } from '@/components/settings/OrgProfileCard';
import { BankAccountCard } from '@/components/settings/BankAccountCard';
import { SubscriptionBillingCard } from '@/components/settings/SubscriptionBillingCard';
import { BrandingSettingsCard } from '@/components/settings/BrandingSettingsCard';
import { PacConnectionCard } from '@/components/settings/PacConnectionCard';
import { track } from '@/lib/analytics';

export default function SettingsPage() {
  const { settings, role, subscriptionStatusInfo, updateSettings, loading, saving, error } =
    useOrganizationSettings();

  // PATCH /api/organization is scoped by owner_id, so offering the form to a
  // manager or member would let them submit into a guaranteed failure (#64's
  // corollary). They see the data read-only instead.
  const canEdit = role === 'owner';

  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);

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

  return (
    <div className="min-h-screen pb-16">
      <Header title="Ajustes de Empresa y Suscripción" />

      <div className="px-4 py-6 md:px-8 space-y-8">
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl bg-slate-800/60" />
        ) : !settings ? (
          // Loading is over and there is no organization to show: say so
          // instead of rendering the demo tenant's data as if it were theirs.
          <div className="p-6 rounded-3xl border border-rose-500/30 bg-rose-950/80 text-rose-200 text-sm font-medium">
            {error || 'No se pudo cargar la información de tu negocio. Intenta de nuevo más tarde.'}
          </div>
        ) : (
          <>
            {error && (
              <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-950/80 text-rose-300 text-sm font-medium">
                {error}
              </div>
            )}

            {/* Organization Profile Settings */}
            <OrgProfileCard
              settings={settings}
              onSave={updateSettings}
              saving={saving}
              canEdit={canEdit}
            />

            {/* SPEI Settlement Account */}
            <BankAccountCard />

            {/* CFDI 4.0 stamping credentials */}
            <PacConnectionCard />

            {/* White-Labeling & Branding Settings */}
            <BrandingSettingsCard
              settings={settings}
              onSave={updateSettings}
              saving={saving}
              canEdit={canEdit}
            />

            {checkoutError && (
              <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-950/80 text-rose-300 text-sm font-medium">
                {checkoutError}
              </div>
            )}

            {/* Stripe Subscription Billing */}
            <SubscriptionBillingCard
              settings={settings}
              statusInfo={subscriptionStatusInfo}
              onSelectTier={handleSelectTier}
            />
          </>
        )}
      </div>
    </div>
  );
}
