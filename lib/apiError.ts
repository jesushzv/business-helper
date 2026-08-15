import { NextResponse } from 'next/server';

/**
 * The authenticated API's error envelope, in one place (#322 item 2).
 *
 * `CLAUDE.md` convention #2 already mandates the shape — `{ error: { code,
 * message } }` with a Spanish `message` — and it was honoured by 234 hand-built
 * literals across 32 route files, plus two private helpers (`fail()` in
 * `lib/apiAuth.ts`, `error()` in the admin trial route). A convention held up by
 * 234 copies is one bad copy away from drifting, and the public surface already
 * learned that lesson the expensive way: `/api/receivables/public/[token]` once
 * shipped a fourth body shape with `code` as a *sibling* of `error`, which
 * `publicApiError()` and `tests/unit/publicErrorEnvelope.test.ts` exist to stop
 * (#65).
 *
 * This is that function for the authenticated half. `tests/unit/apiErrorEnvelope.test.ts`
 * fails the build on a route that hand-builds the envelope again.
 *
 * Two extension points, because the call sites genuinely need them and an
 * envelope helper that forces callers back to a literal has failed:
 *
 * - **`fields`** rides *inside* `error`, keyed by database column. That is
 *   #146's contract: a form that returns at the first failure and names no
 *   field is a form the tenant cannot get past, so validation reports every
 *   problem at once and the UI pins each message under its own input.
 * - **`extra`** rides *beside* `error`, for the machine state a consumer
 *   branches on — `uuid`, `motives`, `limit`/`used`, `milestone`. Same argument
 *   and same name as `publicApiError()`'s, so the two surfaces read alike.
 */

export interface ApiErrorOptions {
  /** Per-column validation messages, keyed by database column name (#146). */
  fields?: Record<string, string>;
  /**
   * Further keys *inside* `error`, for state that qualifies the error itself
   * rather than accompanying it — `trial_ended_at` on a trial refusal, `field`
   * on a single-field rejection. Kept distinct from `extra` because the two
   * land in different places and consumers read them differently.
   */
  details?: Record<string, unknown>;
  /** Machine-readable state served alongside the error, never inside it. */
  extra?: Record<string, unknown>;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  options: ApiErrorOptions = {}
): NextResponse {
  const error: Record<string, unknown> = { code, message, ...(options.details ?? {}) };
  if (options.fields) error.fields = options.fields;

  return NextResponse.json({ error, ...(options.extra ?? {}) }, { status });
}
