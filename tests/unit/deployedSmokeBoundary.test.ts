import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveDeployedTarget,
  PRODUCTION_ORIGIN,
  TARGET_ENV_VAR,
} from '../e2e/deployedTarget';

/**
 * Gate for the deployed smoke test (#70).
 *
 * Two properties are load-bearing and neither is visible in the PR gate's own
 * output, which is exactly why they need a test:
 *
 *   1. **The deployed check never leaks into the pull-request gate.** #250 drew
 *      that boundary — the PR gate must not depend on a live provider or a
 *      deployed URL, so a Supabase incident cannot block an unrelated merge.
 *      Nothing in a CI run reveals a violation: adding the deployed spec to the
 *      PR suite would look like extra coverage right up until the day it went
 *      red for an outage nobody's PR caused.
 *
 *   2. **The deployed check cannot pass by doing nothing.** A verification
 *      script's exit code is a claim (#63, #118): `verify:webhook` once printed
 *      "All 4 checks passed" for a run that skipped the two protecting money.
 *      The same shape here is a scheduled run whose target variable is unset —
 *      green, having contacted nothing. Vitest does not collect `tests/e2e/**`,
 *      so without this file the resolution rules have no coverage at all.
 *
 * Note: `tests/e2e/deployedTarget.ts` is imported directly. Vitest's `exclude`
 * governs which files it collects as *tests*, not which files a test may
 * import.
 */

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const DEPLOYED_SPEC = 'tests/e2e/deployed-smoke.spec.ts';
const DEPLOYED_CONFIG = 'playwright.deployed.config.ts';
const PR_GATE_CONFIG = 'playwright.config.ts';
const CI_WORKFLOW = '.github/workflows/ci.yml';
const SMOKE_WORKFLOW = '.github/workflows/deployed-smoke.yml';

describe('resolveDeployedTarget — fail-closed target resolution', () => {
  it('defaults to the production apex when nothing is set', () => {
    const target = resolveDeployedTarget({});
    expect(target.origin).toBe(PRODUCTION_ORIGIN);
    expect(target.isProductionApex).toBe(true);
    expect(target.source).toBe('default');
  });

  it('honours an override and reports that production was NOT the target', () => {
    // Silently accepting an override while the run's summary still implies
    // production is the reporting half of hard rule #2.
    const target = resolveDeployedTarget({
      [TARGET_ENV_VAR]: 'https://business-helper-preview.vercel.app',
    });
    expect(target.origin).toBe('https://business-helper-preview.vercel.app');
    expect(target.isProductionApex).toBe(false);
    expect(target.source).toBe(TARGET_ENV_VAR);
  });

  it('normalises a trailing slash and an incidental path to a bare origin', () => {
    expect(resolveDeployedTarget({ [TARGET_ENV_VAR]: 'https://example.com/' }).origin).toBe(
      'https://example.com'
    );
    expect(resolveDeployedTarget({ [TARGET_ENV_VAR]: 'https://example.com/api' }).origin).toBe(
      'https://example.com'
    );
  });

  it('treats an empty or whitespace-only variable as unset rather than as a target', () => {
    // `E2E_HEALTH_URL: ${{ inputs.target_url }}` in the workflow evaluates to
    // an empty string on the schedule. Empty must mean "use the default", not
    // "throw" — and must never mean "skip".
    expect(resolveDeployedTarget({ [TARGET_ENV_VAR]: '' }).origin).toBe(PRODUCTION_ORIGIN);
    expect(resolveDeployedTarget({ [TARGET_ENV_VAR]: '   ' }).origin).toBe(PRODUCTION_ORIGIN);
  });

  it.each([
    ['not-a-url', /is not a URL/],
    ['http://businesshelper.app', /is not https/],
    ['https://localhost:3000', /local address/],
    ['https://127.0.0.1:3000', /local address/],
  ])('throws on %s rather than resolving something unusable', (value, message) => {
    expect(() => resolveDeployedTarget({ [TARGET_ENV_VAR]: value })).toThrow(message);
  });

  it('says nothing was checked in every refusal message', () => {
    // The message is the run's only output when resolution fails at config
    // load, before any browser starts. It must not read as a passing run.
    for (const bad of ['not-a-url', 'http://businesshelper.app', 'https://localhost:3000']) {
      expect(() => resolveDeployedTarget({ [TARGET_ENV_VAR]: bad })).toThrow(
        /Nothing was checked/
      );
    }
  });
});

