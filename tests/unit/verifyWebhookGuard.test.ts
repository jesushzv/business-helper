import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

/**
 * `scripts/verify-stripe-webhook.mjs` is the only evidence #63 will ever have.
 *
 * Two separate properties are under test here, and the second is the one that
 * kept #63 honest:
 *
 *   #43 — the script must refuse to run against production. The guard used to
 *   be a denylist naming businesshelper.mx, which silently stopped matching
 *   when the domain moved to businesshelper.app. It is now an allowlist, so a
 *   future rename fails closed.
 *
 *   #63 — the script must never report a pass it did not earn. It used to skip
 *   the accept-and-process and idempotency checks whenever ORG_ID was unset and
 *   still print "✓ All 4 checks passed", and all four of the checks it did run
 *   passed against an endpoint that rejected *everything* — which is exactly
 *   what a deployment with no STRIPE_WEBHOOK_SECRET looks like.
 *
 * The #63 cases run the script against a local stub that implements the route's
 * response contract, including deliberately broken variants. The stub proves
 * nothing about the real endpoint — that is what running the script against a
 * staging deployment is for. What it pins is the script's *verdict*: which
 * responses it calls a pass, and whether it can be made to sign off on a run
 * that skipped the checks that matter.
 */

const SCRIPT = path.resolve(__dirname, '../../scripts/verify-stripe-webhook.mjs');
const SECRET = 'whsec_stub_endpoint_secret';
const ORG = '11111111-2222-3333-4444-555555555555';

/**
 * Asynchronous on purpose. `execFileSync` blocks this process's event loop, so
 * the stub server below would never accept the script's connections and every
 * #63 case would fail as an unreachable target.
 */
function runScript(env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT],
      { env: { ...process.env, ...env }, timeout: 20_000, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = (err as { code?: number } | null)?.code ?? (err ? 1 : 0);
        resolve({ code, stdout: stdout || '', stderr: stderr || '' });
      }
    );
  });
}

/* ── #43: the production guard ─────────────────────────────────────────────── */

