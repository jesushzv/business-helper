import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useCurrentOrg,
  applyCurrentOrgRow,
  invalidateCurrentOrg,
  __resetCurrentOrgCacheForTests,
} from '@/lib/hooks/useCurrentOrg';
import { useOrganizationSettings } from '@/lib/hooks/useOrganizationSettings';

/**
 * #281 — the chrome's cached identity is corrected when the tenant changes it.
 *
 * `cached` is module scope and only `signOut` cleared it, so renaming the
 * business in Ajustes saved, reported success, and left the header, the sidebar
 * badge and `buildClientGreeting()` — which signs the WhatsApp messages a
 * tenant's *clients* receive — showing the old name for the rest of the SPA
 * session.
 *
 * Every case here renders **two** consumers, because one hook re-rendering with
 * fresh state proves nothing: the defect is that the other one, mounted
 * elsewhere in the tree, keeps the stale copy.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ORG_ROW = {
  id: 'org-1',
  name: 'Ferretería La Central',
  rfc: 'FCE900101AB1',
  logo_url: null,
  subscription_tier: 'inicial',
  subscription_status: 'active',
  regimen_fiscal: '612',
  codigo_postal: '64000',
  phone: '8112345678',
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // A real tenant, not the demo deployment: without this the hooks
  // short-circuit and the assertions below would cover nothing (LESSONS,
  // client/server state).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  __resetCurrentOrgCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function mountedChrome() {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { organization: ORG_ROW, role: 'owner' }));
  const header = renderHook(() => useCurrentOrg());
  await waitFor(() => expect(header.result.current.loading).toBe(false));

  // A second consumer, served from the cache — the sidebar to the header.
  const sidebar = renderHook(() => useCurrentOrg());
  expect(sidebar.result.current.org?.name).toBe('Ferretería La Central');

  return { header, sidebar };
}

describe('applyCurrentOrgRow', () => {
  it('corrects every mounted consumer, not just the one that wrote', async () => {
    const { header, sidebar } = await mountedChrome();

    act(() => {
      applyCurrentOrgRow({ ...ORG_ROW, name: 'Ferretería Don Roberto' });
    });

    expect(header.result.current.org?.name).toBe('Ferretería Don Roberto');
    expect(sidebar.result.current.org?.name).toBe('Ferretería Don Roberto');
  });

  it('does not re-fetch — the row it was handed is the answer', async () => {
    const { header } = await mountedChrome();
    const callsBefore = fetchMock.mock.calls.length;

    act(() => {
      applyCurrentOrgRow({ ...ORG_ROW, rfc: 'XAXX010101000' });
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(header.result.current.org?.rfc).toBe('XAXX010101000');
  });

  it('keeps the role and the user, which the organization row does not carry', async () => {
    const { header } = await mountedChrome();

    act(() => {
      applyCurrentOrgRow({ ...ORG_ROW, name: 'Ferretería Don Roberto' });
    });

    expect(header.result.current.role).toBe('owner');
  });
});

describe('invalidateCurrentOrg', () => {
  it('re-reads from the server rather than showing the old identity', async () => {
    const { header, sidebar } = await mountedChrome();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        organization: { ...ORG_ROW, name: 'Ferretería Don Roberto' },
        role: 'owner',
      })
    );

    act(() => {
      invalidateCurrentOrg();
    });

    await waitFor(() =>
      expect(header.result.current.org?.name).toBe('Ferretería Don Roberto')
    );
    expect(sidebar.result.current.org?.name).toBe('Ferretería Don Roberto');
  });

  it('shows neutral chrome while the re-read is in flight, never the stale name', async () => {
    const { header } = await mountedChrome();

    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );

    act(() => {
      invalidateCurrentOrg();
    });

    // Mid-flight: the old name is gone and nothing has replaced it yet. A stale
    // name here is the defect wearing a loading state.
    expect(header.result.current.org).toBeNull();
    expect(header.result.current.loading).toBe(true);

    await act(async () => {
      release(jsonResponse(200, { organization: ORG_ROW, role: 'owner' }));
    });
    await waitFor(() => expect(header.result.current.loading).toBe(false));
    expect(header.result.current.org?.name).toBe('Ferretería La Central');
  });
});

describe('saving the organization profile (#281, end to end)', () => {
  it('renames the chrome the tenant is looking at, from the server row', async () => {
    const { header, sidebar } = await mountedChrome();

    // The settings hook's own GET…
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { organization: ORG_ROW, role: 'owner' }));
    const settings = renderHook(() => useOrganizationSettings());
    await waitFor(() => expect(settings.result.current.loading).toBe(false));

    // …then the PATCH. The route normalizes (it upper-cases the RFC), and the
    // *server* row is what must land in the chrome — mirroring the submitted
    // patch would put text on screen the database does not hold.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        organization: { ...ORG_ROW, name: 'Ferretería Don Roberto', rfc: 'XAXX010101000' },
      })
    );

    await act(async () => {
      const outcome = await settings.result.current.updateSettings({
        name: 'Ferretería Don Roberto',
        rfc: 'xaxx010101000',
      });
      expect(outcome.ok).toBe(true);
    });

    expect(header.result.current.org?.name).toBe('Ferretería Don Roberto');
    expect(sidebar.result.current.org?.name).toBe('Ferretería Don Roberto');
    expect(header.result.current.org?.rfc).toBe('XAXX010101000');
  });

  it('leaves the chrome alone when the save failed', async () => {
    const { header } = await mountedChrome();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { organization: ORG_ROW, role: 'owner' }));
    const settings = renderHook(() => useOrganizationSettings());
    await waitFor(() => expect(settings.result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'Error interno' } })
    );

    await act(async () => {
      const outcome = await settings.result.current.updateSettings({ name: 'Nombre rechazado' });
      expect(outcome.ok).toBe(false);
    });

    // A rejected write that renamed the header would be the fabricated success
    // this repo keeps shipping (hard rule #1).
    expect(header.result.current.org?.name).toBe('Ferretería La Central');
  });
});
