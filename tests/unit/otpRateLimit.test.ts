import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  OTP_PHONE_WINDOW_MS,
  OTP_PHONE_WINDOW_MAX_SENDS,
  OTP_PHONE_DAY_MAX_SENDS,
  OTP_QUOTE_LIFETIME_MAX_SENDS,
  OTP_RESEND_BACKOFF_BASE_MS,
  OTP_RESEND_BACKOFF_MAX_MS,
  checkOtpSendAllowance,
  checkResendBackoff,
  evaluatePhoneWindow,
  evaluateQuoteLifetime,
  evaluateResendBackoff,
  markOtpSendDeliveryFailed,
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
  delivery_failed?: boolean;
}

type LedgerSeed = Omit<LedgerRow, 'id'> & { id?: string };

/**
 * In-memory stand-in for the `otp_send_log` table, honouring the subset of the
 * Supabase builder the module uses. `failOn` simulates the table being
 * unreachable, which the route must fail closed on.
 */
function fakeLedger(seed: LedgerSeed[] = [], failOn?: 'select' | 'insert') {
  let sequence = 0;
  const rows: LedgerRow[] = seed.map((row) => ({
    delivery_failed: false,
    ...row,
    id: row.id ?? `seed-${sequence++}`,
  }));
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
            eq(column: string, value: string | boolean) {
              filters.push((row) => {
                const held = (row as unknown as Record<string, unknown>)[column];
                // Boolean columns default in SQL, not in the fake: an absent
                // delivery_failed reads as false, as the real table would.
                if (typeof value === 'boolean') return Boolean(held) === value;
                return read(row, column) === value;
              });
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
            delivery_failed: false,
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

        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              const target = state.rows.find(
                (row) => String((row as unknown as Record<string, unknown>)[column]) === value
              );
              if (target) Object.assign(target, values);
              return Promise.resolve({ error: null });
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

    expect(other).toMatchObject({ allowed: true });
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

    expect(
      await reserveOtpSend(client, { phoneE164, quoteId: 'q-new', now: NOW })
    ).toMatchObject({ allowed: true });
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
    expect(
      await reserveOtpSend(client, { phoneE164, quoteId: 'quote-2', now: NOW })
    ).toMatchObject({ allowed: true });
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


describe('evaluateResendBackoff — the gap widens with each send (#22)', () => {
  function secondsAgo(seconds: number): string {
    return new Date(NOW.getTime() - seconds * 1000).toISOString();
  }

  it('never delays the first send of the hour', () => {
    expect(evaluateResendBackoff([], NOW)).toEqual({ allowed: true });
    expect(evaluateResendBackoff([minutesAgo(61)], NOW)).toEqual({ allowed: true });
  });

  it('requires 30s after the first send and doubles from there', () => {
    // One send, 10s ago: 20s left of the 30s base gap.
    const first = evaluateResendBackoff([secondsAgo(10)], NOW);
    expect(first.allowed).toBe(false);
    if (first.allowed) return;
    expect(first.scope).toBe('backoff');
    expect(first.retryAfterSeconds).toBe(20);

    // Two sends, latest 40s ago: the second resend needs 60s, so 20s remain.
    const second = evaluateResendBackoff([secondsAgo(300), secondsAgo(40)], NOW);
    expect(second.allowed).toBe(false);
    if (second.allowed) return;
    expect(second.retryAfterSeconds).toBe(20);

    // Same history but the gap fully served: allowed.
    expect(evaluateResendBackoff([secondsAgo(300), secondsAgo(61)], NOW)).toEqual({
      allowed: true,
    });
  });

  it('caps the gap so a signer is never told to wait longer than the ceiling', () => {
    const many = Array.from({ length: 12 }, (_, i) => secondsAgo(120 + i));
    const decision = evaluateResendBackoff(many, NOW);
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(
      Math.ceil(OTP_RESEND_BACKOFF_MAX_MS / 1000)
    );
  });

  it('reads the ledger through checkResendBackoff', async () => {
    const phoneE164 = '+528115559988';
    const { client } = fakeLedger([
      { phone_e164: phoneE164, quote_id: 'q-1', channel: 'sms', created_at: NOW.toISOString() },
    ]);

    const decision = await checkResendBackoff(client, { phoneE164, now: NOW });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('backoff');
    expect(decision.retryAfterSeconds).toBe(Math.ceil(OTP_RESEND_BACKOFF_BASE_MS / 1000));
  });
});

describe('daily cap — the hourly window alone permits a slow drip (#22)', () => {
  const phoneE164 = '+528115559988';

  /** Sends spread so no hour holds more than 2 — invisible to the hourly cap. */
  function drip(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      phone_e164: phoneE164,
      quote_id: `q-${i}`,
      channel: 'sms',
      created_at: minutesAgo(40 * (i + 1)),
    }));
  }

  it('denies the send after the daily cap with a retry that waits for the day window', async () => {
    const { client } = fakeLedger(drip(OTP_PHONE_DAY_MAX_SENDS));

    const decision = await checkOtpSendAllowance(client, { phoneE164, quoteId: 'q-new', now: NOW });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('phone_day');
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows below the daily cap even when the drip is steady', async () => {
    const { client } = fakeLedger(drip(OTP_PHONE_DAY_MAX_SENDS - 1));

    expect(
      await checkOtpSendAllowance(client, { phoneE164, quoteId: 'q-new', now: NOW })
    ).toEqual({ allowed: true });
  });

  it('reserveOtpSend releases a slot that loses the race against the daily cap', async () => {
    const { client, state } = fakeLedger(drip(OTP_PHONE_DAY_MAX_SENDS));

    const decision = await reserveOtpSend(client, { phoneE164, quoteId: 'q-new', now: NOW });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('phone_day');
    expect(state.rows).toHaveLength(OTP_PHONE_DAY_MAX_SENDS);
  });
});

