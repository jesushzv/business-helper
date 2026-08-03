'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Client } from '@/types';

// Mock initial data for Don Roberto & Demo mode
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
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const LOCAL_STORAGE_KEY = 'business_helper_clients_v1';

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch clients from API or localStorage fallback
  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/clients');
      if (res.ok) {
        const data = await res.json();
        if (data.clients && Array.isArray(data.clients) && data.clients.length > 0) {
          setClients(data.clients);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fall through to localStorage / demo fallback
    }

    // LocalStorage / Demo Fallback
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClients(parsed);
        } else {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_CLIENTS));
          setClients(INITIAL_DEMO_CLIENTS);
        }
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_CLIENTS));
        setClients(INITIAL_DEMO_CLIENTS);
      }
    } catch {
      setClients(INITIAL_DEMO_CLIENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Sync state to local storage helper
  const syncLocalStorage = (updated: Client[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to sync to localStorage', e);
    }
  };

  const addClient = async (
    clientData: Omit<Client, 'id' | 'created_at' | 'updated_at' | 'health_score' | 'organization_id'>
  ): Promise<Client> => {
    const newClient: Client = {
      ...clientData,
      id: `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      organization_id: 'org-demo-1',
      health_score: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !process.env.NEXT_PUBLIC_SUPABASE_URL || (typeof window !== 'undefined' && localStorage.getItem('business_helper_sandbox') === 'true');

    // Try API only when not in demo/sandbox mode
    if (!isDemoMode) {
      try {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clientData),
        });

        if (res.ok) {
          const saved = await res.json();
          if (saved && saved.id) {
            setClients((prev) => [saved, ...prev]);
            return saved;
          }
        }
      } catch {
        // Fallback to local state mutation
      }
    }

    setClients((prev) => {
      const next = [newClient, ...prev];
      syncLocalStorage(next);
      return next;
    });

    return newClient;
  };

  const updateClient = async (id: string, clientData: Partial<Client>): Promise<Client> => {
    // Try API
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData),
      });

      if (res.ok) {
        const updated = await res.json();
        if (updated && updated.id) {
          setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
          return updated;
        }
      }
    } catch {
      // Fallback
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
    try {
      await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    } catch {
      // Fallback
    }

    setClients((prev) => {
      const next = prev.filter((c) => c.id !== id);
      syncLocalStorage(next);
      return next;
    });
  };

  const getClientById = useCallback(
    (id: string): Client | undefined => {
      return clients.find((c) => c.id === id);
    },
    [clients]
  );

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase().trim();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
        (c.rfc && c.rfc.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [clients, searchQuery]);

  return {
    clients,
    filteredClients,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    fetchClients,
    addClient,
    updateClient,
    deleteClient,
    getClientById,
  };
}
