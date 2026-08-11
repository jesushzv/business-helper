import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isClientDemoMode } from '@/lib/clientDemoMode';

/**
 * #124 — `business_helper_sandbox` is sticky, and used to outrank a real
 * session.
 *
 * Any `?demo=true` link plants the flag in localStorage with no expiry, and
 * nothing called `removeItem` on it. So a visitor who once opened the tour,
 * then signed up and became a paying tenant in the same browser, was in demo
 * mode forever: `useClients`, `useProducts`, `useQuotes` and `useReceivables`
 * all served fixtures — including ~$145,000 of cobranza owed by three
 * companies that do not exist — with `error` null, so nothing on screen
 * contradicted it.
 *
 * `DemoSessionExit` clears the flags, but it is asynchronous and mounts only
 * in the dashboard chrome, so hooks could read fixtures before it ran. This
 * pins the synchronous half: a session cookie beats the flag on the first
 * read.
 *
 * Every test here stubs `NEXT_PUBLIC_SUPABASE_URL`. Vitest has none, and its
 * absence alone reads as the demo deployment — without the stub this file
 * would assert nothing (LESSONS.md, client/server state).
 */

const SESSION_COOKIE = 'sb-abcdefghijklm-auth-token';

function clearCookies() {
  for (const name of [SESSION_COOKIE, `${SESSION_COOKIE}.0`, 'demo_mode', 'business_helper_sandbox']) {
    document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe('demo flag lifecycle (#124)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCookies();
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
  });

  afterEach(() => {
    localStorage.clear();
    clearCookies();
    vi.unstubAllEnvs();
  });

  it('honours the sandbox opt-in for a visitor with no session', () => {
    // The tour has to keep working on the real domain — that is what the flag
    // is for, and removing it outright would blank the walkthrough.
    localStorage.setItem('business_helper_sandbox', 'true');
    expect(isClientDemoMode()).toBe(true);
  });

  it('does NOT serve fixtures to a signed-in tenant carrying the flag', () => {
    // The #124 repro: opened a ?demo=true link once, then signed up.
    localStorage.setItem('business_helper_sandbox', 'true');
    document.cookie = `${SESSION_COOKIE}=eyJhbGciOi; path=/`;
    expect(isClientDemoMode()).toBe(false);
  });

  it('recognises a chunked session cookie', () => {
    // @supabase/ssr splits a large session across .0/.1 chunks; matching only
    // the unchunked name would miss exactly the tenants with the most claims
    // in their token.
    localStorage.setItem('business_helper_sandbox', 'true');
    document.cookie = `${SESSION_COOKIE}.0=eyJhbGciOi; path=/`;
    expect(isClientDemoMode()).toBe(false);
  });

  it('is not demo for a configured deployment with neither flag nor session', () => {
    expect(isClientDemoMode()).toBe(false);
  });

  it('still answers true for the demo deployment itself, session or not', () => {
    // No Supabase to be real against: fixtures are the only honest content.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    document.cookie = `${SESSION_COOKIE}=eyJhbGciOi; path=/`;
    expect(isClientDemoMode()).toBe(true);
  });

  it('still answers true for an explicit build-time demo flag', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    document.cookie = `${SESSION_COOKIE}=eyJhbGciOi; path=/`;
    expect(isClientDemoMode()).toBe(true);
  });

  it('does not mistake an unrelated cookie for a session', () => {
    localStorage.setItem('business_helper_sandbox', 'true');
    document.cookie = 'sb-provider-token=nope; path=/';
    document.cookie = 'analytics-auth-token=nope; path=/';
    expect(isClientDemoMode()).toBe(true);
    document.cookie = 'sb-provider-token=; path=/; max-age=0';
    document.cookie = 'analytics-auth-token=; path=/; max-age=0';
  });
});
