import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  STRIPE_PLANS,
  TIER_PRICE_ENV_VARS,
  normalizeTierKey,
  StripeTierId,
} from '@/lib/stripe';
import { APP_TIERS } from '@/lib/tierFeaturesData';

/**
 * One price per tier, wherever it is written down (#68).
 *
 * The monthly price lives in three files: `lib/stripe.ts` (what Stripe is asked
 * to bill), `app/pricing/page.tsx` (what a visitor is promised) and
 * `lib/tierFeaturesData.ts` (what the comparison table shows). Nothing tied
 * them together, so editing one silently advertised a price the checkout would
 * not charge — the "mismatched map charges the wrong amount" failure #68 calls
 * worse than failing to charge at all.
 *
 * The price ids themselves cannot be checked here: they are live Stripe objects,
 * and only `npm run verify:stripe` can confirm a tier's Price id bills the
 * amount below. These tests cover the half that is knowable offline.
 */

const PRICING_PAGE = 'app/pricing/page.tsx';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

/** Every `id: '…'` / `price: '$…'` pair declared in the pricing page's plan list. */
function pricingPageTiers(): Array<{ id: string; price: number }> {
  const source = readSource(PRICING_PAGE);
  const tiers: Array<{ id: string; price: number }> = [];
  const blockPattern = /id:\s*'([a-z_]+)',[\s\S]{0,600}?price:\s*'\$([\d,]+)'/g;

  for (const match of source.matchAll(blockPattern)) {
    tiers.push({ id: match[1], price: Number(match[2].replace(/,/g, '')) });
  }

  return tiers;
}

describe('the advertised price and the billed price are the same number (#68)', () => {
  it('the pricing page lists all three tiers', () => {
    // Guards the regex above: a page refactor that stops matching would
    // otherwise turn every assertion below into a silent no-op.
    expect(pricingPageTiers()).toHaveLength(3);
  });

  it('every pricing-page tier maps to a plan, at the price it advertises', () => {
    for (const tier of pricingPageTiers()) {
      const tierId = normalizeTierKey(tier.id);
      expect(tierId, `pricing page tier "${tier.id}" maps to no plan`).not.toBeNull();
      expect(STRIPE_PLANS[tierId as StripeTierId].price, `tier "${tier.id}"`).toBe(tier.price);
    }
  });

  it('the tier comparison data carries the same prices', () => {
    expect(APP_TIERS).toHaveLength(3);

    for (const tier of APP_TIERS) {
      const tierId = normalizeTierKey(tier.id);
      expect(tierId, `APP_TIERS tier "${tier.id}" maps to no plan`).not.toBeNull();
      expect(STRIPE_PLANS[tierId as StripeTierId].price, `tier "${tier.id}"`).toBe(
        tier.priceMonthly
      );
    }
  });

  it('all three plans are priced in MXN per month', () => {
    for (const plan of Object.values(STRIPE_PLANS)) {
      expect(plan.currency).toBe('MXN');
      expect(plan.interval).toBe('mes');
    }
  });
});

/**
 * A Stripe Price id is an account-specific value that only Stripe issues. A
 * literal one in shipped code is a fabricated identifier (hard rule #1): the
 * old `process.env.STRIPE_PRICE_NEGOCIO || 'price_negocio_599_mxn'` meant an
 * unmapped live deployment posted an id no account has, and the owner saw the
 * same error as a Stripe outage.
 */
