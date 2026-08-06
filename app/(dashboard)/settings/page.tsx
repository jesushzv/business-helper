'use client';

import React from 'react';
import { Header } from '@/components/layout/Header';
import { useOrganizationSettings } from '@/lib/hooks/useOrganizationSettings';
import { OrgProfileCard } from '@/components/settings/OrgProfileCard';
import { SubscriptionBillingCard } from '@/components/settings/SubscriptionBillingCard';
import { BrandingSettingsCard } from '@/components/settings/BrandingSettingsCard';

export default function SettingsPage() {
  const { settings, subscriptionStatusInfo, updateSettings, loading, saving } = useOrganizationSettings();

  const handleSelectTier = async (tierId: 'inicial' | 'negocio' | 'empresa') => {
    // Initiate Stripe checkout via API or update settings
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId, returnUrl: window.location.href }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          // Update local tier selection
          await updateSettings({ subscription_tier: tierId, subscription_status: 'active' });
          window.location.href = data.url;
          return;
        }
      }
    } catch {
      // Fallback update
    }

    await updateSettings({ subscription_tier: tierId, subscription_status: 'active' });
  };

  return (
    <div className="min-h-screen pb-16">
      <Header title="Ajustes de Empresa y Suscripción" />

      <div className="px-4 py-6 md:px-8 space-y-8">
        {loading ? (
          <div className="h-64 w-full animate-pulse rounded-3xl bg-gray-100" />
        ) : (
          <>
            {/* Organization Profile Settings */}
            <OrgProfileCard settings={settings} onSave={updateSettings} saving={saving} />

            {/* White-Labeling & Branding Settings */}
            <BrandingSettingsCard settings={settings} onSave={updateSettings} saving={saving} />

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
