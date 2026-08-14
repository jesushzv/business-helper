'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MilestoneItem,
  agingBucketOf,
  calculateReceivablesSummary,
  ReceivablesSummary,
} from '../receivablesCalculator';
import { isClientDemoMode } from '../clientDemoMode';

export interface MilestoneWithClient extends MilestoneItem {
  client_id?: string;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  contract_title?: string;
  /**
   * The quote's `public_token` — what `/pay/[token]` resolves.
   *
   * Not a column on `milestones`. It reaches here from the quote behind the
   * milestone's contract, flattened by `toMilestoneWithClient` below. Undefined
   * means this milestone has no payment page, and the UI must offer no link
   * rather than substitute a placeholder.
   */
  public_token?: string;
  /**
   * Whether the account **this quote named** has since been archived (#164).
   *
   * Required rather than optional: the org-level readiness gate cannot answer
   * this, so a tenant with two accounts who archives the non-default one keeps
   * `ready: true` everywhere while the `/pay/` links of the quotes that named
   * it refuse. Optional-everything is how the last flattening shipped
   * undefined for every real tenant (#78), so this one is stated.
   */
  pay_account_archived: boolean;
}

/**
 * A milestone row as `/api/receivables` returns it: nested, not flat.
 *
 * PostgREST returns a to-one embed as an object, but not every deployment and
 * version agrees — an array shows up often enough that both are handled below.
 */
interface ReceivableApiRow extends MilestoneItem {
  contracts?: RelatedContract | RelatedContract[] | null;
}

interface RelatedContract {
  title?: string | null;
  client_id?: string | null;
  clients?: RelatedClient | RelatedClient[] | null;
  quotes?: RelatedQuote | RelatedQuote[] | null;
}

