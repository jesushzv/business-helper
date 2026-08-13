import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The founder panel (`/admin`), asked the tenant's question (#146): can the
 * founder see the platform and complete the one action the page offers?
 *
 * The page is data-gated, not markup-gated — the API answers 404 for anyone
 * off the allowlist and the page must then vanish behind `notFound()` rather
 * than render an empty admin shell. On the action, the row shown after a
 * grant must be the server's readback, never the optimistic local value
 * (#33/#50/#59).
 */

const notFoundMock = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
}));

import AdminPage from '@/app/admin/page';

const METRICS = {
  generated_at: '2026-08-13T00:00:00.000Z',
  totals: {
    organizations: 2,
    users: 4,
    clients: 7,
    quotes: 5,
    contracts: 3,
    milestones: 9,
    confirmed_payments: 3,
    confirmed_amount_mxn: 3500.5,
  },
  subscriptions: { trialing: 1, active: 1 },
  tiers: { inicial: 1, negocio: 1 },
  organizations: [
    {
      id: 'org-1',
      name: 'Constructora Norte',
      subscription_tier: 'inicial',
      subscription_status: 'trialing',
      trial_ends_at: '2026-09-01T00:00:00.000Z',
      created_at: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'org-2',
      name: 'Taller del Sur',
      subscription_tier: 'negocio',
      subscription_status: 'active',
      trial_ends_at: null,
      created_at: '2026-07-01T00:00:00.000Z',
    },
  ],
  organizations_total: 2,
};

type FetchCall = { url: string; init?: RequestInit };
const fetchCalls: FetchCall[] = [];

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let metricsResponse: () => Response | Promise<Response>;
let trialResponse: () => Response | Promise<Response>;

beforeEach(() => {
  notFoundMock.mockClear();
  fetchCalls.length = 0;
  metricsResponse = () => jsonResponse(200, METRICS);
  trialResponse = () =>
    jsonResponse(200, {
      organization: {
        id: 'org-1',
        name: 'Constructora Norte',
        subscription_tier: 'inicial',
        subscription_status: 'trialing',
        trial_ends_at: '2026-10-01T00:00:00.000Z',
      },
      previous_trial_ends_at: '2026-09-01T00:00:00.000Z',
    });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).includes('/trial')) return trialResponse();
      return metricsResponse();
    })
  );
});

describe('AdminPage', () => {
  it('vanishes behind notFound() when the API answers 404', async () => {
    metricsResponse = () =>
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });

    render(<AdminPage />);
    await waitFor(() => expect(notFoundMock).toHaveBeenCalled());
  });

  it('renders platform totals and the organization list', async () => {
    render(<AdminPage />);

    expect(await screen.findByText('Constructora Norte')).toBeInTheDocument();
    expect(screen.getByText('Taller del Sur')).toBeInTheDocument();
    // Organization count tile and confirmed revenue are the two headline figures.
    expect(screen.getByTestId('total-organizations')).toHaveTextContent('2');
    expect(screen.getByTestId('total-confirmed-amount')).toHaveTextContent('3,500.50');
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('shows an unknown user count as an em dash, never 0 (#64)', async () => {
    metricsResponse = () =>
      jsonResponse(200, { ...METRICS, totals: { ...METRICS.totals, users: null } });

    render(<AdminPage />);
    await screen.findByText('Constructora Norte');
    expect(screen.getByTestId('total-users')).toHaveTextContent('—');
    expect(screen.getByTestId('total-users')).not.toHaveTextContent('0');
  });

  it('extends a trial and renders the server row, not the optimistic one', async () => {
    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText('Constructora Norte');

    await user.click(screen.getAllByRole('button', { name: /extender prueba/i })[0]);

    await waitFor(() => {
      const trialCall = fetchCalls.find((c) => c.url.includes('/trial'));
      expect(trialCall).toBeDefined();
      expect(trialCall!.url).toContain('/api/admin/organizations/org-1/trial');
      expect(JSON.parse(String(trialCall!.init?.body))).toEqual({ days: 30 });
    });

    // 2026-10-01 comes only from the mocked server response.
    expect(await screen.findByText(/2026-10-01/)).toBeInTheDocument();
  });

  it('surfaces a failed extension as an error instead of pretending success', async () => {
    trialResponse = () =>
      jsonResponse(409, {
        error: { code: 'SUBSCRIPTION_ACTIVE', message: 'La organización ya tiene una suscripción activa.' },
      });

    const user = userEvent.setup();
    render(<AdminPage />);
    await screen.findByText('Constructora Norte');

    await user.click(screen.getAllByRole('button', { name: /extender prueba/i })[0]);

    expect(
      await screen.findByText('La organización ya tiene una suscripción activa.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-01/)).not.toBeInTheDocument();
  });

  it('shows a Spanish error when the metrics read fails — no invented figures', async () => {
    metricsResponse = () => {
      throw new Error('network down');
    };

    render(<AdminPage />);
    expect(await screen.findByText(/No se pudieron cargar las métricas/)).toBeInTheDocument();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});
