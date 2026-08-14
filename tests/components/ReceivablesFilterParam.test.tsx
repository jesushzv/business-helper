import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ReceivablesPage from '@/app/(dashboard)/receivables/page';

/**
 * #279 — the dashboard's "Cobrar hoy" card links to
 * `/receivables?filter=overdue`, and the param must actually select the
 * filter: it was produced by the card and consumed by nothing, so the owner
 * landed on the unfiltered list and re-filtered by hand — against the
 * ≤3-taps rule for the primary persona.
 *
 * Demo posture (no Supabase URL in vitest): the hook serves the sandbox
 * fixtures, which is fine — the filter selection is what's under test.
 */

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
  fetchMock.mockResolvedValue(jsonResponse(200, {}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const filterButton = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('/receivables?filter=… selects the filter (#279)', () => {
  it('lands on Atrasados when the dashboard card links with filter=overdue', async () => {
    window.history.pushState({}, '', '/receivables?filter=overdue');
    render(<ReceivablesPage />);

    await waitFor(() =>
      expect(filterButton(/Atrasados/i).className).toContain('bg-emerald-500')
    );
    expect(filterButton(/Todas/i).className).not.toContain('bg-emerald-500');
  });

  it('stays on Todas without the param', async () => {
    window.history.pushState({}, '', '/receivables');
    render(<ReceivablesPage />);

    await waitFor(() => expect(filterButton(/Todas/i).className).toContain('bg-emerald-500'));
  });

  it('ignores an unknown filter value instead of blanking the list', async () => {
    window.history.pushState({}, '', '/receivables?filter=nonsense');
    render(<ReceivablesPage />);

    await waitFor(() => expect(filterButton(/Todas/i).className).toContain('bg-emerald-500'));
  });
});
