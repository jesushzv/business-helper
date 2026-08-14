import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopClientsCard } from '@/components/dashboard/TopClientsCard';
import type { TopClientRevenue } from '@/lib/dashboardAnalytics';

/**
 * #277 / #276 — the leaderboard tells the truth about who paid and how they
 * are scored. Its $0 rows and invented "Excelente (100 pt)" badges are filtered
 * and nulled upstream; these cases pin what the card itself claims.
 */

vi.mock('@/lib/hooks/useCurrentOrg', () => ({
  useCurrentOrg: () => ({ org: { name: 'Ferretería La Central' } }),
}));

const PAYER: TopClientRevenue = {
  id: 'c-1',
  name: 'Constructora del Bajío',
  contact_name: 'Ing. Laura Peña',
  phone: '+528112345678',
  health_score: null,
  rfc: '',
  totalRevenue: 48720,
  confirmedMilestonesCount: 2,
};

describe('TopClientsCard', () => {
  it('badges a client with no score as "Sin historial", never Excelente (#276)', () => {
    render(<TopClientsCard topClients={[PAYER]} hasClients />);

    expect(screen.getByText(/Sin historial/i)).toBeTruthy();
    expect(screen.queryByText(/Excelente/i)).toBeNull();
    expect(screen.queryByText(/100 pt/i)).toBeNull();
  });

  it('still shows a real score as one', () => {
    render(<TopClientsCard topClients={[{ ...PAYER, health_score: 92 }]} hasClients />);

    expect(screen.getByText(/Excelente \(92 pt\)/i)).toBeTruthy();
  });

  it('tells a tenant with clients but no revenue what will fill the ranking (#277)', () => {
    render(<TopClientsCard topClients={[]} hasClients />);

    expect(screen.getByText(/No hay ingresos confirmados/i)).toBeTruthy();
    expect(screen.queryByText(/Todavía no tienes clientes/i)).toBeNull();
  });

  it('tells a tenant with no clients to register one — different absence, different copy', () => {
    render(<TopClientsCard topClients={[]} hasClients={false} />);

    expect(screen.getByText(/Todavía no tienes clientes registrados/i)).toBeTruthy();
    expect(screen.queryByText(/No hay ingresos confirmados/i)).toBeNull();
  });
});
