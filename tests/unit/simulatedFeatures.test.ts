import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { encodeStripeForm, createCheckoutSession, isStripeConfigured } from '@/lib/stripeClient';
import { createCheckoutPayload } from '@/lib/stripe';
import {
  buildInvitationUrl,
  evaluateInvitation,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  invitationTokenMatches,
  isInvitableRole,
  normalizeInviteEmail,
} from '@/lib/teamInvitations';
import {
  buildAccountantZipManifest,
  generateMonthlySummaryCSV,
  isValidExportMonth,
  mapMilestoneRows,
  monthDateRange,
} from '@/lib/accountantExport';
import { parseNaturalLanguageQuery } from '@/lib/whatsappAI';

/**
 * Regression suite for issue #4: endpoints that returned fabricated success for
 * work they never did (Stripe checkout, team invites, accountant export, and
 * the assistant's invented ledger).
 */

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

/**
 * Strips comments before pattern-matching source, so a comment describing the
 * removed behaviour does not fail the test proving it was removed.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Stripe checkout is a real session', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('encodes nested payloads in Stripe bracket form', () => {
    const params = encodeStripeForm({
      mode: 'subscription',
      line_items: [{ price: 'price_negocio_599_mxn', quantity: 1 }],
      metadata: { organization_id: 'org-1', tier_id: 'negocio' },
      customer: undefined,
    });

    expect(params.get('mode')).toBe('subscription');
    expect(params.get('line_items[0][price]')).toBe('price_negocio_599_mxn');
    expect(params.get('line_items[0][quantity]')).toBe('1');
    expect(params.get('metadata[organization_id]')).toBe('org-1');
    // An absent value must not travel as the string "undefined".
    expect(params.has('customer')).toBe(false);
  });

  it('refuses to invent a session when no secret key is configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeConfigured()).toBe(false);

    const result = await createCheckoutSession({ mode: 'subscription' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_CONFIGURED');
  });

  it('returns the URL Stripe issues, not a constructed one', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'cs_test_realsession', url: 'https://checkout.stripe.com/c/pay/cs_test_realsession' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createCheckoutSession({ mode: 'subscription' }, 'idem-key');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.id).toBe('cs_test_realsession');
      expect(result.session.url).toBe('https://checkout.stripe.com/c/pay/cs_test_realsession');
    }

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init.headers.Authorization).toBe('Bearer sk_test_fake');
    expect(init.headers['Idempotency-Key']).toBe('idem-key');
  });

  it('surfaces a Stripe rejection instead of a usable-looking link', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'No such price' } }),
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createCheckoutSession({ mode: 'subscription' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('STRIPE_ERROR');
  });

  it('propagates the organization onto the subscription so webhooks can attribute it', () => {
    const built = createCheckoutPayload('negocio', 'org-abc', undefined, {
      STRIPE_PRICE_NEGOCIO: 'price_live_negocio',
    });

    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const payload = built.payload as {
      subscription_data: { metadata: { organization_id: string } };
      client_reference_id: string;
    };

    expect(payload.subscription_data.metadata.organization_id).toBe('org-abc');
    expect(payload.client_reference_id).toBe('org-abc');
  });

  it('no longer contains the fabricated demo checkout URL', () => {
    const source = stripComments(readSource('app/api/stripe/checkout/route.ts'));
    expect(source).not.toContain('cs_test_demo_');
    expect(source).not.toContain('simulated');
  });

  it('does not grant a paid tier from the client before payment', () => {
    const source = stripComments(readSource('app/(dashboard)/settings/page.tsx'));
    expect(source).not.toContain("subscription_status: 'active'");
  });
});

describe('Team invitations are recorded and redeemable', () => {
  it('stores only a digest of the token', () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashInvitationToken(token));
    expect(tokenHash).not.toBe(token);
  });

  it('matches a token against its digest and rejects any other', () => {
    const { token, tokenHash } = generateInvitationToken();
    expect(invitationTokenMatches(token, tokenHash)).toBe(true);
    expect(invitationTokenMatches('not-the-token', tokenHash)).toBe(false);
    expect(invitationTokenMatches('', tokenHash)).toBe(false);
  });

  it('builds an invitation URL that lands on the acceptance page', () => {
    expect(buildInvitationUrl('abc123', 'https://app.example.mx/')).toBe(
      'https://app.example.mx/invitacion/abc123'
    );
  });

  it('accepts only manager, member and accountant roles', () => {
    expect(isInvitableRole('manager')).toBe(true);
    expect(isInvitableRole('accountant')).toBe(true);
    // Ownership is not transferable by invitation.
    expect(isInvitableRole('owner')).toBe(false);
    expect(isInvitableRole('admin')).toBe(false);
  });

  it('lets a pending invitation through for the invited address only', () => {
    const invitation = {
      status: 'pending' as const,
      expires_at: invitationExpiry(),
      email: 'Contador@Despacho.MX',
    };

    expect(evaluateInvitation(invitation, 'contador@despacho.mx')).toEqual({ ok: true });
    expect(evaluateInvitation(invitation, 'otro@despacho.mx')).toEqual({
      ok: false,
      reason: 'EMAIL_MISMATCH',
    });
  });

  it('rejects expired, reused, revoked and unknown invitations', () => {
    const base = { email: 'a@b.mx', expires_at: invitationExpiry() };

    expect(evaluateInvitation(null, 'a@b.mx')).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(evaluateInvitation({ ...base, status: 'accepted' }, 'a@b.mx')).toEqual({
      ok: false,
      reason: 'ALREADY_ACCEPTED',
    });
    expect(evaluateInvitation({ ...base, status: 'revoked' }, 'a@b.mx')).toEqual({
      ok: false,
      reason: 'REVOKED',
    });
    expect(
      evaluateInvitation(
        { status: 'pending', email: 'a@b.mx', expires_at: '2020-01-01T00:00:00.000Z' },
        'a@b.mx'
      )
    ).toEqual({ ok: false, reason: 'EXPIRED' });
  });

  it('normalizes the invited address', () => {
    expect(normalizeInviteEmail('  Nuevo@Empresa.MX ')).toBe('nuevo@empresa.mx');
  });

  it('no longer serves the hardcoded roster or a fabricated invite', () => {
    const source = stripComments(readSource('app/api/organization/members/route.ts'));
    expect(source).not.toContain('Don Roberto');
    expect(source).not.toContain('Lic. Mariana');
    expect(source).not.toContain('simulated');
    expect(source).toContain('organization_invitations');
  });

  it('does not keep the invented team in the team hook', () => {
    const source = stripComments(readSource('lib/hooks/useTeamMembers.ts'));
    expect(source).not.toContain('Don Roberto');
    expect(source).toContain('/api/organization/members');
  });
});

describe('Accountant export reads real records', () => {
  it('flattens the client join and coerces numeric strings', () => {
    const [item] = mapMilestoneRows([
      {
        id: 'm-1',
        label: 'Anticipo',
        amount: '75000.00',
        due_date: '2026-08-15',
        status: 'confirmed',
        tracking_reference: 'SPEI123',
        confirmed_at: '2026-08-16T10:00:00.000Z',
        contracts: { title: 'Obra', clients: { name: 'Constructora Real', rfc: 'CRE120315HD9' } },
      },
    ]);

    expect(item.amount).toBe(75000);
    expect(item.client_name).toBe('Constructora Real');
    expect(item.client_rfc).toBe('CRE120315HD9');
    // Nothing is invented for a milestone with no CFDI or receipt.
    expect(item.cfdi_xml_url).toBeNull();
    expect(item.receipt_url).toBeNull();
  });

  it('accepts the array shape PostgREST may return for embedded relations', () => {
    const [item] = mapMilestoneRows([
      {
        id: 'm-2',
        label: 'Finiquito',
        amount: 1000,
        due_date: '2026-08-20',
        status: 'pending',
        contracts: [{ title: 'Obra', clients: [{ name: 'Cliente Array', rfc: 'CAR990101AAA' }] }],
      },
    ]);

    expect(item.client_name).toBe('Cliente Array');
  });

  it('validates the requested month and resolves its date range', () => {
    expect(isValidExportMonth('2026-08')).toBe(true);
    expect(isValidExportMonth('2026-13')).toBe(false);
    expect(isValidExportMonth('agosto')).toBe(false);

    expect(monthDateRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' });
  });

  it('lists only files that exist and never a tenant id in the CSV link', () => {
    const manifest = buildAccountantZipManifest('org-1', '2026-08', [
      {
        id: 'm-1',
        label: 'Anticipo',
        amount: 75000,
        due_date: '2026-08-15',
        status: 'confirmed',
        receipt_url: 'https://files.example.mx/spei-m1.jpg',
      },
      {
        id: 'm-2',
        label: 'Finiquito',
        amount: 25000,
        due_date: '2026-08-20',
        status: 'pending',
      },
    ]);

    expect(manifest.totalMilestonesCount).toBe(2);
    expect(manifest.totalAmount).toBe(100000);
    // CSV + the single real receipt, and no CFDI entries for unstamped work.
    expect(manifest.files).toHaveLength(2);
    expect(manifest.files.some((f) => f.url.includes('orgId='))).toBe(false);
    expect(manifest.files.some((f) => f.url.includes('storage.businesshelper.mx'))).toBe(false);
  });

  it('includes the payer in the monthly CSV', () => {
    const csv = generateMonthlySummaryCSV('org-1', '2026-08', [
      {
        id: 'm-1',
        label: 'Anticipo "Torre"',
        amount: 75000,
        due_date: '2026-08-15',
        status: 'confirmed',
        client_name: 'Constructora Real, S.A.',
        client_rfc: 'CRE120315HD9',
      },
    ]);

    const [header, row] = csv.split('\n');
    expect(header).toContain('RFC Cliente');
    expect(row).toContain('CRE120315HD9');
    // A comma inside a business name must not shift the columns.
    expect(row).toContain('"Constructora Real, S.A."');
    expect(row).toContain('"Anticipo ""Torre"""');
  });

  it('no longer ships the invented milestones and storage URLs', () => {
    const source = stripComments(readSource('app/api/accountant/export/route.ts'));
    expect(source).not.toContain('storage.businesshelper.mx');
    expect(source).not.toContain('demoMilestones');
    expect(source).toContain("from('milestones')");
  });
});

describe('Assistant answers from the tenant, not a fixed ledger', () => {
  it('does not conjure a client the organization never entered', () => {
    const response = parseNaturalLanguageQuery('¿Cuánto me debe Grupo Salinas?', {
      clients: [],
      receivables: [],
    });

    expect(response.matchedClient).toBeNull();
    expect(response.totalOverdue).toBe(0);
  });

  it('answers with the client and balance the organization actually has', () => {
    const response = parseNaturalLanguageQuery('¿cuánto me debe Ferretería Progreso?', {
      clients: [{ id: 'c-9', name: 'Ferretería Progreso', phone: '8110002000' }],
      receivables: [{ clientId: 'c-9', amount: 12500, status: 'pending' }],
    });

    expect(response.matchedClient).toBe('Ferretería Progreso');
    expect(response.totalOverdue).toBe(12500);
    expect(response.whatsappUrl).toContain('528110002000');
  });

  it('does not address a reminder to a fallback number when no phone is on file', () => {
    const response = parseNaturalLanguageQuery('¿cuánto me debe Taller Norte?', {
      clients: [{ id: 'c-10', name: 'Taller Norte' }],
      receivables: [{ clientId: 'c-10', amount: 500, status: 'pending' }],
    });

    expect(response.whatsappUrl).not.toContain('8112223344');
    expect(response.whatsappUrl.startsWith('https://wa.me/?text=')).toBe(true);
  });

  it('reads tenant data in the assistant routes rather than a demo constant', () => {
    for (const route of ['app/api/ai/assistant/route.ts', 'app/api/ai/support/route.ts']) {
      const source = stripComments(readSource(route));
      expect(source).not.toContain('demoOrgData');
      expect(source).toContain('loadAIOrgContext');
      // The response names its engine so no caller has to assume a model.
      expect(source).toContain("engine: 'rules'");
    }
  });
});
