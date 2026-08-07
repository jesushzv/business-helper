import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  OTP_PHONE_WINDOW_MS,
  OTP_PHONE_WINDOW_MAX_SENDS,
  OTP_QUOTE_LIFETIME_MAX_SENDS,
  checkOtpSendAllowance,
  evaluatePhoneWindow,
  evaluateQuoteLifetime,
  normalizeOtpRecipient,
  recordOtpSend,
  reserveOtpSend,
  type OtpLedgerClient,
} from '@/lib/otpRateLimit';

/**
 * Regression suite for issue #17: OTP issuance was capped per quote, so a
 * client holding several quote tokens could be pumped without limit — every
 * send a billable message.
 */

const NOW = new Date('2026-08-07T12:00:00.000Z');

function minutesAgo(minutes: number, from: Date = NOW): string {
  return new Date(from.getTime() - minutes * 60 * 1000).toISOString();
}

interface LedgerRow {
  id: string;
  phone_e164: string;
  quote_id: string | null;
  channel: string | null;
  created_at: string;
}

type LedgerSeed = Omit<LedgerRow, 'id'> & { id?: string };

/**
 * In-memory stand-in for the `otp_send_log` table, honouring the subset of the
 * Supabase builder the module uses. `failOn` simulates the table being
 * unreachable, which the route must fail closed on.
 */
