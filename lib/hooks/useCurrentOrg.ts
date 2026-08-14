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

/**
 * The chrome mounts on every dashboard page; one fetch serves them all.
 *
 * The cache used to be write-once: read on the first mount, cleared only by
 * `signOut`. So renaming the business in Ajustes saved, showed its success, and
 * changed nothing on screen for the rest of the SPA session — header, sidebar
 * badge and the greeting `buildClientGreeting()` signs outbound WhatsApp
 * messages with all kept the old name (#281). `cacheVersion` and the subscriber
 * set are what let a writer correct it: every mounted consumer of this hook is
 * notified, rather than each holding its own copy of a value that has moved on.
 */
let cached: CurrentOrgState | null = null;
let pending: Promise<LoadResult | null> | null = null;
let cacheVersion = 0;
const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  cacheVersion += 1;
  for (const notify of Array.from(subscribers)) notify();
}

/**
 * Writes a fresh `organizations` row into the shared chrome.
 *
 * The **server row**, never the values the form submitted: the route
 * normalizes (an RFC is upper-cased, a blank string becomes null), and
 * mirroring the request instead would put text on screen the database does not
 * hold — the honesty rule that `useOrganizationSettings` already follows for
 * its own state, extended to the copy the chrome reads.
 *
 * A no-op when nothing is cached yet: there is no consumer holding a stale
 * value, and the pending load will bring the same row.
 */
export function applyCurrentOrgRow(row: Record<string, unknown>): void {
  if (!cached) return;
  cached = { ...cached, org: toCurrentOrg(row) };
  notifySubscribers();
}

/**
 * Drops the cached identity so the next render reads it from the server again.
 *
 * For the writes that change *which* organization the caller resolves to — the
 * row itself is not in hand there, so re-reading is the only honest option.
 */
export function invalidateCurrentOrg(): void {
  cached = null;
  pending = null;
  notifySubscribers();
}

export function __resetCurrentOrgCacheForTests(): void {
  cached = null;
  pending = null;
  cacheVersion = 0;
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
  // Bumped by `applyCurrentOrgRow`/`invalidateCurrentOrg`. Held in state so a
  // correction re-renders every mounted consumer, and re-runs the load effect
  // below when the cache was dropped rather than replaced (#281).
  const [version, setVersion] = useState<number>(cacheVersion);

  useEffect(() => {
    if (demo) return;
    const onCacheChange = () => {
      setState(cached);
      setVersion(cacheVersion);
      // Neutral chrome, not the stale name, while the re-read is in flight.
      if (!cached) setLoading(true);
    };
    subscribers.add(onCacheChange);
    return () => {
      subscribers.delete(onCacheChange);
    };
  }, [demo]);

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
    // `version` is the dependency that makes an invalidation re-read: without
    // it this effect never runs again, which is the shape of #281 itself.
  }, [demo, version]);

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
