import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The fourth `verify:*` guard (#322 item 6).
 *
 * `verifyOtpGuard` (#118), `verifyStripeGuard` and `verifyWebhookGuard` (#63)
 * each pin their script's non-zero-exit-on-skip contract; `verify:gemini` was
 * the one without. The exit code is the machine-readable half of a
 * verification and the half a wrapper or a scrolled-past terminal actually
 * reads — `verify:webhook` once printed "All 4 checks passed" for a run that
 * skipped the two protecting money, against an endpoint with no secret at all.
 *
 * The script's handling was checked before this test was written, not assumed:
 * it already exits 1 with GEMINI_API_KEY unset. So this pins the contract
 * rather than repairing it — including the two failure modes that are not
 * about the credential being absent:
 *
 *   - a 200 that carried no completion (Gemini returns an empty candidate with
 *     `finishReason: MAX_TOKENS` when thinking eats the output budget — the
 *     script itself once had that bug, so a valid key failed its own check)
 *   - an endpoint that accepts *any* key, which is the positive control on the
 *     negative check: without it, "a garbage key is refused" can pass against a
 *     provider that refuses nothing.
 *
 * The provider call is stubbed by injecting `fetch` with `node --import`, for
 * the reason in the fixture header: a seam inside the script would be one
 * config flip away from letting a real run be pointed at something that always
 * says yes. The stub proves nothing about Gemini; it pins which responses this
 * script is willing to call a pass.
 */

const SCRIPT = path.resolve(__dirname, '../../scripts/verify-gemini.mjs');
const STUB = pathToFileURL(path.resolve(__dirname, '../fixtures/stubGeminiFetch.mjs')).href;

function runScript(env: Record<string, string>): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    // The parent's own GEMINI_* values must not leak in and hand the child a
    // credential the case is trying to withhold.
    const base = { ...process.env };
    for (const key of Object.keys(base)) {
      if (key.startsWith('GEMINI_') || key.startsWith('BH_STUB_')) delete base[key];
    }

    execFile(
      process.execPath,
      ['--import', STUB, SCRIPT],
      { env: { ...base, ...env }, timeout: 20_000, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = (err as { code?: number } | null)?.code ?? (err ? 1 : 0);
        resolve({ code, output: `${stdout || ''}${stderr || ''}` });
      }
    );
  });
}

describe('verify:gemini cannot sign off on a run it did not complete (#322)', () => {
  it('exits non-zero and names the skip when GEMINI_API_KEY is unset', async () => {
    const { code, output } = await runScript({ BH_STUB_MODE: 'healthy' });

    expect(code).not.toBe(0);
    expect(output).toContain('INCOMPLETE');
    // The prose must say which checks did not happen, not merely that one did.
    expect(output).toMatch(/SKIPPED/);
    expect(output).toContain('proves nothing');
  });

  it('exits zero only when the completion happened and the garbage key was refused', async () => {
    const { code, output } = await runScript({
      GEMINI_API_KEY: 'AIza_stub_key',
      BH_STUB_MODE: 'healthy',
    });

    expect(code, output).toBe(0);
    expect(output).toContain('BH-OK');
  });

  it('refuses a 200 that carried no completion', async () => {
    // finishReason MAX_TOKENS with empty text: the response is HTTP-successful
    // and proves the model produced nothing.
    const { code, output } = await runScript({
      GEMINI_API_KEY: 'AIza_stub_key',
      BH_STUB_MODE: 'empty',
    });

    expect(code, output).not.toBe(0);
    expect(output).toContain('check(s) failed');
  });

  it('refuses an endpoint that accepts any key at all', async () => {
    // The negative control's own positive control. A provider that never
    // refuses makes "a garbage key is refused" vacuous, and a vacuous check
    // that passes is how #63 shipped.
    const { code, output } = await runScript({
      GEMINI_API_KEY: 'AIza_stub_key',
      BH_STUB_MODE: 'accepts-any',
    });

    expect(code, output).not.toBe(0);
    expect(output).toContain('garbage key is refused');
  });

  it('reports a transport failure as a failure, never as a pass', async () => {
    const { code, output } = await runScript({
      GEMINI_API_KEY: 'AIza_stub_key',
      BH_STUB_MODE: 'network',
    });

    expect(code, output).not.toBe(0);
  });
});
