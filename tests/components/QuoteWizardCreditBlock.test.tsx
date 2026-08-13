import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuoteWizardModal } from '@/components/quotes/QuoteWizardModal';
import type { Client } from '@/types';

/**
 * #203 — the wizard consumes `isAllowed`, not just `warningMessage`.
 *
 * For a client the owner marked `blocked`, the server now refuses the write
 * with a 403, so the wizard must not offer a submit that can only fail
 * (#64's corollary). Before this, the red sentence rendered and every control
 * stayed enabled — the message said "solo se permiten ventas de contado"
 * while the product permitted exactly what it said it did not.
 */

const BLOCKED_CLIENT: Client = {
  id: 'client-blocked',
  name: 'Comercial Morosa SA',
  credit_status: 'blocked',
  credit_limit: 50000,
} as unknown as Client;

const ACTIVE_CLIENT: Client = {
  id: 'client-active',
  name: 'Constructora del Valle',
  credit_status: 'active',
  credit_limit: 50000,
} as unknown as Client;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ accounts: [], role: 'owner' }) }))
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Fills steps 1 and 2 and lands on the confirm step, where submit lives. */
async function reachConfirmStep() {
  const next = () => screen.getByRole('button', { name: /Siguiente/i });

  fireEvent.change(screen.getByPlaceholderText(/Suministro de Cemento/i), {
    target: { value: 'Suministro para obra' },
  });
  fireEvent.click(next());

  fireEvent.change(screen.getByPlaceholderText(/Descripción del producto/i), {
    target: { value: 'Cemento gris 50kg' },
  });
  fireEvent.change(document.getElementById('line-item-0-quantity') as HTMLInputElement, {
    target: { value: '1' },
  });
  fireEvent.change(document.getElementById('line-item-0-unit-price') as HTMLInputElement, {
    target: { value: '1000' },
  });
  fireEvent.click(next());

  await waitFor(() => expect(screen.getByText(/Resumen y Confirmación/i)).toBeInTheDocument());
}

describe('the wizard refuses to offer a submit the server will 403 (#203)', () => {
  it('disables submit for a blocked client, with the reason on screen', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <QuoteWizardModal isOpen onClose={() => {}} clients={[BLOCKED_CLIENT]} onSubmit={onSubmit} />
    );
    await reachConfirmStep();

    expect(screen.getByRole('button', { name: /Generar y Compartir/i })).toBeDisabled();
    // The reason renders next to the disabled control, naming the state:
    expect(screen.getAllByText(/crédito bloqueado/i).length).toBeGreaterThan(0);
  });

  it('keeps submit enabled for an active client', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <QuoteWizardModal isOpen onClose={() => {}} clients={[ACTIVE_CLIENT]} onSubmit={onSubmit} />
    );
    await reachConfirmStep();

    expect(screen.getByRole('button', { name: /Generar y Compartir/i })).toBeEnabled();
  });
});
