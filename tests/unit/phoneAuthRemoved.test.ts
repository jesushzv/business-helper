import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Phone-credential auth and the SMS transport are retired (#122, and the
 * sms OTP channel that went with it). The product authenticates with
 * email/OAuth only; WhatsApp remains the only outbound message transport.
 *
 * This scan keeps both from growing back anywhere in the runtime tree:
 *
 *  - No Supabase auth call may take a phone credential. The login tab that
 *    did could never succeed — no account has a phone identity — and told
 *    the user their password was wrong (#122).
 *  - Nothing may read the retired SMS sender variables. `lib/otpDelivery.ts`
 *    resolves `OTP_DELIVERY_CHANNEL=sms` to console (fails closed in
 *    production); a new read of these variables would mean the channel is
 *    being rebuilt.
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

// TWILIO_PHONE_NUMBER is NOT listed: lib/whatsappOutbound.ts reads it as a
// legacy alias for the WhatsApp sender, which is unrelated to the sms channel.
const RETIRED_ENV_VARS = /TWILIO_SMS_NUMBER/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('phone auth and SMS transport stay removed', () => {
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

  it('nothing reads the retired SMS sender variables', () => {
    const offenders = files.filter((file) => RETIRED_ENV_VARS.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
