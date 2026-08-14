import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MILESTONE_MONEY_COLUMNS } from '@/lib/receivablesCalculator';

/**
 * A read of `milestones` that takes `amount` and stops there is asking "what
 * was agreed", then answering "what is owed" or "what arrived" with it.
 *
 * Two selects did exactly that. `/api/dashboard/analytics` omitted
 * `transferred_amount`, so `collectedAmount` read every confirmed milestone as
 * fully collected: a $20,000 wire against a $48,720 cobro booked as $48,720 of
 * revenue and $0 pending, on the KPI cards, while Cobranza showed the same
 * cobro still owing $28,720. `lib/aiOrgContext` omitted it too, so the
 * assistant stated the overstated figure as a computed fact under an
 * `engine: 'rules'` label (#351 — the #253 defect alive outside Cobranza).
 *
 * The type system cannot close this: both routes read PostgREST through an
 * `any` cast, and an optional `transferred_amount?` made "the column is NULL"
 * and "the caller never asked for the column" the same thing at the type level
 * — the #78 shape one level up. So the obligation is checked here, against the
 * source, where the next forgotten column is one line away on every future
 * caller.
 *
 * The rule is deliberately blunt: **name `amount`, name the other three.**
 * Selects that never touch `amount` (id lookups, status flips, document
 * paths) are untouched, and `select('*')` satisfies it outright.
 */

const ROOTS = ['app', 'lib'].map((d) => join(process.cwd(), d));

/** What `amount` cannot answer alone. Derived from the source, not restated. */
const REQUIRED = MILESTONE_MONEY_COLUMNS.filter((c) => c !== 'amount');

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
 * Removes comments while leaving string literals intact.
 *
 * Not cosmetic: several of these selects carry an explanatory comment *inside*
 * the argument list, and a naive literal sweep splices the comment's own
 * apostrophes into the column list — which is how the first run of this scan
 * reported a select string with prose in the middle of it. Tracking quote
 * state is the difference between parsing the query and parsing the essay
 * about the query.
 */
function stripComments(source: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += source[++i] ?? '';
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Every `.select(...)` argument in a file, string-concatenation flattened,
 * paired with the nearest preceding `.from('<table>')`.
 *
 * Same blind spot `postgrestEmbedHints.test.ts` documents: a select assembled
 * in a variable, or `.from(tableVariable)`, escapes the scan. Every call site
 * today writes both as literals — the "parsed a plausible number of selects"
 * case below is what keeps that claim from rotting silently.
 */
function extractSelects(raw: string): SelectCall[] {
  const source = stripComments(raw);
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

/**
 * The column lists belonging to `milestones` inside a select — the root list
 * when the query is `.from('milestones')`, plus every embedded
 * `milestones(...)` reached from another parent.
 *
 * Returned as raw token lists so the caller decides what a violation is; the
 * walk only has to know where a milestone's own columns start and stop.
 */
export function milestoneColumnLists(table: string, select: string): string[][] {
  const lists: string[][] = [];

  function walk(name: string, body: string) {
    const columns: string[] = [];
    let depth = 0;
    let token = '';
    const flush = () => {
      const trimmed = token.trim();
      // `foo!hint` and `foo(...)` are embeds, not columns of this table.
      if (trimmed && !trimmed.includes('(')) columns.push(trimmed.split('!')[0]);
      token = '';
    };

    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === '(') {
        if (depth === 0) {
          // Descend into the embed, whose name is whatever `token` collected.
          const child = token.trim().split('!')[0];
          const close = matchingParen(body, i);
          walk(child, body.slice(i + 1, close));
          token = '';
          i = close;
          depth = 0;
          continue;
        }
        depth++;
      } else if (ch === ')') {
        depth--;
      } else if (ch === ',' && depth === 0) {
        flush();
        continue;
      }
      token += ch;
    }
    flush();

    if (name === 'milestones') lists.push(columns);
  }

  walk(table, select);
  return lists;
}

function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

