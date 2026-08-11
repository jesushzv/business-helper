import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "When trying to upgrade, I get forced into the registration flow."
 *
 * Every plan CTA — pricing page, landing page, folio calculator, tier
 * comparison modal — linked to `/register?plan=…` unconditionally. A signed-in
 * owner who wanted to move from Inicial to Negocio was handed the one page that
 * cannot sell them anything, asking them to create a business they already had.
 * And nothing read `plan`: the register page pulls `businessName`, `rfc`,
 * `phone` and `email` off the query and never `plan`, so even for a genuinely
 * new visitor the tier they picked was dropped at the first hop.
 *
 * `/upgrade` makes that decision with the session, server-side.
 */

const scenario: {
  supabaseConfigured: boolean;
  user: { id: string } | null;
  owned: Array<{ id: string }>;
  membership: Array<{ organization_id: string }>;
  throwOnRead: boolean;
} = {
  supabaseConfigured: true,
  user: { id: 'user_1' },
  owned: [{ id: 'org_1' }],
  membership: [],
  throwOnRead: false,
};

vi.mock('@/lib/supabase/server', () => ({
  isSupabaseConfigured: () => scenario.supabaseConfigured,
  createClient: async () => {
    if (scenario.throwOnRead) throw new Error('network');
    return {
      auth: { getUser: async () => ({ data: { user: scenario.user } }) },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: table === 'organizations' ? scenario.owned : scenario.membership,
            }),
          }),
        }),
      }),
    };
  },
}));

async function upgrade(query: string) {
  const { GET } = await import('@/app/upgrade/route');
  const response = await GET(new Request(`https://businesshelper.app/upgrade${query}`));
  return new URL(response.headers.get('location') as string);
}

beforeEach(() => {
  scenario.supabaseConfigured = true;
  scenario.user = { id: 'user_1' };
  scenario.owned = [{ id: 'org_1' }];
  scenario.membership = [];
  scenario.throwOnRead = false;
});

describe('GET /upgrade', () => {
  it('sends an owner to the page that can actually charge them', async () => {
    const location = await upgrade('?plan=pro');

    expect(location.pathname).toBe('/settings');
    // The alias the pricing page sells arrives as the id the billing card
    // matches on, or the highlight silently marks nothing.
    expect(location.searchParams.get('plan')).toBe('negocio');
  });

  it('never sends a signed-in user to the registration form', async () => {
    for (const owned of [[{ id: 'org_1' }], []]) {
      scenario.owned = owned;
      scenario.membership = owned.length ? [] : [{ organization_id: 'org_2' }];
      const location = await upgrade('?plan=business');
      expect(location.pathname, JSON.stringify({ owned })).not.toBe('/register');
    }
  });

  it('sends a signed-in user with no organization to onboarding, plan intact', async () => {
    scenario.owned = [];
    scenario.membership = [];

    const location = await upgrade('?plan=starter');

    expect(location.pathname).toBe('/onboarding');
    expect(location.searchParams.get('plan')).toBe('inicial');
  });

  it('sends a member to settings too — who may buy is the route’s call, not a redirect’s', async () => {
    scenario.owned = [];
    scenario.membership = [{ organization_id: 'org_2' }];

    expect((await upgrade('?plan=negocio')).pathname).toBe('/settings');
  });

  it('sends a visitor with no session to register, carrying the plan', async () => {
    scenario.user = null;

    const location = await upgrade('?plan=pro');

    expect(location.pathname).toBe('/register');
    expect(location.searchParams.get('plan')).toBe('negocio');
  });

  it('does not guess a plan it does not recognise', async () => {
    for (const query of ['', '?plan=', '?plan=plan_pirata']) {
      const location = await upgrade(query);
      expect(location.pathname, query).toBe('/settings');
      expect(location.searchParams.get('plan'), query).toBeNull();
    }
  });

  it('treats a failed session read as unknown, not as signed out', async () => {
    // Guessing "signed out" here is the reported bug all over again: an owner
    // dropped into a registration form by a network blip.
    scenario.throwOnRead = true;

    expect((await upgrade('?plan=pro')).pathname).toBe('/onboarding');
  });

  it('sends the demo deployment to register — there is no session to read', async () => {
    scenario.supabaseConfigured = false;

    expect((await upgrade('?plan=pro')).pathname).toBe('/register');
  });

  it('redirects within this deployment, never to a literal origin', async () => {
    const { GET } = await import('@/app/upgrade/route');
    const response = await GET(new Request('https://preview.example.com/upgrade?plan=pro'));

    expect(new URL(response.headers.get('location') as string).origin).toBe(
      'https://preview.example.com'
    );
  });
});

