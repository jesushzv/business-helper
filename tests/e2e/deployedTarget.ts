/**
 * Target resolution for the deployed smoke test (#70).
 *
 * Split out of the spec so that both `playwright.deployed.config.ts` and
 * `tests/e2e/deployed-smoke.spec.ts` agree on one answer, and so the rules
 * below are unit-testable — `tests/unit/deployedSmokeBoundary.test.ts` covers
 * them, since Vitest never collects `tests/e2e/**` as tests.
 *
 * The posture is fail-closed, and it is the whole point of this module. The
 * previous home of this check (scenario 10) resolved `E2E_HEALTH_URL` and
 * called `test.skip()` when it was unset, which is correct for a PR gate and
 * wrong for a scheduled deployment check: unset the variable and the run goes
 * green having contacted nothing (#63, #118). So there is no skip and no
 * silent fallback to localhost — an unusable target throws, and the run exits
 * non-zero naming what it could not check.
 */

/**
 * The deployment this repo ships to. A literal origin is banned in `lib/`
 * (`tests/unit/url.test.ts` scans it) because a link a *client* receives must
 * follow the deployment it was built on. This is the opposite case: a smoke
 * test that inherits its target cannot report which deployment it found
 * healthy, and "production is up" is the one claim it exists to make.
 */
export const PRODUCTION_ORIGIN = 'https://businesshelper.app';

/** Retains scenario 10's variable name, so an existing local invocation still works. */
export const TARGET_ENV_VAR = 'E2E_HEALTH_URL';

export interface DeployedTarget {
  /** Scheme + host, no trailing slash. */
  origin: string;
  /** False when overridden — the run must say so rather than imply production was checked. */
  isProductionApex: boolean;
  /** Where the target came from, for the run's own summary. */
  source: 'default' | typeof TARGET_ENV_VAR;
}

export function resolveDeployedTarget(
  env: Record<string, string | undefined> = process.env
): DeployedTarget {
  const override = env[TARGET_ENV_VAR]?.trim();
  const source: DeployedTarget['source'] = override ? TARGET_ENV_VAR : 'default';
  const raw = override || PRODUCTION_ORIGIN;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `${TARGET_ENV_VAR}="${raw}" is not a URL. The deployed smoke test needs a full origin, ` +
        `e.g. ${PRODUCTION_ORIGIN}. Nothing was checked.`
    );
  }

  // Not a style preference: #70 item 2 is "the apex resolves with valid SSL",
  // and http:// would complete the request without proving any of it.
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `${TARGET_ENV_VAR}="${raw}" is not https. The certificate is half of what this test ` +
        `checks (#70), so an http target would report a pass it did not earn. Nothing was checked.`
    );
  }

  // A smoke test aimed at localhost is the failure this whole file guards
  // against: it passes against a build the author just started, while the
  // deployment it is supposed to watch is down.
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(parsed.host)) {
    throw new Error(
      `${TARGET_ENV_VAR}="${raw}" points at a local address. This suite checks a DEPLOYED ` +
        `URL; for the local demo posture run \`npm run test:e2e\` instead. Nothing was checked.`
    );
  }

  const origin = parsed.origin;

  return {
    origin,
    isProductionApex: origin === PRODUCTION_ORIGIN,
    source,
  };
}
