import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
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
    // The "se guardaron correctamente" confirmation moved out of the card and
    // into the settings page's ActionResultDialog, fired off the save outcome —
    // the card no longer concludes anything about the result on its own.
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

/**
 * #267 — the tier column outlives the subscription.
 *
 * The webhook writes `subscription_tier` on every attributable event,
 * `customer.subscription.deleted` included, so a cancelled customer kept the
 * tier that named their plan. Reading that column alone, the card showed them
 * "Tu Plan Actual" over a greyed-out "Plan Activo" — while the header badge
 * said "Cancelado" — and the only way left to pay was to buy a *different*
 * tier. Both tests above pass `'active'`, which is why nothing caught it.
 */
describe('a plan that was cancelled can be bought again', () => {
  const negocioAt = (status: string) => (
    <SubscriptionBillingCard
      settings={{ ...SERVER_ROW, subscription_tier: 'negocio', subscription_status: status }}
      statusInfo={validateSubscriptionStatus(status)}
      onSelectTier={vi.fn()}
    />
  );

  it.each([
    ['canceled', 'Cancelado'],
    ['unpaid', 'Pago vencido'],
  ])('offers %s customers their own plan back', (status, badge) => {
    render(negocioAt(status));

    expect(screen.getByText(badge)).toBeTruthy();
    expect(screen.queryByText('Tu Plan Actual')).toBeNull();
    expect(screen.queryByText('Plan Activo')).toBeNull();

    // Named as the plan they had, and purchasable.
    expect(screen.getByText('Tu plan anterior')).toBeTruthy();
    const reactivate = screen.getByRole('button', {
      name: /Reactivar Plan Negocio/i,
    }) as HTMLButtonElement;
    expect(reactivate.disabled).toBe(false);
  });

  it.each(['active', 'trialing', 'past_due'])(
    'still treats %s as the plan they hold — re-buying would double it',
    (status) => {
      render(negocioAt(status));

      expect(screen.getAllByText('Tu Plan Actual')).toHaveLength(1);
      expect(screen.queryByText('Tu plan anterior')).toBeNull();
      expect(screen.queryByRole('button', { name: /Reactivar/i })).toBeNull();
    }
  );
});

/**
 * #266 — the card had no role prop while `POST /api/stripe/checkout` requires
 * `billing_management` (owner-only), and `/upgrade` deliberately routes a
 * member here with `?plan=`. The member read "Continúa para pagarlo", waited
 * through "Procesando…", and was refused.
 */
