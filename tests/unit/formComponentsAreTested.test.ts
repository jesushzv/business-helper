import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #146 — why the suite was green over a form nobody could get past.
 *
 * The clients coverage was real and reasonably thorough: `clientWritePath`
 * invoked both handlers and asserted on what reached the DB layer,
 * `clientPhoneValidation` pinned the normalizer, `clientCredit` the
 * calculations. Every one of them tested a *function*. Not one rendered the
 * form.
 *
 * So the defects that made registration impossible were all invisible to it,
 * because they lived in the seam: validation returning at the first failure, an
 * envelope carrying prose with no field attached, and a form dropping that
 * prose into a banner above the fold of a modal taller than the phone. Each
 * layer was correct on its own terms. What no test asked was the only question
 * the tenant asks — *can I complete this form?*
 *
 * Hence this gate. A component that owns a `<form>` and a submit handler is
 * where a user can get stuck, and a component test is where that can be caught.
 * Such components with no test that renders them are allowlisted below, tracked
 * in #149 — each entry is live debt, and the gate fails when one acquires a
 * test and keeps its entry. (`OtpSignatureModal` left the list with the
 * email-OTP migration; `/pay/[token]` — the page a paying client sees — left it
 * with #164's payer-facing archived-account rendering.)
 *
 * **Coverage is decided by import, not by filename.** `SettingsCards.test.tsx`
 * covers three cards, and every Next.js page is called `page.tsx`, so matching
 * `<Name>.test.tsx` would both miss real coverage and invent it.
 */

const ROOTS = ['components', 'app'];
const TEST_DIR = join(process.cwd(), 'tests', 'components');

/**
 * Form components with no component test. Each entry is untested, not exempt.
 * Delete one in the PR that adds its test; that is how #149 closes.
 */
const UNTESTED = new Set([
  'components/assistant/AIAssistantCard.tsx',
  'components/help/HelpCenterView.tsx',
  'components/landing/BottomConversionForm.tsx',
  'components/products/ProductCatalogCard.tsx',
  'components/settings/PacConnectionCard.tsx',
  'components/team/TeamMembersCard.tsx',
]);

const HAS_FORM = /<form[\s>]/;
const HAS_SUBMIT = /onSubmit=|handleSubmit/;

function sourceFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full, ext);
    return entry.name.endsWith(ext) ? [full] : [];
  });
}

/** Components that own a form and a submit handler — where a user can get stuck. */
function formComponents(): string[] {
  return ROOTS.flatMap((root) => sourceFiles(join(process.cwd(), root), '.tsx'))
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      return HAS_FORM.test(source) && HAS_SUBMIT.test(source);
    })
    .map((file) => file.replace(process.cwd() + '/', ''))
    .sort();
}

/** Everything under tests/components/, concatenated once. */
function componentTestSources(): string {
  return sourceFiles(TEST_DIR, '.tsx')
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function isRenderedByATest(componentPath: string, tests: string): boolean {
  return tests.includes(`'@/${componentPath.replace(/\.tsx$/, '')}'`);
}

describe('a form a user can get stuck in has a test that tries to finish it (#146)', () => {
  it('finds a plausible set of form components (guards the guard)', () => {
    // A scan that silently matched nothing would pass everything below while
    // checking nothing — the failure mode CLAUDE.md rule 7 names.
    const forms = formComponents();
    expect(forms.length).toBeGreaterThanOrEqual(17);
    expect(forms).toContain('components/clients/ClientFormModal.tsx');
    expect(forms).toContain('components/quotes/QuoteWizardModal.tsx');
  });

  it('detects the coverage that already exists (guards the guard)', () => {
    // If the import match were broken, every component would read as untested
    // and the allowlist would quietly become the whole population.
    const tests = componentTestSources();
    expect(isRenderedByATest('components/clients/ClientFormModal.tsx', tests)).toBe(true);
    expect(isRenderedByATest('app/(auth)/register/page.tsx', tests)).toBe(true);
    // Covered by SettingsCards.test.tsx — the case filename matching would miss.
    expect(isRenderedByATest('components/settings/OrgProfileCard.tsx', tests)).toBe(true);
  });

  it('every new form component has one', () => {
    const tests = componentTestSources();
    const offenders = formComponents()
      .filter((f) => !UNTESTED.has(f))
      .filter((f) => !isRenderedByATest(f, tests));

    expect(
      offenders,
      `These components own a <form> and a submit handler, but no test in tests/components/ ` +
        `imports them:\n\n${offenders.map((o) => `  - ${o}`).join('\n')}\n\n` +
        `Unit-testing the handler underneath is not the same check. #146's defects were all in ` +
        `the seam between form and API — messages with nowhere to land — and every function ` +
        `involved passed its own tests. Render the component and assert that a user supplying ` +
        `the minimum can complete it. tests/components/ClientFormModal.test.tsx is the template.`
    ).toEqual([]);
  });

  it('the allowlist is live debt, not decoration', () => {
    const forms = formComponents();
    const tests = componentTestSources();

    for (const rel of UNTESTED) {
      expect(
        forms,
        `${rel} is allowlisted but no longer owns a form — remove the entry`
      ).toContain(rel);
      expect(
        isRenderedByATest(rel, tests),
        `${rel} now has a component test — delete its allowlist entry (that is how #149 closes)`
      ).toBe(false);
    }
  });
});
