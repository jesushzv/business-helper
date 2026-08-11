import { NextResponse } from 'next/server';
import { requireOrgAccess, isDemoDeployment } from '@/lib/apiAuth';
import { readOrganizationTrialState } from '@/lib/organizationTrialGate';

/**
 * The organization's trial state (#128).
 *
 * Its own route rather than three more columns on `GET /api/organization`, and
 * the reason is deploy ordering. That route's `select` is an explicit column
 * list, and PostgREST fails the *whole* request when one of them does not exist
 * — so adding `trial_ends_at` there would take the entire dashboard chrome down
 * for every tenant in any window where the deploy outran the migration. Vercel
 * auto-deploys `main` and migrations are applied by hand, so that window is
 * real (hard rule #6).
 *
 * Here the same failure costs one line on the billing card: the read is
 * swallowed into `kind: 'unknown'`, which renders nothing and gates nothing.
 */
export async function GET() {
  if (isDemoDeployment()) {
    // A marketing demo has no subscription to report. Absent, not invented.
    return NextResponse.json({
      trial: { kind: 'unknown', daysLeft: null, endsAt: null, blocksNewWork: false, gateEnforced: false },
    });
  }

  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  const trial = await readOrganizationTrialState(supabase, organizationId);
  return NextResponse.json({ trial });
}
