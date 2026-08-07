import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * #43 — verify:webhook must refuse to run against production.
 *
 * The guard used to be a denylist naming businesshelper.mx, which silently
 * stopped matching when the domain moved to businesshelper.app — so the script
 * would happily send real subscription events at production. It is now an
 * allowlist (localhost, *.vercel.app previews, staging.*): a future domain
 * rename fails closed instead of open.
 *
 * Each case runs the real script as a subprocess so the guard is tested as it
 * executes, not as a string.
 */

const SCRIPT = path.resolve(__dirname, '../../scripts/verify-stripe-webhook.mjs');

function runGuard(webhookUrl: string): { failed: boolean; stderr: string } {
  try {
    execFileSync(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        WEBHOOK_URL: webhookUrl,
        STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    });
    return { failed: false, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer };
    return { failed: (e.status ?? 1) !== 0, stderr: e.stderr?.toString() || '' };
  }
}

describe('verify:webhook target guard (#43)', () => {
  it('refuses the current production domain', () => {
    const { failed, stderr } = runGuard('https://businesshelper.app/api/stripe/webhook');
    expect(failed).toBe(true);
    expect(stderr).toContain('Refusing to run against a target');
  });

  it('refuses the retired production domain too', () => {
    const { failed, stderr } = runGuard('https://businesshelper.mx/api/stripe/webhook');
    expect(failed).toBe(true);
    expect(stderr).toContain('Refusing to run against a target');
  });

  it('refuses an arbitrary unknown host', () => {
    const { failed, stderr } = runGuard('https://api.some-company.com/api/stripe/webhook');
    expect(failed).toBe(true);
    expect(stderr).toContain('Refusing to run against a target');
  });

  it('lets a staging host past the guard', () => {
    // Port 9 is discard/unreachable: the run still fails later at the network
    // layer, but the guard itself must not be what stops it.
    const { stderr } = runGuard('http://localhost:9/api/stripe/webhook');
    expect(stderr).not.toContain('Refusing to run against a target');
  });

  it('lets a vercel.app preview past the guard', () => {
    // DNS for this name does not resolve in CI, so the run fails at fetch —
    // after the guard. Only the guard's verdict is under test.
    const { stderr } = runGuard('https://preview-branch-abc123.vercel.app/api/stripe/webhook');
    expect(stderr).not.toContain('Refusing to run against a target');
  });
});
