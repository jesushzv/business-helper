import { defineConfig, devices } from '@playwright/test';
import { resolveDeployedTarget } from './tests/e2e/deployedTarget';

/**
 * Playwright config for the DEPLOYED smoke test (#70) — `npm run test:e2e:deployed`.
 *
 * Separate from `playwright.config.ts` on purpose. That one gates pull
 * requests against a local demo-posture build; this one contacts a live
 * deployment. Keeping them apart is the boundary #250 drew: an expired
 * certificate or a Supabase incident must fail *this* run, on its schedule,
 * without blocking an unrelated merge.
 *
 * Two differences carry that boundary, and both are gated by
 * `tests/unit/deployedSmokeBoundary.test.ts`:
 *
 *   - **No `webServer`.** The PR config boots `npm run start` on :3000. If this
 *     one did too, a target that failed to resolve could quietly fall through
 *     to a localhost build and report the deployment healthy.
 *   - **`ignoreHTTPSErrors` stays false.** It is Playwright's default, and it
 *     is named here because "the apex resolves with valid SSL" (#70 item 2) is
 *     asserted by *not* setting it.
 *
 * Resolution throws — at config load, before a browser starts — on a target it
 * cannot verify. Playwright then exits non-zero with that message, which is
 * the required posture for a scheduled check: an incomplete run must fail
 * loudly naming what it skipped, never exit 0 having contacted nothing.
 */
const target = resolveDeployedTarget(process.env);

export default defineConfig({
  testDir: './tests/e2e',
  // Only the deployed spec. The demo-posture scenarios assert the *absence* of
  // Supabase config and would fail against a working production deployment.
  testMatch: ['**/deployed-smoke.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry absorbs a single dropped request; it cannot absorb an outage,
  // and each attempt re-contacts the deployment rather than replaying a cache.
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',

  use: {
    baseURL: target.origin,
    // Named rather than defaulted: see the header. A self-signed or expired
    // certificate must fail this suite, not be waved through.
    ignoreHTTPSErrors: false,
    trace: 'on-first-retry',
    // A deployment that has stopped responding should fail on its own terms
    // rather than hit the default 30s per-action timeout with no explanation.
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      ...(process.env.E2E_CHROMIUM_PATH
        ? { executablePath: process.env.E2E_CHROMIUM_PATH }
        : {}),
    },
  },

  // Both viewports: the primary persona is mobile-only (Don Roberto), so a
  // deployment that renders only on desktop is a production outage for most of
  // the user base, not a cosmetic bug.
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],

  // Deliberately no `webServer`.
});
