import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `/api/health` serves only facts it measured (#317).
 *
 * The endpoint used to fold `auditReleaseGates()` into its `status` and serve
 * the whole report publicly: six gates, every `passed` a literal `true`, with
 * metrics nobody computed — `'1.2s Load Time'`, `'100% Vitest Suite Pass
 * Rate'`, `'0 Errors / 0 Warnings'`. The coverage gate asserted a pass while
 * the repo's own operating doc records `npm run test:coverage` as failing on
 * `main`. That is hard rule #1 on a live endpoint rather than in a script —
 * the same class as `verify:webhook` (#63) and `verify:otp` (#118).
 *
 * Two of the three assertions below are assertions of *absence*, so per hard
 * rule #7 each was shown to fail before being committed: restoring
 * `lib/releaseGates.ts` and its import turned the scan red, and re-adding
 * `releaseGates: auditReport` to the response turned the payload test red.
 */

const ROOT = join(__dirname, '..', '..');
const HEALTH_ROUTE = join(ROOT, 'app', 'api', 'health', 'route.ts');

describe('/api/health serves measured facts only (#317)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers with the environment-derived payload and nothing else', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon_key');

    const { GET } = await import('@/app/api/health/route');
    const body = await (await GET()).json();

    // Every key here is derived from something the process can actually see.
    expect(Object.keys(body).sort()).toEqual([
      'environment',
      'services',
      'status',
      'timestamp',
      'version',
    ]);
    expect(body.services).toEqual({ database: 'connected', auth: 'active' });
    expect(body.status).toBe('healthy');
  });

  it('reports degraded from the services themselves, not from a gate report', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const { GET } = await import('@/app/api/health/route');
    const body = await (await GET()).json();

    expect(body.status).toBe('degraded');
    expect(body.services).toEqual({ database: 'disconnected', auth: 'inactive' });
    expect(body).not.toHaveProperty('releaseGates');
  });

  it('has no release-gate module for the route to serve', () => {
    // Derived from the tree rather than from a hand-kept list, so a module
    // reintroduced under a different name in `lib/` is still caught.
    const libFiles = readdirSync(join(ROOT, 'lib'));
    expect(libFiles.length).toBeGreaterThan(20);

    const gateModules = libFiles.filter((name) => /releasegate/i.test(name));
    expect(
      gateModules,
      `lib/ carries a release-gate module again: ${gateModules.join(', ')}. ` +
        'A release checklist belongs in docs/STATUS.md, where it can say what is unmeasured (#317).'
    ).toEqual([]);
    expect(existsSync(join(ROOT, 'lib', 'releaseGates.ts'))).toBe(false);
  });

  it('keeps the route free of hardcoded pass claims', () => {
    const src = readFileSync(HEALTH_ROUTE, 'utf8');
    // Match the code, not the comment explaining why the code is gone.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).not.toMatch(/passed\s*:\s*true/);
    expect(code).not.toMatch(/releaseGates/);
    expect(code).toContain('getHealthStatus');
  });
});
