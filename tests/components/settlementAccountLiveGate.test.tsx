import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BankAccountsCard } from '@/components/settings/BankAccountsCard';
import { SettlementAccountBanner } from '@/components/settlement/SettlementAccountBanner';
import { ReceivableCard } from '@/components/receivables/ReceivableCard';
import { useSettlementAccount } from '@/lib/hooks/useSettlementAccount';
import type { MilestoneWithClient } from '@/lib/hooks/useReceivables';

/**
 * The tenant's question, not the function's (#163, #164): *after I change my
 * settlement accounts, does the rest of the app follow — in this session,
 * without a reload?*
 *
 * Each layer is covered on its own: the hook refetches when notified, the card
 * writes through the API. The defect lives *between* them — nothing proves the
 * card ever notifies, and both call sites could be deleted with a green suite,
 * restoring the failure #64 exists to prevent (an owner archives their last
 * account, walks to Cobranza, and shares a `/pay/` link that answers 409 in
 * front of their client). So this renders the settings card, the dashboard
 * banner and a Cobranza share button together and drives them like a user.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is stubbed to a real-looking value on purpose: it
 * is unset in Vitest, so `isClientDemoMode()` is on by default, the hooks
 * short-circuit, and every assertion below would pass while exercising nothing.
 */

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const BBVA = {
  id: 'acct-1',
  label: 'BBVA obra',
  bank_name: 'BBVA México',
  clabe: '012180001234567899',
  account_holder: 'Ferretería La Central',
  is_default: true,
  archived_at: null,
};

const SANTANDER = {
  id: 'acct-2',
  label: 'Santander nómina',
  bank_name: 'Santander',
  clabe: '014180001234567897',
  account_holder: 'Ferretería La Central',
  is_default: false,
  archived_at: null,
};

const MILESTONE: MilestoneWithClient = {
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
  updated_at: new Date().toISOString(),
  client_name: 'Constructora del Valle',
  client_phone: '8112345678',
  contract_title: 'Suministro',
  public_token: 'a1b2c3d4e5f678901234567890abcdef',
} as unknown as MilestoneWithClient;

/** Cobranza's share button, wired to the gate exactly as the page wires it. */
const ShareAction: React.FC = () => {
  const { ready } = useSettlementAccount();
  return <ReceivableCard milestone={MILESTONE} canShare={ready !== false} />;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the gate follows the accounts without a page reload (#163, #164)', () => {
  it('raises the banner and blocks sharing once the owner archives their last account', async () => {
    let archived = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          archived = true;
          return jsonResponse({ account: { ...BBVA, is_default: false, archived_at: '2026-08-11T00:00:00Z' } });
        }
        return jsonResponse({ accounts: archived ? [] : [BBVA], role: 'owner' });
      })
    );

    render(
      <>
        <SettlementAccountBanner />
        <BankAccountsCard canEdit />
        <ShareAction />
      </>
    );

    // Healthy tenant: account listed, no banner, sharing available.
    await waitFor(() => expect(screen.getByText('BBVA obra')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Recordar WhatsApp/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Archivar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, archivar/i }));

    // Nothing remounts here — in the app the banner lives in the dashboard
    // shell and the share button on another route, both of which survive a
    // client-side navigation.
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Recordar WhatsApp/i })).not.toBeInTheDocument()
    );
    expect(screen.getByText(/Agrega tu CLABE para cobrar/i)).toBeInTheDocument();
  });

  it('drops the banner once the owner adds their first account, in the same session', async () => {
    let added = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          added = true;
          return jsonResponse({ account: BBVA });
        }
        return jsonResponse({ accounts: added ? [BBVA] : [], role: 'owner' });
      })
    );

    render(
      <>
        <SettlementAccountBanner />
        <BankAccountsCard canEdit />
        <ShareAction />
      </>
    );

    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.queryByRole('link', { name: /Recordar WhatsApp/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));
    fireEvent.change(screen.getByLabelText(/Nombre de la cuenta/i), {
      target: { value: 'BBVA obra' },
    });
    fireEvent.change(screen.getByLabelText(/^Banco$/i), { target: { value: 'BBVA México' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '012180001234567899' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar cuenta/i }));

    await waitFor(() => expect(screen.getByRole('link', { name: /Recordar WhatsApp/i })).toBeInTheDocument());
    expect(screen.queryByText(/Agrega tu CLABE para cobrar/i)).not.toBeInTheDocument();
  });

  /**
   * The #164 question specifically: a tenant with two accounts switches which
   * one is principal. The gate must stay satisfied throughout — this is the
   * case where a naive "refetch and hope" implementation flickers the banner in
   * front of a tenant who never lost their ability to be paid — and the list
   * must show the switch, from the server's rows rather than from the click.
   */
  it('moves the default between two accounts, with the gate never going false', async () => {
    let defaultId = BBVA.id;
    const readySeen: (boolean | null)[] = [];

    const Probe: React.FC = () => {
      const { ready } = useSettlementAccount();
      readySeen.push(ready);
      return null;
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          defaultId = SANTANDER.id;
          return jsonResponse({ account: { ...SANTANDER, is_default: true } });
        }
        return jsonResponse({
          accounts: [
            { ...BBVA, is_default: defaultId === BBVA.id },
            { ...SANTANDER, is_default: defaultId === SANTANDER.id },
          ],
          role: 'owner',
        });
      })
    );

    render(
      <>
        <Probe />
        <SettlementAccountBanner />
        <BankAccountsCard canEdit />
      </>
    );

    // Principal starts on BBVA, so only Santander offers "Hacer principal".
    await waitFor(() => expect(screen.getByText('Santander nómina')).toBeInTheDocument());
    const santanderRow = screen.getByText('Santander nómina').closest('li')!;
    fireEvent.click(within(santanderRow).getByRole('button', { name: /Hacer principal/i }));

    await waitFor(() => {
      const bbvaRow = screen.getByText('BBVA obra').closest('li')!;
      expect(within(bbvaRow).queryByText('Principal')).not.toBeInTheDocument();
    });
    const switched = screen.getByText('Santander nómina').closest('li')!;
    expect(within(switched).getByText('Principal')).toBeInTheDocument();

    // The tenant could be paid before and after; the banner must never have
    // flashed in between. `false` is the only state that warns.
    expect(readySeen).not.toContain(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