describe('a failed delivery releases the lifetime slot but keeps throttling the phone (#60)', () => {
  const phoneE164 = '+528115559988';

  it('marks the row instead of deleting it', async () => {
    const { client, state } = fakeLedger();

    const decision = await reserveOtpSend(client, { phoneE164, quoteId: 'q-1', now: NOW });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.sendId).toBeTruthy();

    await markOtpSendDeliveryFailed(client, decision.sendId!);

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].delivery_failed).toBe(true);
  });

  it('ten failed deliveries no longer make the quote permanently unsignable', async () => {
    // The lifetime cap's worth of failures, aged out of the hourly window so
    // only the lifetime cap could deny.
    const failures = Array.from({ length: OTP_QUOTE_LIFETIME_MAX_SENDS }, (_, i) => ({
      phone_e164: phoneE164,
      quote_id: 'quote-1',
      channel: 'sms',
      created_at: minutesAgo(120 + i),
      delivery_failed: true,
    }));
    const { client } = fakeLedger(failures);

    expect(
      await checkOtpSendAllowance(client, { phoneE164, quoteId: 'quote-1', now: NOW })
    ).toEqual({ allowed: true });
  });

  it('failed sends still count against the hourly window — a broken provider stays throttled', async () => {
    const failures = Array.from({ length: OTP_PHONE_WINDOW_MAX_SENDS }, (_, i) => ({
      phone_e164: phoneE164,
      quote_id: `q-${i}`,
      channel: 'sms',
      created_at: minutesAgo(5 + i),
      delivery_failed: true,
    }));
    const { client } = fakeLedger(failures);

    const decision = await checkOtpSendAllowance(client, { phoneE164, quoteId: 'q-new', now: NOW });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('phone');
  });

  it('delivered sends still spend the lifetime budget as before', async () => {
    const delivered = Array.from({ length: OTP_QUOTE_LIFETIME_MAX_SENDS }, (_, i) => ({
      phone_e164: phoneE164,
      quote_id: 'quote-1',
      channel: 'sms',
      created_at: minutesAgo(120 + i),
    }));
    const { client } = fakeLedger(delivered);

    const decision = await checkOtpSendAllowance(client, { phoneE164, quoteId: 'quote-1', now: NOW });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.scope).toBe('quote');
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

  it('paces resends through the ledger backoff, not a flat per-quote cooldown (#22)', () => {
    // The old constant is gone; pacing is per-phone and escalates.
    expect(routeSource).not.toContain('RESEND_COOLDOWN_MS');
    expect(routeSource).toContain('checkResendBackoff');

    const backoffAt = routeSource.indexOf('checkResendBackoff(');
    const reserveAt = routeSource.indexOf('reserveOtpSend(');
    expect(backoffAt).toBeGreaterThan(-1);
    expect(backoffAt).toBeLessThan(reserveAt);
  });

  it('flags a failed delivery so the quote lifetime slot is released (#60)', () => {
    expect(routeSource).toMatch(
      /!delivery\.delivered[\s\S]{0,600}markOtpSendDeliveryFailed\([\s\S]{0,200}reservation\.sendId/
    );
  });

  it('answers over-cap requests with 429 and keeps retry_after_seconds as a body sibling', () => {
    expect(routeSource).toContain('retry_after_seconds: reservation.retryAfterSeconds');
    // The envelope moved to publicApiError(429, 'OTP_RATE_LIMITED', …) in #65;
    // the status is its first argument now, not a NextResponse init literal.
    expect(routeSource).toMatch(/reservation\.allowed[\s\S]{0,600}publicApiError\(\s*429,\s*'OTP_RATE_LIMITED'/);
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
