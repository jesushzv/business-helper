import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * #289 — the re-invite revocation must match the stored address literally.
 *
 * `%` and `_` are wildcards under `ilike`, and the old
 * `.ilike('email', normalizedEmail)` let one stray `%` in a typed address
 * revoke every pending invitation in the organization. Rows are stored
 * normalized (lowercased, trimmed), so `.eq` on the normalized address is the
 * case-insensitive match the ilike was there for — with no pattern language.
 */

const source = readFileSync(
  path.join(process.cwd(), 'app', 'api', 'organization', 'members', 'route.ts'),
  'utf8'
);

describe('invitation revocation matches literally (#289)', () => {
  it('revokes by equality on the stored normalized address (positive control for the scan below)', () => {
    expect(source).toContain(".eq('email', normalizedEmail)");
  });

  it('never matches invitation emails with a LIKE pattern', () => {
    expect(source.includes('.ilike(')).toBe(false);
  });
});
