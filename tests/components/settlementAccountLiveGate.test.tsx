import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BankAccountCard } from '@/components/settings/BankAccountCard';
import { SettlementAccountBanner } from '@/components/settlement/SettlementAccountBanner';

/**
 * #163 — the tenant's question, not the function's: *after I remove my account,
 * does the app stop telling me I can be paid?*
 *
 * Each layer was already covered on its own — the hook refetches when notified,
 * the card posts the clear — and the defect lived between them: nothing proved
 * the card ever notifies. Both call sites could be deleted with all 1181 tests
 * green, taking the fix for the worst finding in this change with them (an
 * owner removes their CLABE, walks to Cobranza, and shares a `/pay/` link that
 * answers 409 in front of their client). That is #146's shape, so this test
 * renders the two together and asks the question end to end.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is stubbed to a real-looking value on purpose: it
 * is unset in Vitest, so `isClientDemoMode()` is on by default and the hook
 * short-circuits to `ready: true` — the whole assertion would pass while
 * exercising nothing.
 */

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const WITH_ACCOUNT = {
  organization: {
    id: 'org-1',
    bank_name: 'BBVA México',
    bank_clabe: '012180001234567890',
    bank_account_holder: 'Ferretería La Central',
  },
  role: 'owner',
};

const ACCOUNT = {
  id: 'acct-1',
  label: 'BBVA México',
  bank_name: 'BBVA México',
  clabe: '012180001234567890',
  account_holder: 'Ferretería La Central',
  is_default: true,
  archived_at: null,
};

const WITHOUT_ACCOUNT = {
  organization: { id: 'org-1', bank_name: null, bank_clabe: null, bank_account_holder: null },
  role: 'owner',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the gate follows the account without a page reload (#163)', () => {
  it('raises the banner after the owner removes their account', async () => {
    let removed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          removed = true;
          return jsonResponse(WITHOUT_ACCOUNT);
        }
        // The card reads the organization row; the readiness hook reads the
        // account list. Both must reflect the same removal.
        if (String(url).includes('bank-accounts')) {
          return jsonResponse(removed ? { accounts: [], role: 'owner' } : { accounts: [ACCOUNT], role: 'owner' });
        }
        return jsonResponse(removed ? WITHOUT_ACCOUNT : WITH_ACCOUNT);
      })
    );

    render(
      <>
        <SettlementAccountBanner />
        <BankAccountCard canEdit />
      </>
    );

    // Healthy tenant: no banner, and the account is on screen.
    await waitFor(() => {
      expect(screen.getByLabelText(/CLABE/i)).toHaveValue('0121 8000 1234 5678 90');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Quitar cuenta/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sí, quitar cuenta/i }));

    // The banner must appear without anything remounting: in the app it lives
    // in the dashboard shell, which survives client-side navigation.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('drops the banner once the owner saves an account, in the same session', async () => {
    let saved = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          saved = true;
          return jsonResponse(WITH_ACCOUNT);
        }
        if (String(url).includes('bank-accounts')) {
          return jsonResponse(saved ? { accounts: [ACCOUNT], role: 'owner' } : { accounts: [], role: 'owner' });
        }
        return jsonResponse(saved ? WITH_ACCOUNT : WITHOUT_ACCOUNT);
      })
    );

    render(
      <>
        <SettlementAccountBanner />
        <BankAccountCard canEdit />
      </>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Banco/i), { target: { value: 'BBVA México' } });
    fireEvent.change(screen.getByLabelText(/CLABE/i), { target: { value: '012180001234567890' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cuenta Bancaria/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
