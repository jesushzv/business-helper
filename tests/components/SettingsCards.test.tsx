import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OrgProfileCard } from '@/components/settings/OrgProfileCard';
import { BrandingSettingsCard } from '@/components/settings/BrandingSettingsCard';
import { SubscriptionBillingCard } from '@/components/settings/SubscriptionBillingCard';
import { validateSubscriptionStatus } from '@/lib/stripe';
import type { OrganizationSettings } from '@/lib/hooks/useOrganizationSettings';

/**
 * The tail of #95.
 *
 * The hook was fixed to apply the server row, but the two forms on Ajustes
 * seeded their local state from `settings` exactly once, so a save that the
 * server normalized left the typed text on screen under a success banner. A
 * PATCH against production on 2026-08-09 confirmed the normalization is real:
 * `{"phone":"81 1234 5678"}` came back — and was stored — as `8112345678`.
 *
 * The billing card is the same rule one column over: `subscription_tier`
 * defaults to `'free'`, which the hook used to map to `'inicial'`.
 */

const SERVER_ROW: OrganizationSettings = {
  id: 'org-real-1',
  name: 'Ferretería La Central',
  rfc: 'FCE900101AB1',
  regimen_fiscal: '601',
  codigo_postal: '44100',
  phone: '3312345678',
  logo_url: null,
  subscription_tier: null,
  subscription_status: 'active',
};

describe('OrgProfileCard — the form follows the server row', () => {
  it('shows the normalized value the server stored, not the text the user typed', async () => {
    const onSave = vi.fn(async () => true);
    const { rerender } = render(
      <OrgProfileCard settings={SERVER_ROW} onSave={onSave} saving={false} canEdit />
    );

    const phone = document.getElementById('org-phone') as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '81 1234 5678' } });
    // Normalized as typed, so the field never shows a shape the column will
    // not hold — the #95 defect was exactly that gap.
    expect(phone.value).toBe('8112345678');

    fireEvent.submit(phone.closest('form') as HTMLFormElement);
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    // The field submits E.164 — the country is explicit, never inferred (#94).
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ phone: '+528112345678' }));

    // What the hook does on a 2xx: replace `settings` with the returned row.
    rerender(
      <OrgProfileCard
        settings={{ ...SERVER_ROW, phone: '+528112345678' }}
        onSave={onSave}
        saving={false}
        canEdit
      />
    );

    // The national part is what the field shows; the country lives in the
    // selector beside it. Still the #95 guard: the typed text must not survive
    // the server row landing.
    await waitFor(() =>
      expect((document.getElementById('org-phone') as HTMLInputElement).value).toBe('8112345678')
    );
    expect(await screen.findByText(/se guardaron correctamente/i)).toBeTruthy();
  });

  it('does not offer a submit button to a role whose PATCH cannot match a row', () => {
    render(
      <OrgProfileCard settings={SERVER_ROW} onSave={vi.fn()} saving={false} canEdit={false} />
    );

    expect(screen.queryByText(/Guardar Cambios de Empresa/i)).toBeNull();
    expect(screen.getByText(/Solo el propietario del negocio puede editar/i)).toBeTruthy();
  });
});

describe('BrandingSettingsCard — the logo field follows the server row', () => {
  it('re-reads the stored logo after a save instead of keeping the typed string', async () => {
    const onSave = vi.fn(async () => true);
    const { rerender } = render(
      <BrandingSettingsCard settings={SERVER_ROW} onSave={onSave} saving={false} canEdit />
    );

    const input = screen.getByPlaceholderText('https://ejemplo.com/logo.png') as HTMLInputElement;
    // Deliberately not a whitespace-only difference: jsdom applies the URL
    // value sanitizer to `type="url"`, so a trim would be indistinguishable
    // from the card doing nothing and this assertion would never go red.
    fireEvent.change(input, { target: { value: 'https://cdn.example.com/typed.png' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    rerender(
      <BrandingSettingsCard
        settings={{ ...SERVER_ROW, logo_url: 'https://cdn.example.com/stored.png' }}
        onSave={onSave}
        saving={false}
        canEdit
      />
    );

    await waitFor(() =>
      expect(
        (screen.getByPlaceholderText('https://ejemplo.com/logo.png') as HTMLInputElement).value
      ).toBe('https://cdn.example.com/stored.png')
    );
  });
});

describe('SubscriptionBillingCard — a plan is only "current" when the row says so', () => {
  it('claims no plan, and leaves every plan selectable, when the tier is absent', () => {
    render(
      <SubscriptionBillingCard
        settings={SERVER_ROW}
        statusInfo={validateSubscriptionStatus('active')}
        onSelectTier={vi.fn()}
      />
    );

    expect(screen.queryByText('Tu Plan Actual')).toBeNull();
    expect(screen.queryByText('Plan Activo')).toBeNull();
    expect(screen.getByText('Sin plan contratado')).toBeTruthy();

    // The old mapping marked Inicial as current and disabled its own button,
    // so the entry plan could never be bought from this page.
    const buy = screen.getByRole('button', { name: /Seleccionar Plan Inicial/i });
    expect((buy as HTMLButtonElement).disabled).toBe(false);
  });

  it('marks exactly the tier the server reported', () => {
    render(
      <SubscriptionBillingCard
        settings={{ ...SERVER_ROW, subscription_tier: 'negocio' }}
        statusInfo={validateSubscriptionStatus('active')}
        onSelectTier={vi.fn()}
      />
    );

    expect(screen.getAllByText('Tu Plan Actual')).toHaveLength(1);
    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.queryByText('Sin plan contratado')).toBeNull();
    expect(
      (screen.getByRole('button', { name: /Seleccionar Plan Inicial/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });
});