function fakeLedger(seed: LedgerSeed[] = [], failOn?: 'select' | 'insert') {
  let sequence = 0;
  const rows: LedgerRow[] = seed.map((row) => ({ ...row, id: row.id ?? `seed-${sequence++}` }));
  const state = { rows, inserts: 0 };

  const client: OtpLedgerClient = {
    from(table: string) {
      expect(table).toBe('otp_send_log');

      return {
        select(_columns: string, options?: { count?: 'exact'; head?: boolean }) {
          const filters: ((row: LedgerRow) => boolean)[] = [];
          const sortColumns: string[] = [];

          const read = (row: LedgerRow, column: string) =>
            String((row as unknown as Record<string, unknown>)[column] ?? '');

          const query = {
            eq(column: string, value: string) {
              filters.push((row) => read(row, column) === value);
              return query;
            },
            gte(column: string, value: string) {
              filters.push((row) => read(row, column) >= value);
              return query;
            },
            order(column: string, { ascending }: { ascending: boolean }) {
              expect(ascending).toBe(true);
              sortColumns.push(column);
              return query;
            },
            then(onfulfilled: (result: unknown) => unknown) {
              if (failOn === 'select') {
                return Promise.resolve(
                  onfulfilled({ data: null, error: { message: 'connection refused' }, count: null })
                );
              }

              const matched = state.rows
                .filter((row) => filters.every((f) => f(row)))
                .sort((a, b) => {
                  for (const column of sortColumns) {
                    const diff = read(a, column).localeCompare(read(b, column));
                    if (diff !== 0) return diff;
                  }
                  return 0;
                });

              return Promise.resolve(
                onfulfilled({
                  data: options?.head ? null : matched,
                  error: null,
                  count: matched.length,
                })
              );
            },
          };

          return query as never;
        },

        insert(row: Record<string, unknown>) {
          const inserted: LedgerRow = {
            // Padded so lexical id order matches insertion order, as a uuid
            // would not — the ranking only needs a stable tie-break.
            id: `row-${String(sequence++).padStart(4, '0')}`,
            phone_e164: String(row.phone_e164),
            quote_id: row.quote_id === null ? null : String(row.quote_id),
            channel: row.channel === null || row.channel === undefined ? null : String(row.channel),
            created_at: NOW.toISOString(),
          };

          return {
            select() {
              return {
                single() {
                  if (failOn === 'insert') {
                    return Promise.resolve({
                      data: null,
                      error: { message: 'permission denied' },
                    });
                  }
                  state.inserts += 1;
                  state.rows.push(inserted);
                  return Promise.resolve({ data: inserted, error: null });
                },
              };
            },
          };
        },

        delete() {
          return {
            eq(column: string, value: string) {
              const index = state.rows.findIndex(
                (row) => String((row as unknown as Record<string, unknown>)[column]) === value
              );
              if (index >= 0) state.rows.splice(index, 1);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { client, state };
}

describe('normalizeOtpRecipient — one handset, one budget', () => {
  it('collapses the spellings a client row can hold into the same key', () => {
    const key = normalizeOtpRecipient('8115559988');

    expect(key).toBe('+528115559988');
    expect(normalizeOtpRecipient('+52 811 555 9988')).toBe(key);
    expect(normalizeOtpRecipient('(811) 555-9988')).toBe(key);
    expect(normalizeOtpRecipient('528115559988')).toBe(key);
  });

  it('rejects phones that cannot key a limit rather than inventing one', () => {
    expect(normalizeOtpRecipient('')).toBeNull();
    expect(normalizeOtpRecipient(null)).toBeNull();
    expect(normalizeOtpRecipient(undefined)).toBeNull();
    expect(normalizeOtpRecipient('12345')).toBeNull();
    expect(normalizeOtpRecipient('no es un teléfono')).toBeNull();
  });
});

describe('evaluatePhoneWindow', () => {
  it('allows a phone below the cap', () => {
    const sends = Array.from({ length: OTP_PHONE_WINDOW_MAX_SENDS - 1 }, (_, i) =>
      minutesAgo(i + 1)
    );

    expect(evaluatePhoneWindow(sends, NOW)).toEqual({ allowed: true });
  });

  it('denies at the cap and dates the retry off the send that frees the slot', () => {
    // Oldest is 50 minutes back, so a slot opens 10 minutes from now.
    const sends = [minutesAgo(50), minutesAgo(40), minutesAgo(30), minutesAgo(20), minutesAgo(10)];

    const decision = evaluatePhoneWindow(sends, NOW);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('phone');
    expect(decision.retryAfterSeconds).toBe(10 * 60);
  });

  it('counts down from the (n - cap)-th oldest when the window is over-full', () => {
    const sends = [minutesAgo(55), minutesAgo(50), minutesAgo(45), minutesAgo(40), minutesAgo(35), minutesAgo(30)];

    const decision = evaluatePhoneWindow(sends, NOW);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    // Six sends, cap of five: the count only drops below the cap once the two
    // oldest have aged out, i.e. when the 50-minute-old one expires.
    expect(decision.retryAfterSeconds).toBe(10 * 60);
  });

  it('ignores sends that have aged out of the window', () => {
    const stale = new Date(NOW.getTime() - OTP_PHONE_WINDOW_MS - 1000).toISOString();
    const sends = [stale, stale, stale, stale, stale, minutesAgo(5)];

    expect(evaluatePhoneWindow(sends, NOW)).toEqual({ allowed: true });
  });

  it('ignores unparseable timestamps instead of counting them as now', () => {
    const sends = Array.from({ length: OTP_PHONE_WINDOW_MAX_SENDS }, () => 'not-a-date');

    expect(evaluatePhoneWindow(sends, NOW)).toEqual({ allowed: true });
  });
});

describe('evaluateQuoteLifetime', () => {
  it('allows a quote below its lifetime cap', () => {
    expect(evaluateQuoteLifetime(OTP_QUOTE_LIFETIME_MAX_SENDS - 1)).toEqual({ allowed: true });
  });

  it('denies at the cap with no retry, because waiting does not help', () => {
    const decision = evaluateQuoteLifetime(OTP_QUOTE_LIFETIME_MAX_SENDS);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('quote');
    expect(decision.retryAfterSeconds).toBeUndefined();
  });
});

describe('reserveOtpSend — the limit is the phone, not the quote', () => {
  it('caps a client pumped across several of their own quotes', async () => {
    const { client, state } = fakeLedger();
    const phoneE164 = '+528115559988';

    // Each request names a different quote, so every per-quote cooldown is
    // satisfied — the exploit in the issue.
    const decisions = [];
    for (let i = 0; i < OTP_PHONE_WINDOW_MAX_SENDS + 3; i += 1) {
      decisions.push(
        await reserveOtpSend(client, { phoneE164, quoteId: `quote-${i}`, now: NOW })
      );
    }

    expect(decisions.filter((d) => d.allowed)).toHaveLength(OTP_PHONE_WINDOW_MAX_SENDS);
    expect(state.inserts).toBe(OTP_PHONE_WINDOW_MAX_SENDS);

    const denied = decisions[decisions.length - 1];
    expect(denied.allowed).toBe(false);
    if (denied.allowed) return;
    expect(denied.scope).toBe('phone');
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps budgets separate for different phones', async () => {
    const { client } = fakeLedger();

    for (let i = 0; i < OTP_PHONE_WINDOW_MAX_SENDS; i += 1) {
      await reserveOtpSend(client, { phoneE164: '+528115559988', quoteId: `q-${i}`, now: NOW });
    }

    const other = await reserveOtpSend(client, {
      phoneE164: '+525512340000',
      quoteId: 'q-other',
      now: NOW,
    });

    expect(other).toEqual({ allowed: true });
  });

  it('lets a phone through again once the window has rolled', async () => {
    const phoneE164 = '+528115559988';
    const spent = Array.from({ length: OTP_PHONE_WINDOW_MAX_SENDS }, (_, i) => ({
      phone_e164: phoneE164,
      quote_id: `q-${i}`,
      channel: 'sms',
      created_at: minutesAgo(70),
    }));
    const { client } = fakeLedger(spent);

    expect(await reserveOtpSend(client, { phoneE164, quoteId: 'q-new', now: NOW })).toEqual({
      allowed: true,
    });
  });

  it('caps one quote over its lifetime even while the phone has budget left', async () => {
    const phoneE164 = '+528115559988';
    // Aged out of the hourly window, so only the lifetime cap can deny this.
    const history = Array.from({ length: OTP_QUOTE_LIFETIME_MAX_SENDS }, (_, i) => ({
      phone_e164: phoneE164,
      quote_id: 'quote-1',
      channel: 'sms',
      created_at: minutesAgo(120 + i),
    }));
    const { client, state } = fakeLedger(history);

    const decision = await reserveOtpSend(client, { phoneE164, quoteId: 'quote-1', now: NOW });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('quote');
    expect(state.inserts).toBe(0);

    // A different quote for the same client is unaffected by that quote's cap.
    expect(await reserveOtpSend(client, { phoneE164, quoteId: 'quote-2', now: NOW })).toEqual({
      allowed: true,
    });
  });

  it('does not consume budget when it denies', async () => {
    const { client, state } = fakeLedger();
    const phoneE164 = '+528115559988';

    for (let i = 0; i < OTP_PHONE_WINDOW_MAX_SENDS + 5; i += 1) {
      await reserveOtpSend(client, { phoneE164, quoteId: `q-${i}`, now: NOW });
    }

    expect(state.rows).toHaveLength(OTP_PHONE_WINDOW_MAX_SENDS);
  });

  it('claims the slot before the code is delivered, so a failing provider cannot loop', async () => {
    const { client, state } = fakeLedger();

    await reserveOtpSend(client, {
      phoneE164: '+528115559988',
      quoteId: 'q-1',
      channel: 'sms',
      now: NOW,
    });

    // reserveOtpSend has no way to report delivery back, which is the point:
    // the row exists the moment the send is authorized.
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ phone_e164: '+528115559988', quote_id: 'q-1' });
  });

  it('settles a race for the last slot with exactly one winner', async () => {
    const phoneE164 = '+528115559988';
    const { client, state } = fakeLedger();

    // Fill to one below the cap, then have two callers race for the remainder:
    // both clear the pre-check and both insert, so only the ranking done after
    // the rows land can separate them.
    for (let i = 0; i < OTP_PHONE_WINDOW_MAX_SENDS - 1; i += 1) {
      await reserveOtpSend(client, { phoneE164, quoteId: `q-${i}`, now: NOW });
    }

    const [a, b] = await Promise.all([
      reserveOtpSend(client, { phoneE164, quoteId: 'race-a', now: NOW }),
      reserveOtpSend(client, { phoneE164, quoteId: 'race-b', now: NOW }),
    ]);

    expect([a.allowed, b.allowed].filter(Boolean)).toHaveLength(1);

    // The loser gave its slot back rather than leaving the phone over-spent.
    expect(state.rows).toHaveLength(OTP_PHONE_WINDOW_MAX_SENDS);

    const loser = a.allowed ? b : a;
    expect(loser.allowed).toBe(false);
    if (loser.allowed) return;
    expect(loser.scope).toBe('phone');
    expect(loser.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('ledger failures fail closed', () => {
  it('refuses to rank against a window its own row is missing from', async () => {
    const phoneE164 = '+528115559988';
    const { client, state } = fakeLedger();

    // Stands in for the database clock trailing this function's by more than
    // the window: the row lands with a created_at that the window query then
    // filters out. Ranking cannot be trusted, and neither can the budget.
    const now = new Date(NOW.getTime() + OTP_PHONE_WINDOW_MS + 60_000);

    await expect(
      reserveOtpSend(client, { phoneE164, quoteId: 'q-1', now })
    ).rejects.toThrow(/absent from its own window/);

    // The row is still there — failing closed here means refusing to send, not
    // quietly handing the slot back.
    expect(state.rows).toHaveLength(1);
  });


  it('throws rather than allowing when the window cannot be read', async () => {
    const { client } = fakeLedger([], 'select');

    await expect(
      checkOtpSendAllowance(client, { phoneE164: '+528115559988', quoteId: 'q-1', now: NOW })
    ).rejects.toThrow(/otp_send_log/);
  });

  it('throws rather than sending unrecorded when the insert is rejected', async () => {
    const { client } = fakeLedger([], 'insert');

    await expect(
      recordOtpSend(client, { phoneE164: '+528115559988', quoteId: 'q-1' })
    ).rejects.toThrow(/otp_send_log/);

    await expect(
      reserveOtpSend(client, { phoneE164: '+528115559988', quoteId: 'q-1', now: NOW })
    ).rejects.toThrow(/otp_send_log/);
  });
});

describe('the OTP route wires the limit in', () => {
  const routeSource = readFileSync(
    join(process.cwd(), 'app/api/quotes/public/[token]/otp/route.ts'),
    'utf8'
  );

  it('reserves a slot before minting or delivering a code', () => {
    expect(routeSource).toContain('reserveOtpSend');

    const reserveAt = routeSource.indexOf('reserveOtpSend(');
    const mintAt = routeSource.indexOf('generateOTP()');
    const deliverAt = routeSource.indexOf('deliverOtp(');

    expect(reserveAt).toBeGreaterThan(-1);
    expect(reserveAt).toBeLessThan(mintAt);
    expect(reserveAt).toBeLessThan(deliverAt);
  });

  it('keys the limit on the phone the database holds, not on request input', () => {
    expect(routeSource).toContain('normalizeOtpRecipient(phone)');
    expect(routeSource).toContain('phoneE164: recipient');
  });

  it('keeps the per-quote cooldown as well as the new bound', () => {
    expect(routeSource).toContain('RESEND_COOLDOWN_MS');
    expect(routeSource).toContain('client_otp_sent_at');
  });

  it('answers over-cap requests with the existing 429 shape', () => {
    expect(routeSource).toContain('retry_after_seconds: reservation.retryAfterSeconds');
    expect(routeSource).toMatch(/reservation\.allowed[\s\S]{0,600}status: 429/);
  });
});

describe('the persistence the limit depends on ships with it', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260807000000_otp_send_rate_limit.sql'),
    'utf8'
  );

  it('creates the ledger the counter lives in, so it survives a cold start', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.otp_send_log');
    expect(migration).toContain('phone_e164 text NOT NULL');
  });

  it('indexes the two queries the limit issues', () => {
    expect(migration).toContain('(phone_e164, created_at)');
    expect(migration).toContain('(quote_id)');
  });

  it('leaves the ledger unreadable and unwritable outside the service role', () => {
    expect(migration).toContain('ALTER TABLE public.otp_send_log ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/CREATE POLICY[^;]*otp_send_log/);
    expect(migration).toContain('REVOKE ALL ON public.otp_send_log FROM anon');
  });
});
