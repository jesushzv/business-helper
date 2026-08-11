'use client';

import { useState, useEffect } from 'react';
import { isClientDemoMode } from '../clientDemoMode';
import type { TrialState } from '../subscriptionTrial';

/**
 * The organization's trial, for the billing card (#128).
 *
 * `null` while unknown — still loading, the read failed, or the deployment has
 * no backend — and the card renders nothing at all in that case. A countdown is
 * a claim about the tenant's account; showing "quedan 30 días" because a fetch
 * failed would be the fabricated-success class with a friendly face.
 *
 * The demo deployment gets `null` too, for the same reason: an invented trial is
 * still invented.
 */
export function useTrialState(): { trial: TrialState | null; loading: boolean } {
  const demo = isClientDemoMode();
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [loading, setLoading] = useState(!demo);

  useEffect(() => {
    if (demo) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/organization/trial');
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        // 'unknown' is the server saying it could not tell; carry that through
        // as absence rather than rendering a state nobody is in.
        if (res.ok && data?.trial && data.trial.kind !== 'unknown') setTrial(data.trial);
      } catch {
        // Absence is the honest answer; the card omits the line.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demo]);

  return { trial, loading };
}
