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
 * Whose "today" is it? The browser's — these helpers serve client-rendered
 * surfaces, where local time is the tenant's own clock. Server-side "today"
 * (quote expiry, the assistant's due-today intent, the quota month) is a
 * different question needing the organization's timezone; it is tracked
 * separately and deliberately not smuggled in here.
 */

export function localTodayStr(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
