'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Client } from '@/types';
import { track } from '@/lib/analytics';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { readClientWriteError } from '@/lib/clientWriteError';
import { foldSearchText } from '@/lib/search';

// Demo-mode fixtures. Reachable ONLY behind isClientDemoMode(): they used to be
// the fallback for any API failure — and for a real tenant with zero clients,
// because the fetch treated an empty list as "no answer" — so a new tenant's
// directory opened with three invented companies (#93/#96 audit).
const INITIAL_DEMO_CLIENTS: Client[] = [
  {
    id: 'client-demo-1',
    organization_id: 'org-demo-1',
    name: 'Construcciones Maya S.A. de C.V.',
    contact_name: 'Arq. Fernando Maya',
    email: 'contacto@construccionesmaya.mx',
    phone: '8115551234',
    rfc: 'CMA120315HD9',
    regimen_fiscal: '601',
    codigo_postal: '64000',
    cfdi_use: 'G03',
    notes: 'Cliente preferente de materiales para obra civil.',
    health_score: 95,
    credit_limit: 100000,
    credit_days: 30,
    credit_status: 'active',
    // Demo fixtures are never archived; the sandbox has one list.
    archived_at: null,
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'client-demo-2',
    organization_id: 'org-demo-1',
    name: 'Desarrollos Inmobiliarios del Norte',
    contact_name: 'Lic. Sofía Garza',
    email: 'sgarza@dinorte.com.mx',
    phone: '8189998877',
    rfc: 'DIN080920AB3',
    regimen_fiscal: '601',
    codigo_postal: '66220',
    cfdi_use: 'G01',
    notes: 'Pagos quincenales vía SPEI Banorte.',
    health_score: 65,
    credit_limit: 50000,
    credit_days: 15,
    credit_status: 'suspended',
    // Demo fixtures are never archived; the sandbox has one list.
    archived_at: null,
    created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'client-demo-3',
    organization_id: 'org-demo-1',
    name: 'Taller Industrial Regiomontano',
    contact_name: 'Roberto Gómez',
    email: 'rgomez@tiregno.com',
    phone: '8112223344',
    rfc: 'GORR750412890',
    regimen_fiscal: '612',
    codigo_postal: '64500',
    cfdi_use: 'P01',
    notes: 'Requiere CFDI inmediato al pago.',
    health_score: 100,
    credit_limit: 0,
    credit_days: 0,
    credit_status: 'active',
    // Demo fixtures are never archived; the sandbox has one list.
    archived_at: null,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const LOCAL_STORAGE_KEY = 'business_helper_clients_v1';

export interface UseClientsOptions {
  /**
   * Read active *and* archived clients, for surfaces that only need to put a
   * name and a phone next to a record that already exists (#337).
   *
   * The quotes list is the case: it resolves each card's client out of this
   * hook, so an active-only read turned every quote belonging to a newly
   * archived client into "Cliente sin asignar" with the WhatsApp action
   * disabled — for a client whose phone is on file. The disjoint-lists rule is
   * right for *pickers* (never offer an archived client for new work) and
   * wrong for *labels*.
   *
   * Callers that pass this must not use the list as a picker.
   */
  includeArchived?: boolean;
}

export function useClients(options: UseClientsOptions = {}) {
  const includeArchived = options.includeArchived === true;
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  /**
   * Which of the two disjoint lists is on screen (#337).
   *
   * `/api/clients` returns active clients or archived ones, never both, so
   * this is a place the tenant goes rather than a filter over one list — and
   * no consumer can show archived clients by forgetting a flag.
   */
  const [showArchived, setShowArchived] = useState<boolean>(false);

  /**
   * Real tenants get the server's answer — including an empty list, which is a
   * real answer — or an error. The localStorage/demo path exists only for the
   * demo deployment: falling into it on a failed fetch showed a real tenant
   * three invented clients (#93/#96), and `error` was never assigned at all
   * (#97), so no page could have told them.
   */
  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isClientDemoMode()) {
      try {
        // The flag rides inside the query string rather than being
        // interpolated into the path: `tests/unit/clientFetchMethods.test.ts`
        // resolves a fetch URL to its route file and stops at `?`, so a
        // template expression before the `?` leaves it unable to check this
        // call site at all — dodging the gate rather than passing it.
        const scope = includeArchived ? 'all' : showArchived ? '1' : '0';
        const res = await fetch(`/api/clients?archived=${scope}`);
        const data = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.clients)) {
          setClients(data.clients);
        } else {
          setError(data?.error?.message || 'No se pudieron cargar tus clientes.');
        }
      } catch {
        setError('No se pudieron cargar tus clientes. Revisa tu conexión.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Demo deployment: localStorage keeps the sandbox interactive. It holds a
    // single list and no `archived_at`, so the archived view is empty there
    // rather than showing the active clients back (#337). Returning them would
    // have been worse than cosmetic: each would carry a *Restaurar* button
    // whose handler filters the row out of the only list the sandbox has, so
    // "restoring" a demo client deleted it, under a green confirmation.
    if (showArchived) {
      setClients([]);
      setLoading(false);
      return;
    }

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setClients(parsed);
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_CLIENTS));
        setClients(INITIAL_DEMO_CLIENTS);
      }
    } catch {
      setClients(INITIAL_DEMO_CLIENTS);
    } finally {
      setLoading(false);
    }
  }, [showArchived, includeArchived]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Persists the demo sandbox only; a real tenant's data lives on the server.
  const syncLocalStorage = (updated: Client[]) => {
    if (!isClientDemoMode()) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to sync to localStorage', e);
    }
  };

  // Every mutation: demo mode mutates the sandbox locally; a real tenant gets
  // the server row on success and a thrown error on failure. The old shape fell
  // back to a local mutation when the API failed, so a rejected write still
  // appeared in the directory (#33's class on the client CRUD).
  //
  // Failures throw a `ClientWriteError`, which keeps the envelope's per-field
  // messages attached. A bare Error carried only prose, so the form could print
  // it in a banner and nothing more — the tenant learned *that* a field was
  // wrong and had to guess *which*.
  const addClient = async (
    clientData: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'health_score' | 'organization_id'>
  ): Promise<Client> => {
    if (!isClientDemoMode()) {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData),
      });
      if (!res.ok) {
        throw await readClientWriteError(res, 'No se pudo guardar el cliente.');
      }
      const saved = await res.json();
      if (!saved?.id) throw new Error('No se pudo guardar el cliente.');
      // Only real writes count toward the funnel; the demo path below is
      // fiction and would pollute it.
      track('client_created', { organization_id: saved.organization_id });
      setClients((prev) => [saved, ...prev]);
      return saved;
    }

    const newClient: Client = {
      ...clientData,
      id: `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: 'org-demo-1',
      // Even the sandbox does not invent a payment-history judgment for a
      // client registered seconds ago (#276).
      health_score: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setClients((prev) => {
      const next = [newClient, ...prev];
      syncLocalStorage(next);
      return next;
    });
    return newClient;
  };

  const updateClient = async (id: string, clientData: Partial<Client>): Promise<Client> => {
    if (!isClientDemoMode()) {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData),
      });
      if (!res.ok) {
        throw await readClientWriteError(res, 'No se pudieron guardar los cambios del cliente.');
      }
      const updated = await res.json();
      if (!updated?.id) throw new Error('No se pudieron guardar los cambios del cliente.');
      setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    }

    let updatedClient: Client | undefined;
    setClients((prev) => {
      const next = prev.map((c) => {
        if (c.id === id) {
          updatedClient = { ...c, ...clientData, updated_at: new Date().toISOString() };
          return updatedClient;
        }
        return c;
      });
      syncLocalStorage(next);
      return next;
    });

    if (!updatedClient) throw new Error('Cliente no encontrado');
    return updatedClient;
  };

  const deleteClient = async (id: string): Promise<void> => {
    if (!isClientDemoMode()) {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw await readClientWriteError(res, 'No se pudo eliminar el cliente.');
      }
    }

    setClients((prev) => {
      const next = prev.filter((c) => c.id !== id);
      syncLocalStorage(next);
      return next;
    });
  };

  /**
   * Archives a client, or restores one (#337).
   *
   * The row leaves whichever list is on screen, because the two lists are
   * disjoint: archiving removes it from the active directory, restoring
   * removes it from the archived view. That is done only *after* the server
   * confirms — a failure throws with the server's Spanish message and the
   * directory is left exactly as it was, rather than hiding a client on a
   * write that did not land (#33/#50/#59).
   */
  const archiveClient = async (id: string, archived: boolean): Promise<Client | null> => {
    let serverRow: Client | null = null;

    if (!isClientDemoMode()) {
      const res = await fetch(`/api/clients/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        throw await readClientWriteError(
          res,
          archived ? 'No se pudo archivar el cliente.' : 'No se pudo restaurar el cliente.'
        );
      }
      const data = await res.json().catch(() => null);
      serverRow = (data?.client as Client) ?? null;
    }

    setClients((prev) => {
      const next = prev.filter((c) => c.id !== id);
      syncLocalStorage(next);
      return next;
    });

    return serverRow;
  };

  const getClientById = useCallback(
    (id: string): Client | undefined => {
      return clients.find((c) => c.id === id);
    },
    [clients]
  );

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    // Folded, not lowercased: "ferreteria" must find "Ferretería" (#278).
    const q = foldSearchText(searchQuery).trim();
    return clients.filter(
      (c) =>
        foldSearchText(c.name).includes(q) ||
        (c.contact_name && foldSearchText(c.contact_name).includes(q)) ||
        (c.rfc && foldSearchText(c.rfc).includes(q)) ||
        (c.email && foldSearchText(c.email).includes(q))
    );
  }, [clients, searchQuery]);

  return {
    clients,
    filteredClients,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    showArchived,
    setShowArchived,
    fetchClients,
    addClient,
    updateClient,
    deleteClient,
    archiveClient,
    getClientById,
  };
}
