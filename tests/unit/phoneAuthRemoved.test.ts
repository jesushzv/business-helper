import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Phone-credential auth is retired (#122). The product authenticates with
 * email/OAuth only; phone numbers are message-delivery data, never a
 * credential.
 *
 * This scan keeps it from growing back anywhere in the runtime tree: no
 * Supabase auth call may take a phone credential. The login tab that did
 * could never succeed — no account has a phone identity — and told the
 * user their password was wrong (#122).
 *
 * The sms OTP *delivery* channel is deliberately out of scope: it was
 * retired alongside phone login, then restored as the interim delivery
 * channel once WhatsApp OTP proved to need a WABA + approved auth template
 * (#42). Delivering a code over SMS is not phone-credential auth — the
 * credential model this scan guards is unchanged.
 *
 * Derived from the tree at run time, not from a fixture — a hand-kept list
 * cannot catch the drift it names (hard rule #7).
 */

const ROOTS = ['app', 'lib', 'components'];

/**
 * supabase.auth.<sign-in method>({ ... phone ... }) with a phone key anywhere
 * in the argument. `signUp` is deliberately not listed: register legitimately
 * stores the business WhatsApp number in `options.data` (metadata, not a
 * credential), and a phone *identity* cannot be signed up without also adding
 * a sign-in path this scan does catch.
 */
const PHONE_CREDENTIAL_CALL =
  /\.auth\s*\.\s*(signInWithPassword|signInWithOtp|verifyOtp)\s*\(\s*\{[^)]*\bphone\s*[:,}]/s;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('phone-credential auth stays removed', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));

  it('scanned a plausible slice of the runtime tree', () => {
    // A refactor moving these roots would leave the scan matching nothing —
    // indistinguishable from passing. The suite alone imports from all three.
    expect(files.length).toBeGreaterThan(100);
  });

  it('no Supabase auth call takes a phone credential', () => {
    const offenders = files.filter((file) => PHONE_CREDENTIAL_CALL.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