/** The columns a milestone select names `amount` without. `[]` = compliant. */
export function missingMoneyColumns(table: string, select: string): string[] {
  const missing = new Set<string>();
  for (const columns of milestoneColumnLists(table, select)) {
    if (columns.includes('*')) continue;
    if (!columns.includes('amount')) continue;
    for (const required of REQUIRED) {
      if (!columns.includes(required)) missing.add(required);
    }
  }
  return [...missing];
}

describe('a milestones select that reads money reads all of it (#351)', () => {
  const scanned = ROOTS.flatMap((root) =>
    tsFiles(root).flatMap((file) =>
      extractSelects(readFileSync(file, 'utf8')).map((call) => ({ file, ...call }))
    )
  );

  it('parsed a plausible number of selects out of the tree', () => {
    // A scan that silently matched nothing is indistinguishable from a scan
    // that passed (hard rule #7). These floors are well under the real counts
    // and only trip if the parser — or the repo layout — stops working.
    expect(scanned.length).toBeGreaterThan(40);
    expect(scanned.filter((c) => c.table === 'milestones').length).toBeGreaterThan(10);
    // And it must be reading the actual column names, not empty strings.
    expect(
      scanned.some((c) => c.table === 'milestones' && c.select.includes('transferred_amount'))
    ).toBe(true);
  });

  it('no select in app/ or lib/ takes a milestone amount without the rest', () => {
    const offenders = scanned
      .map((call) => ({ ...call, missing: missingMoneyColumns(call.table, call.select) }))
      .filter((call) => call.missing.length > 0)
      .map(
        (call) =>
          `${call.file.replace(process.cwd() + '/', '')}: .from('${call.table}').select('${call.select}')\n` +
          `  names 'amount' but not ${call.missing.join(', ')}`
      );

    expect(offenders).toEqual([]);
  });

  // The absence assertion above is only worth its green if it can go red.
  // These are the two select strings that shipped the defect, verbatim.
  it('flags the exact selects that shipped #351', () => {
    expect(
      missingMoneyColumns(
        'milestones',
        'id, contract_id, client_id, label, amount, due_date, status, confirmed_at'
      )
    ).toEqual(['transferred_amount', 'cfdi_total', 'cfdi_status']);

    expect(
      missingMoneyColumns('milestones', 'id, amount, confirmed_at, contracts(client_id)')
    ).toEqual(['transferred_amount', 'cfdi_total', 'cfdi_status']);

    // Partially compliant is still a violation, and only the gap is reported.
    expect(
      missingMoneyColumns('milestones', 'id, amount, cfdi_total, cfdi_status')
    ).toEqual(['transferred_amount']);
  });

  it('leaves selects alone that never ask for an amount', () => {
    expect(missingMoneyColumns('milestones', 'id')).toEqual([]);
    expect(missingMoneyColumns('milestones', 'id, status, confirmed_at')).toEqual([]);
    expect(missingMoneyColumns('milestones', 'id, cfdi_status, cfdi_xml_path')).toEqual([]);
    expect(missingMoneyColumns('milestones', '*, contracts(*, clients(*))')).toEqual([]);
    // Another table's `amount` column is not a milestone's.
    expect(
      missingMoneyColumns('cfdi_payment_complements', 'installment, amount, status')
    ).toEqual([]);
    expect(missingMoneyColumns('quotes', 'id, client_id, status, total_amount')).toEqual([]);
  });

  it('reaches a milestones embed under another parent', () => {
    // The shape `postgrestEmbedHints` records from the quotes side: the
    // milestone columns are nested two levels down and still ours to check.
    expect(
      missingMoneyColumns(
        'quotes',
        'id, title, contracts!quote_id(id, title, milestones(id, label, amount, due_date, status)), clients(name)'
      )
    ).toEqual(['transferred_amount', 'cfdi_total', 'cfdi_status']);

    expect(
      missingMoneyColumns(
        'quotes',
        'id, contracts!quote_id(milestones(id, amount, transferred_amount, cfdi_total, cfdi_status))'
      )
    ).toEqual([]);

    // A sibling embed's columns must not be mistaken for the milestone's.
    expect(
      missingMoneyColumns(
        'milestones',
        'id, amount, transferred_amount, cfdi_total, cfdi_status, contracts(title, clients(name, rfc))'
      )
    ).toEqual([]);
  });
});
