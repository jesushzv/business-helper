/**
 * CFDI folio quota.
 *
 * lib/stripe.ts has priced folios since the tiers were written — 0 included on
 * Inicial, 10 on Negocio, 50 on Empresa, packs of 50 and 200 on top — but
 * nothing ever counted one, so the allowance existed only in the pricing table.
 * Stamping is the point where it has to mean something: every folio the
 * platform's PAC issues is a folio the platform pays for.
 *
 * The rule this module encodes:
 *
 *   - An organization stamping with **its own** PAC key is not metered here at
 *     all. Its PAC bills it directly; counting those folios would be charging
 *     twice for the same document (integration architecture §05, "connect your
 *     PAC").
 *   - An organization stamping with the **platform's** PAC account spends its
 *     tier's monthly allowance first, then any folios it has bought.
 *
 * The counters live on `organizations` and are moved by the SQL functions in
 * 20260807120000_cfdi_pac_integration.sql, not by read-modify-write from a
 * route: two stamps racing for the last folio must not both get it.
 */

import { getStripeTierConfig } from './stripe';

export interface FolioAllowance {
  /** Folios the tier includes each calendar month. */
  included: number;
  /** Folios already used inside `period`. */
  used: number;
  /** Non-expiring folios bought as a pack. */
  purchased: number;
  /** 'YYYY-MM' the counters describe. */
  period: string;
  remaining: number;
  addOnPricePerFolio: number;
}

export interface OrganizationFolioState {
  subscription_tier?: string | null;
  cfdi_folios_used?: number | null;
  cfdi_folios_period?: string | null;
  cfdi_folios_purchased?: number | null;
}

/** The billing period a stamp falls in. Folios reset on the calendar month, as the tiers are quoted. */
export function currentFolioPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/**
 * Projects an organization row onto its allowance for the given period.
 *
 * A row whose `cfdi_folios_period` is an earlier month has already rolled over
 * even though nothing has written to it yet, so `used` reads as 0 rather than
 * last month's total.
 */
export function resolveFolioAllowance(
  organization: OrganizationFolioState | null | undefined,
  period: string = currentFolioPeriod()
): FolioAllowance {
  const tier = getStripeTierConfig(organization?.subscription_tier || 'inicial');
  const purchased = Math.max(0, organization?.cfdi_folios_purchased ?? 0);
  const samePeriod = organization?.cfdi_folios_period === period;
  const used = samePeriod ? Math.max(0, organization?.cfdi_folios_used ?? 0) : 0;

  return {
    included: tier.includedFolios,
    used,
    purchased,
    period,
    remaining: Math.max(0, tier.includedFolios - used) + purchased,
    addOnPricePerFolio: tier.addOnPricePerFolio,
  };
}

/**
 * Whether a stamp against the platform's PAC account may proceed.
 *
 * The message names the two ways out — connect your own PAC, or buy a pack —
 * because "sin folios disponibles" on its own leaves a user who needs to
 * invoice a client today with nowhere to go.
 */
export function describeFolioExhaustion(allowance: FolioAllowance): string {
  if (allowance.included === 0) {
    return (
      'Tu plan no incluye folios CFDI. Conecta tu propio PAC en Ajustes para timbrar sin límite, ' +
      'o cambia a un plan con folios incluidos.'
    );
  }

  return (
    `Usaste los ${allowance.included} folios CFDI incluidos en tu plan este mes. ` +
    'Conecta tu propio PAC en Ajustes o adquiere un paquete de folios para seguir timbrando.'
  );
}
