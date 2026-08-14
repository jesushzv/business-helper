import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useQuotes } from '@/lib/hooks/useQuotes';
import { quoteSignableState } from '@/lib/quoteSignability';

/**
 * A quote is "sent" when it is shared, not when it is written (#61).
 *
 * `createQuote` hardcoded `status: 'sent'` on the payload. But the wizard's
 * button writes the quote and the WhatsApp message is a *separate* tap on
 * QuoteCard afterwards — so a vendor who created a quote and closed the app had
 * one marked "Enviada" that no client had ever seen. A claim about somebody
 * else, made by the product on their behalf.
 *
 * Three consequences it also fixes: the two funnel events (#37/#56) had no
 * state behind them, so "quotes made but never sent" was unmeasurable; the
 * status filter's `draft` option could never match; and the schema's own
 * default was dead code.
 */

const SERVER_ROW = {
  id: 'q-1',
  organization_id: 'org-1',
  client_id: 'c-1',
  title: 'Suministro de cemento',
  status: 'draft',
  total_amount: 25000,
  currency: 'MXN',
  public_token: 'tok-1',
  valid_until: '2099-12-31',
  line_items: [],
};

const CREATE_INPUT = {
  client_id: 'c-1',
  title: 'Suministro de cemento',
  line_items: [{ description: 'Cemento', quantity: 1, unit_price: 25000 }],
  valid_until: '2099-12-31',
} as unknown as Parameters<ReturnType<typeof useQuotes>['createQuote']>[0];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Otherwise every assertion runs against the demo sandbox rather than the
  // real-tenant path (the CLAUDE.md Vitest trap).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { quotes: [] }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function mounted() {
  const rendered = renderHook(() => useQuotes());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe('a quote is born a draft (#61)', () => {
  it('sends no status at all, so the column default applies', async () => {
    const { result } = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, SERVER_ROW));

    await act(async () => {
      await result.current.createQuote(CREATE_INPUT);
    });

    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    // `quotes.status` is `NOT NULL DEFAULT 'draft'` with a CHECK covering the
    // six states. Omitting the field is one fewer place to disagree with it —
    // and, specifically, it can no longer say 'sent'.
    expect(body).not.toHaveProperty('status');
  });

  it('shows whatever status the server stored, not one assumed here', async () => {
    const { result } = await mounted();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, SERVER_ROW));

    await act(async () => {
      await result.current.createQuote(CREATE_INPUT);
    });

    expect(result.current.quotes[0].status).toBe('draft');
  });
});

describe('sharing is what makes it sent (#61)', () => {
  async function withDraft() {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { quotes: [SERVER_ROW] }));
    return mounted();
  }

  it('promotes a draft through the server and applies the row it returns', async () => {
    const { result } = await withDraft();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...SERVER_ROW, status: 'sent' }));

    await act(async () => {
      await result.current.promoteQuoteToSent('q-1');
    });

    expect(fetchMock.mock.calls[1][0]).toBe('/api/quotes/q-1');
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('PUT');
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      status: 'sent',
    });
    expect(result.current.quotes[0].status).toBe('sent');
  });

  it('leaves the quote a draft when the promotion is refused', async () => {
    // The client may have received the message anyway. Under-claiming is the
    // honest direction: "Borrador" understates, "Enviada" would assert a
    // delivery nothing recorded.
    const { result } = await withDraft();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Tu rol no permite editar' } })
    );

    await act(async () => {
      await result.current.promoteQuoteToSent('q-1').catch(() => {});
    });

    expect(result.current.quotes[0].status).toBe('draft');
  });

  it.each([['sent'], ['accepted'], ['converted'], ['rejected']])(
    'never walks a %s quote backwards by re-sharing its link',
    async (status) => {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { quotes: [{ ...SERVER_ROW, status }] }));
      const { result } = await mounted();

      await act(async () => {
        await result.current.promoteQuoteToSent('q-1');
      });

      // No second request at all: re-sharing an accepted quote must not
      // reopen it, and re-sharing a sent one is not new information.
      expect(fetchMock.mock.calls).toHaveLength(1);
      expect(result.current.quotes[0].status).toBe(status);
    }
  );
});

describe('a draft cannot be signed (#61)', () => {
  it('is not signable, and says why rather than offering a dead button', () => {
    // Already true before this change and load-bearing now that drafts exist:
    // the OTP and signing routes fail closed on status ∉ {sent, accepted}, and
    // #282 made the public page agree instead of showing a live sign button
    // that dead-ended at OTP time.
    expect(quoteSignableState({ status: 'draft', valid_until: '2099-12-31' })).toBe('not_yet_sent');
  });

  it('becomes signable once sharing has promoted it', () => {
    expect(quoteSignableState({ status: 'sent', valid_until: '2099-12-31' })).toBe('signable');
  });
});
