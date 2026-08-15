import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { apiError } from '@/lib/apiError';

/**
 * The authenticated error envelope is built in one place (#322 item 2).
 *
 * `CLAUDE.md` convention #2 mandates `{ error: { code, message } }` with a
 * Spanish message, and it was honoured by **234 hand-built literals across 32
 * route files** plus two private helpers. A convention held up by 234 copies is
 * one bad copy from drifting, and the public surface already paid for that
 * lesson: `/api/receivables/public/[token]` shipped a fourth body shape with
 * `code` as a sibling of `error`, which `publicApiError()` and
 * `publicErrorEnvelope.test.ts` now prevent (#65).
 *
 * This is the same gate for the authenticated half. It scans `app/api` for the
 * literal rather than trusting the refactor to have been complete — the count
 * is derived, so the next hand-built envelope fails here.
 */

const ROOT = join(__dirname, '..', '..');
const API_DIR = join(ROOT, 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry.endsWith('.ts') ? [full] : [];
  });
}

describe('apiError builds the shape', () => {
  it('produces the mandated envelope', async () => {
    const body = await apiError(403, 'FORBIDDEN', 'Tu rol no permite esto').json();
    expect(body).toEqual({ error: { code: 'FORBIDDEN', message: 'Tu rol no permite esto' } });
  });

  it('carries the status', () => {
    expect(apiError(404, 'NOT_FOUND', 'No encontrado').status).toBe(404);
  });

  it('puts fields inside error, keyed by column (#146)', async () => {
    const body = await apiError(400, 'INVALID_INPUT', 'Revisa los datos', {
      fields: { rfc: 'El RFC no es válido.' },
    }).json();
    expect(body.error.fields).toEqual({ rfc: 'El RFC no es válido.' });
  });

  it('puts details inside error and extra beside it', async () => {
    const body = await apiError(402, 'TRIAL_EXPIRED', 'Tu prueba terminó', {
      details: { trial_ended_at: '2026-08-01' },
      extra: { milestone: { id: 'm-1' } },
    }).json();

    // `details` qualifies the error; `extra` accompanies it. The distinction is
    // load-bearing — consumers read them from different places.
    expect(body.error.trial_ended_at).toBe('2026-08-01');
    expect(body.milestone).toEqual({ id: 'm-1' });
    expect(body.error.milestone).toBeUndefined();
  });

  it('omits both when not asked for, rather than serving empty objects', async () => {
    const body = await apiError(500, 'SERVER_ERROR', 'Algo salió mal').json();
    expect(Object.keys(body)).toEqual(['error']);
    expect(Object.keys(body.error)).toEqual(['code', 'message']);
  });
});

describe('no route hand-builds the envelope (#322)', () => {
  it('scans a plausible number of route files', () => {
    const files = routeFiles(API_DIR);
    // A walk that found almost nothing would make the scan below vacuous. The
    // floor sits under the real count (38 at the time of writing) rather than
    // pinning it, so adding a route does not fail this for the wrong reason.
    expect(files.length).toBeGreaterThanOrEqual(30);
  });

  it('finds no inline `NextResponse.json({ error: { … } })`', () => {
    // Assertion of absence, shown to fail before committing: restoring one
    // literal in app/api/clients/route.ts turned this red.
    const offenders: string[] = [];
    const inline = /NextResponse\.json\(\s*\{\s*error:\s*\{/s;

    for (const file of routeFiles(API_DIR)) {
      const source = readFileSync(file, 'utf8');
      if (inline.test(source)) offenders.push(relative(ROOT, file).split('\\').join('/'));
    }

    expect(
      offenders,
      `These routes build the error envelope by hand instead of calling apiError():\n` +
        `${offenders.join('\n')}\n\n` +
        'The shape is a convention (CLAUDE.md #2); 234 copies of it is how a convention drifts. ' +
        'Use apiError(status, code, message, { fields, details, extra }) from lib/apiError.ts.'
    ).toEqual([]);
  });

  it('keeps every message Spanish-shaped, not a bare code echo', () => {
    // Cheap smell test for the one regression a mechanical refactor invites:
    // a call site left with its code duplicated into the message slot.
    const offenders: string[] = [];
    for (const file of routeFiles(API_DIR)) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/apiError\([^,]+,\s*'([A-Z_]+)'\s*,\s*'([A-Z_]+)'\s*[,)]/g)) {
        if (m[1] === m[2]) offenders.push(`${relative(ROOT, file)}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
