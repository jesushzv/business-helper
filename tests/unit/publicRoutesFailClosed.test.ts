import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * #259 — a missing service key is a broken deployment, not the demo.
 *
 * Both public GETs gated their fixture on `isServiceRoleConfigured()`, which is
 * also false when Supabase *is* configured and only `SUPABASE_SERVICE_ROLE_KEY`
 * is absent — a preview env without the secret, a rotated key, a dropped var.
 * In that state `/q/<any-token>` served an invented $97,440 quote with a live
 * sign button and no label, and `/pay/` served demo bank details.
 *
 * #258 / #293 — the signing and OTP routes share `quoteSignableState`: an
 * expired quote refuses both, and an already-signed quote answers 409 instead
 * of `success: true` to a caller who verified nothing.
 */

const quoteRow = {
  id: 'q-1',
  status: 'sent',
  valid_until: '2026-12-31',
  organization_id: 'org-1',
  total_amount: 48720,
  client_otp_hash: null,
  client_otp_expires_at: null,
  client_otp_attempts: 0,
  client_otp_verified: false,
  contract_hash: null,
  accepted_at: null,
  clients: { name: 'Constructora del Bajío' },
};

const state = { row: null as Record<string, unknown> | null };

vi.mock('@/lib/supabase/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/service')>();
  return {
    ...actual,
    createServiceClient: () => ({
      from: () => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          update: () => chain,
          maybeSingle: async () => ({ data: state.row, error: null }),
        };
        return chain;
      },
    }),
  };
});

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const params = (token: string) => ({ params: Promise.resolve({ token }) });

function signRequest(body: Record<string, unknown> = { otpCode: '000000' }) {
  return new Request('https://businesshelper.app/api/quotes/public/tok-1', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  state.row = { ...quoteRow };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a configured deployment missing its service key fails closed (#259)', () => {
  beforeEach(() => {
    // Live for tenants: Supabase URL and anon key present. Service key gone.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
  });

  it('answers 503 on the public quote GET — never the $97,440 fixture', async () => {
    const { GET } = await import('@/app/api/quotes/public/[token]/route');
    const res = await GET(new Request('https://businesshelper.app/api'), params('tok-real'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('BACKEND_NOT_CONFIGURED');
    // The fabrication this issue is about, by its most recognizable parts.
    expect(JSON.stringify(body)).not.toContain('Suministro de Materiales');
    expect(JSON.stringify(body)).not.toContain('97440');
  });

  it('answers 503 on the public pay GET — never demo bank details', async () => {
    const { GET } = await import('@/app/api/receivables/public/[token]/route');
    const res = await GET(new Request('https://businesshelper.app/api'), params('tok-real'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('Banco Demo');
    expect(JSON.stringify(body)).not.toContain('milestone-demo');
  });

  it('does not blame "modo demo" for a broken deployment', async () => {
    const { POST } = await import('@/app/api/quotes/public/[token]/route');
    const res = await POST(signRequest(), params('tok-real'));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.message).not.toMatch(/demo/i);
  });
});

describe('the marketing sandbox still serves its labeled fixture', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  });

  it('serves the demo quote, labeled as such', async () => {
    const { GET } = await import('@/app/api/quotes/public/[token]/route');
    const res = await GET(new Request('https://businesshelper.app/api'), params('tok-demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.is_demo).toBe(true);
    expect(body.total_amount).toBe(97440);
  });

  it('serves the demo milestone with its existing label', async () => {
    const { GET } = await import('@/app/api/receivables/public/[token]/route');
    const res = await GET(new Request('https://businesshelper.app/api'), params('tok-demo'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.milestone.is_demo).toBe(true);
    expect(body.milestone.clabe).toBeNull();
  });
});

describe('the signing POST applies the shared signability predicate', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  });

  it('answers 409 — not success — when the quote was already signed (#293)', async () => {
    // The route used to return `{ success: true, contract_hash, … }` here,
    // before any OTP check: a junk code read as "¡Firma Aceptada con Éxito!".
    state.row = {
      ...quoteRow,
      client_otp_verified: true,
      contract_hash: 'sha256:existing',
      accepted_at: '2026-08-01T10:00:00Z',
    };

    const { POST } = await import('@/app/api/quotes/public/[token]/route');
    const res = await POST(signRequest({ otpCode: '000000' }), params('tok-1'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('QUOTE_ALREADY_SIGNED');
    expect(body.success).toBeUndefined();
    // The existing seal rides along as data for the page's sealed view.
    expect(body.contract_hash).toBe('sha256:existing');
  });

  it('refuses to sign an expired quote (#258)', async () => {
    state.row = { ...quoteRow, valid_until: '2026-08-01' };

    const { POST } = await import('@/app/api/quotes/public/[token]/route');
    const res = await POST(signRequest({ otpCode: '123456' }), params('tok-1'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('QUOTE_EXPIRED');
    expect(body.error.message).toMatch(/venció/i);
  });

  it('still refuses a converted quote', async () => {
    state.row = { ...quoteRow, status: 'converted' };

    const { POST } = await import('@/app/api/quotes/public/[token]/route');
    const res = await POST(signRequest(), params('tok-1'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('QUOTE_NOT_SIGNABLE');
  });
});

describe('the OTP-issuing POST refuses the same states', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  });

  it('will not issue a code for an expired quote (#258)', async () => {
    // Issuing the code is the first step of minting a seal at stale prices.
    state.row = {
      ...quoteRow,
      valid_until: '2026-08-01',
      client_otp_sent_at: null,
      clients: { phone: '+528112345678', email: 'cliente@example.com' },
    };

    const { POST } = await import('@/app/api/quotes/public/[token]/otp/route');
    const res = await POST(
      new Request('https://businesshelper.app/api', { method: 'POST' }),
      params('tok-1')
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('QUOTE_EXPIRED');
  });
});
