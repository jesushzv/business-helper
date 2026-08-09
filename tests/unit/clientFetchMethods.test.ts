import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * #95's quietest half, turned into a build failure.
 *
 * `useOrganizationSettings` PUT to `/api/organization`, which exports only
 * GET / PATCH / POST. Every save it ever made was a 405, swallowed by
 * `.catch(() => {})` and reported as success. No test that mocks `fetch` can
 * see this — the mock answers whatever the test says, and the route file is
 * never involved. CLAUDE.md's remedy was "grep the route file for the export
 * of that HTTP method before writing the fetch"; this runs that grep for every
 * call site on every build instead of trusting it to be remembered.
 *
 * A mismatch here is not a style problem. It is a request the deployed app
 * cannot serve, on a path a human has to exercise to notice.
 */

const ROOTS = ['app', 'components', 'lib'] as const;
const APP_API = path.join(process.cwd(), 'app', 'api');

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir.startsWith(APP_API)) return; // route handlers themselves
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const root of ROOTS) walk(path.join(process.cwd(), root));
  return out;
}

/** The full `fetch( … )` argument text, found by matching parentheses. */
function fetchCalls(source: string): string[] {
  const calls: string[] = [];
  const opener = /\bfetch\(/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(source))) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    if (depth === 0) calls.push(source.slice(start, i - 1));
  }

  return calls;
}

interface CallSite {
  route: string;
  method: string;
  file: string;
}

function callSites(): CallSite[] {
  const sites: CallSite[] = [];

  for (const file of sourceFiles()) {
    for (const call of fetchCalls(fs.readFileSync(file, 'utf8'))) {
      // Only same-origin API paths; absolute URLs belong to third parties.
      const url = /^\s*[`'"](\/api\/[^`'"?]*)/.exec(call);
      if (!url) continue;
      const method = /\bmethod:\s*['"](\w+)['"]/.exec(call);
      sites.push({
        route: url[1],
        // A fetch with no explicit method is a GET.
        method: (method?.[1] ?? 'GET').toUpperCase(),
        file: path.relative(process.cwd(), file),
      });
    }
  }

  return sites;
}

/**
 * Resolves `/api/quotes/${id}/convert` to `app/api/quotes/[id]/convert/route.ts`
 * by walking the tree and taking the `[param]` directory wherever the URL has
 * an interpolation.
 */
function resolveRouteFile(route: string): string | null {
  let dir = path.join(process.cwd(), 'app');

  for (const segment of route.split('/').filter(Boolean)) {
    const interpolated = segment.includes('${');
    let next: string;

    if (interpolated) {
      const dynamic = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('['))
        .map((e) => e.name);
      if (dynamic.length !== 1) return null;
      next = path.join(dir, dynamic[0]);
    } else {
      next = path.join(dir, segment);
    }

    if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) return null;
    dir = next;
  }

  const file = path.join(dir, 'route.ts');
  return fs.existsSync(file) ? file : null;
}

function exportedMethods(routeFile: string): string[] {
  const source = fs.readFileSync(routeFile, 'utf8');
  return [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Z]+)\b/g)].map((m) => m[1]);
}

describe('client fetch methods exist on the routes they call', () => {
  const sites = callSites();

  /**
   * Without this the whole suite is an assertion of absence that matches
   * nothing — the exact failure CLAUDE.md rule 7 warns about. If a refactor
   * moves the call sites, this drops first and says so.
   */
  it('finds the client call sites at all', () => {
    expect(sites.length).toBeGreaterThan(20);
    expect(sites.some((s) => s.route === '/api/organization' && s.method === 'PATCH')).toBe(true);
  });

  it('resolves every /api path to a route handler', () => {
    const unresolved = sites
      .filter((s) => resolveRouteFile(s.route) === null)
      .map((s) => `${s.file} → ${s.method} ${s.route}`);
    expect(unresolved).toEqual([]);
  });

  it('never calls a method the route does not export', () => {
    const mismatches: string[] = [];

    for (const site of sites) {
      const routeFile = resolveRouteFile(site.route);
      if (!routeFile) continue; // reported by the test above
      const methods = exportedMethods(routeFile);
      if (!methods.includes(site.method)) {
        mismatches.push(
          `${site.file}: ${site.method} ${site.route} — ` +
            `${path.relative(process.cwd(), routeFile)} exports ${methods.join(', ') || 'nothing'}`
        );
      }
    }

    expect(mismatches).toEqual([]);
  });
});
