'use client';

import { useState, useEffect, useCallback } from 'react';
import { STRIPE_PLANS, StripeTierConfig, validateSubscriptionStatus, SubscriptionStatusResult } from '../stripe';

export interface OrganizationSettings {
  id: string;
  name: string;
  rfc: string;
  regimen_fiscal: string;
  codigo_postal: string;
  phone: string;
  logo_url: string | null;
  subscription_tier: 'emprendedor' | 'negocio' | 'empresa';
  subscription_status: 'active' | 'past_due' | 'canceled';
}

const DEFAULT_SETTINGS: OrganizationSettings = {
  id: 'org-demo-1',
  name: 'Distribuidora del Norte',
  rfc: 'DNO850101HD9',
  regimen_fiscal: '601 — General de Ley Personas Morales',
  codigo_postal: '64000',
  phone: '8115551234',
  logo_url: null,
  subscription_tier: 'negocio',
  subscription_status: 'active',
};

const LOCAL_STORAGE_KEY = 'business_helper_org_settings_v1';

export function useOrganizationSettings() {
  const [settings, setSettings] = useState<OrganizationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Initialize settings from localStorage or API
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setSettings(JSON.parse(stored));
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      }
    } catch {
      // Fallback to default
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<OrganizationSettings>) => {
    try {
      setSaving(true);
      setError(null);

      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

      // Attempt API sync if connected
      await fetch('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }).catch(() => {});

      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al guardar los ajustes';
      setError(errorMessage);
      return false;
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const currentTierConfig: StripeTierConfig = STRIPE_PLANS[settings.subscription_tier] || STRIPE_PLANS.negocio;
  const subscriptionStatusInfo: SubscriptionStatusResult = validateSubscriptionStatus(settings.subscription_status);

  return {
    settings,
    currentTierConfig,
    subscriptionStatusInfo,
    loading,
    saving,
    error,
    updateSettings,
  };
}
