import { NextResponse } from 'next/server';
import { auditReleaseGates } from '@/lib/releaseGates';
import { getHealthStatus } from '@/lib/health';

export async function GET() {
  const auditReport = auditReleaseGates();
  const baseHealth = getHealthStatus();

  return NextResponse.json({
    ...baseHealth,
    status: auditReport.allPassed && baseHealth.status === 'healthy' ? 'healthy' : 'degraded',
    releaseGates: auditReport,
  });
}
