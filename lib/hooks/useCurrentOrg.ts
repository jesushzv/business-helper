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

/**
 * Every role `organization_members.role` can hold.
 *
 * `accountant` was missing, so an accountant's role arrived and was mapped to
 * `null` — indistinguishable from "still loading" or "the read failed". That is
 * harmless while the only consumer is chrome, and stops being harmless the
 * moment a control is enabled or disabled by role (#123): a union narrower than
 * the column is #95's defect class.
 */
export type CurrentOrgRole = 'owner' | 'manager' | 'member' | 'accountant';

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
let pending: Promise<LoadResult | null> | null = null;

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

/**
 * Why the caller has no organization — but only when the API *said so*.
 * `unauthenticated` is a 401 UNAUTHENTICATED, `no_organization` a 403
 * NO_ORGANIZATION; anything else (network failure, 503 demo deployment, a
 * malformed body) stays `null` = unknown, because a redirect fired off a
 * network blip would throw a healthy tenant out of their dashboard (#64's
 * tri-state; #248 is the consumer).
 */
export type OrgDeniedReason = 'unauthenticated' | 'no_organization' | null;

interface LoadResult {
  state: CurrentOrgState | null;
  denied: OrgDeniedReason;
}

async function loadCurrentOrg(): Promise<LoadResult> {
  const res = await fetch('/api/organization');
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.organization) {
    const code = data?.error?.code;
    return {
      state: null,
      denied:
        res.status === 401 && code === 'UNAUTHENTICATED'
          ? 'unauthenticated'
          : res.status === 403 && code === 'NO_ORGANIZATION'
            ? 'no_organization'
            : null,
    };
  }

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
    state: {
      org: toCurrentOrg(data.organization),
      role:
        role === 'owner' || role === 'manager' || role === 'member' || role === 'accountant'
          ? role
          : null,
      user,
    },
    denied: null,
  };
}

export function useCurrentOrg() {
  const demo = isClientDemoMode();
  const [state, setState] = useState<CurrentOrgState | null>(demo ? DEMO_STATE : cached);
  const [denied, setDenied] = useState<OrgDeniedReason>(null);
  const [loading, setLoading] = useState<boolean>(!demo && !cached);

  useEffect(() => {
    if (demo || cached) return;
    let cancelled = false;

    pending = pending ?? loadCurrentOrg().catch(() => null);
    pending
      .then((loaded) => {
        if (loaded?.state) cached = loaded.state;
        if (!cancelled) {
          setState(loaded?.state ?? null);
          setDenied(loaded?.denied ?? null);
        }
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
    denied,
    loading,
    signOut,
  };
}
