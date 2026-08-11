import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '@/components/layout/Header';
import { AppShell } from '@/components/layout/AppShell';
import { __resetCurrentOrgCacheForTests } from '@/lib/hooks/useCurrentOrg';

/**
 * #93 — the chrome rendered against the bytes production actually returns.
 *
 * `useCurrentOrgHonesty.test.ts` pins the hook and `demoIdentityLeak.test.ts`
 * scans for the strings; neither shows what a tenant sees. This renders Header
 * and AppShell over the verbatim body of `GET /api/organization` captured from
 * https://businesshelper.app on 2026-08-11 for the signed-in owner of the
 * "Hector test" organization — a server row, not a fixture, per the
 * server-shaped-row rule in docs/LESSONS.md.
 *
 * `bank_clabe` / `bank_name` are redacted: they are a real settlement account
 * and no part of the chrome reads them. Everything the chrome does read is
 * verbatim, including `rfc: null` (absent, and it must render as absent) and
 * `subscription_tier: 'free'`, which is outside the tier union and must
 * therefore badge as nothing rather than as the nearest paid plan (#95).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

const PRODUCTION_ORG_BODY = {
  organization: {
    id: 'ecae39e6-bae7-4d3e-b960-27e7cb348cc5',
    name: 'Hector test',
    rfc: null,
    regimen_fiscal: '601',
    codigo_postal: null,
    phone: null,
    logo_url: null,
    industry: 'construction',
    subscription_tier: 'free',
    subscription_status: 'active',
    bank_name: '[redacted]',
    bank_clabe: '[redacted]',
    bank_account_holder: null,
  },
  role: 'owner',
};

const DEMO_IDENTITY = [/Distribuidora del Norte/, /Don Roberto/, /DNO850101/];

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/organization')) {
      return new Response(JSON.stringify(PRODUCTION_ORG_BODY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No encontrado' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  // A real tenant, not the demo deployment: without this the demo signal is on
  // in Vitest and the assertions below would pass without proving anything.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://dfyoavffxzujvxvnsizi.supabase.co');
  __resetCurrentOrgCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Header (#93)', () => {
  it("shows the real organization's name, never the demo persona", async () => {
    render(<Header />);

    expect(await screen.findByText('Hector test')).toBeInTheDocument();
    for (const identity of DEMO_IDENTITY) {
      expect(screen.queryByText(identity)).toBeNull();
    }
  });

  it('offers Cerrar sesión from the profile menu', async () => {
    render(<Header />);
    await screen.findByText('Hector test');

    expect(screen.queryByText('Cerrar sesión')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mi cuenta' }));

    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
  });
});

describe('AppShell (#93)', () => {
  it("names the real organization in the sidebar and nothing where the RFC is absent", async () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>
    );

    expect((await screen.findAllByText('Hector test')).length).toBeGreaterThan(0);
    for (const identity of DEMO_IDENTITY) {
      expect(screen.queryByText(identity)).toBeNull();
    }
    // rfc is null on this row: no RFC line at all, not "RFC: —" and not a
    // placeholder that reads as a filed one.
    expect(screen.queryByText(/RFC:/)).toBeNull();
  });

  it("badges no plan for a tier outside the union rather than the nearest paid one", async () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>
    );
    await screen.findAllByText('Hector test');

    expect(screen.queryByText('INICIAL')).toBeNull();
    expect(screen.queryByText('NEGOCIO')).toBeNull();
    expect(screen.queryByText('EMPRESA')).toBeNull();
  });
});
