import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The root layout mounts this component on every page, so its only hard
 * requirement is the one `lib/analytics.ts` states as rule 1: analytics must
 * never break the product. A missing key is the normal state in demo, local dev
 * and CI — it has to stay quiet rather than take the layout down.
 */

const posthogInit = vi.fn();
const posthogIdentify = vi.fn();
const posthogGetDistinctId = vi.fn(() => 'posthog-js-id');

vi.mock('posthog-js', () => ({
  default: {
    init: (...args: unknown[]) => posthogInit(...args),
    identify: (...args: unknown[]) => posthogIdentify(...args),
    reset: vi.fn(),
    captureException: vi.fn(),
    get_distinct_id: () => posthogGetDistinctId(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a missing key never breaks the page', () => {
  it('renders without throwing in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { PostHogInit } = await import('@/components/PostHogInit');
    expect(() => render(<PostHogInit />)).not.toThrow();

    expect(posthogInit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders silently in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { PostHogInit } = await import('@/components/PostHogInit');
    expect(() => render(<PostHogInit />)).not.toThrow();

    expect(posthogInit).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves the helpers inert rather than calling into an uninitialized SDK', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const { identifyPostHogUser } = await import('@/components/PostHogInit');

    expect(() => identifyPostHogUser('user-1', { email: 'x@y.mx' })).not.toThrow();
    expect(posthogIdentify).not.toHaveBeenCalled();
  });
});

describe('with a key configured', () => {
  it('initializes on mount and defaults the host', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');

    const { PostHogInit } = await import('@/components/PostHogInit');
    render(<PostHogInit />);

    expect(posthogInit).toHaveBeenCalledTimes(1);
    const [token, options] = posthogInit.mock.calls[0] as [string, { api_host: string }];
    expect(token).toBe('phc_test');
    expect(options.api_host).toBe('https://us.i.posthog.com');
  });

  it('hands its distinct id to the raw capture path, so both senders agree', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');

    const { PostHogInit } = await import('@/components/PostHogInit');
    const analytics = await import('@/lib/analytics');

    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<PostHogInit />);
    await analytics.capture('signup_started');

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.distinct_id).toBe('posthog-js-id');

    analytics.setBrowserDistinctIdSource(null);
    vi.unstubAllGlobals();
  });
});
