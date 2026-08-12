import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * #88 / #90 — horizontal overflow at 375px, and two stacking collisions.
 *
 * These are CSS-class defects, and jsdom has no layout engine: it cannot tell
 * whether a flex row actually overflows. So the assertions are on the classes
 * that decide it, each tied to the mechanism the audit measured. That is
 * weaker than a real viewport — a Playwright pass at 375px is what would
 * *prove* these, and e2e is not in CI — but it does stop a silent revert of
 * the specific attributes each fix depends on.
 */

const read = (f: string) => readFileSync(f, 'utf8');

describe('horizontal overflow at 375px (#88)', () => {
  // The folio calculator and its slider/stepper cases were retired with the
  // component itself: BYOK (#221) removed per-folio pricing, so there is no
  // folio cost to calculate.

  it('lets the disabled share states shrink instead of pushing the card open', () => {
    // `flex-1` + `whitespace-nowrap` next to a `shrink-0` sibling: neither can
    // give, so the card overflows. The CLABE-missing variant is what every
    // new tenant sees on day one.
    for (const file of [
      'components/quotes/QuoteCard.tsx',
      'components/receivables/ReceivableCard.tsx',
    ]) {
      const disabled = read(file)
        .split('\n')
        .filter((l) => l.includes('flex-1') && l.includes('cursor-not-allowed'));
      expect(disabled.length, `${file} should still have a disabled share state`).toBeGreaterThan(0);
      for (const line of disabled) {
        expect(line, `${file}: a flex-1 item needs min-w-0 to shrink`).toContain('min-w-0');
        expect(line, `${file}: nowrap defeats the shrink`).not.toContain('whitespace-nowrap');
      }
    }
  });

  it('constrains selects, whose intrinsic width is their widest option', () => {
    // globals.css forces 16px on selects (load-bearing for iOS), so
    // "PPD — Pago diferido o en parcialidades" is wider than the row holding it.
    const invoice = read('components/invoices/InvoiceManagerCard.tsx');
    const metodoPago = invoice
      .split('\n')
      .find((l) => l.includes('bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-sm'));
    expect(metodoPago).toBeTruthy();
    expect(metodoPago).toContain('min-w-0');

    // Grid items default to min-width:auto, so the régimen selects blow out
    // their track the same way.
    const clientForm = read('components/clients/ClientFormModal.tsx');
    const grids = clientForm.split('\n').filter((l) => l.includes('sm:grid-cols-3'));
    expect(grids.length).toBeGreaterThan(0);
    for (const grid of grids) {
      expect(grid, 'grid children need min-w-0 or a select overflows the track').toContain(
        '[&>*]:min-w-0'
      );
    }
  });

  it('scrolls the tier tab rail instead of overflowing it', () => {
    const src = read('components/features/FeatureTierComparisonModal.tsx');
    const rail = src.split('\n').find((l) => l.includes('border-b border-slate-800 bg-slate-900/80'));
    expect(rail).toContain('overflow-x-auto');
  });

  it('breaks the identifiers a payer actually has to read', () => {
    // A CLABE and a Banxico clave de rastreo have no break opportunity, so
    // they need break-all — the repo already does this for the SHA-256 seal.
    const clabe = read('app/pay/[token]/page.tsx')
      .split('\n')
      .find((l) => l.includes('{milestone.clabe}'));
    expect(clabe).toContain('break-all');

    const clave = read('components/receivables/SpeiConfirmModal.tsx')
      .split('\n')
      .find((l) => l.includes('{milestone.tracking_reference}'));
    expect(clave).toContain('break-all');

    // A long corporate address does not break at `@` or `.` by default.
    const email = read('components/team/TeamMembersCard.tsx');
    expect(email).toMatch(/truncate">\{mem\.email/);
  });
});

describe('sticky/fixed stacking collisions (#90)', () => {
  it('sticks the dashboard header below the demo banner, not underneath it', () => {
    // Both stuck to top:0; the banner is earlier in the DOM with the higher
    // z-index, so the header vanished under it on the first scroll.
    const header = read('components/layout/Header.tsx');
    expect(header).toContain("top: 'var(--bh-sticky-offset, 0px)'");
    expect(header, 'the header must not re-pin itself to 0').not.toMatch(/sticky top-0/);

    // Measured, not hardcoded: the banner wraps at 375px, which is exactly
    // where the collision matters.
    const banner = read('components/demo/DemoBanner.tsx');
    expect(banner).toContain('--bh-sticky-offset');
    expect(banner).toContain('ResizeObserver');
    // Leaving demo mode must not leave every header pushed down.
    expect(banner).toContain('removeProperty');
  });

  it('lifts the cookie banner clear of the bottom-pinned CTA on small screens', () => {
    const src = read('components/layout/CookieBanner.tsx');
    expect(src).toContain('bottom-24 sm:bottom-4');
    expect(src, 'a bare bottom-4 puts it back on top of the CTA').not.toContain('fixed bottom-4');
  });

  it('gives the cookie banner controls the 48px floor', () => {
    // #90 says to take these while the file is open; the rest of #89 is not
    // in this PR.
    const src = read('components/layout/CookieBanner.tsx');
    expect(src).toMatch(/h-12 w-12[^"]*"\s*\n?\s*aria-label="Cerrar aviso de cookies"/);
    expect(src).not.toContain('min-h-[44px]');
  });
});
