import { NextResponse } from 'next/server';
import { auditReleaseGates } from '@/lib/releaseGates';

export async function GET() {
  const auditReport = auditReleaseGates();

  return NextResponse.json({
    status: auditReport.allPassed ? 'healthy' : 'degraded',
    version: '0.1.0-beta',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    releaseGates: auditReport,
  });
}