const ROOTS = ['app', 'components', 'lib'];
const PRICE_LITERAL = /['"`]price_[A-Za-z0-9_]+['"`]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('no Stripe Price id is ever hardcoded (#68)', () => {
  it('shipped code contains no price_* literal', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sourceFiles(join(process.cwd(), root))) {
        const rel = file.replace(process.cwd() + '/', '');
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const trimmed = line.trim();
            // The history of this defect is documented in comments on purpose.
            if (
              trimmed.startsWith('//') ||
              trimmed.startsWith('*') ||
              trimmed.startsWith('/*') ||
              trimmed.startsWith('{/*')
            ) {
              return;
            }
            if (PRICE_LITERAL.test(line)) offenders.push(`${rel}:${i + 1}: ${trimmed}`);
          });
      }
    }

    expect(offenders).toEqual([]);
  });

  // An absence assertion must be shown to catch what it exists for (rule 7).
  // Verified by planting each shape in lib/stripe.ts and watching this go red.
  it('the pattern catches the shapes that actually shipped', () => {
    expect(
      PRICE_LITERAL.test("stripePriceId: process.env.STRIPE_PRICE_NEGOCIO || 'price_negocio_599_mxn',")
    ).toBe(true);
    expect(PRICE_LITERAL.test('price: pack.stripePriceId || "price_cfdi_50_folios_100_mxn",')).toBe(
      true
    );
    expect(PRICE_LITERAL.test('const priceId = obj?.price?.id || `price_negocio`;')).toBe(true);
  });

  it('the pattern leaves unrelated code alone', () => {
    expect(PRICE_LITERAL.test("const label = 'precio_total';")).toBe(false);
    expect(PRICE_LITERAL.test('const key = "STRIPE_PRICE_NEGOCIO";')).toBe(false);
    expect(PRICE_LITERAL.test('acc.price_total = subtotal + iva;')).toBe(false);
  });
});

/**
 * `scripts/verify-stripe-live.mjs` is plain JS run by node, so it restates the
 * amounts and variable names it checks against Stripe. A restatement that
 * drifts verifies the wrong thing while reporting a pass — the failure mode of
 * every duplicated table in this repo — so the copy is asserted here.
 */
describe('the verify:stripe script checks the prices the app actually sells (#68)', () => {
  const script = readSource('scripts/verify-stripe-live.mjs');

  function tableEntries(constName: string): Array<{ id: string; envVars: string[]; amountMxn: number }> {
    const block = script.match(new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\n\\];`));
    if (!block) return [];

    return [
      ...block[1].matchAll(
        /\{\s*id:\s*'([a-z_0-9]+)',\s*envVars:\s*\[([^\]]*)\],\s*amountMxn:\s*(\d+)\s*\}/g
      ),
    ].map((match) => ({
      id: match[1],
      envVars: [...match[2].matchAll(/'([A-Z_0-9]+)'/g)].map((v) => v[1]),
      amountMxn: Number(match[3]),
    }));
  }

  it('its tier table matches STRIPE_PLANS and the price variables', () => {
    const entries = tableEntries('EXPECTED_TIERS');
    expect(entries).toHaveLength(Object.keys(STRIPE_PLANS).length);

    for (const entry of entries) {
      const tierId = entry.id as StripeTierId;
      expect(STRIPE_PLANS[tierId], `unknown tier "${entry.id}"`).toBeDefined();
      expect(entry.amountMxn, `tier "${entry.id}"`).toBe(STRIPE_PLANS[tierId].price);
      expect(entry.envVars, `tier "${entry.id}"`).toEqual(TIER_PRICE_ENV_VARS[tierId]);
    }
  });

  it('checks no folio pack — the product no longer exists (#221 BYOK)', () => {
    // A verify table for a product nobody can buy would report "checked" on a
    // price that can mis-charge nobody and drift silently. (Its presence made
    // the inverse of this assertion pass before #221's PR removed it.)
    expect(script).not.toContain('EXPECTED_PACKS');
    expect(script).not.toContain('STRIPE_PRICE_FOLIO');
  });

  it('it requires exactly the events the webhook route handles', () => {
    const scriptEvents = [
      ...(script.match(/const REQUIRED_EVENTS = \[([\s\S]*?)\n\];/)?.[1] ?? '').matchAll(/'([\w.]+)'/g),
    ].map((m) => m[1]);

    const routeEvents = [
      ...(readSource('app/api/stripe/webhook/route.ts').match(
        /const HANDLED_EVENTS = new Set\(\[([\s\S]*?)\n\]\);/
      )?.[1] ?? '').matchAll(/'([\w.]+)'/g),
    ].map((m) => m[1]);

    expect(routeEvents.length).toBeGreaterThan(0);
    expect(scriptEvents.sort()).toEqual(routeEvents.sort());
  });

  it('it never falls back to a hardcoded app origin', () => {
    // #36/#47/#73: the hardcoded-domain defect has shipped four times. The
    // webhook-endpoint check is skipped when NEXT_PUBLIC_APP_URL is unset
    // rather than guessing a host and reporting on the wrong deployment.
    // The usage example in the header comment may name the domain; code may not.
    const code = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/businesshelper\.(app|mx)/);
  });
});
