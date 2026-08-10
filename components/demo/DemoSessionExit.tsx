'use client';

import { useEffect } from 'react';
import { exitDemoMode, hasRuntimeDemoFlags } from '@/lib/demoUtils';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

/**
 * A real session ends the demo — retroactively.
 *
 * The sign-in pages clear the demo flags when they start a real sign-in, but
 * that leaves everyone whose flags predate that fix (or whose session was
 * created on another path) still carrying `business_helper_sandbox` in
 * localStorage, where it never expires: they signed in with Google and still
 * saw the sandbox dashboard. This mounts in the dashboard chrome and closes
 * that state: runtime demo flags alongside a live Supabase session mean the
 * flags lost — clear them and reload once so every hook re-reads
 * isClientDemoMode() and fetches the real tenant's data. The ?demo/?sandbox
 * params are stripped from the reload URL so it cannot re-plant the flags
 * (which would loop).
 *
 * No session, or the read failed → nothing happens: unknown is not
 * "signed in", and the marketing demo visitor keeps their tour.
 */
export function DemoSessionExit() {
  useEffect(() => {
    // The demo deployment, or a build-time demo: there is no real tenant to
    // exit into, and no session to ask about.
    if (!isSupabaseConfigured() || process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return;

    const params = new URLSearchParams(window.location.search);
    const urlWantsDemo = params.get('demo') === 'true' || params.get('sandbox') === 'true';
    if (!urlWantsDemo && !hasRuntimeDemoFlags()) return;

    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (cancelled || !data?.session) return;
        exitDemoMode();
        // Rebuilt from the current href, so the target is always same-origin
        // (a bare pathname could read as protocol-relative if it began "//").
        const url = new URL(window.location.href);
        url.searchParams.delete('demo');
        url.searchParams.delete('sandbox');
        window.location.replace(url.href);
      })
      .catch(() => {
        // Unknown is not "signed in" — leave the demo state alone.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
