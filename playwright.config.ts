import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration — Business Helper
 * 
 * Configures cross-browser & mobile viewport testing.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // generate-media.spec.ts is a screenshot/video capture job, not a test — it
  // asserts nothing and doubled the reported count to "40 tests" (#91). Run it
  // on demand with E2E_MEDIA=1.
  testIgnore: process.env.E2E_MEDIA ? [] : ['**/generate-media.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      // Environments with a system Chromium but no network access to the
      // Playwright CDN (some sandboxes/containers) can point at it here.
      // Everywhere else, `npx playwright install --with-deps chromium` is the
      // required setup step — without it every test fails in ~2ms with
      // "Executable doesn't exist", which looks nothing like a product failure.
      ...(process.env.E2E_CHROMIUM_PATH
        ? { executablePath: process.env.E2E_CHROMIUM_PATH }
        : {}),
    },
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
      },
    },
  ],

  webServer: {
    command: 'npm run start || npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
