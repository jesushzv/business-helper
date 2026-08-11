import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientFormModal, FIELD_INPUT_IDS } from '@/components/clients/ClientFormModal';
import { __resetCurrentOrgCacheForTests } from '@/lib/hooks/useCurrentOrg';
import type { Client } from '@/types';

/**
 * #123 in the form: a tenant who cannot set credit terms is not shown a
 * control that answers 403.
 *
 * The server is the enforcement — `tests/unit/clientCreditRBAC.test.ts` pins
 * both routes — and this is the other half of #64's corollary: never send a
 * user to a write they do not hold. The section is disabled, says in plain
 * Spanish who does decide it, and the three columns are left out of the payload
 * entirely so a member's edit of a phone number cannot be read as a credit
 * change.
 *
 * The role is a **tri-state**. While it is unknown — still loading, or the org
 * read failed — the section stays usable, because disabling on unknown would
 * lock a healthy owner out of their own credit line on a network blip.
 */

type SaveFn = (data: Partial<Client>) => Promise<void>;

const creditLimitInput = () =>
  document.getElementById(FIELD_INPUT_IDS.credit_limit) as HTMLInputElement;
const creditDaysInput = () =>
  document.getElementById(FIELD_INPUT_IDS.credit_days) as HTMLSelectElement;
const creditStatusInput = () =>
  document.getElementById(FIELD_INPUT_IDS.credit_status) as HTMLSelectElement;
const nameInput = () => document.getElementById(FIELD_INPUT_IDS.name) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /Guardar Cliente/i });

/**
 * A real tenant, not the demo deployment.
 *
 * Without this stub `isClientDemoMode()` is on in Vitest — NEXT_PUBLIC_SUPABASE_URL
 * is unset — so `useCurrentOrg` short-circuits to the demo owner and every
 * assertion below would pass while testing nothing.
 */
function asRealTenant(role: string | null) {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/organization')) {
        return {
          ok: true,
          json: async () => ({ organization: { id: 'org-1', name: 'Ferretería Norte' }, role }),
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    })
  );
}

function renderModal(onSave: ReturnType<typeof vi.fn<SaveFn>> = vi.fn<SaveFn>(async () => {})) {
  render(<ClientFormModal isOpen onClose={vi.fn()} onSave={onSave} />);
  return onSave;
}

beforeEach(() => {
  __resetCurrentOrgCacheForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  __resetCurrentOrgCacheForTests();
});

describe('a member sees the credit section locked', () => {
  it('disables the three controls and says who decides', async () => {
    asRealTenant('member');
    renderModal();

    await waitFor(() => expect(creditLimitInput().disabled).toBe(true));
    expect(creditDaysInput().disabled).toBe(true);
    expect(creditStatusInput().disabled).toBe(true);
    expect(screen.getByText(/lo decide el dueño o un administrador/i)).toBeTruthy();
  });

  it('leaves the credit columns out of the payload entirely', async () => {
    asRealTenant('member');
    const onSave = renderModal();

    await waitFor(() => expect(creditLimitInput().disabled).toBe(true));
    fireEvent.change(nameInput(), { target: { value: 'Ferretería Don Roberto' } });
    fireEvent.click(submit());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.name).toBe('Ferretería Don Roberto');
    // Absent, not null: a key the route never sees cannot be read as an intent.
    expect('credit_limit' in payload).toBe(false);
    expect('credit_days' in payload).toBe(false);
    expect('credit_status' in payload).toBe(false);
  });
});

describe('a manager or owner sees it as before', () => {
  it('leaves the controls usable and sends what was typed', async () => {
    asRealTenant('manager');
    const onSave = renderModal();

    await waitFor(() => expect(creditLimitInput().disabled).toBe(false));
    expect(screen.queryByText(/lo decide el dueño o un administrador/i)).toBeNull();

    fireEvent.change(nameInput(), { target: { value: 'Ferretería Don Roberto' } });
    fireEvent.change(creditLimitInput(), { target: { value: '50000' } });
    fireEvent.click(submit());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].credit_limit).toBe(50000);
  });
});

describe('an unknown role is not treated as a locked one', () => {
  it('keeps the section usable when the org read fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );
    const onSave = renderModal();

    // Nothing about a failed read says this tenant cannot set credit terms —
    // and the route refuses them if they really cannot.
    await waitFor(() => expect(creditLimitInput().disabled).toBe(false));
    fireEvent.change(nameInput(), { target: { value: 'Ferretería Don Roberto' } });
    fireEvent.change(creditLimitInput(), { target: { value: '50000' } });
    fireEvent.click(submit());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].credit_limit).toBe(50000);
  });
});
