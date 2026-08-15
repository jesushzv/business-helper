import { test, expect } from '@playwright/test';
import { resolveDeployedTarget } from './deployedTarget';

/**
 * Deployed smoke test — #70.
 *
 * Runs against a REAL deployment (https://businesshelper.app by default), not
 * a local build. It is deliberately not part of the pull-request gate:
 * `playwright.config.ts` ignores this file, and it has its own config
 * (`playwright.deployed.config.ts`) with no `webServer`. That boundary was
 * decided in #250 — a provider outage or an expired certificate must not block
 * an unrelated merge. Its home is the scheduled workflow
 * `.github/workflows/deployed-smoke.yml`.
 *
 * Three rules this file must never break:
 *
 * 1. **No skip path.** A smoke test that self-skips when its target is unset
 *    exits 0 having checked nothing, and a green scheduled run is then
 *    indistinguishable from a working deployment (#63, #118 — a verification
 *    script's exit code is a claim). The target is resolved in
 *    `deployedTarget.ts`, which throws on anything it cannot verify; there is
 *    no opt-out and no default-to-skip.
 *
 * 2. **Read-only.** Every request here is a GET against a public surface. The
 *    write half of #70's loop (register → onboarding → quote → OTP sign →
 *    SPEI proof → confirm) creates real rows, sends a real OTP to a real
 *    handset and uploads a real receipt, so it is a human runbook, not a cron
 *    job — see `docs/deployment.md` §12. This suite passing does NOT mean that
 *    loop has been walked.
 *
 * 3. **Assert against the real backend's contract, not the demo one.** The
 *    demo posture (`tests/e2e/scenarios.spec.ts`) is the *absence* of Supabase
 *    config. In production that same absence is an outage that serves invented
 *    data to real clients, so the checks below are written to fail on it
 *    loudly rather than accept either answer.
 */

const target = resolveDeployedTarget(process.env);

test.describe(`Deployed smoke test — ${target.origin}`, () => {
  /**
   * #70 item 1. Both fields matter and neither implies the other: `status` is
   * the deployment's own summary, while `services.*` names which half is
   * missing. Until #317 `status` also folded in `auditReleaseGates()`, whose
   * six gates were literal `true`s — so a `healthy` here asserted things
   * nobody had measured.
   */
  test('01 /api/health reports healthy with database connected and auth active', async ({
    request,
  }) => {
    const response = await request.get(`${target.origin}/api/health`);

    // The status alone does not say who answered. A 403 with an HTML body is a
    // proxy or WAF between the runner and the deployment; a 500 with a JSON
    // body is the app. Reporting "the deployment is down" for the first would
    // be a diagnosis thrown away, and this run is nobody's foreground task.
    const raw = await response.text();
    expect(
      response.status(),
      `GET ${target.origin}/api/health answered ${response.status()} ${response.statusText()}, not 200.\n` +
        `Body (first 500 chars):\n${raw.slice(0, 500)}`
    ).toBe(200);

    const body = JSON.parse(raw);

    // The whole body goes into the failure message: "expected healthy, got
    // degraded" alone does not say which service is the reason, and the
    // scheduled run is nobody's foreground task.
    const detail = `\nFull /api/health body:\n${JSON.stringify(body, null, 2)}`;

    expect(
      body.services?.database,
      `The deployment cannot reach Postgres — NEXT_PUBLIC_SUPABASE_URL is unset or wrong on the deployment.${detail}`
    ).toBe('connected');

    expect(
      body.services?.auth,
      `The deployment has no auth key — NEXT_PUBLIC_SUPABASE_ANON_KEY is unset or wrong on the deployment.${detail}`
    ).toBe('active');

    expect(
      body.status,
      `Health is degraded. \`status\` is services + auditReleaseGates(), so this can be red while both services above are green.${detail}`
    ).toBe('healthy');
  });

  /**
   * #70 item 2. There is no separate certificate assertion because there is no
   * way to reach this line without one: `resolveDeployedTarget` refuses a
   * non-https target, `ignoreHTTPSErrors` is false in the deployed config, and
   * a request that resolved DNS and completed a TLS handshake has proven both
   * halves of "the apex resolves with valid SSL". A bad chain fails the GET.
   */
  test('02 the apex resolves over TLS and serves the landing page', async ({ page }) => {
    expect(target.origin.startsWith('https://')).toBe(true);

    const response = await page.goto(`${target.origin}/`);
    expect(
      response?.status(),
      `GET ${target.origin}/ answered ${response?.status()} ${response?.statusText() ?? ''}, not 200.`
    ).toBe(200);

    await expect(page.locator('header')).toContainText('Business');
    await expect(page.locator('header')).toContainText('Helper');
  });

  /**
   * #70 item 3, the half a scheduled job may safely walk: the pages a client
   * or a returning owner actually opens. A 200 from the CDN is not enough —
   * Next.js serves an error boundary with a 200 — so each asserts its own copy.
   */
  test('03 the public entry points a client opens all render', async ({ page }) => {
    const pages: Array<{ path: string; expect: RegExp }> = [
      { path: '/login', expect: /Inicia Sesión/i },
      { path: '/register', expect: /Registra tu Negocio/i },
      { path: '/pricing', expect: /Precios|Planes/i },
    ];

    for (const entry of pages) {
      const response = await page.goto(`${target.origin}${entry.path}`);
      expect(
        response?.status(),
        `GET ${target.origin}${entry.path} answered ${response?.status()} ${response?.statusText() ?? ''}, not 200.`
      ).toBe(200);
      await expect(
        page.locator('body'),
        `${entry.path} answered 200 but did not render its own copy — likely an error boundary.`
      ).toContainText(entry.expect);
    }
  });

  /**
   * The seam #70 was filed for, in its read-only form.
   *
   * `/q/[token]` and `/pay/[token]` both resolve `quotes.public_token` through
   * this route. When the service-role key is missing it returns a **fabricated
   * demo quote with HTTP 200** — cement and rebar totalling $97,440 — which on
   * a real deployment is a client opening a link and reading a proposal nobody
   * sent (the #58/#93/#96 class). The honest production answer to a token that
   * does not exist is 404 with a Spanish `error.message` and a machine `code`
   * (#65). Asserting the 404 is what distinguishes the two.
   */
  test('04 an unknown quote token is refused honestly, not answered with demo data', async ({
    request,
  }) => {
    const bogus = 'smoke-test-token-that-does-not-exist';
    const response = await request.get(`${target.origin}/api/quotes/public/${bogus}`);

    // Read as text first: a non-JSON body here (an HTML error page from a
    // proxy or the CDN) must surface as itself, not as a JSON parse error
    // pointing at the wrong layer.
    const raw = await response.text();
    expect(
      response.status(),
      `Expected 404 for an unknown quote token, got ${response.status()} ${response.statusText()}. ` +
        `A 200 means the deployment is missing SUPABASE_SERVICE_ROLE_KEY and is serving the demo ` +
        `quote to real visitors; a 500 means the route threw.\nBody (first 500 chars):\n${raw.slice(0, 500)}`
    ).toBe(404);

    const body = JSON.parse(raw);
    expect(body.error?.code).toBe('QUOTE_NOT_FOUND');
    expect(typeof body.error?.message).toBe('string');
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});
