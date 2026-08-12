import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { baseSentryOptions } from '@/lib/sentryOptions';
import { scrubEvent, scrubLog } from '@/lib/sentryScrub';

/**
 * Next.js initialises Sentry three times, from three files nothing imports.
 *
 * That is the whole hazard. No call site references `instrumentation-client.ts`,
 * `sentry.server.config.ts` or `sentry.edge.config.ts`, so no type error and no
 * ordinary test notices when one of them loses an option the other two keep. The
 * failure is silent and one-runtime-wide: Edge errors stop arriving, or the
 * browser stops scrubbing, and the dashboard still looks healthy because the
 * other two runtimes are still reporting.
 *
 * These read the files off disk for that reason.
 */

const ROOT = join(__dirname, '..', '..');

const RUNTIME_CONFIGS = {
  client: 'instrumentation-client.ts',
  server: 'sentry.server.config.ts',
  edge: 'sentry.edge.config.ts',
} as const;

/**
 * The file's *code*, with comments removed.
 *
 * Not cosmetic. The first version of this suite read the raw text and the
 * "no `includeLocalVariables` on Edge" assertion failed against the sentence in
 * that file's header explaining why the option is absent — a scan that a comment
 * can satisfy proves nothing about the config.
 *
 * Both strippers are anchored to the start of a line, and that is load-bearing:
 * the CSP in `next.config.ts` contains `https://*.posthog.com`, whose slash-star
 * an unanchored block-comment pattern reads as an opening delimiter and then
 * eats every header up to the next closing one. That silently deleted the two
 * CSP assertions' subject matter and failed them for the wrong reason.
 */
function source(file: string): string {
  const path = join(ROOT, file);
  expect(existsSync(path), `${file} is missing — Sentry does not initialise without it`).toBe(true);

  const code = readFileSync(path, 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

  expect(code.trim().length, `${file} is empty once comments are stripped`).toBeGreaterThan(0);
  return code;
}

describe('All three runtimes share one options object', () => {
  it('covers exactly the three runtimes Next.js has', () => {
    // Derived from the SDK's contract, not from a list someone remembered to
    // update: if Next.js grows a fourth runtime this count is the reminder.
    expect(Object.keys(RUNTIME_CONFIGS)).toHaveLength(3);
  });

  for (const [runtime, file] of Object.entries(RUNTIME_CONFIGS)) {
    it(`${runtime} spreads baseSentryOptions() rather than restating options`, () => {
      expect(source(file)).toMatch(/\.\.\.baseSentryOptions\(\)/);
    });

    it(`${runtime} initialises with a DSN`, () => {
      expect(source(file)).toMatch(/dsn:\s*process\.env\./);
    });
  }

  it('gives the browser the public DSN and the server runtimes the private one', () => {
    // Getting this backwards is the classic version of this mistake: the server
    // reading `NEXT_PUBLIC_` still works, so it never surfaces, while the
    // browser reading `SENTRY_DSN` gets `undefined` and silently reports nothing.
    expect(source(RUNTIME_CONFIGS.client)).toMatch(/dsn:\s*process\.env\.NEXT_PUBLIC_SENTRY_DSN/);
    expect(source(RUNTIME_CONFIGS.server)).toMatch(/dsn:\s*process\.env\.SENTRY_DSN/);
    expect(source(RUNTIME_CONFIGS.edge)).toMatch(/dsn:\s*process\.env\.SENTRY_DSN/);
  });
});

describe('The shared options carry the scrubbers and the honest defaults', () => {
  const options = baseSentryOptions();

  it('installs scrubEvent as beforeSend and scrubLog as beforeSendLog', () => {
    // Identity, not a textual match: this is the hook that makes #52's exit
    // criterion hold for events nobody wrote a capture call for.
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendLog).toBe(scrubLog);
  });

  it('leaves sendDefaultPii off', () => {
    // The Sentry skill suggests `true`. This app holds RFCs, CLABEs and client
    // telephone numbers, and `true` attaches IPs, headers, cookies and user
    // email upstream of the scrubbers.
    expect(options.sendDefaultPii).toBe(false);
  });

  it('enables logs, which are a no-op unless explicitly turned on', () => {
    expect(options.enableLogs).toBe(true);
  });

  it('samples traces at a rate that is a fraction in production', () => {
    expect(options.tracesSampleRate).toBeGreaterThan(0);
    expect(options.tracesSampleRate).toBeLessThanOrEqual(1);
  });
});

