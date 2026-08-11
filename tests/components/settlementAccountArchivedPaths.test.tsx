import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PayPage from '@/app/pay/[token]/page';
import { ReceivableCard } from '@/components/receivables/ReceivableCard';
import { BankAccountsCard } from '@/components/settings/BankAccountsCard';
import type { MilestoneWithClient } from '@/lib/hooks/useReceivables';

/**
 * What happens after a tenant archives an account that quotes already name
 * (#164) — the failure a `money-path-reviewer` pass found reaching the payer.
 *
 * `resolveQuoteAccount` refuses rather than substituting, which is right. But
 * every surface downstream of that refusal was answering the wrong question:
 *
 * - `/pay/[token]` branched on two error codes and flattened everything else
 *   into **"Enlace de Pago No Encontrado — la clave o ficha de cobro no existe
 *   o ha expirado"**. A client holding a valid quote was told their cobro was
 *   not real, so nobody contacted anybody.
 * - Cobranza's gate is organization-level ("has ≥1 live account"), so a tenant
 *   with two accounts who archived the non-default one kept every share button
 *   live and kept sending links that refuse.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'a1b2c3d4e5f678901234567890abcdef' }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const ARCHIVED_MESSAGE =
  'La cuenta de cobro de esta cotización ya no está disponible. Contacta al negocio antes de transferir.';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the payer, when the quote names an archived account', () => {
  it('is told to contact the business — never that the link does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(409, {
          error: { code: 'SETTLEMENT_ACCOUNT_UNAVAILABLE', message: ARCHIVED_MESSAGE },
        })
      )
    );

    render(<PayPage />);

    await waitFor(() => expect(screen.getByText(ARCHIVED_MESSAGE)).toBeInTheDocument());
    // The old rendering, which turned a real cobro into a fake one.
    expect(screen.queryByText(/no existe o ha expirado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enlace de Pago No Encontrado/i)).not.toBeInTheDocument();
  });

  /**
   * `publicApiError()` guarantees a Spanish message safe to render verbatim, so
   * a refusal this page has no styling for is still said in the route's words.
   * Flattening it to "no existe" asserts something the page cannot know.
   */
  it('renders an unrecognised refusal in the route’s own words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(409, {
          error: { code: 'SOME_FUTURE_CODE', message: 'Este cobro está en revisión.' },
        })
      )
    );

    render(<PayPage />);

    await waitFor(() => expect(screen.getByText('Este cobro está en revisión.')).toBeInTheDocument());
    expect(screen.queryByText(/no existe o ha expirado/i)).not.toBeInTheDocument();
  });

  /** A token that genuinely resolves to nothing still says so. */
  it('still reports a truly unknown token as not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(404, { error: { code: 'PAYMENT_NOT_FOUND', message: 'Cobro no encontrado' } })
      )
    );

    render(<PayPage />);

    await waitFor(() => expect(screen.getByText(/Cobro no encontrado/i)).toBeInTheDocument());
  });
});

describe('Cobranza, when the quote names an archived account', () => {
  const milestone = (overrides: Partial<MilestoneWithClient> = {}): MilestoneWithClient =>
    ({
      id: 'ms-1',
      organization_id: 'org-1',
      contract_id: 'contract-1',
      label: 'Anticipo',
      amount: 15000,
      due_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      status: 'pending',
      tracking_reference: null,
      transferred_amount: null,
      receipt_url: null,
      created_at: new Date().toISOString(),
      client_name: 'Constructora del Valle',
      client_phone: '8112345678',
      contract_title: 'Suministro',
      public_token: 'a1b2c3d4e5f678901234567890abcdef',
      pay_account_archived: false,
      ...overrides,
    }) as unknown as MilestoneWithClient;

  it('offers the reminder while the named account is live', () => {
    render(<ReceivableCard milestone={milestone()} canShare />);

    expect(screen.getByRole('link', { name: /Recordar WhatsApp/i })).toBeInTheDocument();
  });

  /**
   * The organization-level gate says "ready" here — the tenant still has their
   * default. Only the quote's own account is gone, and the link is built in the
   * browser as a `wa.me/` URL, so no server refusal can intercept this path.
   */
  it('refuses to hand out a link whose payment page will refuse', () => {
    render(<ReceivableCard milestone={milestone({ pay_account_archived: true })} canShare />);

    expect(screen.queryByRole('link', { name: /Recordar WhatsApp/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Cuenta de cobro archivada/i)).toBeInTheDocument();
  });

  it('names the account as the thing to fix, not the phone or the quote', () => {
    render(<ReceivableCard milestone={milestone({ pay_account_archived: true })} canShare />);

    expect(screen.queryByText(/Agrega un teléfono/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin liga de pago/i)).not.toBeInTheDocument();
  });

  it('does not open the payment portal for a quote whose account is archived', () => {
    render(<ReceivableCard milestone={milestone({ pay_account_archived: true })} canShare />);

    expect(screen.queryByRole('link', { name: /Portal|Ver Pago|SPEI/i })).not.toBeInTheDocument();
  });
});

describe('the owner whose role could not be read', () => {
  /**
   * `canEdit` comes from a *separate* read of `/api/organization`; that read
   * failing yields `false`, indistinguishable from "you are a member". This
   * card has its own `role` from the accounts route, so it can tell them apart
   * rather than telling an owner they are not the owner (#64's tri-state rule).
   */
  it('still offers the actions when the accounts route says owner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { accounts: [], role: 'owner' }))
    );

    render(<BankAccountsCard canEdit={false} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Agregar cuenta/i })).toBeInTheDocument()
    );
    expect(screen.queryByText(/Solo el dueño de la cuenta puede/i)).not.toBeInTheDocument();
  });

  it('says the role is unknown rather than asserting the caller is not the owner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: { message: 'caído' } })));

    render(<BankAccountsCard canEdit={false} />);

    await waitFor(() =>
      expect(screen.getByText(/No pudimos confirmar tu rol/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Solo el dueño de la cuenta puede/i)).not.toBeInTheDocument();
  });

  it('still tells a known member that only the owner may change these', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { accounts: [], role: 'member' }))
    );

    render(<BankAccountsCard canEdit={false} />);

    await waitFor(() =>
      expect(screen.getByText(/Solo el dueño de la cuenta puede/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /Agregar cuenta/i })).not.toBeInTheDocument();
  });
});
