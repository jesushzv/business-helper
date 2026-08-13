import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The platform-admin gate (`lib/platformAdmin.ts`).
 *
 * This is the only place in the app where a session is allowed to read across
 * tenants, so the claims worth pinning are all refusals: who is turned away,
 * with what, and that every refusal looks identical from the outside. The one
 * loud failure is reserved for the admin themselves — a misconfigured service
 * role must name itself (hard rule #3), never fabricate an empty platform.
 */

const state: {
  configured: boolean;
  serviceConfigured: boolean;
  user: { id: string } | null;
} = { configured: true, serviceConfigured: true, user: null };

const serviceClient = { __marker: 'service-client' };

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => state.configured,
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => state.serviceConfigured,
  createServiceClient: () => serviceClient,
}));

import { parsePlatformAdminIds, requirePlatformAdmin } from '@/lib/platformAdmin';

beforeEach(() => {
  state.configured = true;
  state.serviceConfigured = true;
  state.user = null;
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parsePlatformAdminIds', () => {
  it('answers an empty list when the variable is unset', () => {
    expect(parsePlatformAdminIds({})).toEqual([]);
  });

  it('answers an empty list for an empty or whitespace-only value', () => {
    expect(parsePlatformAdminIds({ PLATFORM_ADMIN_USER_IDS: '' })).toEqual([]);
    expect(parsePlatformAdminIds({ PLATFORM_ADMIN_USER_IDS: '  ,  , ' })).toEqual([]);
  });

  it('splits on commas, trims, and drops empty entries', () => {
    expect(
      parsePlatformAdminIds({ PLATFORM_ADMIN_USER_IDS: ' uid-a, uid-b ,,uid-c ' })
    ).toEqual(['uid-a', 'uid-b', 'uid-c']);
  });

  it('reads the environment at call time, not at import time (#68)', () => {
    vi.stubEnv('PLATFORM_ADMIN_USER_IDS', 'uid-late');
    expect(parsePlatformAdminIds()).toEqual(['uid-late']);
  });
});

describe('requirePlatformAdmin — every outsider gets the same 404', () => {
  async function refusal() {
    const result = await requirePlatformAdmin();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    return {
      status: result.response.status,
      body: (await result.response.json()) as { error: { code: string; message: string } },
    };
  }

  it('404s when the backend is not configured — never demo data', async () => {
    state.configured = false;
    const { status, body } = await refusal();
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('404s for everyone when the allowlist is unset (fail closed)', async () => {
    state.user = { id: 'uid-a' };
    const { status } = await refusal();
    expect(status).toBe(404);
  });

  it('404s when there is no session', async () => {
    vi.stubEnv('PLATFORM_ADMIN_USER_IDS', 'uid-a');
    const { status, body } = await refusal();
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('404s an authenticated user who is not on the allowlist', async () => {
    vi.stubEnv('PLATFORM_ADMIN_USER_IDS', 'uid-a');
    state.user = { id: 'uid-intruder' };
    const { status } = await refusal();
    expect(status).toBe(404);
  });

  it('an unauthenticated caller and a non-admin caller are indistinguishable', async () => {
    vi.stubEnv('PLATFORM_ADMIN_USER_IDS', 'uid-a');
    const anonymous = await refusal();

    state.user = { id: 'uid-intruder' };
    const nonAdmin = await refusal();

    expect(nonAdmin.status).toBe(anonymous.status);
    expect(nonAdmin.body).toEqual(anonymous.body);
  });

  it('fails loudly for a real admin when the service role is missing (hard rule #3)', async () => {
    vi.stubEnv('PLATFORM_ADMIN_USER_IDS', 'uid-a');
    state.user = { id: 'uid-a' };
    state.serviceConfigured = false;

    const result = await requirePlatformAdmin();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.response.status).toBe(503);
    const body = (await result.response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('SERVICE_ROLE_NOT_CONFIGURED');
    expect(body.error.message).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('admits an allowlisted admin with the service client and their id', async () => {
    vi.stubEnv('PLATFORM_ADMIN_USER_IDS', 'uid-b, uid-a');
    state.user = { id: 'uid-a' };

    const result = await requirePlatformAdmin();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.ctx.userId).toBe('uid-a');
    expect(result.ctx.service).toBe(serviceClient);
  });
});
