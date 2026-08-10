import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DemoSessionExit } from '@/components/demo/DemoSessionExit';

/**
 * The state this component exists for: `business_helper_sandbox` in
 * localStorage (planted by "Ver Demo", never expiring) alongside a live
 * Supabase session. That combination showed a signed-in Google user the
 * sandbox dashboard. A real session must win: flags cleared, one reload with
 * the ?demo/?sandbox params stripped so the reload cannot re-plant them.
 */

const mockGetSession = vi.fn();
let supabaseConfigured = true;

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => supabaseConfigured,
  createClient: () => ({ auth: { getSession: mockGetSession } }),
}));

const replaceMock = vi.fn();

function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, 'location', {
    value: {
      href: url.href,
      search: url.search,
      pathname: url.pathname,
      hash: url.hash,
      replace: replaceMock,
    },
    writable: true,
    configurable: true,
  });
}

function expireDemoCookies() {
  for (const name of ['demo_mode', 'business_helper_sandbox', 'sandbox']) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe('DemoSessionExit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
    supabaseConfigured = true;
    localStorage.clear();
    expireDemoCookies();
    setLocation('https://app.test/dashboard');
  });

  it('clears stale sandbox flags and reloads once when a real session exists', async () => {
    localStorage.setItem('business_helper_sandbox', 'true');
    localStorage.setItem('business_helper_demo', 'true');
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });

    render(<DemoSessionExit />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem('business_helper_sandbox')).toBeNull();
    expect(localStorage.getItem('business_helper_demo')).toBeNull();
    expect(replaceMock).toHaveBeenCalledWith('https://app.test/dashboard');
  });

  it('strips ?demo=true from the reload URL so the exit cannot loop', async () => {
    setLocation('https://app.test/dashboard?demo=true&tab=cobranza');
    localStorage.setItem('business_helper_sandbox', 'true');
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });

    render(<DemoSessionExit />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith('https://app.test/dashboard?tab=cobranza');
  });

  it('leaves the demo visitor alone when there is no session', async () => {
    localStorage.setItem('business_helper_sandbox', 'true');
    mockGetSession.mockResolvedValue({ data: { session: null } });

    render(<DemoSessionExit />);

    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(localStorage.getItem('business_helper_sandbox')).toBe('true');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('leaves the demo state alone when the session read fails — unknown is not signed in', async () => {
    localStorage.setItem('business_helper_sandbox', 'true');
    mockGetSession.mockRejectedValue(new Error('network down'));

    render(<DemoSessionExit />);

    await waitFor(() => expect(mockGetSession).toHaveBeenCalled());
    expect(localStorage.getItem('business_helper_sandbox')).toBe('true');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not even ask for a session when no demo flag is present', async () => {
    render(<DemoSessionExit />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does nothing on the unconfigured demo deployment', async () => {
    supabaseConfigured = false;
    localStorage.setItem('business_helper_sandbox', 'true');

    render(<DemoSessionExit />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('business_helper_sandbox')).toBe('true');
  });
});
