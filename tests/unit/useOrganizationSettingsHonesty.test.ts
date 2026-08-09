import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useOrganizationSettings,
  toOrganizationSettings,
  normalizeRegimenCode,
} from '@/lib/hooks/useOrganizationSettings';

/**
 * #95 — Ajustes must render the tenant's real organization and never report a
 * save the server did not accept.
 *
 * The old hook seeded the demo tenant ('Distribuidora del Norte') into
 * localStorage for every visitor, never called GET /api/organization, saved
 * with a PUT the route does not implement, swallowed the rejection, and
 * returned `true` — so "guardado correctamente" showed for a write that had
 * never once succeeded (every save was a silent 405).
 */

const SERVER_ROW = {
  id: 'org-real-1',
  name: 'Ferretería La Central',
  rfc: 'FCE900101AB1',
  regimen_fiscal: '601',
  codigo_postal: '44100',
  phone: '3312345678',
  logo_url: null,
  subscription_tier: 'inicial',
  subscription_status: 'active',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Vitest has no NEXT_PUBLIC_SUPABASE_URL, which reads as demo mode and would
  // silently skip every real-tenant branch below (the CLAUDE.md gotcha).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function mountLoaded() {
  fetchMock.mockResolvedValueOnce(
    jsonResponse(200, { organization: SERVER_ROW, role: 'owner' })
  );
  const rendered = renderHook(() => useOrganizationSettings());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe('load honesty (real tenant)', () => {
  it('renders the tenant’s own organization from GET /api/organization, never the demo tenant', async () => {
    const { result } = await mountLoaded();

    expect(fetchMock).toHaveBeenCalledWith('/api/organization');
    expect(result.current.settings?.name).toBe('Ferretería La Central');
    expect(result.current.settings?.rfc).toBe('FCE900101AB1');
    expect(result.current.role).toBe('owner');
    expect(JSON.stringify(result.current.settings)).not.toContain('Distribuidora del Norte');
  });

  it('reports an error and no settings when the read fails — not the demo tenant', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'SERVER_ERROR', message: 'Error al obtener la organización' } })
    );
    const { result } = renderHook(() => useOrganizationSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings).toBeNull();
    expect(result.current.error).toBe('Error al obtener la organización');
  });

  it('reports an error and no settings when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useOrganizationSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings).toBeNull();
    expect(result.current.error).not.toBeNull();
  });

  it('does not seed anything into localStorage', async () => {
    await mountLoaded();
    expect(localStorage.getItem('business_helper_org_settings_v1')).toBeNull();
  });
});

describe('save honesty', () => {
  it('saves via PATCH and applies the server row, not the local form data', async () => {
    const { result } = await mountLoaded();
    // Server normalizes: RFC uppercased, régimen reduced to its code.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        organization: { ...SERVER_ROW, name: 'Ferretería La Central S.A.', regimen_fiscal: '626' },
      })
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateSettings({
        name: 'Ferretería La Central S.A.',
        regimen_fiscal: '626',
      });
    });

    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[1];
    expect(init?.method).toBe('PATCH');
    expect(result.current.settings?.name).toBe('Ferretería La Central S.A.');
    expect(result.current.settings?.regimen_fiscal).toBe('626');
  });

  it('returns false and surfaces the server message when the save is rejected', async () => {
    const { result } = await mountLoaded();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: 'INVALID_RFC', message: 'El RFC no es válido' } })
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateSettings({ rfc: 'NOPE' });
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('El RFC no es válido');
    // The rejected value must not be presented as saved.
    expect(result.current.settings?.rfc).toBe('FCE900101AB1');
  });

  it('returns false when the network fails — never a fabricated success', async () => {
    const { result } = await mountLoaded();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateSettings({ name: 'Otro Nombre' });
    });

    expect(ok).toBe(false);
    expect(result.current.settings?.name).toBe('Ferretería La Central');
  });
});

describe('demo deployment', () => {
  it('serves the demo tenant without touching the network, only behind the demo signal', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const { result } = renderHook(() => useOrganizationSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.settings?.name).toBe('Distribuidora del Norte');
    expect(result.current.role).toBe('owner');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('toOrganizationSettings', () => {
  it('flattens a server-shaped row — required fields present, no fixture needed', () => {
    expect(toOrganizationSettings(SERVER_ROW)).toEqual({
      id: 'org-real-1',
      name: 'Ferretería La Central',
      rfc: 'FCE900101AB1',
      regimen_fiscal: '601',
      codigo_postal: '44100',
      phone: '3312345678',
      logo_url: null,
      subscription_tier: 'inicial',
      subscription_status: 'active',
    });
  });

  it('treats absent columns as absent, not as demo values', () => {
    const mapped = toOrganizationSettings({ id: 'org-x', name: 'Real' });
    expect(mapped.rfc).toBe('');
    expect(mapped.phone).toBe('');
    expect(JSON.stringify(mapped)).not.toContain('8115551234');
  });

  /**
   * This assertion previously read `toBe('inicial')` — a test pinning the
   * defect rather than catching it (CLAUDE.md rule 7). `organizations`
   * defaults `subscription_tier` to `'free'`, there is no `'free'` plan in
   * STRIPE_PLANS, and mapping it to `'inicial'` told every organization that
   * has never checked out it was on the $299/mes plan.
   */
  /**
   * The database accepts the seven statuses Stripe reports (widened in
   * 20260806120000_security_hardening.sql). Collapsing the four it did not
   * recognise into 'active' badged a tenant Stripe had stopped collecting from
   * as "Activo".
   */
  it('passes the subscription status through instead of rounding it up to active', () => {
    for (const status of ['unpaid', 'incomplete', 'incomplete_expired', 'trialing']) {
      expect(
        toOrganizationSettings({ ...SERVER_ROW, subscription_status: status })
          .subscription_status
      ).toBe(status);
    }
    expect(
      toOrganizationSettings({ ...SERVER_ROW, subscription_status: 'past_due' })
        .subscription_status
    ).toBe('past_due');
    // Absent is the one case that gets a default, and it stays the old one.
    expect(toOrganizationSettings({ id: 'x', name: 'y' }).subscription_status).toBe('active');
  });

  it('reports no tier at all when the row names no paid plan', () => {
    expect(toOrganizationSettings({ id: 'org-x', name: 'Real' }).subscription_tier).toBeNull();
    expect(
      toOrganizationSettings({ ...SERVER_ROW, subscription_tier: 'free' }).subscription_tier
    ).toBeNull();
    // The retired tier key (#renamed to 'inicial') is not silently revived.
    expect(
      toOrganizationSettings({ ...SERVER_ROW, subscription_tier: 'emprendedor' })
        .subscription_tier
    ).toBeNull();
    expect(
      toOrganizationSettings({ ...SERVER_ROW, subscription_tier: 'negocio' }).subscription_tier
    ).toBe('negocio');
  });

  it('reduces a legacy display label to the SAT code', () => {
    expect(normalizeRegimenCode('601 — General de Ley Personas Morales')).toBe('601');
    expect(normalizeRegimenCode('626')).toBe('626');
    expect(normalizeRegimenCode('no es un régimen')).toBe('');
    expect(normalizeRegimenCode(null)).toBe('');
  });
});
