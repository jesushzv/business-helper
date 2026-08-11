import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * #118 — `verify:otp` must not sign off on a run that skipped the send.
 *
 * `scripts/verify-otp-delivery.mjs` is the only evidence the OTP channel will
 * ever have short of a signer telling you it worked. It used to `process.exit(0)`
 * whenever the send stage had no target, having verified everything *except*
 * the stage the signing flow depends on. The prose was honest; the exit code —
 * the machine-readable half, and the half a wrapper or a scrolled-past terminal
 * actually reads — was not. Same defect as #63 one script over.
 *
 * Stages 1–2 cannot substitute for stage 3: a Resend account in sandbox, a
 * sending domain whose DNS has not propagated, or a Twilio trial restricted to
 * verified numbers all authenticate cleanly and deliver nothing.
 *
 * The provider calls are stubbed by injecting a `fetch` replacement with
 * `node --import` (see the fixture's header for why the seam lives there and
 * not in the script). Asynchronous `execFile` on purpose, mirroring
 * `verifyWebhookGuard.test.ts`.
 */

const SCRIPT = path.resolve(__dirname, '../../scripts/verify-otp-delivery.mjs');
const STUB = pathToFileURL(path.resolve(__dirname, '../fixtures/stubProviderFetch.mjs')).href;

const EMAIL_ENV = {
  OTP_DELIVERY_CHANNEL: 'email',
  RESEND_API_KEY: 're_stub_key',
  OTP_EMAIL_FROM: 'Business Helper <firmas@businesshelper.app>',
};

function runScript(
  env: Record<string, string>,
  { stub = true }: { stub?: boolean } = {}
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    // The parent's OTP_* values must not leak in and hand the child a target
    // the case is trying to withhold.
    const base = { ...process.env };
    for (const key of Object.keys(base)) {
      if (key.startsWith('OTP_') || key.startsWith('TWILIO_') || key.startsWith('META_') || key.startsWith('RESEND_')) {
        delete base[key];
      }
    }

    execFile(
      process.execPath,
      stub ? ['--import', STUB, SCRIPT] : [SCRIPT],
      { env: { ...base, ...env }, timeout: 20_000, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = (err as { code?: number } | null)?.code ?? (err ? 1 : 0);
        resolve({ code, output: `${stdout || ''}${stderr || ''}` });
      }
    );
  });
}

describe('verify:otp refuses to sign off on a skipped send stage (#118)', () => {
  it('exits non-zero and prints INCOMPLETE when no send target is set', async () => {
    const { code, output } = await runScript(EMAIL_ENV);

    // The credentials stage passed against the stub — this is the skip path,
    // not a credentials failure.
    expect(output).toContain('Resend credentials accepted');
    expect(output).toContain('INCOMPLETE');
    expect(output).toContain('OTP_TEST_EMAIL');
    expect(code).not.toBe(0);
  });

  it('never claims a pass in the same breath as skipping the send', async () => {
    const { output } = await runScript(EMAIL_ENV);

    // The old line. Its return would be the regression.
    expect(output).not.toContain('✓ Configuration and credentials verified');
    expect(output).not.toMatch(/all .* checks passed/i);
  });

  it('exits 0 only once a message has actually been sent', async () => {
    const { code, output } = await runScript({ ...EMAIL_ENV, OTP_TEST_EMAIL: 'probe@example.com' });

    expect(code).toBe(0);
    expect(output).toContain('accepted the send');
    // Acceptance is not arrival, and the script must keep saying so.
    expect(output).toContain('acceptance is not delivery');
  });

  it('records the run without pasting the recipient into a public doc', async () => {
    const { output } = await runScript({ ...EMAIL_ENV, OTP_TEST_EMAIL: 'don.roberto@ferreteria.mx' });

    const marker = 'Record for docs/STATUS.md';
    expect(output).toContain(marker);

    // Scoped to the record block on purpose. The operator's own terminal names
    // the recipient in full above this — they need to know where the message
    // went. What must not carry a real person's address is the block written
    // to be pasted into a public document.
    const record = output.slice(output.indexOf(marker));
    expect(record).toContain('@ferreteria.mx');
    expect(record).not.toContain('don.roberto@ferreteria.mx');
    expect(record).toContain('provider:    resend_email');
  });

  it('fails closed on an unset channel, without reaching a provider', async () => {
    const { code, output } = await runScript({}, { stub: false });

    expect(code).not.toBe(0);
    expect(output).toContain('No delivery channel selected');
  });

  it('names the missing variable rather than authenticating with a hole in the config', async () => {
    const { code, output } = await runScript(
      { OTP_DELIVERY_CHANNEL: 'email', RESEND_API_KEY: 're_stub_key' },
      { stub: false }
    );

    expect(code).not.toBe(0);
    expect(output).toContain('OTP_EMAIL_FROM');
  });
});
