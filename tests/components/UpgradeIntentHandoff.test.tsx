import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionBillingCard } from '@/components/settings/SubscriptionBillingCard';
import { validateSubscriptionStatus } from '@/lib/stripe';
import type { OrganizationSettings } from '@/lib/hooks/useOrganizationSettings';

/**
 * The other half of "I get forced into the registration flow": what the plan
 * the visitor picked is worth once they arrive somewhere that can sell it.
 *
 * `/upgrade` decides *where* (see `upgradeEntryRoute.test.ts`); these cover the
 * handoff at the far end — the tier survives the trip and the owner can see
 * which plan they asked for without hunting for it.
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

// jsdom has no layout, so scrollIntoView is not implemented on the prototype.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('SubscriptionBillingCard — the plan they chose is marked', () => {
  function renderCard(highlightTier: 'inicial' | 'negocio' | 'empresa' | null) {
    const onSelectTier = vi.fn(async () => {});
    render(
      <SubscriptionBillingCard
        settings={SERVER_ROW}
        statusInfo={validateSubscriptionStatus(SERVER_ROW.subscription_status)}
        onSelectTier={onSelectTier}
        highlightTier={highlightTier}
      />
    );
    return onSelectTier;
  }

  it('names the chosen plan and scrolls it into view', () => {
    renderCard('negocio');

    const note = screen.getByText(/Este es el plan que elegiste/i);
    expect(note).toBeTruthy();
    // The card sits below four others; a highlight the owner has to scroll to
    // find on a 375px screen is not a highlight.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    // The note belongs to the Negocio card, not to whichever rendered first.
    const negocioCard = screen.getByText('Plan Negocio').closest('div.relative');
    expect(negocioCard?.contains(note)).toBe(true);
  });

  it('marks nothing when no plan came along', () => {
    renderCard(null);

    expect(screen.queryByText(/Este es el plan que elegiste/i)).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('still requires the tap — arriving does not start a payment', async () => {
    const onSelectTier = renderCard('empresa');

    // Auto-opening Checkout on load would trap anyone who pressed Back on
    // Stripe: they would land here and be bounced straight out again.
    await waitFor(() => expect(screen.getByText(/Este es el plan que elegiste/i)).toBeTruthy());
    expect(onSelectTier).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Seleccionar Plan Empresa/i }));
    await waitFor(() => expect(onSelectTier).toHaveBeenCalledWith('empresa'));
  });

  it('does not mark the plan the tenant is already on', () => {
    render(
      <SubscriptionBillingCard
        settings={{ ...SERVER_ROW, subscription_tier: 'negocio' }}
        statusInfo={validateSubscriptionStatus('active')}
        onSelectTier={vi.fn(async () => {})}
        highlightTier="negocio"
      />
    );

    expect(screen.queryByText(/Este es el plan que elegiste/i)).toBeNull();
    expect(screen.getByText('Tu Plan Actual')).toBeTruthy();
  });
});
