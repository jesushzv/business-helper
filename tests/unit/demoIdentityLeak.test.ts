import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #93 — the demo persona must never reach a real tenant's screen or their
 * clients' messages. "Don Roberto" / "Distribuidora del Norte" were hardcoded
 * into the header, sidebar, dashboard greeting and three outbound WhatsApp
 * builders, so every tenant's app — and their clients' chats — carried another
 * company's identity.
 *
 * This scans for the identity strings themselves. Files where they are
 * legitimate (demo fixtures behind isClientDemoMode()/isDemoDeployment()/
 * isServiceRoleConfigured(), and form-placeholder examples) are allowlisted
 * one by one; everything else must not mention them in code. Comment lines are
 * skipped — history lives in comments on purpose.
 */

const IDENTITY_STRINGS = ['Distribuidora del Norte', 'Don Roberto', 'DNO850101'];

// Each entry was verified by hand: the string sits behind a demo gate or in an
// <input placeholder> example a tenant types over.
const ALLOWED = new Set([
  'lib/demoUtils.ts', // the demo dataset itself
  'lib/hooks/useOrganizationSettings.ts', // DEMO_SETTINGS behind isClientDemoMode()
  'lib/hooks/useCurrentOrg.ts', // DEMO_STATE behind isClientDemoMode()
  'app/api/organization/route.ts', // demo org behind isDemoDeployment()
  'app/api/receivables/public/[token]/route.ts', // DEMO_MILESTONE behind !isServiceRoleConfigured()
  'components/demo/DemoBanner.tsx', // renders only on the demo deployment, and says so
  'app/onboarding/page.tsx', // placeholder= examples
]);

const ROOTS = ['app', 'components', 'lib'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('demo identity stays behind the demo gate (#93)', () => {
  it('no tenant-facing module mentions the demo persona outside the allowlist', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const rel = file.replace(process.cwd() + '/', '');
        if (ALLOWED.has(rel)) continue;

        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          const trimmed = line.trim();
          // Comments may narrate the defect's history; only code counts.
          if (
            trimmed.startsWith('//') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('{/*')
          ) {
            return;
          }
          for (const needle of IDENTITY_STRINGS) {
            if (line.includes(needle)) {
              offenders.push(`${rel}:${i + 1} contains "${needle}": ${trimmed}`);
            }
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the allowlist only names files that still exist and still need the exemption', () => {
    // A stale allowlist entry is a hole the next regression walks through.
    for (const rel of ALLOWED) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(
        IDENTITY_STRINGS.some((needle) => source.includes(needle)),
        `${rel} is allowlisted but no longer mentions the demo identity — remove it`
      ).toBe(true);
    }
  });
});