/**
 * The scanning half: a plan-selection CTA anywhere in the tree must go through
 * `/upgrade`, or this defect comes back one component at a time.
 */
describe('no plan CTA links straight into registration', () => {
  const ROOTS = ['app', 'components'];
  const PLAN_REGISTER_LINK = /\/register\?[^'"`]*plan=/;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [full] : [];
    });
  }

  it('finds the files it is meant to be scanning', () => {
    // An absence assertion that matches nothing passes for the wrong reason.
    const files = ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root)));
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith('app/pricing/page.tsx'))).toBe(true);
  });

  it('every plan link goes through /upgrade', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const rel = file.replace(process.cwd() + '/', '');
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const trimmed = line.trim();
            // The history of this defect is documented in comments on purpose.
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
            if (PLAN_REGISTER_LINK.test(line)) offenders.push(`${rel}:${i + 1}: ${trimmed}`);
          });
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the pattern catches the shapes that actually shipped', () => {
    // Verified by planting each in app/pricing/page.tsx and watching this go red.
    expect(PLAN_REGISTER_LINK.test("ctaHref: '/register?plan=starter',")).toBe(true);
    expect(PLAN_REGISTER_LINK.test('<Link href="/register?plan=pro" className="…">')).toBe(true);
    expect(PLAN_REGISTER_LINK.test('href={`/register?plan=${bestPlan.toLowerCase()}`}')).toBe(true);
    expect(PLAN_REGISTER_LINK.test("router.push(`/register?utm=x&plan=${tier}`)")).toBe(true);
  });

  it('the pattern leaves the plain signup links alone', () => {
    expect(PLAN_REGISTER_LINK.test('<Link href="/register">Crear cuenta</Link>')).toBe(false);
    expect(PLAN_REGISTER_LINK.test("router.push(`/register?${params.toString()}`)")).toBe(false);
    expect(PLAN_REGISTER_LINK.test('href="/upgrade?plan=pro"')).toBe(false);
  });
});

/**
 * The hops between the CTA and the payment page. `/upgrade` picks the
 * destination; these carry the choice the rest of the way.
 */
describe('the chosen plan survives registration and onboarding', () => {
  it('appends only a plan this deployment sells', async () => {
    const { withPlanParam } = await import('@/lib/upgradeIntent');

    expect(withPlanParam('/onboarding', 'pro')).toBe('/onboarding?plan=negocio');
    expect(withPlanParam('/onboarding', 'starter')).toBe('/onboarding?plan=inicial');
    // Absent is absent, and an unknown key is not forwarded as though it meant
    // something — the billing card would match it against nothing.
    expect(withPlanParam('/onboarding', null)).toBe('/onboarding');
    expect(withPlanParam('/onboarding', '')).toBe('/onboarding');
    expect(withPlanParam('/onboarding', 'plan_pirata')).toBe('/onboarding');
  });

  it('finishes onboarding on Ajustes when a plan is in flight, the dashboard otherwise', async () => {
    const { postOnboardingPath } = await import('@/lib/upgradeIntent');

    expect(postOnboardingPath('?plan=pro')).toBe('/settings?plan=negocio');
    expect(postOnboardingPath('?utm_source=x&plan=business')).toBe('/settings?plan=empresa');
    expect(postOnboardingPath('')).toBe('/dashboard');
    expect(postOnboardingPath('?utm_source=x')).toBe('/dashboard');
    expect(postOnboardingPath('?plan=plan_pirata')).toBe('/dashboard');
  });
});
