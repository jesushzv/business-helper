'use client';

import { useState, useEffect, useCallback } from 'react';
import { identifyPostHogUser, resetPostHogUser } from '@/components/PostHogInit';
import { isClientDemoMode } from '../clientDemoMode';
import { createClient, isSupabaseConfigured } from '../supabase/client';

/**
 * The signed-in tenant's identity for the app chrome: org name/RFC for the
 * sidebar and header, the user's own name for the greeting, and sign-out.
 *
 * Before this hook existed, Header, AppShell, the dashboard greeting and the
 * outbound WhatsApp builders all hardcoded the demo persona — every real
 * tenant was "Don Roberto" of "Distribuidora del Norte", including in messages
 * their clients received (#93).
 *
 * Absence is honest here: while the org is unknown (loading or failed) the
 * consumers render neutral chrome, never the demo identity. Demo strings are
 * reachable only behind isClientDemoMode().
 */

export interface CurrentOrg {
  id: string;
  name: string;
  rfc: string | null;
  logo_url: string | null;
  subscription_tier: 'inicial' | 'negocio' | 'empresa' | null;
}

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string | null;
}

export type CurrentOrgRole = 'owner' | 'manager' | 'member';

interface CurrentOrgState {
  org: CurrentOrg | null;
  role: CurrentOrgRole | null;
  user: CurrentUser | null;
}

const DEMO_STATE: CurrentOrgState = {
  org: {
    id: 'org-demo-1',
    name: 'Distribuidora del Norte',
    rfc: 'DNO850101HD9',
    logo_url: null,
    subscription_tier: 'negocio',
  },
  role: 'owner',
  user: { id: 'user-demo-1', name: 'Don Roberto', email: null },
};

// The chrome mounts on every dashboard page; one fetch serves them all.
let cached: CurrentOrgState | null = null;
let pending: Promise<CurrentOrgState | null> | null = null;

export function __resetCurrentOrgCacheForTests(): void {
  cached = null;
  pending = null;
}

function toCurrentOrg(row: Record<string, unknown>): CurrentOrg {
  const tier = row.subscription_tier;
  return {
    id: typeof row.id === 'string' ? row.id : '',
    name: typeof row.name === 'string' ? row.name : '',
    rfc: typeof row.rfc === 'string' && row.rfc ? row.rfc : null,
    logo_url: typeof row.logo_url === 'string' && row.logo_url ? row.logo_url : null,
    subscription_tier:
      tier === 'inicial' || tier === 'negocio' || tier === 'empresa' ? tier : null,
  };
}

async function loadCurrentOrg(): Promise<CurrentOrgState | null> {
  const res = await fetch('/api/organization');
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.organization) return null;

  let user: CurrentUser | null = null;
  if (isSupabaseConfigured()) {
    try {
      const { data: auth } = await createClient().auth.getUser();
      if (auth?.user) {
        const meta = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
        const name =
          (typeof meta.full_name === 'string' && meta.full_name) ||
          (typeof meta.name === 'string' && meta.name) ||
          null;
        user = { id: auth.user.id, name, email: auth.user.email ?? null };
      }
    } catch {
      // The org still renders; only the personal greeting degrades.
    }
  }

  const role = data.role;
  return {
    org: toCurrentOrg(data.organization),
    role: role === 'owner' || role === 'manager' || role === 'member' ? role : null,
    user,
  };
}

export function useCurrentOrg() {
  const demo = isClientDemoMode();
  const [state, setState] = useState<CurrentOrgState | null>(demo ? DEMO_STATE : cached);
  const [loading, setLoading] = useState<boolean>(!demo && !cached);

  useEffect(() => {
    if (demo || cached) return;
    let cancelled = false;

    pending = pending ?? loadCurrentOrg().catch(() => null);
    pending
      .then((loaded) => {
        if (loaded) cached = loaded;
        if (!cancelled) setState(loaded);
      })
      .finally(() => {
        pending = null;
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [demo]);

  useEffect(() => {
    if (!demo && state?.user) {
      identifyPostHogUser(state.user.id, {
        email: state.user.email ?? undefined,
        name: state.user.name ?? undefined,
      });
    }
  }, [demo, state?.user]);

  const signOut = useCallback(async () => {
    try {
      if (!demo && isSupabaseConfigured()) {
        resetPostHogUser();
        await createClient().auth.signOut();
      }
    } finally {
      cached = null;
      window.location.href = '/';
    }
  }, [demo]);

  return {
    org: state?.org ?? null,
    role: state?.role ?? null,
    user: state?.user ?? null,
    loading,
    signOut,
  };
}
