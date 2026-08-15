import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  QUOTE_CONTENT_FIELDS,
  touchesQuoteContent,
  quoteContentEditVerdict,
} from '@/lib/quoteEditability';
import { QUOTE_WRITABLE_FIELDS } from '@/lib/apiAuth';
import { quoteSignableState, QUOTE_REFUSAL } from '@/lib/quoteSignability';

/**
 * A quote's content is editable in `draft` and `sent`, and nowhere else (#340).
 *
 * Until this landed the only mutation any screen issued was
 * `updateQuoteStatus`, which sends `{ status }` alone — so raising a total was
 * reachable from the API and from nothing a tenant could tap. The founder
 * decided a quote should be editable after creation; these are the boundaries
 * that decision needs, and the one that matters most is the pair that must
 * **never** be editable: `accepted` and `converted` carry the client's OTP
 * signature, which #327/#335 made immutable on purpose.
 */

const updateCalls: Array<Record<string, unknown>> = [];
let currentStatus: string | null = 'draft';
let quoteMissing = false;
let statusReadError: { message: string } | null = null;

function quotesTable() {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (statusReadError) return { data: null, error: statusReadError };
            if (quoteMissing) return { data: null, error: null };
            return { data: { status: currentStatus }, error: null };
          },
        }),
      }),
    }),
    update: (values: Record<string, unknown>) => {
      updateCalls.push(values);
      return {
        eq: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: { id: 'quote-1', ...values }, error: null }),
            }),
          }),
        }),
      };
    },
  };
}

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'owner',
        supabase: { from: () => quotesTable() },
      },
    })),
  };
});

const { PUT } = await import('@/app/api/quotes/[id]/route');

