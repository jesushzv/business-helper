'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Quote } from '@/types';
import { generatePublicToken } from '../quoteToken';
import { calculateQuoteTotals, LineItem, type QuoteTaxTreatment } from '../quoteCalculator';
import { convertQuoteToContract, ContractResult } from '../quoteToContract';
import { track } from '@/lib/analytics';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { readClientWriteError } from '@/lib/clientWriteError';
import { foldSearchText } from '@/lib/search';

const INITIAL_DEMO_QUOTES: Quote[] = [
  {
    id: 'quote-demo-1',
    organization_id: 'org-demo-1',
    client_id: 'client-demo-1',
    created_by: 'user-demo-1',
    title: 'Suministro de Cemento y Varilla para Obra Civil',
    line_items: [
      { description: 'Tonelada Cemento CPO 40', quantity: 5, unit_price: 3600, sat_code: '30111500', unit: 'TON' },
      { description: 'Tonelada Varilla 3/8"', quantity: 3, unit_price: 22000, sat_code: '30101800', unit: 'TON' },
    ],
    subtotal_amount: 84000,
    tax_treatment: 'iva_16',
    iva_amount: 13440,
    retencion_isr_amount: 0,
    retencion_iva_amount: 0,
    total_amount: 97440,
    currency: 'MXN',
    status: 'sent',
    valid_until: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'Entrega directa en obra en 48 horas hábiles tras recibir anticipo.',
    public_token: 'a1b2c3d4e5f678901234567890abcdef',
    converted_contract_id: null,
    bank_account_id: null,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'quote-demo-2',
    organization_id: 'org-demo-1',
    client_id: 'client-demo-2',
    created_by: 'user-demo-1',
    title: 'Estudio de Suelo e Ingeniería Topográfica',
    line_items: [
      { description: 'Estudio Geotécnico de Suelo', quantity: 1, unit_price: 25000, sat_code: '81101500', unit: 'E48' },
      { description: 'Levantamiento Topográfico', quantity: 1, unit_price: 12000, sat_code: '81101500', unit: 'E48' },
    ],
    subtotal_amount: 37000,
    tax_treatment: 'iva_16',
    iva_amount: 5920,
    retencion_isr_amount: 3700,
    retencion_iva_amount: 3946.68,
    total_amount: 35273.32,
    currency: 'MXN',
    status: 'accepted',
    valid_until: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notes: 'Cotización emitida bajo Régimen RESICO.',
    public_token: 'ff99887766554433221100aabbccdde',
    converted_contract_id: null,
    bank_account_id: null,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const LOCAL_STORAGE_KEY = 'business_helper_quotes_v1';

/**
 * True when this build/browser is the demo experience: no Supabase baked into
 * the bundle, the demo flag set, or the visitor opted into the sandbox. Only
 * then are locally minted quotes and demo fixtures legitimate; on a configured
 * deployment the server is the sole source of truth (#50).
 *
 * Defined in lib/clientDemoMode.ts since #64 gave it a second caller; re-exported
 * here because CLAUDE.md names this hook as the reference implementation.
 */
export { isClientDemoMode };

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isClientDemoMode()) {
      // A mirror written before the demo gate below existed holds real rows —
      // public_token signing secrets included — and isClientDemoMode() also
      // honors a visitor-settable sandbox flag that would render them back
      // into the UI. Already-leaked state is removed, not just no longer
      // written (#113).
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        // Storage unavailable — nothing persisted there to remove.
      }
      try {
        const res = await fetch('/api/quotes');
        const data = await res.json().catch(() => null);

        if (res.ok && Array.isArray(data?.quotes)) {
          // The server's answer is the answer — including an empty list. A
          // real tenant with zero quotes must see zero, not the demo fixtures.
          setQuotes(data.quotes);
        } else {
          // A configured backend answered with a failure. Falling back to
          // demo data here would present fiction as fact; report it instead.
          const err = (data as { error?: string | { message?: string } } | null)?.error;
          setError(
            (typeof err === 'string' && err) ||
              (typeof err === 'object' && err?.message) ||
              'No se pudieron cargar tus cotizaciones'
          );
        }
      } catch {
        setError('No se pudo conectar con el servidor');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuotes(parsed);
        } else {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_QUOTES));
          setQuotes(INITIAL_DEMO_QUOTES);
        }
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_QUOTES));
        setQuotes(INITIAL_DEMO_QUOTES);
      }
    } catch {
      setQuotes(INITIAL_DEMO_QUOTES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const syncLocalStorage = (updated: Quote[]) => {
    // Demo-sandbox state only, like useClients/useProducts. For a real tenant
    // every serialized quote carries public_token — the secret /q/ and /pay/
    // resolve — so the mirror would persist working signing links at rest in
    // the browser (#113).
    if (!isClientDemoMode()) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to sync quotes to localStorage', e);
    }
  };

  const createQuote = async (data: {
    client_id: string;
    title: string;
    line_items: LineItem[];
    currency?: string;
    valid_until?: string;
    notes?: string;
    /** The account this quote's client pays into; `null` = the org default (#164). */
    bank_account_id?: string | null;
    taxOptions?: {
      taxTreatment?: QuoteTaxTreatment;
      applyIva?: boolean;
      applyRetencionIsr?: boolean;
      applyRetencionIva?: boolean;
    };
  }): Promise<Quote> => {
    const totals = calculateQuoteTotals(data.line_items, data.taxOptions);

    const payload = {
      client_id: data.client_id,
      title: data.title,
      line_items: data.line_items,
      subtotal_amount: totals.subtotal,
      // What the tenant stated, not what the amounts imply (#407): `iva_amount`
      // of 0 cannot tell a zero-rated sale from an exempt one, and the stamped
      // CFDI has to say which. NULL only for a quote created before the choice
      // existed — never written as a guess here.
      tax_treatment: data.taxOptions?.taxTreatment ?? null,
      iva_amount: totals.ivaAmount,
      retencion_isr_amount: totals.retencionIsrAmount,
      retencion_iva_amount: totals.retencionIvaAmount,
      total_amount: totals.totalAmount,
      currency: (data.currency as 'MXN' | 'USD') || 'MXN',
      // `status` is deliberately absent, so `quotes.status` applies its own
      // default of 'draft' (#61). Hardcoding 'sent' made every quote claim
      // the client had received it at the moment it was written — but the
      // wizard's button generates the quote and the WhatsApp message is a
      // *separate* tap on QuoteCard afterwards, so a vendor who created one
      // and closed the app had a quote marked "Enviada" that nobody had seen.
      // Sharing is what makes it sent; `promoteQuoteToSent` below does that,
      // through the server.
      //
      // Omitted rather than set to 'draft' explicitly: the column already
      // carries the answer, and one fewer place to disagree with it.
      valid_until: data.valid_until || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: data.notes || '',
      // Null, not omitted: "no account named" is a meaning this column carries
      // (settle at the organization's default), not a missing value.
      bank_account_id: data.bank_account_id ?? null,
    };

    // The demo deployment has no backend; a locally minted quote is the honest
    // representation of what exists. Everywhere else the server row is the only
    // quote — identity fields (id, public_token, organization_id, created_by)
    // are the server's to assign, and the /q/ link only works if the token the
    // UI shows is the token the database holds.
    if (isClientDemoMode()) {
      const localQuote: Quote = {
        ...payload,
        // The sandbox has no column to default from, so it states what the
        // database would have chosen (#61).
        status: 'draft',
        id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        organization_id: 'org-demo-1',
        created_by: 'user-demo-1',
        line_items: data.line_items as unknown as Quote['line_items'],
        public_token: generatePublicToken(),
        converted_contract_id: null,
        // `bank_account_id` comes from the payload above: overriding it to null
        // here would silently discard the account the demo visitor picked in
        // the wizard, showing them a feature that appears not to work (#164).
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setQuotes((prev) => {
        const next = [localQuote, ...prev];
        syncLocalStorage(next);
        return next;
      });
      return localQuote;
    }

    // A failed write must surface as a failure. The previous version fell back
    // to local state after any error — or a 1.5s timeout — so a quote that was
    // never stored (or was stored under a different token than the one shown)
    // appeared created, and the WhatsApp link it produced led the client to
    // "Cotización no encontrada" (#50).
    let res: Response;
    try {
      res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor. La cotización no fue creada.');
    }

    const saved = await res.json().catch(() => null);

    if (!res.ok || !saved?.id) {
      const message =
        (typeof saved?.error === 'string' && saved.error) ||
        saved?.error?.message ||
        'No se pudo crear la cotización. Intenta de nuevo.';
      throw new Error(message);
    }

    // Only real writes count toward the funnel — activation measured
    // against demo fixtures would be self-deception.
    track('quote_created', { organization_id: saved.organization_id });
    setQuotes((prev) => [saved, ...prev]);
    return saved;
  };

  /**
   * Edits an existing quote's content (#340).
   *
   * Same payload shape as `createQuote` — the totals are recomputed from the
   * line items here rather than trusted from the form, for the same reason
   * they are on create: the figure the client is shown and the figure stored
   * must come from one calculation.
   *
   * `status` is deliberately **not** sent. Whether an edit retires a live `/q/`
   * link is the server's decision (`lib/quoteEditability.ts`), and a client
   * that could name its own status could keep the link alive over changed
   * figures. The server row that comes back is what the list then shows — the
   * #33/#50 rule: never an optimistic local object.
   */
  const updateQuote = async (
    id: string,
    data: {
      client_id: string;
      title: string;
      line_items: LineItem[];
      currency?: string;
      valid_until?: string;
      notes?: string;
      bank_account_id?: string | null;
      taxOptions?: {
      taxTreatment?: QuoteTaxTreatment;
      applyIva?: boolean;
      applyRetencionIsr?: boolean;
      applyRetencionIva?: boolean;
    };
    }
  ): Promise<Quote> => {
    const totals = calculateQuoteTotals(data.line_items, data.taxOptions);

    const payload = {
      client_id: data.client_id,
      title: data.title,
      line_items: data.line_items,
      subtotal_amount: totals.subtotal,
      // What the tenant stated, not what the amounts imply (#407): `iva_amount`
      // of 0 cannot tell a zero-rated sale from an exempt one, and the stamped
      // CFDI has to say which. NULL only for a quote created before the choice
      // existed — never written as a guess here.
      tax_treatment: data.taxOptions?.taxTreatment ?? null,
      iva_amount: totals.ivaAmount,
      retencion_isr_amount: totals.retencionIsrAmount,
      retencion_iva_amount: totals.retencionIvaAmount,
      total_amount: totals.totalAmount,
      currency: (data.currency as 'MXN' | 'USD') || 'MXN',
      valid_until:
        data.valid_until || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: data.notes || '',
      bank_account_id: data.bank_account_id ?? null,
    };

    if (isClientDemoMode()) {
      let edited: Quote | null = null;
      setQuotes((prev) => {
        const next = prev.map((q) =>
          q.id === id
            ? ((edited = {
                ...q,
                ...payload,
                line_items: data.line_items as unknown as Quote['line_items'],
                // The sandbox states what the server would have done, rather
                // than leaving a link live over figures that changed.
                status: q.status === 'sent' ? 'draft' : q.status,
                updated_at: new Date().toISOString(),
              } as Quote),
              edited)
            : q
        );
        syncLocalStorage(next);
        return next;
      });
      if (!edited) throw new Error('Cotización no encontrada');
      return edited;
    }

    let res: Response;
    try {
      res = await fetch(`/api/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor. La cotización no fue modificada.');
    }

    const saved = await res.json().catch(() => null);

    if (!res.ok || !saved?.id) {
      // The server's refusals here are written for the owner and name what to
      // do next — a signed quote is immutable, an expired one needs a new
      // quote (lib/quoteEditability.ts). Rendering them verbatim beats a
      // generic sentence that hides which of those happened.
      throw new Error(
        (typeof saved?.error === 'string' && saved.error) ||
          saved?.error?.message ||
          'No se pudo modificar la cotización. Intenta de nuevo.'
      );
    }

    setQuotes((prev) => prev.map((q) => (q.id === id ? saved : q)));
    return saved;
  };

  /** Applies a status locally. Only legitimate once the server has confirmed it
   *  (or in demo mode, where local state is the only state). `extra` carries
   *  sibling fields the same confirmation established (converted_contract_id). */
  const applyStatusLocally = (id: string, status: string, extra?: Partial<Quote>): Quote | undefined => {
    let updated: Quote | undefined;
    setQuotes((prev) => {
      const next = prev.map((q) => {
        if (q.id === id) {
          updated = { ...q, ...extra, status: status as Quote['status'], updated_at: new Date().toISOString() };
          return updated;
        }
        return q;
      });
      syncLocalStorage(next);
      return next;
    });
    return updated;
  };

  /**
   * Marks a quote as sent, at the moment it is actually shared (#61).
   *
   * "Sent" is a claim about the client, and until now it was made at
   * creation: `createQuote` hardcoded `status: 'sent'` while the WhatsApp
   * message is a separate tap afterwards. The two funnel events #37/#56 wired
   * — `quote_created` on the write, `quote_sent` on the share — had no state
   * behind them, so the one drop-off worth measuring (quotes made but never
   * sent) was invisible, and `draft` was a dead option on the status filter.
   *
   * Only a `draft` is promoted. A quote already `accepted` or `converted`
   * must not be walked backwards by re-sharing its link, and re-sharing a
   * `sent` one is not new information.
   *
   * The share itself is never blocked on this: the WhatsApp message opens
   * regardless, and a failed promotion leaves the quote reading `Borrador`.
   * That is the honest direction to fail — the client may have received a
   * message the product did not record, and under-claiming beats asserting a
   * delivery that nothing confirmed.
   */
  const promoteQuoteToSent = async (id: string): Promise<void> => {
    const quote = quotes.find((q) => q.id === id);
    if (!quote || quote.status !== 'draft') return;
    await updateQuoteStatus(id, 'sent');
  };

  // The old version flipped status first and discarded the response, so a
  // 401/403/500 left the UI — and localStorage — asserting a status the database
  // does not hold (#59). The server row is now what the list shows.
  const updateQuoteStatus = async (id: string, status: string): Promise<Quote> => {
    if (isClientDemoMode()) {
      const updated = applyStatusLocally(id, status);
      if (!updated) throw new Error('Cotización no encontrada');
      return updated;
    }

    let res: Response;
    try {
      res = await fetch(`/api/quotes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch {
      throw new Error('No se pudo conectar con el servidor. El estado no fue actualizado.');
    }

    const saved = await res.json().catch(() => null);

    if (!res.ok || !saved?.id) {
      throw new Error(
        (typeof saved?.error === 'string' && saved.error) ||
          saved?.error?.message ||
          'No se pudo actualizar el estado de la cotización.'
      );
    }

    setQuotes((prev) => prev.map((q) => (q.id === id ? saved : q)));
    return saved;
  };

  const convertToContract = async (
    quoteId: string
  ): Promise<ContractResult & { warning?: string }> => {
    const targetQuote = quotes.find((q) => q.id === quoteId);
    if (!targetQuote) throw new Error('Cotización no encontrada');

    // Demo deployment: no backend to create a contract in, so the locally
    // derived one is the honest representation of what exists.
    if (isClientDemoMode()) {
      const conversion = convertQuoteToContract({
        id: targetQuote.id,
        organization_id: targetQuote.organization_id,
        client_id: targetQuote.client_id,
        title: targetQuote.title,
        total_amount: targetQuote.total_amount,
        currency: targetQuote.currency,
        status: targetQuote.status,
      });
      applyStatusLocally(quoteId, 'converted');
      return conversion;
    }

    // The route creates the contract AND its milestones AND flips the quote
    // status, rolling back the contract if the milestones fail. Deriving a
    // contract locally and flipping status first announced a payment schedule
    // that a failed request never created (#59) — the #33 defect on the step
    // that opens the receivable.
    let res: Response;
    try {
      res = await fetch(`/api/quotes/${quoteId}/convert`, { method: 'POST' });
    } catch {
      throw new Error('No se pudo conectar con el servidor. La cotización no fue convertida.');
    }

    const saved = await res.json().catch(() => null);

    // Partial success: the contract and its schedule exist; only the quote's
    // own status flip failed. Thrown as "No se pudo convertir", the tenant was
    // told nothing happened while a payment schedule sat live in Cobranza
    // (#283). The quote deliberately stays un-flipped locally — the server
    // still holds the old status, and the next convert tap resumes and heals.
    if (saved?.error?.code === 'QUOTE_STATUS_NOT_UPDATED' && saved?.contract) {
      return {
        contract: saved.contract,
        milestones: saved.milestones || [],
        warning: saved.error.message as string,
      };
    }

    if (!res.ok || !saved?.contract) {
      throw new Error(
        (typeof saved?.error === 'string' && saved.error) ||
          saved?.error?.message ||
          'No se pudo convertir la cotización a contrato.'
      );
    }

    // The server flipped the quote; mirror the row it now holds — status alone
    // left converted_contract_id stale in local state (#283).
    applyStatusLocally(quoteId, 'converted', {
      converted_contract_id: saved.contract?.id ?? null,
    });
    return { contract: saved.contract, milestones: saved.milestones || [] };
  };

  /**
   * Deletes a quote the tenant may still delete (draft/sent/rejected/expired —
   * the route refuses accepted and converted ones with a 409, because those
   * carry a signature or a live /pay/ link). The row leaves local state only
   * after the server confirms; a refused or failed delete throws with the
   * server's Spanish message so the page can show why.
   */
  const deleteQuote = async (id: string): Promise<void> => {
    if (!isClientDemoMode()) {
      const res = await fetch(`/api/quotes/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw await readClientWriteError(res, 'No se pudo eliminar la cotización.');
      }
    }

    setQuotes((prev) => {
      const next = prev.filter((q) => q.id !== id);
      syncLocalStorage(next);
      return next;
    });
  };

  const filteredQuotes = useMemo(() => {
    // Folded, not lowercased: "instalacion" must find "Instalación" (#278).
    const q = foldSearchText(searchQuery).trim();
    return quotes.filter((quote) => {
      const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
      const matchesQuery =
        !q ||
        foldSearchText(quote.title).includes(q) ||
        foldSearchText(quote.notes).includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [quotes, statusFilter, searchQuery]);

  const resetDemoQuotes = useCallback(() => {
    // One of the four localStorage surfaces the #93/#96 audit names. No real
    // caller exists today, but a future wire-up must not re-seed a real
    // tenant's quote list with fixtures (#113).
    if (!isClientDemoMode()) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_QUOTES));
    setQuotes(INITIAL_DEMO_QUOTES);
  }, []);

  return {
    quotes,
    filteredQuotes,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    fetchQuotes,
    createQuote,
    updateQuote,
    updateQuoteStatus,
    promoteQuoteToSent,
    convertToContract,
    deleteQuote,
    resetDemoQuotes,
  };
}
