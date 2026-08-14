import React, { Suspense } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClientDetailPage from '@/app/(dashboard)/clients/[id]/page';
import { __resetCurrentOrgCacheForTests } from '@/lib/hooks/useCurrentOrg';

/**
 * An archived client's profile (#360).
 *
 * `/api/dashboard/analytics` reads clients unfiltered — correctly, since
 * revenue an archived client paid still happened — so Top Clientes ranks them
 * and links to `/clients/[id]`. That page resolved its record from
 * `useClients()`, which since #337 returns the **active** directory, so the
 * dashboard's most prominent card led to "Cliente no encontrado": a dead end
 * reached from the dashboard, in a feature built to remove one.
 *
 * The page now reads `GET /api/clients/[id]`, which has always answered for
 * archived rows and is scoped by `organization_id`. Their history stays
 * browsable, the archived state is stated, and restoring is offered where the
 * owner is standing.
 */

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const ARCHIVED_CLIENT = {
  id: 'client-real-1',
  organization_id: 'org-real-1',
  name: 'Aceros del Bajío S.A. de C.V.',
  contact_name: 'Ing. Laura Peña',
  email: 'lpena@acerosbajio.mx',
  phone: '4771234567',
  rfc: 'ABA050505XX1',
  regimen_fiscal: '601',
  codigo_postal: '37000',
  cfdi_use: 'G03',
  notes: null,
  health_score: 90,
  credit_limit: 80000,
  credit_days: 30,
  credit_status: 'active',
  archived_at: '2026-08-14T08:00:00Z',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const ACTIVE_CLIENT = { ...ARCHIVED_CLIENT, archived_at: null };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

function answerApis({
  client,
  role = 'owner',
  onArchiveWrite,
}: {
  client: unknown;
  role?: string;
  onArchiveWrite?: (body: unknown) => Response;
}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/archive')) {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      return onArchiveWrite
        ? onArchiveWrite(body)
        : jsonResponse(200, { client: { ...ARCHIVED_CLIENT, archived_at: null } });
    }
    // The by-id route answers for archived rows; the directory list does not
    // carry them, which is exactly why the page cannot resolve from it.
    if (url.startsWith('/api/clients/')) return jsonResponse(200, { client });
    if (url.startsWith('/api/clients')) return jsonResponse(200, { clients: [] });
    if (url.startsWith('/api/quotes')) return jsonResponse(200, { quotes: [] });
    if (url.startsWith('/api/receivables')) return jsonResponse(200, { receivables: [] });
    if (url.startsWith('/api/organization')) {
      return jsonResponse(200, {
        organization: { id: 'org-real-1', name: 'Ferretería La Central' },
        role,
      });
    }
    return jsonResponse(404, {});
  });
}

function renderPage() {
  const params = Promise.resolve({ id: 'client-real-1' }) as Promise<{ id: string }> & {
    status: string;
    value: { id: string };
  };
  params.status = 'fulfilled';
  params.value = { id: 'client-real-1' };

  return render(
    <Suspense fallback={null}>
      <ClientDetailPage params={params} />
    </Suspense>
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  mockPush.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Without this the demo signal defaults to *on* in Vitest and the real-tenant
  // branch is never exercised (the LESSONS.md trap).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  __resetCurrentOrgCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('an archived client is reachable, not a dead end (#360)', () => {
  it('renders the profile instead of "Cliente no encontrado"', async () => {
    answerApis({ client: ARCHIVED_CLIENT });
    renderPage();

    expect((await screen.findAllByText('Aceros del Bajío S.A. de C.V.')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Cliente no encontrado/i)).toBeNull();
    // The history the archive was never supposed to hide.
    expect(screen.getByText(/ABA050505XX1/)).toBeTruthy();
  });

  it('says the client is archived, in the owner’s words', async () => {
    answerApis({ client: ARCHIVED_CLIENT });
    renderPage();

    expect(await screen.findByText(/Este cliente está archivado/i)).toBeTruthy();
    expect(screen.getByText(/No aparece en tu directorio/i)).toBeTruthy();
    // Never the machine's vocabulary.
    expect(screen.queryByText(/archived_at|soft delete/i)).toBeNull();
  });

  it('offers Restaurar with a ≥48px target, and no Archivar for a client already archived', async () => {
    answerApis({ client: ARCHIVED_CLIENT });
    renderPage();

    const restore = await screen.findByRole('button', { name: /Restaurar cliente/i });
    expect(restore.className).toContain('min-h-[48px]');
    expect(screen.queryByRole('button', { name: /^Archivar$/i })).toBeNull();
  });

  it('says nothing about archiving for an active client', async () => {
    answerApis({ client: ACTIVE_CLIENT });
    renderPage();

    await screen.findAllByText('Aceros del Bajío S.A. de C.V.');
    expect(screen.queryByText(/Este cliente está archivado/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Restaurar cliente/i })).toBeNull();
  });

  it('hides the restore control from a role that cannot archive', async () => {
    // `POST /api/clients/[id]/archive` requires delete_records, which a member
    // does not hold. Never send a user to fix something they lack the write for.
    answerApis({ client: ARCHIVED_CLIENT, role: 'member' });
    renderPage();

    expect(await screen.findByText(/Este cliente está archivado/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Restaurar/i })).toBeNull();
  });
});

describe('restoring from the profile (#360)', () => {
  it('sends the write and clears the banner using the row the server returned', async () => {
    answerApis({ client: ARCHIVED_CLIENT });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Restaurar cliente/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, restaurar cliente/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/archive'));
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ archived: false });
    });

    // The banner goes away because the server said the client is no longer
    // archived — not because the click happened.
    await waitFor(() => expect(screen.queryByText(/Este cliente está archivado/i)).toBeNull());
    expect(await screen.findByText(/Cliente restaurado/i)).toBeTruthy();
  });

  it('keeps the banner and reports the failure when the write is refused', async () => {
    answerApis({
      client: ARCHIVED_CLIENT,
      onArchiveWrite: () =>
        jsonResponse(403, {
          error: { code: 'FORBIDDEN', message: 'No tienes permiso para restaurar clientes.' },
        }),
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Restaurar cliente/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, restaurar cliente/i }));

    expect(await screen.findByText(/No se pudo restaurar/i)).toBeTruthy();
    // A refused write leaves the client archived on screen, because they are.
    expect(screen.getByText(/Este cliente está archivado/i)).toBeTruthy();
  });
});
