import { describe, it, expect } from 'vitest';
import { auditReleaseGates } from '@/lib/releaseGates';

describe('MVP Beta Release Gates Auditor', () => {
  it('reports all six gates, which /api/health folds into its status', () => {
    const audit = auditReleaseGates();
    const gateKeys = Object.keys(audit.gates);

    expect(gateKeys).toEqual([
      'dataIsolation',
      'mobilePerformance',
      'coverage',
      'zeroWarning',
      'otpSecurity',
      'fileSecurity',
    ]);
    expect(audit.totalGates).toBe(6);
  });

  it('derives allPassed and the passed count from the gates themselves', () => {
    const audit = auditReleaseGates();
    const passed = Object.values(audit.gates).filter((gate) => gate.passed);

    expect(audit.passedGatesCount).toBe(passed.length);
    expect(audit.allPassed).toBe(passed.length === audit.totalGates);
  });

  it('describes every gate with a metric and a target', () => {
    for (const gate of Object.values(auditReleaseGates().gates)) {
      expect(gate.name.length).toBeGreaterThan(0);
      expect(gate.description.length).toBeGreaterThan(0);
      expect(gate.metric.length).toBeGreaterThan(0);
      expect(gate.target.length).toBeGreaterThan(0);
    }
  });
});