async function putQuote(body: Record<string, unknown>) {
  const res = await PUT(
    new Request('http://localhost/api/quotes/quote-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'quote-1' }) }
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  updateCalls.length = 0;
  currentStatus = 'draft';
  quoteMissing = false;
  statusReadError = null;
});

describe('the content-field set is derived, not hand-listed', () => {
  it('is every writable quote field except status', () => {
    // A field added to the quote and forgotten here would be editable on a
    // signed quote — the one thing this feature must never allow. Deriving the
    // expectation from `QUOTE_WRITABLE_FIELDS` means the next field to arrive
    // fails this test instead of silently escaping the gate.
    const expected = QUOTE_WRITABLE_FIELDS.filter((f) => f !== 'status');
    expect([...QUOTE_CONTENT_FIELDS].sort()).toEqual([...expected].sort());
  });

  it('sees a content edit and ignores a status-only one', () => {
    expect(touchesQuoteContent({ total_amount: 5000 })).toBe(true);
    expect(touchesQuoteContent({ line_items: [] })).toBe(true);
    expect(touchesQuoteContent({ status: 'sent' })).toBe(false);
    expect(touchesQuoteContent({})).toBe(false);
  });
});

describe('quoteContentEditVerdict', () => {
  it('allows a draft with no further consequence', () => {
    expect(quoteContentEditVerdict('draft')).toEqual({ ok: true, resetToDraft: false });
  });

  it('allows a sent quote and requires the link to retire with it', () => {
    expect(quoteContentEditVerdict('sent')).toEqual({ ok: true, resetToDraft: true });
  });

  it('refuses a signed quote, and says the signature is why', () => {
    for (const status of ['accepted', 'converted']) {
      const verdict = quoteContentEditVerdict(status);
      expect(verdict.ok, `${status} must never be editable`).toBe(false);
      if (verdict.ok) continue;
      expect(verdict.code).toBe('QUOTE_SIGNED_IMMUTABLE');
      expect(verdict.message).toMatch(/firmada/i);
      // Mexican Spanish that says what to do next, not a code (#146, rule 8).
      expect(verdict.message).toMatch(/crea una cotización nueva/i);
      expect(verdict.message).not.toMatch(/QUOTE_|status|immutable/);
    }
  });

  it('refuses rejected and expired, naming which', () => {
    expect(quoteContentEditVerdict('rejected')).toMatchObject({ ok: false, status: 409 });
    expect(quoteContentEditVerdict('expired')).toMatchObject({ ok: false, status: 409 });
  });

  it('refuses a status it has never heard of rather than guessing', () => {
    // #95: mapping an unrecognised value to the nearest listed one is how a
    // `free` plan displayed as a $299 tier. Here the guess would be about
    // whether a client has signed.
    for (const status of ['negotiating', 'archived', 'SENT']) {
      expect(quoteContentEditVerdict(status).ok, status).toBe(false);
    }
  });

  it('treats an absent status as draft — the column default', () => {
    // `quotes.status` defaults to 'draft', and a row written before the column
    // carried a value means the same thing. This is not the "guess" the case
    // above refuses: absent is a known state, an unrecognised string is not.
    for (const absent of [null, undefined, '']) {
      expect(quoteContentEditVerdict(absent), String(absent)).toEqual({
        ok: true,
        resetToDraft: false,
      });
    }
  });
});

describe('PUT /api/quotes/[id] — the content gate in the route', () => {
  it('edits a draft and leaves its status alone', async () => {
    const { status } = await putQuote({ total_amount: 5000, line_items: [] });

    expect(status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ total_amount: 5000 });
    expect(updateCalls[0]).not.toHaveProperty('status');
  });

  it('sends an edited `sent` quote back to draft, retiring the live link', async () => {
    currentStatus = 'sent';
    const { status } = await putQuote({ total_amount: 9000 });

    expect(status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ total_amount: 9000, status: 'draft' });
  });

  it('the retirement is what the public link actually reads', () => {
    // The reset is only worth anything if `/q/[token]` refuses afterwards.
    // Asserting the two together is the point: this is the seam #282 found,
    // where the routes read status and the page ignored it.
    const state = quoteSignableState({ status: 'draft', valid_until: '2099-01-01' });
    expect(state).toBe('not_yet_sent');
    expect(QUOTE_REFUSAL.not_yet_sent.message).toMatch(/todavía no está lista para firma/i);
  });

  it('cannot be talked out of the reset by also claiming `sent`', async () => {
    currentStatus = 'sent';
    const { status } = await putQuote({ total_amount: 9000, status: 'sent' });

    // A caller that edits content *and* asserts 'sent' in the same request
    // would otherwise keep the stale link alive over the changed figures.
    expect(status).toBe(200);
    expect(updateCalls[0].status).toBe('draft');
  });

  it('refuses a content edit on a signed quote and writes nothing', async () => {
    for (const signed of ['accepted', 'converted']) {
      updateCalls.length = 0;
      currentStatus = signed;
      const { status, body } = await putQuote({ total_amount: 1 });

      expect(status).toBe(409);
      expect(body.error.code).toBe('QUOTE_SIGNED_IMMUTABLE');
      expect(updateCalls).toHaveLength(0);
    }
  });

  it('still allows a status-only edit on any status — the pipeline is untouched', async () => {
    // `updateQuoteStatus` is how a quote is marked sent, accepted or rejected.
    // Gating it here would break the loop this feature is not about, and it
    // must not even pay for the status read.
    for (const from of ['draft', 'sent', 'accepted', 'converted']) {
      updateCalls.length = 0;
      currentStatus = from;
      const { status } = await putQuote({ status: 'rejected' });

      expect(status, `status-only edit from ${from}`).toBe(200);
      expect(updateCalls[0]).toMatchObject({ status: 'rejected' });
    }
  });

  it('404s a content edit on a quote this organization does not have', async () => {
    quoteMissing = true;
    const { status, body } = await putQuote({ total_amount: 5000 });

    // Same answer as a nonexistent id: another tenant's quote must not be
    // distinguishable from one that is not there (convention 3).
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(updateCalls).toHaveLength(0);
  });

  it('reports a failed status read instead of editing anyway', async () => {
    statusReadError = { message: 'connection terminated' };
    const { status } = await putQuote({ total_amount: 5000 });

    // Falling through to the write on a failed read would edit a quote whose
    // status is unknown — which for this gate means possibly signed.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(updateCalls).toHaveLength(0);
  });
});

describe('the editor is reachable from the product, not only from the API', () => {
  it('the card offers an edit action and the page wires it to the update', () => {
    // #340's finding was not that editing was refused — it was that no screen
    // issued anything but `{ status }`, so the whole feature existed only in
    // the API. A server gate with no surface would leave that true.
    const card = readFileSync(
      join(process.cwd(), 'components', 'quotes', 'QuoteCard.tsx'),
      'utf8'
    );
    expect(card).toMatch(/onEdit/);

    const hook = readFileSync(join(process.cwd(), 'lib', 'hooks', 'useQuotes.ts'), 'utf8');
    expect(hook).toMatch(/updateQuote\b/);
  });
});
