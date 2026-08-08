import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `quotes` and `contracts` are joined by two foreign keys — `contracts.quote_id`
 * and `quotes.converted_contract_id` — so PostgREST refuses any unhinted embed
 * between them with PGRST201, and the route's error branch turns that into a 404.
 * That is not hypothetical: both selects in the public payment route shipped
 * unhinted, and the live check for #79 (2026-08-08) confirmed every /pay/ link
 * had answered "Cobro no encontrado" since the route existed.
 *
 * The ambiguity is a property of the schema, not of one query, so this scans
 * every `.select()` string in app/ and lib/ rather than pinning the two fixed
 * call sites. Embeds between any OTHER pair (e.g. contracts under milestones,
 * quotes under clients) have exactly one FK and stay legal unhinted — verified
 * against live PostgREST in the #79 pass.
 */

const ROOTS = ['app', 'lib'].map((d) => join(process.cwd(), d));

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  });
}

interface SelectCall {
  table: string;
  select: string;
}

/**
 * Pulls every `.select(...)` argument out of a source file as one flattened
 * string (string concatenation in the argument is joined), paired with the
 * nearest preceding `.from('<table>')` in the file.
 *
 * Known blind spot: a select string assembled in a variable, or a
 * `.from(tableVariable)`, escapes this scan. Every call site today writes both
 * as literals; if one ever doesn't, extend the parser rather than trusting the
 * green run.
 */
function extractSelects(source: string): SelectCall[] {
  const froms: { idx: number; table: string }[] = [];
  const fromRe = /\.from\(\s*['"`](\w+)['"`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(source))) froms.push({ idx: m.index, table: m[1] });

  const calls: SelectCall[] = [];
  const selRe = /\.select\(/g;
  while ((m = selRe.exec(source))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    const arg = source.slice(start, i - 1);
    const literals = [...arg.matchAll(/['"`]([^'"`]*)['"`]/g)].map((x) => x[1]).join('');
    const from = [...froms].reverse().find((f) => f.idx < (m as RegExpExecArray).index);
    if (from && literals) calls.push({ table: from.table, select: literals });
  }
  return calls;
}

/** The pair with two FKs between them. Order-independent. */
function isAmbiguousPair(parent: string, child: string): boolean {
  return (
    (parent === 'quotes' && child === 'contracts') ||
    (parent === 'contracts' && child === 'quotes')
  );
}

/**
 * Walks a select string's embed tree and reports every quotes↔contracts embed
 * that carries no `!` hint.
 */
function unhintedAmbiguousEmbeds(table: string, select: string): string[] {
  const offenders: string[] = [];
  const stack = [table];
  const tokenRe = /([A-Za-z_]\w*)(!\w+)?\s*\(|\)/g;
  let t: RegExpExecArray | null;
  while ((t = tokenRe.exec(select))) {
    if (t[0] === ')') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const [, name, hint] = t;
    const parent = stack[stack.length - 1];
    if (isAmbiguousPair(parent, name) && !hint) {
      offenders.push(`${parent} → ${name}( … ) without a !hint`);
    }
    stack.push(name);
  }
  return offenders;
}

describe('PostgREST embeds between quotes and contracts carry an FK hint (#79)', () => {
  it('no .select() in app/ or lib/ embeds across the two-FK pair unhinted', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of tsFiles(root)) {
        const source = readFileSync(file, 'utf8');
        for (const { table, select } of extractSelects(source)) {
          for (const offence of unhintedAmbiguousEmbeds(table, select)) {
            offenders.push(
              `${file.replace(process.cwd() + '/', '')}: ${offence}\n  in .from('${table}').select('${select}')`
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // The parser itself must be shown to catch the defect it exists for —
  // an absence assertion that matches nothing passes just as green (CLAUDE.md
  // hard rule 7). These pin the historical offender shapes verbatim.
  it('flags the exact select strings that shipped the #79 defect', () => {
    expect(
      unhintedAmbiguousEmbeds(
        'quotes',
        'id, title, contracts(id, title, milestones(id, label, amount, due_date, status)), clients(name), organizations(name, bank_name, bank_clabe, bank_account_holder)'
      )
    ).toHaveLength(1);
    expect(unhintedAmbiguousEmbeds('quotes', 'id, contracts(id, milestones(id))')).toHaveLength(1);
  });

  it('accepts the hinted form and single-FK embeds from other parents', () => {
    expect(
      unhintedAmbiguousEmbeds('quotes', 'id, contracts!quote_id(id, milestones(id))')
    ).toEqual([]);
    // clients has exactly one FK to each — verified unambiguous live (#79).
    expect(unhintedAmbiguousEmbeds('clients', '*, quotes(*), contracts(*, milestones(*))')).toEqual(
      []
    );
    // quotes nested under contracts still needs the hint; hinted passes.
    expect(
      unhintedAmbiguousEmbeds('milestones', '*, contracts(*, clients(*), quotes!quote_id(public_token))')
    ).toEqual([]);
    expect(
      unhintedAmbiguousEmbeds('milestones', '*, contracts(*, quotes(public_token))')
    ).toHaveLength(1);
  });
});