describe('a viewer who cannot buy is told so before they tap', () => {
  // The card scrolls a highlighted plan into view; jsdom has no such method.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  const asMember = (highlightTier?: 'negocio') => (
    <SubscriptionBillingCard
      settings={SERVER_ROW}
      statusInfo={validateSubscriptionStatus('active')}
      onSelectTier={vi.fn()}
      canManageBilling={false}
      highlightTier={highlightTier ?? null}
    />
  );

  it('disables every plan button and says whose decision it is', () => {
    render(asMember());

    expect(screen.getByText(/Solo el dueño de la cuenta puede contratar o cambiar el plan/i)).toBeTruthy();

    // One per plan, none of them offering to start a payment.
    const buttons = screen.getAllByRole('button', { name: /Solo el dueño puede contratar/i });
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.queryByRole('button', { name: /^Seleccionar/i })).toBeNull();
  });

  it('never fires checkout for a member', () => {
    const onSelectTier = vi.fn();
    render(
      <SubscriptionBillingCard
        settings={SERVER_ROW}
        statusInfo={validateSubscriptionStatus('active')}
        onSelectTier={onSelectTier}
        canManageBilling={false}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Solo el dueño puede contratar/i })[0]);

    expect(onSelectTier).not.toHaveBeenCalled();
  });

  it('does not tell a member to continue to payment on the plan they picked', () => {
    render(asMember('negocio'));

    expect(screen.queryByText(/Continúa para pagarlo/i)).toBeNull();
    expect(screen.getByText(/Pídele al dueño de la cuenta que lo contrate/i)).toBeTruthy();
  });

  it('leaves the owner able to buy', () => {
    render(
      <SubscriptionBillingCard
        settings={SERVER_ROW}
        statusInfo={validateSubscriptionStatus('active')}
        onSelectTier={vi.fn()}
        canManageBilling
      />
    );

    expect(screen.queryByText(/Solo el dueño de la cuenta puede contratar/i)).toBeNull();
    expect(
      (screen.getByRole('button', { name: /Seleccionar Plan Negocio/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });
});

/**
 * #288 — the currency toggle was live, `handleSaveBranding` sent only
 * `logo_url`, and the page then reported "Tu logotipo y marca se guardaron
 * correctamente". The owner switched to USD, was congratulated, reloaded, and
 * was back on MXN.
 */
describe('branding offers no control it cannot keep', () => {
  it('disables the currency toggle like its already-disabled neighbours', () => {
    render(
      <BrandingSettingsCard settings={SERVER_ROW} onSave={vi.fn()} saving={false} canEdit />
    );

    const mxn = screen.getByRole('button', { name: /Peso Mexicano/i }) as HTMLButtonElement;
    const usd = screen.getByRole('button', { name: /Dólar Americano/i }) as HTMLButtonElement;

    expect(mxn.disabled).toBe(true);
    expect(usd.disabled).toBe(true);
  });

  it('marks the currency as pending, the way the colour and lema already are', () => {
    render(
      <BrandingSettingsCard settings={SERVER_ROW} onSave={vi.fn()} saving={false} canEdit />
    );

    // Three "Muy pronto" markers now: colour, lema placeholder, divisa.
    expect(screen.getAllByText(/Muy pronto/i).length).toBeGreaterThanOrEqual(2);
  });

  it('submits only the field that has somewhere to persist', async () => {
    // Typed, so `tsc` can see the argument this case reads back.
    const onSave = vi.fn(async (_patch: Partial<OrganizationSettings>) => true);
    render(
      <BrandingSettingsCard
        settings={{ ...SERVER_ROW, logo_url: 'https://cdn.example.com/a.png' }}
        onSave={onSave}
        saving={false}
        canEdit
      />
    );

    fireEvent.submit(screen.getByPlaceholderText('https://ejemplo.com/logo.png').closest('form')!);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // Exactly one key: a payload carrying a currency the server drops is the
    // fabrication this issue is about.
    expect(Object.keys(onSave.mock.calls[0][0])).toEqual(['logo_url']);
  });
});

/**
 * #127 — Ajustes blanked the régimen fiscal of any tenant who chose one its
 * own hardcoded list did not carry.
 *
 * The four screens offering a régimen each had their own copy of the SAT
 * catalogue and no two agreed; `OrgProfileCard`'s was the only one missing
 * 606 (Arrendamiento), which registration offered. A `<select>` whose value
 * matches no option renders blank, so the tenant could not see their own
 * régimen — and the moment they touched the dropdown to fix it, the value
 * their CFDIs are stamped with was overwritten.
 */
describe('OrgProfileCard — régimen fiscal (#127)', () => {
  const select = () => document.querySelector('select[name="regimen_fiscal"]') as HTMLSelectElement;

  it('shows a régimen registration offers but the old Ajustes list omitted', () => {
    render(
      <OrgProfileCard
        settings={{ ...SERVER_ROW, regimen_fiscal: '606' }}
        onSave={vi.fn(async () => true)}
        saving={false}
        canEdit
      />
    );

    // The defect was a *blank* select: value set, no matching option.
    expect(select().value).toBe('606');
    const chosen = Array.from(select().options).find((o) => o.value === '606');
    expect(chosen).toBeTruthy();
    expect(chosen?.text).toContain('Arrendamiento');
  });

  it('keeps a stored code the catalogue does not list visible and selected', () => {
    render(
      <OrgProfileCard
        settings={{ ...SERVER_ROW, regimen_fiscal: '699' }}
        onSave={vi.fn(async () => true)}
        saving={false}
        canEdit
      />
    );

    expect(select().value).toBe('699');
    const stored = Array.from(select().options).find((o) => o.value === '699');
    expect(stored?.text).toContain('código guardado');
    // Absent and present-but-unlisted are different facts: the placeholder is
    // for "nothing chosen", and this tenant has chosen something.
    expect(
      Array.from(select().options).some((o) => o.text.includes('Selecciona tu régimen'))
    ).toBe(false);
  });

  it('offers the placeholder only when nothing is stored', () => {
    render(
      <OrgProfileCard
        settings={{ ...SERVER_ROW, regimen_fiscal: '' }}
        onSave={vi.fn(async () => true)}
        saving={false}
        canEdit
      />
    );
    expect(select().value).toBe('');
    expect(
      Array.from(select().options).some((o) => o.text.includes('Selecciona tu régimen'))
    ).toBe(true);
  });
});