describe('Runtime-specific options are on the runtimes that support them', () => {
  it('profiles the Node runtime with the native integration', () => {
    const server = source(RUNTIME_CONFIGS.server);
    expect(server).toMatch(/nodeProfilingIntegration\(\)/);
    expect(server).toMatch(/from '@sentry\/profiling-node'/);
  });

  it('keeps the native profiler out of the Edge runtime', () => {
    // The Edge runtime cannot load native add-ons; importing it here fails the
    // build, or worse, ships and never initialises.
    const edge = source(RUNTIME_CONFIGS.edge);
    expect(edge).not.toMatch(/@sentry\/profiling-node/);
    expect(edge).not.toMatch(/includeLocalVariables/);
  });

  it('attaches local variables only on the server, where the scrubber covers them', () => {
    expect(source(RUNTIME_CONFIGS.server)).toMatch(/includeLocalVariables:\s*true/);
  });

  it('registers browser profiling after browser tracing', () => {
    // Order is load-bearing — profiling attaches to the spans tracing creates.
    const client = source(RUNTIME_CONFIGS.client);
    const tracing = client.indexOf('browserTracingIntegration');
    const profiling = client.indexOf('browserProfilingIntegration');
    expect(tracing).toBeGreaterThan(-1);
    expect(profiling).toBeGreaterThan(tracing);
  });
});

describe('Session Replay records the shape of a session, never its data', () => {
  it('masks all text, all inputs and all media', () => {
    // `/q/[token]` and `/pay/[token]` are used by the tenant's *clients*. These
    // are the SDK defaults; written out so relaxing one is a visible diff line.
    const client = source(RUNTIME_CONFIGS.client);
    expect(client).toMatch(/maskAllText:\s*true/);
    expect(client).toMatch(/maskAllInputs:\s*true/);
    expect(client).toMatch(/blockAllMedia:\s*true/);
  });

  it('captures no request or response bodies', () => {
    expect(source(RUNTIME_CONFIGS.client)).toMatch(/networkDetailAllowUrls:\s*\[\]/);
  });
});

describe('The server-side registration hook', () => {
  const instrumentation = source('instrumentation.ts');

  it('loads a config for each server runtime', () => {
    expect(instrumentation).toMatch(/NEXT_RUNTIME === 'nodejs'[\s\S]*sentry\.server\.config/);
    expect(instrumentation).toMatch(/NEXT_RUNTIME === 'edge'[\s\S]*sentry\.edge\.config/);
  });

  it('exports onRequestError, which is what catches errors nobody wrapped', () => {
    expect(instrumentation).toMatch(/export const onRequestError = Sentry\.captureRequestError/);
  });

  it('exports the App Router navigation hook from the client config', () => {
    expect(source(RUNTIME_CONFIGS.client)).toMatch(
      /export const onRouterTransitionStart = Sentry\.captureRouterTransitionStart/
    );
  });
});

describe('The build and request plumbing Sentry depends on', () => {
  const nextConfig = source('next.config.ts');
  const middleware = source('middleware.ts');

  it('wraps the Next config with withSentryConfig', () => {
    expect(nextConfig).toMatch(/withSentryConfig\(nextConfig/);
  });

  it('reads org and project from the environment instead of hardcoding slugs', () => {
    // A plausible-but-wrong literal slug uploads source maps to nothing and
    // reports success — the placeholder-identifier trap, at build time.
    expect(nextConfig).toMatch(/org:\s*process\.env\.SENTRY_ORG/);
    expect(nextConfig).toMatch(/project:\s*process\.env\.SENTRY_PROJECT/);
  });

  it('lets the middleware matcher through to the tunnel route', () => {
    // `tunnelRoute` puts event delivery on a same-origin path that is NOT under
    // /api, so the matcher would otherwise run Supabase session refresh over it
    // and redirect signed-out visitors — losing the reports most worth having.
    const tunnel = nextConfig.match(/tunnelRoute:\s*'\/([\w-]+)'/);
    expect(tunnel, 'tunnelRoute is not set in next.config.ts').not.toBeNull();
    expect(middleware).toMatch(new RegExp(`\\(\\?!.*\\b${tunnel![1]}\\b`));
  });

  it('allows the Replay compression worker in the CSP', () => {
    // `worker-src` covers most browsers; Safari <= 15.4 needs `child-src`.
    expect(nextConfig).toMatch(/worker-src 'self' blob:/);
    expect(nextConfig).toMatch(/child-src 'self' blob:/);
  });

  it('sends the Document-Policy header browser profiling is gated behind', () => {
    expect(nextConfig).toMatch(/'Document-Policy'[\s\S]{0,40}js-profiling/);
  });
});
