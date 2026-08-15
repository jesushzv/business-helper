import { NextResponse } from 'next/server';
import { getHealthStatus } from '@/lib/health';

/**
 * Public liveness probe.
 *
 * It used to serve `auditReleaseGates()` alongside the real checks and fold
 * that report into `status` — six gates whose `passed: true` was a literal, with
 * invented metrics next to it (`'1.2s Load Time'`, `'0 Errors / 0 Warnings'`,
 * `'100% Vitest Suite Pass Rate'`). Nothing was measured. The coverage gate in
 * particular asserted a pass to the public internet while `CLAUDE.md` records
 * `npm run test:coverage` as failing on `main` and CI never running it (#317).
 *
 * So the module is gone rather than rewired. A release checklist is for the
 * founder and lives in `docs/STATUS.md`, where it can be honest about what is
 * unmeasured; a public JSON endpoint asserting it is hard rule #1 in its
 * cheapest disguise. What is left here is measured: whether this deployment
 * actually holds the Supabase URL and key it needs, which is precisely what
 * `.github/workflows/deployed-smoke.yml` reads.
 */
export async function GET() {
  return NextResponse.json(getHealthStatus());
}