describe('verify:webhook target guard (#43)', () => {
  const runGuard = (webhookUrl: string) =>
    runScript({ WEBHOOK_URL: webhookUrl, STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy' });

  it('refuses the current production domain', async () => {
    const { code, stderr } = await runGuard('https://businesshelper.app/api/stripe/webhook');
    expect(code).not.toBe(0);
    expect(stderr).toContain('Refusing to run against a target');
  });

  it('refuses the retired production domain too', async () => {
    const { code, stderr } = await runGuard('https://businesshelper.mx/api/stripe/webhook');
    expect(code).not.toBe(0);
    expect(stderr).toContain('Refusing to run against a target');
  });

  it('refuses an arbitrary unknown host', async () => {
    const { code, stderr } = await runGuard('https://api.some-company.com/api/stripe/webhook');
    expect(code).not.toBe(0);
    expect(stderr).toContain('Refusing to run against a target');
  });

  it('lets a staging host past the guard', async () => {
    // Port 9 is discard/unreachable: the run still fails, but at the network
    // layer, after the guard. Only the guard's verdict is under test.
    const { stderr } = await runGuard('http://localhost:9/api/stripe/webhook');
    expect(stderr).not.toContain('Refusing to run against a target');
  });

  it('lets a vercel.app preview past the guard', async () => {
    // DNS for this name does not resolve in CI, so the run fails at fetch —
    // after the guard.
    const { stderr } = await runGuard('https://preview-branch-abc123.vercel.app/api/stripe/webhook');
    expect(stderr).not.toContain('Refusing to run against a target');
  });

  it('reports an unreachable target as a failed check rather than a stack trace', async () => {
    const { code, stdout, stderr } = await runGuard('http://localhost:9/api/stripe/webhook');
    expect(code).not.toBe(0);
    expect(stdout).toContain('unreachable');
    expect(stderr).not.toContain('ECONNREFUSED\n    at ');
  });
});

/* ── #63: what the script will and will not call a pass ────────────────────── */

type StubMode = 'honest' | 'always400' | 'always503' | 'noDedupe';

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/**
 * Minimal stand-in for app/api/stripe/webhook/route.ts, plus broken variants.
 *
 * The error bodies mirror the route's `{ error: { code, message } }` envelope
 * (#325). Not decoration: the script interpolates the error into its own
 * failure output, so a stub still answering bare strings would hide the
 * `[object Object]` regression the conversion could have caused.
 */
function startStub(mode: StubMode): Promise<{ url: string; server: Server }> {
  const ledger = new Set<string>();

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status: number, body: Record<string, unknown>) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      if (mode === 'always400') return send(400, { error: { code: 'INVALID_SIGNATURE', message: 'Firma de webhook inválida' } });
      if (mode === 'always503') return send(503, {
          error: {
            code: 'WEBHOOK_NOT_CONFIGURED',
            message: 'Verificación de webhook no configurada',
          },
        });

      const rawBody = Buffer.concat(chunks).toString('utf8');
      const header = req.headers['stripe-signature'];

      if (typeof header !== 'string') return send(400, { error: { code: 'INVALID_SIGNATURE', message: 'Firma de webhook inválida' } });

      const timestamp = /(?:^|,)t=([^,]+)/.exec(header)?.[1];
      const signature = /(?:^|,)v1=([^,]+)/.exec(header)?.[1];
      if (!timestamp || !signature) return send(400, { error: { code: 'INVALID_SIGNATURE', message: 'Firma de webhook inválida' } });

      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
        return send(400, { error: { code: 'INVALID_SIGNATURE', message: 'Firma de webhook inválida' } });
      }

      const expected = createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
      if (expected !== signature) return send(400, { error: { code: 'INVALID_SIGNATURE', message: 'Firma de webhook inválida' } });

      const event = JSON.parse(rawBody);
      if (!HANDLED.has(event.type)) return send(200, { received: true, ignored: event.type });

      const organizationId = event?.data?.object?.metadata?.organization_id;
      if (organizationId !== ORG) {
        return send(400, {
          error: {
            code: 'ORGANIZATION_MISSING',
            message: 'El evento no identifica una organización válida',
          },
        });
      }

      if (ledger.has(event.id) && mode !== 'noDedupe') {
        return send(200, { received: true, duplicate: true });
      }
      ledger.add(event.id);

      return send(200, { received: true, processed: { organizationId, tierId: 'negocio' } });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}/api/stripe/webhook`, server });
    });
  });
}

let running: Server | null = null;

afterEach(() => {
  running?.close();
  running = null;
});

async function runAgainstStub(mode: StubMode, extraEnv: Record<string, string> = {}) {
  const { url, server } = await startStub(mode);
  running = server;
  return runScript({ WEBHOOK_URL: url, STRIPE_WEBHOOK_SECRET: SECRET, ...extraEnv });
}

describe('verify:webhook cannot report a pass it did not earn (#63)', () => {
  it('fails against an endpoint that rejects everything', async () => {
    // The exact shape of a deployment whose STRIPE_WEBHOOK_SECRET is unset:
    // all four rejection checks "pass", because nothing is ever accepted.
    const { code, stdout, stderr } = await runAgainstStub('always400');

    expect(code).not.toBe(0);
    expect(stderr).toContain('positive control failed');
    expect(stdout).not.toMatch(/All \d+ checks passed/);
  });

  it('prints the code and message of a refusal, not [object Object] (#325)', async () => {
    // The envelope conversion turned `json.error` from a string into an
    // object, and this script interpolated it straight into a template — so
    // the diagnosis would have degraded to "[object Object]" at exactly the
    // moment a check fails and someone needs to read it. No check reads the
    // body to decide pass/fail; this one line did read it to explain itself.
    const { stdout } = await runAgainstStub('always400');

    expect(stdout).not.toContain('[object Object]');
    expect(stdout).toContain('INVALID_SIGNATURE');
    expect(stdout).toContain('Firma de webhook inválida');
  });

  it('names the missing secret when the target answers 503', async () => {
    const { code, stderr } = await runAgainstStub('always503');

    expect(code).not.toBe(0);
    expect(stderr).toContain('no STRIPE_WEBHOOK_SECRET');
  });

  it('refuses to sign off on a run with no ORG_ID, however many checks passed', async () => {
    const { code, stdout, stderr } = await runAgainstStub('honest');

    expect(code).not.toBe(0);
    expect(stderr).toContain('INCOMPLETE');
    expect(stderr).toContain('not a #63 sign-off');
    // The two criteria that protect money must be named, not silently absent.
    expect(stderr).toContain('accepted and applied');
    expect(stderr).toContain('deduplicated');
    expect(stdout).not.toMatch(/All \d+ checks passed/);
  });

  it('passes, and emits a record, only when every check including idempotency ran', async () => {
    const { code, stdout } = await runAgainstStub('honest', { ORG_ID: ORG });

    expect(code).toBe(0);
    expect(stdout).toMatch(/All \d+ checks passed/);
    expect(stdout).toContain('Record of this run');
    expect(stdout).toContain(ORG);
  });

  it('fails when a redelivery is applied a second time instead of deduplicated', async () => {
    const { code, stdout } = await runAgainstStub('noDedupe', { ORG_ID: ORG });

    expect(code).not.toBe(0);
    expect(stdout).toContain('✗ redelivery of the same event id is deduplicated');
  });

  it('runs the full set of criteria, not a subset', async () => {
    const { stdout } = await runAgainstStub('honest', { ORG_ID: ORG });

    for (const criterion of [
      'correctly signed event is accepted',
      'unsigned request is rejected',
      'signature from a different secret is rejected',
      'tampered payload is rejected',
      'timestamp older than tolerance is rejected',
      'timestamp beyond tolerance in the future is rejected',
      'correctly signed subscription event is accepted and applied',
      'redelivery of the same event id is deduplicated',
    ]) {
      expect(stdout).toContain(`✓ ${criterion}`);
    }
  });
});
