'use client';

import { useState, useEffect, useCallback } from 'react';
import { STRIPE_PLANS, StripeTierConfig, validateSubscriptionStatus, SubscriptionStatusResult } from '../stripe';
import { isClientDemoMode } from '../clientDemoMode';

export interface OrganizationSettings {
  id: string;
  name: string;
  rfc: string;
  /** SAT régimen code ('601', '626', …), never the display label. */
  regimen_fiscal: string;
  codigo_postal: string;
  phone: string;
  logo_url: string | null;
  subscription_tier: 'inicial' | 'negocio' | 'empresa';
  subscription_status: 'active' | 'past_due' | 'canceled';
}

export type OrganizationRole = 'owner' | 'manager' | 'member';

// The demo tenant. Reachable ONLY behind isClientDemoMode() — this exact
// fixture used to be every real tenant's "own" fiscal identity (#95).
const DEMO_SETTINGS: OrganizationSettings = {
  id: 'org-demo-1',
  name: 'Distribuidora del Norte',
  rfc: 'DNO850101HD9',
  regimen_fiscal: '601',
  codigo_postal: '64000',
  phone: '8115551234',
  logo_url: null,
  subscription_tier: 'negocio',
  subscription_status: 'active',
};

/**
 * Old settings display-strings ('601 — General de Ley Personas Morales') and
 * server codes ('601') both reduce to the SAT code; anything else is absent.
 */
export function normalizeRegimenCode(value: unknown): string {
  const match = /^(\d{3})/.exec(typeof value === 'string' ? value.trim() : '');
  return match ? match[1] : '';
}

/**
 * Flattens a server organizations row into the settings shape. Exported and
 * tested on its own: the previous hook assigned nothing at all — the interface
 * was only ever satisfied by the demo fixture (the #78 lesson).
 */
export function toOrganizationSettings(row: Record<string, unknown>): OrganizationSettings {
  const tier = row.subscription_tier;
  const status = row.subscription_status;
  return {
    id: typeof row.id === 'string' ? row.id : '',
    name: typeof row.name === 'string' ? row.name : '',
    rfc: typeof row.rfc === 'string' ? row.rfc : '',
    regimen_fiscal: normalizeRegimenCode(row.regimen_fiscal),
    codigo_postal: typeof row.codigo_postal === 'string' ? row.codigo_postal : '',
    phone: typeof row.phone === 'string' ? row.phone : '',
    logo_url: typeof row.logo_url === 'string' && row.logo_url ? row.logo_url : null,
    subscription_tier: tier === 'negocio' || tier === 'empresa' ? tier : 'inicial',
    subscription_status: status === 'past_due' || status === 'canceled' ? status : 'active',
  };
}

/**
 * The organization's own settings, read from and written to the server.
 *
 * History (#95): this hook used to seed the demo tenant into localStorage for
 * every visitor, never call GET /api/organization, and save with a PUT the
 * route does not implement — swallowing the rejection and returning `true`, so
 * "guardado correctamente" showed for a write that has never once succeeded.
 *
 * `settings` is `null` until the server answers (or demo mode short-circuits):
 * an unknown organization must render as loading, never as the demo tenant.
 */
export function useOrganizationSettings() {
  const demo = isClientDemoMode();
  const [settings, setSettings] = useState<OrganizationSettings | null>(demo ? DEMO_SETTINGS : null);
  const [role, setRole] = useState<OrganizationRole | null>(demo ? 'owner' : null);
  const [loading, setLoading] = useState<boolean>(!demo);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/organization');
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !data?.organization) {
          setError(data?.error?.message || 'No se pudo cargar la información de tu negocio.');
          return;
        }

        setSettings(toOrganizationSettings(data.organization));
        const serverRole = data.role;
        setRole(
          serverRole === 'owner' || serverRole === 'manager' || serverRole === 'member'
            ? serverRole
            : null
        );
      } catch {
        if (!cancelled) setError('No se pudo cargar la información de tu negocio.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demo]);

  const updateSettings = useCallback(
    async (patch: Partial<OrganizationSettings>): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        if (demo) {
          // Simulated on purpose and only here: the demo deployment has no
          // backend to save to, and this branch is unreachable for a real tenant.
          setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
          return true;
        }

        const res = await fetch('/api/organization', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          // Undefined fields drop out of the JSON body, so a profile save and a
          // logo save each send only what they mean to change.
          body: JSON.stringify({
            name: patch.name,
            rfc: patch.rfc,
            regimenFiscal: patch.regimen_fiscal,
            codigoPostal: patch.codigo_postal,
            phone: patch.phone,
            logoUrl: patch.logo_url,
          }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.organization) {
          setError(data?.error?.message || 'No se pudieron guardar los datos de tu negocio.');
          return false;
        }

        // The server row is the truth; local state only ever mirrors it.
        setSettings(toOrganizationSettings(data.organization));
        return true;
      } catch {
        setError('No se pudieron guardar los datos de tu negocio.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [demo]
  );

  const currentTierConfig: StripeTierConfig =
    STRIPE_PLANS[settings?.subscription_tier ?? 'inicial'] || STRIPE_PLANS.inicial;
  const subscriptionStatusInfo: SubscriptionStatusResult = validateSubscriptionStatus(
    settings?.subscription_status ?? 'active'
  );

  return {
    settings,
    role,
    currentTierConfig,
    subscriptionStatusInfo,
    loading,
    saving,
    error,
    updateSettings,
  };
}
