'use client';

import { useCallback, useEffect, useState } from 'react';
import { Client } from '@/types';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { readDemoClients } from '@/lib/hooks/useClients';

/**
 * One client, by id — including an archived one (#360).
 *
 * The detail page used to resolve its client out of `useClients()`, which since
 * #337 returns the **active** directory. So an archived client rendered in the
 * dashboard's Top Clientes card — correctly, since revenue they paid still
 * happened — and tapping them landed on "Cliente no encontrado": a dead end
 * reached from the dashboard, in a feature whose whole purpose was removing one.
 *
 * `GET /api/clients/[id]` has always answered for archived rows and is scoped by
 * `organization_id`, so reading it directly fixes the dead end for *any* surface
 * that links a client by id, not just the one card that exposed it. It also ends
 * the detail page being a function of whichever list happened to be loaded.
 *
 * Four outcomes, kept distinct — collapsing any pair of them is how the page
 * told a tenant their client was deleted while the request was still in flight
 * (#96):
 *
 *   - `client` set          — the server answered with a row.
 *   - `loading`             — no answer yet. Claims nothing.
 *   - `notFound`            — the server said 404. A fact: no such client in
 *                             this organization.
 *   - `error`               — the read failed (network, 5xx). NOT the same as
 *                             "does not exist", and the page must not render
 *                             "Cliente no encontrado" for it.
 */
export interface UseClientResult {
  client: Client | null;
  loading: boolean;
  /** The read failed. Distinct from `notFound` — see the note above. */
  error: string | null;
  /** The server answered 404. Only this justifies "Cliente no encontrado". */
  notFound: boolean;
  /**
   * Applies a row the **server** returned, after a mutation confirmed.
   *
   * Never a locally-assembled object: a client-side merge is how a rejected
   * write still appeared on screen (#33/#50/#59).
   */
  applyServerRow: (client: Client) => void;
  refresh: () => void;
}

export function useClient(id: string): UseClientResult {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  const applyServerRow = useCallback((row: Client) => {
    setClient(row);
    setNotFound(false);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    setNotFound(false);

    // The demo deployment has no tenant and no API to ask; its directory is the
    // localStorage sandbox. Gated on the build-time signal, never on a status
    // code — collection GETs answer the demo deployment with 200 and an empty
    // list, so 503 cannot be the tell (#93/#96).
    if (isClientDemoMode()) {
      const found = readDemoClients().find((c) => c.id === id) ?? null;
      if (!cancelled) {
        setClient(found);
        setNotFound(found === null);
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/clients/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (res.status === 404) {
          setClient(null);
          setNotFound(true);
          return;
        }

        if (!res.ok || !data?.client?.id) {
          // Unknown, not absent. A 500 or a truncated body says nothing about
          // whether this client exists.
          setClient(null);
          setError(data?.error?.message || 'No se pudo cargar el cliente.');
          return;
        }

        setClient(data.client as Client);
      })
      .catch(() => {
        if (!cancelled) {
          setClient(null);
          setError('No se pudo cargar el cliente. Revisa tu conexión.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  return { client, loading, error, notFound, applyServerRow, refresh };
}