describe('the deployed check stays out of the pull-request gate (#250)', () => {
  it('the PR-gate Playwright config ignores the deployed spec on every branch', () => {
    const src = read(PR_GATE_CONFIG);
    const testIgnore = src.match(/testIgnore:[\s\S]*?\n\s*fullyParallel/);
    expect(testIgnore, `Could not find testIgnore in ${PR_GATE_CONFIG}`).not.toBeNull();

    // E2E_MEDIA swaps the ignore list; the deployed spec must be excluded in
    // both arms, or `E2E_MEDIA=1 npm run test:e2e` would contact production.
    const arms = testIgnore![0].match(/\[[^\]]*\]/g) ?? [];
    expect(
      arms.length,
      `Expected both arms of the E2E_MEDIA ternary in ${PR_GATE_CONFIG}; parsed ${arms.length}.`
    ).toBeGreaterThanOrEqual(2);

    for (const arm of arms) {
      expect(
        arm,
        `A testIgnore branch in ${PR_GATE_CONFIG} does not exclude the deployed spec, so the ` +
          `pull-request gate would contact a live deployment. See #250.`
      ).toContain('deployed-smoke.spec.ts');
    }
  });

  it('the deployed spec is the only file the deployed config collects', () => {
    expect(read(DEPLOYED_CONFIG)).toMatch(/testMatch:\s*\[\s*'\*\*\/deployed-smoke\.spec\.ts'/);
  });

  it('the PR-gate e2e job names neither the deployed config nor its target variable', () => {
    const ci = read(CI_WORKFLOW);
    expect(ci).not.toContain('test:e2e:deployed');
    expect(ci).not.toContain(TARGET_ENV_VAR);
  });

  it('the scheduled workflow is not triggered by a pull request or a push', () => {
    const wf = read(SMOKE_WORKFLOW);
    const triggers = wf.slice(wf.indexOf('\non:'), wf.indexOf('\nconcurrency:'));
    expect(triggers).toContain('schedule:');
    expect(triggers).toContain('workflow_dispatch:');
    expect(
      triggers,
      'A pull_request trigger on the deployed smoke test re-couples the PR gate to a live ' +
        'deployment, which is the coupling #250 removed.'
    ).not.toMatch(/^\s{2}pull_request:/m);
    expect(triggers).not.toMatch(/^\s{2}push:/m);
  });

  it('the scheduled workflow actually runs the deployed suite', () => {
    // A workflow that exists but runs the wrong script is the "check that
    // never runs" defect wearing a green badge (#35/#38/#46).
    expect(read(SMOKE_WORKFLOW)).toContain('npm run test:e2e:deployed');
  });
});

describe('the deployed check cannot report a pass it did not earn', () => {
  it('the deployed spec has no skip path', () => {
    const src = read(DEPLOYED_SPEC);
    expect(
      src,
      `${DEPLOYED_SPEC} calls test.skip(). On a scheduled deployment check a skip is a green ` +
        `run that contacted nothing — the #63/#118 defect. An unusable target must throw in ` +
        `resolveDeployedTarget() instead.`
    ).not.toMatch(/\btest\.skip\s*\(/);
    expect(src).not.toMatch(/\btest\.fixme\s*\(/);
    expect(src).not.toMatch(/\btest\.describe\.skip\s*\(/);
  });

  it('the deployed config never falls back to a local server', () => {
    const src = read(DEPLOYED_CONFIG);
    expect(
      src,
      `${DEPLOYED_CONFIG} declares a webServer. A deployed smoke test that can boot its own ` +
        `server can report a localhost build healthy while the deployment is down.`
    ).not.toMatch(/^\s*webServer:/m);
  });

  it('the deployed config does not wave through a bad certificate', () => {
    // "The apex resolves with valid SSL" (#70 item 2) is asserted by NOT
    // ignoring HTTPS errors; ignoreHTTPSErrors: true would silently delete it.
    expect(read(DEPLOYED_CONFIG)).not.toMatch(/ignoreHTTPSErrors:\s*true/);
  });

  it('every check in the deployed spec is a real assertion, and there are several', () => {
    // Derived from the file rather than restated: a scan that matches nothing
    // passes exactly like a scan that matches everything, so assert the parse
    // found a plausible count (CLAUDE.md hard rule #7).
    const src = read(DEPLOYED_SPEC);
    const tests = src.match(/^\s{2}test\(/gm) ?? [];
    expect(
      tests.length,
      `Parsed ${tests.length} tests out of ${DEPLOYED_SPEC} — the scan below is meaningless ` +
        `if it matched nothing.`
    ).toBeGreaterThanOrEqual(4);
    expect(src.match(/expect\(/g)?.length ?? 0).toBeGreaterThanOrEqual(tests.length);
  });

  it('covers all three of #70\'s automatable items', () => {
    const src = read(DEPLOYED_SPEC);
    // Item 1: the health payload, both service fields and the folded status.
    expect(src).toContain('/api/health');
    expect(src).toContain('services?.database');
    expect(src).toContain('services?.auth');
    // Item 2: the apex over TLS.
    expect(src).toContain('https://');
    // Item 3's read-only half: the public entry points and the quote seam.
    expect(src).toContain('/login');
    expect(src).toContain('/register');
    expect(src).toContain('QUOTE_NOT_FOUND');
  });
});
