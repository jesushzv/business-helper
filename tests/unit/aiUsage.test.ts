import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(() => ({ handled: true })),
}));

import { currentAIMonth, resolveAIModelBudget, recordModelAnswer } from '@/lib/aiUsage';
import { captureException } from '@/lib/sentry';
import { TIER_AI_QUOTAS } from '@/lib/whatsappAI';

beforeEach(() => {
  vi.mocked(captureException).mockClear();
});

/**
 * Builds a service-client stub whose organizations/ai_usage_monthly reads
 * resolve to the given results. Shape mirrors the two `.select().eq()…
 * .maybeSingle()` chains in resolveAIModelBudget.
 */
function serviceStub(
  orgResult: { data?: unknown; error?: unknown },
  usageResult: { data?: unknown; error?: unknown },
  rpcResult: { data?: unknown; error?: unknown } = { data: 1 }
) {
  const chain = (result: { data?: unknown; error?: unknown }) => {
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
    };
    return self;
  };
  return {
    from: vi.fn((table: string) => (table === 'organizations' ? chain(orgResult) : chain(usageResult))),
    rpc: vi.fn(async () => ({ data: rpcResult.data ?? null, error: rpcResult.error ?? null })),
  };
}

describe('currentAIMonth', () => {
  it('keys the ledger by UTC year-month', () => {
    expect(currentAIMonth(new Date('2026-08-12T23:59:00Z'))).toBe('2026-08');
    expect(currentAIMonth(new Date('2026-12-31T23:59:00Z'))).toBe('2026-12');
  });
});

describe('resolveAIModelBudget', () => {
  it('grades usage against the tier stored on the organization row', async () => {
    const service = serviceStub({ data: { subscription_tier: 'negocio' } }, { data: { used: 100 } });

    const budget = await resolveAIModelBudget(service, 'org-1');

    expect(budget?.quota.allowed).toBe(true);
    expect(budget?.quota.limit).toBe(TIER_AI_QUOTAS.negocio);
    expect(budget?.quota.remaining).toBe(TIER_AI_QUOTAS.negocio - 100);
    expect(budget?.used).toBe(100);
  });

  it('blocks once the month is spent', async () => {
    const service = serviceStub(
      { data: { subscription_tier: 'inicial' } },
      { data: { used: TIER_AI_QUOTAS.inicial } }
    );

    const budget = await resolveAIModelBudget(service, 'org-1');

    expect(budget?.quota.allowed).toBe(false);
  });

  it('reads a missing ledger row as zero usage — a real answer, not an unknown', async () => {
    const service = serviceStub({ data: { subscription_tier: 'empresa' } }, { data: null });

    const budget = await resolveAIModelBudget(service, 'org-1');

    expect(budget?.used).toBe(0);
    expect(budget?.quota.allowed).toBe(true);
  });

  it('floors an unlisted tier at the demo allowance instead of inventing one', async () => {
    const service = serviceStub({ data: { subscription_tier: 'free' } }, { data: { used: 0 } });

    const budget = await resolveAIModelBudget(service, 'org-1');

    expect(budget?.quota.limit).toBe(TIER_AI_QUOTAS.demo);
  });

  it('answers null — unknown, not zero — when the organization read fails, and reports it', async () => {
    const service = serviceStub({ error: { message: 'boom' } }, { data: { used: 0 } });

    expect(await resolveAIModelBudget(service, 'org-1')).toBeNull();
    // Unknown budget silently switches the model off; without this the
    // degradation is invisible in Sentry, indefinitely.
    expect(vi.mocked(captureException)).toHaveBeenCalledTimes(1);
  });

  it('answers null when the ledger read fails, and reports it', async () => {
    const service = serviceStub({ data: { subscription_tier: 'negocio' } }, { error: { message: 'boom' } });

    expect(await resolveAIModelBudget(service, 'org-1')).toBeNull();
    expect(vi.mocked(captureException)).toHaveBeenCalledTimes(1);
  });

  it('answers null when the organization row does not exist', async () => {
    const service = serviceStub({ data: null }, { data: null });

    expect(await resolveAIModelBudget(service, 'org-1')).toBeNull();
  });
});

describe('recordModelAnswer', () => {
  it('counts through the atomic increment RPC with the current month', async () => {
    const service = serviceStub({ data: null }, { data: null });

    const counted = await recordModelAnswer(service, 'org-1', new Date('2026-08-12T12:00:00Z'));

    expect(counted).toBe(true);
    expect(service.rpc).toHaveBeenCalledWith('increment_ai_usage', {
      p_organization_id: 'org-1',
      p_month: '2026-08',
    });
  });

  it('reports a failed count instead of failing the delivered answer', async () => {
    const service = serviceStub({ data: null }, { data: null }, { error: { message: '42501' } });

    const counted = await recordModelAnswer(service, 'org-1');

    expect(counted).toBe(false);
    expect(vi.mocked(captureException)).toHaveBeenCalledTimes(1);
  });
});
