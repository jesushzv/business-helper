'use client';

import { useEffect, useState } from 'react';
import {
  fetchOAuthProviderEnabled,
  type OAuthProvider,
  type ProviderAvailability,
} from '@/lib/authProviders';

/**
 * Whether a third-party sign-in button should be offered at all (#48).
 *
 * Starts at `null` (unknown) and stays there until the Auth server answers, so
 * the first paint never claims a provider is missing. See
 * `lib/authProviders.ts` for why `null` resolves permissively and why the check
 * cannot be skipped in the click handler even when this returns `true`.
 */
export function useOAuthProviderEnabled(provider: OAuthProvider): ProviderAvailability {
  const [enabled, setEnabled] = useState<ProviderAvailability>(null);

  useEffect(() => {
    let cancelled = false;

    fetchOAuthProviderEnabled(provider)
      .then((value) => {
        if (!cancelled) setEnabled(value);
      })
      .catch(() => {
        if (!cancelled) setEnabled(null);
      });

    return () => {
      cancelled = true;
    };
  }, [provider]);

  return enabled;
}
