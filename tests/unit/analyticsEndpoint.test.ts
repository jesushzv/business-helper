import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `/api/analytics/event` is the only way a browser can write into the funnel,
 * so what it refuses matters more than what it records. These tests pin the
 * refusals: events the server owns, and authenticated events from a caller with
 * no session.
 */

const requireOrgAccess = vi.fn();
const requireUser = vi.fn();

vi.mock('@/lib/apiAuth', () => ({
  requireOrgAccess: (...args: unknown[]) => requireOrgAccess(...args),
  requireUser: (...args: unknown[]) => requireUser(...args),
}));

const { POST } = await import('@/app/api/analytics/event/route');

function post(body: unknown): Request {
  return new Request('http://localhost/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const NO_SESSION = { ok: false as const, response: new Response(null, { status: 401 }) };

describe('POST /api/analytics/event', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    requireOrgAccess.mockResolvedValue(NO_SESSION);
    requireUser.mockResolvedValue(NO_SESSION);
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    process.env.POSTHOG_API_KEY = 'phc_0123456789abcdefghij';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.POSTHOG_API_KEY;
  });

  it('refuses the events the server is the source of', async () => {
    for (const event of ['quote_signed', 'payment_confirmed', 'client_created', 'quote_created']) {
      const response = await POST(post({ event }));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('UNKNOWN_EVENT');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an event that is not in the set at all', async () => {
    expect((await POST(post({ event: 'admin_promoted' }))).status).toBe(400);
    expect((await POST(post({}))).status).toBe(400);
  });

  it('records a pre-account event against the anonymous id the browser minted', async () => {
    const response = await POST(
      post({ event: 'signup_started', anonymousId: 'anon-abc12345', properties: { prefilled: true } })
    );

    expect(response.status).toBe(202);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe('signup_started');
    expect(body.distinct_id).toBe('anon-abc12345');
    expect(body.properties.prefilled).toBe(true);
  });

  it('refuses an authenticated event from a caller with no session', async () => {
    const response = await POST(post({ event: 'quote_sent', anonymousId: 'anon-abc12345' }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes identity from the session, never from the body', async () => {
    requireOrgAccess.mockResolvedValue({
      ok: true,
      ctx: { userId: 'user-1', organizationId: 'org-7', supabase: {}, role: 'owner' },
    });

    const response = await POST(
      post({
        event: 'quote_sent',
        anonymousId: 'anon-abc12345',
        properties: { quote_id: 'q-1', client_name: 'Don Roberto' },
      })
    );

    expect(response.status).toBe(202);

    // The anonymous visitor is stitched onto the account first, then the event.
    const identify = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(identify.event).toBe('$identify');
    expect(identify.properties.$anon_distinct_id).toBe('anon-abc12345');

    const event = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(event.distinct_id).toBe('user-1');
    expect(event.properties.organization_id).toBe('org-7');
    expect(event.properties.quote_id).toBe('q-1');
    expect(event.properties).not.toHaveProperty('client_name');
  });

  it('attributes a signup to the new account even before it has an organization', async () => {
    requireUser.mockResolvedValue({ ok: true, userId: 'user-2', supabase: {} });

    const response = await POST(post({ event: 'signup_completed', anonymousId: 'anon-abc12345' }));

    expect(response.status).toBe(202);
    const event = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(event.event).toBe('signup_completed');
    expect(event.distinct_id).toBe('user-2');
    expect(event.properties.organization_id).toBe('none');
  });

  it('answers 202 rather than an error when a capture fails', async () => {
    fetchMock.mockRejectedValue(new Error('posthog down'));

    const response = await POST(post({ event: 'signup_started', anonymousId: 'anon-abc12345' }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ captured: false });
  });

  it('survives a body that is not JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/analytics/event', { method: 'POST', body: 'not json' })
    );
    expect(response.status).toBe(400);
  });
});