interface RelatedClient {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface RelatedQuote {
  public_token?: string | null;
  bank_account_id?: string | null;
  bank_accounts?: RelatedQuoteAccount | RelatedQuoteAccount[] | null;
}

interface RelatedQuoteAccount {
  archived_at?: string | null;
}

/** Unwraps a PostgREST to-one embed that may arrive as an object or a 1-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Flattens one server row into the shape the Cobranza UI reads.
 *
 * This did not exist: `fetchReceivables` assigned the raw API rows straight to
 * `MilestoneWithClient`, whose flat `client_name` / `client_phone` /
 * `contract_title` / `public_token` fields only ever existed on the demo
 * fixtures. Against a real tenant every one of them was undefined, so the card
 * showed "Cliente no asignado" and "Contrato sin título" for named clients,
 * disabled the WhatsApp reminder as if the client had no phone, and — because
 * the card filled the gap with `milestone.public_token || 'demo'` — pointed
 * "Portal SPEI" at `/pay/demo`. The types hid it: every field is optional, so
 * the missing mapping was not a type error.
 */
export function toMilestoneWithClient(row: ReceivableApiRow): MilestoneWithClient {
  const contract = firstOf(row.contracts);
  const client = firstOf(contract?.clients);
  const quote = firstOf(contract?.quotes);

  // Copy the milestone's own columns and drop the nested blob, rather than
  // listing fields: the row also carries the cfdi_* columns other screens read,
  // and an explicit list would silently stop forwarding any column added later.
  const milestone = { ...row };
  delete milestone.contracts;

  return {
    ...milestone,
    client_id: client?.id || contract?.client_id || undefined,
    client_name: client?.name || undefined,
    client_phone: client?.phone || undefined,
    client_email: client?.email || undefined,
    contract_title: contract?.title || undefined,
    public_token: quote?.public_token || undefined,
    // Only a quote that *named* an account can have a dead one: an unassigned
    // quote follows the organization's current default, which the org-level
    // gate already covers.
    pay_account_archived: Boolean(quote?.bank_account_id && firstOf(quote?.bank_accounts)?.archived_at),
  };
}

const INITIAL_DEMO_RECEIVABLES: MilestoneWithClient[] = [
  {
    id: 'milestone-demo-1',
    contract_id: 'contract-demo-1',
    client_id: 'client-demo-1',
    organization_id: 'org-demo-1',
    label: 'Anticipo 50% — Suministro Cemento',
    amount: 48720,
    due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Overdue
    status: 'pending',
    receipt_url: null,
    tracking_reference: null,
    transferred_amount: null,
    confirmed_at: null,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Construcciones Maya S.A. de C.V.',
    client_phone: '8115551234',
    client_email: 'contacto@construccionesmaya.mx',
    contract_title: 'Suministro de Cemento y Varilla',
    public_token: 'a1b2c3d4e5f678901234567890abcdef',
    // Demo fixtures name no account, so nothing can be archived out from under them.
    pay_account_archived: false,
  },
  {
    id: 'milestone-demo-2',
    contract_id: 'contract-demo-2',
    client_id: 'client-demo-2',
    organization_id: 'org-demo-1',
    label: 'Pago Inicial Estudio Geotécnico',
    amount: 17636.66,
    due_date: new Date().toISOString().split('T')[0], // Due Today
    status: 'marked_paid',
    receipt_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500',
    tracking_reference: 'SPEI20260830998877',
    transferred_amount: 17636.66,
    confirmed_at: null,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Desarrollos Inmobiliarios del Norte',
    client_phone: '8189998877',
    client_email: 'sgarza@dinorte.com.mx',
    contract_title: 'Estudio de Suelo e Ingeniería',
    public_token: 'ff99887766554433221100aabbccdde',
    // Demo fixtures name no account, so nothing can be archived out from under them.
    pay_account_archived: false,
  },
  {
    id: 'milestone-demo-3',
    contract_id: 'contract-demo-1',
    client_id: 'client-demo-1',
    organization_id: 'org-demo-1',
    label: 'Entrega Final 50% — Cemento',
    amount: 48720,
    due_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Upcoming
    status: 'pending',
    receipt_url: null,
    tracking_reference: null,
    transferred_amount: null,
    confirmed_at: null,
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Construcciones Maya S.A. de C.V.',
    client_phone: '8115551234',
    client_email: 'contacto@construccionesmaya.mx',
    contract_title: 'Suministro de Cemento y Varilla',
    public_token: 'a1b2c3d4e5f678901234567890abcdef',
    // Demo fixtures name no account, so nothing can be archived out from under them.
    pay_account_archived: false,
  },
  {
    id: 'milestone-demo-4',
    contract_id: 'contract-demo-3',
    client_id: 'client-demo-3',
    organization_id: 'org-demo-1',
    label: 'Anticipo Proyecto Remodelación',
    amount: 30000,
    due_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'confirmed',
    receipt_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=500',
    tracking_reference: 'SPEI20260815112233',
    transferred_amount: 30000,
    confirmed_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    client_name: 'Taller Industrial Regiomontano',
    client_phone: '8112223344',
    client_email: 'rgomez@tiregno.com',
    contract_title: 'Remodelación NAVE 4',
    public_token: '1234567890abcdef1234567890abcdef',
    // Demo fixtures name no account, so nothing can be archived out from under them.
    pay_account_archived: false,
  },
];

const LOCAL_STORAGE_KEY = 'business_helper_receivables_v1';

/**
 * What a mutation actually did, reported honestly.
 *
 * These used to fire the request and discard the outcome, so a 401/403/500
 * still showed `confirmed`, persisted it to localStorage, and moved the
 * "cobrado este mes" total — the same defect the CFDI work removed, one layer
 * up (#33). Now the server writes first and local state follows its answer.
 */
export interface ReceivableMutationOutcome {
  success: boolean;
  milestone?: MilestoneWithClient;
  error?: string;
  /** Complemento de pago the confirm route filed for a PPD invoice, if any. */
  complement?: Record<string, unknown>;
  /** Set when the payment confirmed but the SAT complement could not be filed. */
  complementError?: { code: string; message: string } | null;
}

function errorMessage(data: unknown, fallback: string): string {
  const err = (data as { error?: string | { message?: string } } | null)?.error;
  if (typeof err === 'string') return err;
  return err?.message || fallback;
}

export function useReceivables() {
  const [receivables, setReceivables] = useState<MilestoneWithClient[]>([]);
  // Mirror of the list for the mutation helpers: a setState updater runs when
  // React flushes, not when it is called, so the row a mutation just changed
  // cannot be read back synchronously through state alone.
  const receivablesRef = useRef<MilestoneWithClient[]>([]);
  useEffect(() => {
    receivablesRef.current = receivables;
  }, [receivables]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    setError(null);

    // A real tenant never sees the fixtures below, whatever happens to the
    // request. The old shape wrapped the fetch in a bare `catch` that fell
    // through to the localStorage block, so a single dropped connection — the
    // normal case on the 3G phone this product is built for — filled Cobranza
    // with ~$145,000 owed by three companies that do not exist, left `error`
    // null so no screen could say otherwise, and fed the same invented
    // milestones into the client detail page's credit meter (#96, same class
    // as #33/#50/#58).
    if (!isClientDemoMode()) {
      try {
        const res = await fetch('/api/receivables');
        const data = await res.json().catch(() => null);

        if (res.ok && Array.isArray(data?.receivables)) {
          setReceivables(data.receivables.map(toMilestoneWithClient));
        } else {
          setError(errorMessage(data, 'No se pudieron cargar tus cobros'));
        }
      } catch {
        setError('No se pudieron cargar tus cobros. Revisa tu conexión.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Demo deployment: localStorage keeps the sandbox interactive across
    // reloads, and is the only persistence there is.
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReceivables(parsed);
        } else {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECEIVABLES));
          setReceivables(INITIAL_DEMO_RECEIVABLES);
        }
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECEIVABLES));
        setReceivables(INITIAL_DEMO_RECEIVABLES);
      }
    } catch {
      setReceivables(INITIAL_DEMO_RECEIVABLES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReceivables();
  }, [fetchReceivables]);

  // Persists the demo sandbox only. A real tenant's cobros live on the server;
  // mirroring them here also seeded the stale snapshot that the fixture
  // fallback used to read back as if it were current (#96).
  const syncLocalStorage = (updated: MilestoneWithClient[]) => {
    if (!isClientDemoMode()) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to sync receivables to localStorage', e);
    }
  };

  /** Applies field changes to one row and mirrors the list to localStorage. */
  const applyRowUpdate = (
    id: string,
    changes: Partial<MilestoneWithClient>
  ): MilestoneWithClient | undefined => {
    let updatedItem: MilestoneWithClient | undefined;
    const next = receivablesRef.current.map((m) => {
      if (m.id === id) {
        updatedItem = { ...m, ...changes };
        return updatedItem;
      }
      return m;
    });
    if (!updatedItem) return undefined;
    receivablesRef.current = next;
    setReceivables(next);
    syncLocalStorage(next);
    return updatedItem;
  };

  const confirmPayment = async (
    id: string,
    transferredAmount?: number
  ): Promise<ReceivableMutationOutcome> => {
    let res: Response;
    try {
      res = await fetch(`/api/receivables/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferredAmount }),
      });
    } catch {
      // No answer from the server means the payment was NOT confirmed. Local
      // state stays as it was.
      return { success: false, error: 'Sin conexión. El pago no se confirmó.' };
    }

    const data = await res.json().catch(() => null);

    if (res.ok) {
      // The server's row is the fact; local state follows it.
      const updated = applyRowUpdate(id, {
        status: 'confirmed',
        transferred_amount: Number(data?.transferred_amount ?? transferredAmount ?? 0) || undefined,
        confirmed_at: data?.confirmed_at || new Date().toISOString(),
      });
      return {
        success: true,
        milestone: updated,
        complement: data?.complement,
        complementError: data?.complementError || null,
      };
    }

    // Only the sandbox may confirm a payment the server did not record. This
    // used to key off a 503 BACKEND_NOT_CONFIGURED instead, which a real
    // deployment also returns when its server-side Supabase config is broken —
    // so a misconfigured production wrote "confirmed" with a locally minted
    // timestamp for a payment nobody had received. Demo detection is the
    // build-time signal, never a response code (CLAUDE.md).
    if (isClientDemoMode()) {
      const updated = applyRowUpdate(id, {
        status: 'confirmed',
        transferred_amount: transferredAmount,
        confirmed_at: new Date().toISOString(),
      });
      if (!updated) return { success: false, error: 'Cobro no encontrado' };
      return { success: true, milestone: updated };
    }

    return { success: false, error: errorMessage(data, 'No se pudo confirmar el pago') };
  };

  const uploadSpeiProof = async (
    id: string,
    data: { receipt_url: string; tracking_reference: string; transferred_amount?: number }
  ): Promise<ReceivableMutationOutcome> => {
    const changes: Partial<MilestoneWithClient> = {
      status: 'marked_paid',
      receipt_url: data.receipt_url,
      tracking_reference: data.tracking_reference,
      transferred_amount: data.transferred_amount,
    };

    // The sandbox never reaches the API: it short-circuits *before* the fetch,
    // which is the rule LESSONS states — a demo simulation is never a fallback
    // on a real request's result. This used to read
    // `if (res.ok || isClientDemoMode())` after the request, so a failed write
    // in a demo-flagged browser still applied a local "comprobante registrado":
    // the #58/#86 shape, sitting in a money hook (#287). `confirmPayment` above
    // still simulates from the failed-response branch; it is at least gated on
    // the build-time signal rather than a status code, and is left alone here.
    if (isClientDemoMode()) {
      const updated = applyRowUpdate(id, changes);
      if (!updated) return { success: false, error: 'Hito de pago no encontrado' };
      return { success: true, milestone: updated };
    }

    let res: Response;
    try {
      res = await fetch(`/api/receivables/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
    } catch {
      return { success: false, error: 'Sin conexión. El comprobante no se registró.' };
    }

    const body = await res.json().catch(() => null);

    if (res.ok) {
      const updated = applyRowUpdate(id, changes);
      if (!updated) return { success: false, error: 'Hito de pago no encontrado' };
      return { success: true, milestone: updated };
    }

    return { success: false, error: errorMessage(body, 'No se pudo registrar el comprobante') };
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const summary: ReceivablesSummary = useMemo(() => {
    return calculateReceivablesSummary(receivables, todayStr);
  }, [receivables, todayStr]);

  const filteredReceivables = useMemo(() => {
    return receivables.filter((m) => {
      let matchesStatus = true;
      // The aging tabs ask `agingBucketOf` — the same predicate the summary
      // cards sum. Written out here they disagreed with the cards twice: a
      // `marked_paid` cobro counted toward Atrasado but the tab hid it, and a
      // partially-paid one appeared in no tab at all (#253).
      if (statusFilter === 'overdue') {
        matchesStatus = agingBucketOf(m, todayStr) === 'overdue';
      } else if (statusFilter === 'due_today') {
        matchesStatus = agingBucketOf(m, todayStr) === 'due_today';
      } else if (statusFilter === 'upcoming') {
        matchesStatus = agingBucketOf(m, todayStr) === 'upcoming';
      } else if (statusFilter === 'marked_paid') {
        matchesStatus = m.status === 'marked_paid';
      } else if (statusFilter === 'confirmed') {
        matchesStatus = m.status === 'confirmed';
      }

      const matchesQuery =
        !searchQuery.trim() ||
        m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.contract_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.tracking_reference?.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesQuery;
    });
  }, [receivables, statusFilter, searchQuery, todayStr]);

  const resetDemoReceivables = useCallback(() => {
    // Named "demo" but ungated, so wiring it to any button would have written
    // fixtures straight into a real tenant's list.
    if (!isClientDemoMode()) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECEIVABLES));
    setReceivables(INITIAL_DEMO_RECEIVABLES);
  }, []);

  return {
    receivables,
    filteredReceivables,
    summary,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    fetchReceivables,
    confirmPayment,
    uploadSpeiProof,
    resetDemoReceivables,
  };
}
