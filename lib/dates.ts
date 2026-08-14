/**
 * Date-only arithmetic for the money surfaces (#263).
 *
 * `due_date` is a date-only string (`2026-08-14`), and two habits kept
 * shifting it a day in Mexico (UTC-6):
 *
 * 1. Deriving "today" as `new Date().toISOString().split('T')[0]` — UTC's
 *    today, which from 18:00 local is tomorrow. A milestone due today read
 *    **Atrasado** all evening, the KPI moved its amount into "Atrasado", and
 *    the WhatsApp reminder told the client they were late on the due date.
 * 2. Round-tripping the string through `new Date('2026-08-14')`, which parses
 *    as UTC **midnight** and lands on the previous local day the moment any
 *    local-midnight value is compared against it.
 *
 * The rules these helpers encode: build "today" from LOCAL date parts, and
 * never compare date-only values through a `Date` at all — compare the
 * strings (ISO date strings order lexicographically) or difference them via
 * `daysBetween`, which parses parts symmetrically.
 *
 * Whose "today" is it? Two answers, and the split is deliberate:
 *
 *   - `localTodayStr` — the **browser's** day, for client-rendered surfaces
 *     where local time is the tenant's own clock (#263, #332).
 *   - `productTodayStr` — the **product's** day, `America/Mexico_City`, for
 *     server-side enforcement: quote expiry, the assistant's due-today intent,
 *     the Inicial quota month. A server has no tenant clock — `new Date()`
 *     there is UTC, which from 18:00 in Mexico is already tomorrow — and the
 *     client cannot be asked, because a caller who picks their own "today"
 *     picks their own deadline (#331, #334).
 */

export function localTodayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The product's civil timezone, decided in #331: one constant, no schema.
 *
 * Central Mexico is where the tenants are. Tijuana (UTC-8) and Cancún (UTC-5)
 * are off by an hour or two at the day boundary — accepted there, and the thing
 * to revisit if a pilot outside the central zone ever appears, at which point
 * the answer is a per-organization column, not a second constant.
 */
export const PRODUCT_TIME_ZONE = 'America/Mexico_City';

/**
 * The wall-clock parts the product zone reads for an instant.
 *
 * `Intl` with a `timeZone` is the only correct route. A fixed `-06:00` offset
 * happens to be right today — Mexico's central zone dropped DST in 2022 — but
 * hardcoding it re-breaks the moment that changes, and this code would then be
 * wrong twice a year with nothing pointing at it.
 */
const PRODUCT_ZONE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRODUCT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function partsInProductZone(instant: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of PRODUCT_ZONE_PARTS.formatToParts(instant)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  // `hour12: false` still renders midnight as 24 in some ICU builds.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Today as the product's civil day (`YYYY-MM-DD`), regardless of the server's zone. */
export function productTodayStr(now: Date = new Date()): string {
  const p = partsInProductZone(now);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The current month as the product sees it (`YYYY-MM`) — the quota's calendar. */
export function productMonthStr(now: Date = new Date()): string {
  return productTodayStr(now).substring(0, 7);
}

/** How far the product zone runs ahead of UTC at a given instant, in ms (negative west of UTC). */
function productZoneOffsetMs(instant: Date): number {
  const p = partsInProductZone(instant);
  const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUTC - instant.getTime();
}

/**
 * The instant at which a product-zone day begins — midnight there, as UTC.
 *
 * Used where a date-only boundary has to be compared against a `timestamptz`
 * column: the quota counts `quotes.created_at >= ` the first instant of the
 * month *in Mexico City*, not the first instant of the UTC month, which is six
 * hours early and rolls the counter over while the tenant is still working.
 *
 * Two passes because the offset is itself a function of the instant: the first
 * uses the offset at UTC midnight of that day, the second re-reads it at the
 * result, which is what makes this survive a DST transition landing on the
 * boundary if the central zone ever reinstates one.
 */
export function productDayStartInstant(dayStr: string): Date {
  const [y, m, d] = dayStr.substring(0, 10).split('-').map(Number);
  const wallClockAsUTC = Date.UTC(y || 1970, (m || 1) - 1, d || 1);

  const firstPass = wallClockAsUTC - productZoneOffsetMs(new Date(wallClockAsUTC));
  const secondPassOffset = productZoneOffsetMs(new Date(firstPass));

  return new Date(wallClockAsUTC - secondPassOffset);
}

/** A date-only string as a UTC-midnight epoch — used symmetrically on both sides, so no zone can skew a difference. */
function dateOnlyEpoch(dateStr: string): number {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number);
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1);
}

/** Whole days from `fromStr` to `toStr` (both date-only strings). Positive when `toStr` is later. */
export function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((dateOnlyEpoch(toStr) - dateOnlyEpoch(fromStr)) / 86_400_000);
}

/**
 * A date-only string as the reader sees dates ("14 ago 2026"), built from its
 * parts — `new Date('2026-08-14').toLocaleDateString()` would render the
 * previous day anywhere west of UTC. Falls back to the raw string for
 * anything unparseable rather than inventing a date.
 */
export function formatDateOnlyEs(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
